// The gateway forwards encrypted SSH bytes. The browser owns SSH session keys.
package main

import (
	"context"
	"crypto/ed25519"
	"crypto/rand"
	"crypto/subtle"
	"encoding/base64"
	"encoding/binary"
	"encoding/json"
	"encoding/pem"
	"errors"
	"flag"
	"io"
	"log"
	"net"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"time"

	"github.com/coder/websocket"
	"golang.org/x/crypto/ssh"
)

type config struct {
	Listen   string `json:"listen"`
	Origin   string `json:"origin"`
	Owner    string `json:"owner"`
	Username string `json:"username"`
	HostKey  string `json:"hostKey"`
	CAKey    string `json:"caKey"`
	Docroot  string `json:"docroot"`
	Command  string `json:"command"`
}

func (c config) validate() error {
	host, _, err := net.SplitHostPort(c.Listen)
	if err != nil || host != "127.0.0.1" {
		return errors.New("listen must bind 127.0.0.1")
	}
	u, err := url.Parse(c.Origin)
	if err != nil || u.Scheme != "https" || u.Host == "" || u.Path != "" || u.RawQuery != "" || u.Fragment != "" || u.User != nil {
		return errors.New("origin must be a bare HTTPS origin")
	}
	if c.Owner == "" || c.Username == "" || c.CAKey == "" || c.Docroot == "" {
		return errors.New("owner, username, caKey and docroot are required")
	}
	key, _, _, _, err := ssh.ParseAuthorizedKey([]byte(c.HostKey))
	if err != nil || key.Type() != ssh.KeyAlgoED25519 {
		return errors.New("a verified ed25519 hostKey is required")
	}
	return nil
}
func initCA(path string) error {
	if _, err := os.Stat(path); err == nil {
		return errors.New("CA already exists; refusing to overwrite")
	} else if !os.IsNotExist(err) {
		return err
	}
	if err := os.MkdirAll(filepath.Dir(path), 0700); err != nil {
		return err
	}
	_, priv, err := ed25519.GenerateKey(rand.Reader)
	if err != nil {
		return err
	}
	block, err := ssh.MarshalPrivateKey(priv, "mini-wasm-user-ca")
	if err != nil {
		return err
	}
	f, err := os.OpenFile(path, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0600)
	if err != nil {
		return err
	}
	defer f.Close()
	return pem.Encode(f, block)
}
func readCA(path string) (ssh.Signer, error) {
	info, err := os.Stat(path)
	if err != nil {
		return nil, err
	}
	if info.Mode().Perm()&0077 != 0 {
		return nil, errors.New("CA private key must have mode 0600")
	}
	b, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}
	return ssh.ParsePrivateKey(b)
}

type gateway struct {
	cfg   config
	ca    ssh.Signer
	slots chan struct{}
	dial  func(context.Context) (net.Conn, error)
}

