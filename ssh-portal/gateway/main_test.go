package main

import (
	"bytes"
	"context"
	"crypto/ed25519"
	"crypto/rand"
	"encoding/json"
	"github.com/coder/websocket"
	"golang.org/x/crypto/ssh"
	"io"
	"net"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func testGateway(t *testing.T) *gateway {
	t.Helper()
	_, priv, _ := ed25519.GenerateKey(rand.Reader)
	ca, _ := ssh.NewSignerFromKey(priv)
	dir := t.TempDir()
	os.WriteFile(filepath.Join(dir, "index.html"), []byte("terminal"), 0600)
	return &gateway{cfg: config{Listen: "127.0.0.1:8022", Origin: "https://terminal.example", Owner: "owner@example.com", Username: "owner", HostKey: string(ssh.MarshalAuthorizedKey(ca.PublicKey())), CAKey: "ca", Docroot: dir}, ca: ca, slots: make(chan struct{}, 1)}
}
func request(g *gateway, method, path, body, origin, owner, csrf string) *httptest.ResponseRecorder {
	r := httptest.NewRequest(method, path, strings.NewReader(body))
	r.Header.Set("Origin", origin)
	r.Header.Set("Tailscale-User-Login", owner)
	r.Header.Set("x-csrf-token", csrf)
	r.AddCookie(&http.Cookie{Name: "__tlsproxySid", Value: strings.Repeat("a", 43)})
	w := httptest.NewRecorder()
	g.handler().ServeHTTP(w, r)
	return w
}
func TestAuthorizationAndCSRF(t *testing.T) {
	g := testGateway(t)
	for _, path := range []string{"/", "/ssh", "/cert", "/config.json", "/ssh.wasm"} {
		for _, owner := range []string{"", "other@example.com"} {
			if w := request(g, "GET", path, "", g.cfg.Origin, owner, ""); w.Code != 403 {
				t.Fatalf("%s allowed non-owner: %d", path, w.Code)
			}
		}
	}
	for _, input := range []struct{ origin, token string }{{"https://evil.example", strings.Repeat("a", 43)}, {"", strings.Repeat("a", 43)}, {g.cfg.Origin, ""}, {g.cfg.Origin, strings.Repeat("b", 43)}} {
		if w := request(g, "POST", "/cert", "", input.origin, g.cfg.Owner, input.token); w.Code != 403 {
			t.Fatalf("CSRF accepted: %d", w.Code)
		}
	}
	if w := request(g, "GET", "/ssh", "", "https://evil.example", g.cfg.Owner, ""); w.Code != 403 {
		t.Fatal("cross-origin WS accepted")
	}
}
func TestShortLivedCertificate(t *testing.T) {
	g := testGateway(t)
	pub, _, _ := ed25519.GenerateKey(rand.Reader)
	key, _ := ssh.NewPublicKey(pub)
	w := request(g, "POST", "/cert", string(ssh.MarshalAuthorizedKey(key)), g.cfg.Origin, g.cfg.Owner, strings.Repeat("a", 43))
	if w.Code != 200 || w.Header().Get("Content-Type") != "text/plain" {
		t.Fatalf("%d %s", w.Code, w.Body.String())
	}
	parsed, _, _, _, err := ssh.ParseAuthorizedKey(w.Body.Bytes())
	if err != nil {
		t.Fatal(err)
	}
	cert := parsed.(*ssh.Certificate)
	if !bytes.Equal(cert.Key.Marshal(), key.Marshal()) || cert.CertType != ssh.UserCert || cert.ValidBefore > uint64(time.Now().Add(21*time.Minute).Unix()) {
		t.Fatal("invalid user certificate")
	}
	if cert.CriticalOptions["source-address"] != "127.0.0.1/32,::1/128" {
		t.Fatal("certificate must be restricted to loopback")
	}
	checker := ssh.CertChecker{SupportedCriticalOptions: []string{"source-address"}, IsUserAuthority: func(k ssh.PublicKey) bool { return bytes.Equal(k.Marshal(), g.ca.PublicKey().Marshal()) }}
	if err := checker.CheckCert(g.cfg.Username, cert); err != nil {
		t.Fatal(err)
	}
	if err := checker.CheckCert("someone-else", cert); err == nil {
		t.Fatal("wrong principal accepted")
	}
	for _, body := range []string{string(ssh.MarshalAuthorizedKey(key)) + string(ssh.MarshalAuthorizedKey(key)), strings.Repeat("x", 5000), "private key"} {
		if w := request(g, "POST", "/cert", body, g.cfg.Origin, g.cfg.Owner, strings.Repeat("a", 43)); w.Code != 400 {
			t.Fatal("invalid public key accepted")
		}
	}
}
func TestConfigAndCA(t *testing.T) {
	g := testGateway(t)
	if err := g.cfg.validate(); err != nil {
		t.Fatal(err)
	}
	bad := g.cfg
	bad.Listen = "0.0.0.0:8022"
	if bad.validate() == nil {
		t.Fatal("network listener accepted")
	}
	bad = g.cfg
	bad.Origin = "http://terminal.example"
	if bad.validate() == nil {
		t.Fatal("insecure origin accepted")
	}
	w := request(g, "GET", "/config.json", "", "", g.cfg.Owner, "")
	var cfg map[string]any
	if err := json.Unmarshal(w.Body.Bytes(), &cfg); err != nil {
		t.Fatal(err)
	}
	if cfg["persist"] != false || !strings.Contains(w.Header().Get("Content-Security-Policy"), "frame-ancestors 'none'") {
		t.Fatal("private origin protections missing")
	}
	if c := w.Result().Cookies(); len(c) != 1 || !c[0].Secure || c[0].SameSite != http.SameSiteStrictMode {
		t.Fatal("invalid CSRF cookie")
	}
	path := filepath.Join(t.TempDir(), "ca")
	if err := initCA(path); err != nil {
		t.Fatal(err)
	}
	if _, err := readCA(path); err != nil {
		t.Fatal(err)
	}
	if initCA(path) == nil {
		t.Fatal("CA overwritten")
	}
	os.Chmod(path, 0644)
	if _, err := readCA(path); err == nil {
		t.Fatal("read public-readable CA")
	}
}
func TestBinaryRelayAndClose(t *testing.T) {
	g := testGateway(t)
	closed := make(chan struct{})
	g.dial = func(context.Context) (net.Conn, error) {
		client, server := net.Pipe()
		go func() { defer close(closed); defer server.Close(); io.Copy(server, server) }()
		return client, nil
	}
	srv := httptest.NewServer(g.handler())
	defer srv.Close()
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()
	headers := http.Header{"Origin": {g.cfg.Origin}, "Tailscale-User-Login": {g.cfg.Owner}}
	c, _, err := websocket.Dial(ctx, strings.Replace(srv.URL, "http:", "ws:", 1)+"/ssh", &websocket.DialOptions{HTTPHeader: headers})
	if err != nil {
		t.Fatal(err)
	}
	data := []byte{0, 1, 255, 128, 13, 10}
	if err := c.Write(ctx, websocket.MessageBinary, data); err != nil {
		t.Fatal(err)
	}
	typ, got, err := c.Read(ctx)
	if err != nil || typ != websocket.MessageBinary || !bytes.Equal(data, got) {
		t.Fatalf("binary corruption: %v %v", got, err)
	}
	_, resp, err := websocket.Dial(ctx, strings.Replace(srv.URL, "http:", "ws:", 1)+"/ssh", &websocket.DialOptions{HTTPHeader: headers})
	if err == nil || resp.StatusCode != 429 {
		t.Fatal("connection limit missing")
	}
	c.CloseNow()
	select {
	case <-closed:
	case <-ctx.Done():
		t.Fatal("TCP remained open after browser disconnect")
	}
}