func (g *gateway) handler() http.Handler {
	files := http.FileServer(http.Dir(g.cfg.Docroot))
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Serve strips client-supplied identity headers. This backend MUST remain
		// on loopback; direct network listeners would make these forgeable.
		if r.Header.Get("Tailscale-User-Login") != g.cfg.Owner {
			http.Error(w, "owner authentication required", 403)
			return
		}
		w.Header().Set("Cache-Control", "no-store")
		w.Header().Set("Content-Security-Policy", "default-src 'none'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; font-src 'self'; connect-src 'self'; img-src 'self' data:; base-uri 'none'; frame-ancestors 'none'; form-action 'none'")
		w.Header().Set("X-Content-Type-Options", "nosniff")
		w.Header().Set("X-Frame-Options", "DENY")
		w.Header().Set("Referrer-Policy", "no-referrer")
		w.Header().Set("Permissions-Policy", "camera=(), microphone=(), geolocation=()")
		switch r.URL.Path {
		case "/cert":
			g.certificate(w, r)
		case "/ssh":
			g.relay(w, r)
		case "/config.json":
			if r.Method != http.MethodGet {
				http.Error(w, "method", 405)
				return
			}
			token := make([]byte, 32)
			if _, err := rand.Read(token); err != nil {
				http.Error(w, "entropy", 500)
				return
			}
			http.SetCookie(w, &http.Cookie{Name: "__tlsproxySid", Value: base64.RawURLEncoding.EncodeToString(token), Path: "/", Secure: true, SameSite: http.SameSiteStrictMode, MaxAge: 3600})
			w.Header().Set("Content-Type", "application/json")
			json.NewEncoder(w).Encode(map[string]any{
				"persist": false, "dbName": "mini-wasm-memory",
				"endpoints":    []any{map[string]any{"name": "mini-t", "url": "./ssh"}},
				"hosts":        []any{map[string]any{"name": "mini-t", "key": g.cfg.HostKey}},
				"generateKeys": []any{map[string]any{"name": "browser", "type": "ed25519", "identityProvider": "./cert", "addToAgent": true}},
				"autoConnect":  map[string]any{"username": g.cfg.Username, "hostname": "mini-t", "identity": "browser", "command": g.cfg.Command, "forwardAgent": false},
			})
		default:
			if r.Method != http.MethodGet && r.Method != http.MethodHead {
				http.Error(w, "method", 405)
				return
			}
			files.ServeHTTP(w, r)
		}
	})
}
func (g *gateway) sameOrigin(r *http.Request) bool { return r.Header.Get("Origin") == g.cfg.Origin }
func (g *gateway) certificate(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method", 405)
		return
	}
	cookie, err := r.Cookie("__tlsproxySid")
	token := r.Header.Get("x-csrf-token")
	if !g.sameOrigin(r) || err != nil || len(token) < 32 || subtle.ConstantTimeCompare([]byte(cookie.Value), []byte(token)) != 1 {
		http.Error(w, "origin/CSRF", 403)
		return
	}
	r.Body = http.MaxBytesReader(w, r.Body, 4096)
	b, err := io.ReadAll(r.Body)
	if err != nil {
		http.Error(w, "public key too large", 400)
		return
	}
	key, _, _, rest, err := ssh.ParseAuthorizedKey(b)
	if err != nil || len(rest) != 0 || key.Type() != ssh.KeyAlgoED25519 {
		http.Error(w, "one ed25519 public key required", 400)
		return
	}
	serial := make([]byte, 8)
	if _, err := rand.Read(serial); err != nil {
		http.Error(w, "entropy", 500)
		return
	}
	now := time.Now()
	cert := &ssh.Certificate{Key: key, Serial: binary.BigEndian.Uint64(serial), CertType: ssh.UserCert, KeyId: "mini-wasm", ValidPrincipals: []string{g.cfg.Username}, ValidAfter: uint64(now.Add(-time.Minute).Unix()), ValidBefore: uint64(now.Add(20 * time.Minute).Unix()), Permissions: ssh.Permissions{CriticalOptions: map[string]string{"source-address": "127.0.0.1/32,::1/128"}, Extensions: map[string]string{"permit-pty": "", "permit-port-forwarding": "", "permit-user-rc": ""}}}
	if err := cert.SignCert(rand.Reader, g.ca); err != nil {
		http.Error(w, "signing", 500)
		return
	}
	w.Header().Set("Content-Type", "text/plain")
	w.Write(ssh.MarshalAuthorizedKey(cert))
}
func (g *gateway) relay(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet || !g.sameOrigin(r) {
		http.Error(w, "origin/method", 403)
		return
	}
	select {
	case g.slots <- struct{}{}:
		defer func() { <-g.slots }()
	default:
		http.Error(w, "connection limit", 429)
		return
	}
	// Origin is checked above against the public origin, not the proxy Host.
	c, err := websocket.Accept(w, r, &websocket.AcceptOptions{InsecureSkipVerify: true, CompressionMode: websocket.CompressionDisabled})
	if err != nil {
		return
	}
	defer c.CloseNow()
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	tcp, err := g.dial(ctx)
	if err != nil {
		c.Close(websocket.StatusInternalError, "SSH unavailable")
		return
	}
	defer tcp.Close()
	ws := websocket.NetConn(ctx, c, websocket.MessageBinary)
	c.SetReadLimit(1 << 20)
	done := make(chan struct{}, 2)
	go func() { io.Copy(tcp, ws); done <- struct{}{} }()
	go func() { io.Copy(ws, tcp); done <- struct{}{} }()
	// Close cancels both copies. No decrypted terminal data is available here.
	<-done
	cancel()
	tcp.Close()
	c.CloseNow()
	<-done
}
func main() {
	cfgPath := flag.String("config", "", "private runtime JSON configuration")
	initPath := flag.String("init-ca", "", "create an owner-only CA key; refuses overwrite")
	publicPath := flag.String("ca-public", "", "print the existing CA public key")
	flag.Parse()
	if *initPath != "" {
		if err := initCA(*initPath); err != nil {
			log.Fatal(err)
		}
		return
	}
	if *publicPath != "" {
		ca, err := readCA(*publicPath)
		if err != nil {
			log.Fatal(err)
		}
		os.Stdout.Write(ssh.MarshalAuthorizedKey(ca.PublicKey()))
		return
	}
	b, err := os.ReadFile(*cfgPath)
	if err != nil {
		log.Fatal(err)
	}
	var cfg config
	if err = json.Unmarshal(b, &cfg); err != nil {
		log.Fatal(err)
	}
	if err = cfg.validate(); err != nil {
		log.Fatal(err)
	}
	ca, err := readCA(cfg.CAKey)
	if err != nil {
		log.Fatal(err)
	}
	g := &gateway{cfg: cfg, ca: ca, slots: make(chan struct{}, 8), dial: func(ctx context.Context) (net.Conn, error) {
		return (&net.Dialer{Timeout: 8 * time.Second}).DialContext(ctx, "tcp", "127.0.0.1:22")
	}}
	server := &http.Server{Addr: cfg.Listen, Handler: g.handler(), ReadHeaderTimeout: 10 * time.Second, IdleTimeout: 60 * time.Second, MaxHeaderBytes: 16384}
	log.Print("private SSH byte relay listening on loopback")
	log.Fatal(server.ListenAndServe())
}
