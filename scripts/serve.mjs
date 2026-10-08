import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { gzipSync } from "node:zlib";
import path from "node:path";
const root = path.resolve("out"),
  port = Number(process.env.PORT || 3000),
  compressed = new Map();
const types = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
  ".xml": "application/xml",
  ".txt": "text/plain; charset=utf-8",
};
createServer(async (req, res) => {
  try {
    const url = new URL(req.url, "http://localhost");
    let file = path.resolve(root, "." + decodeURIComponent(url.pathname));
    if (!file.startsWith(root + path.sep) && file !== root) {
      res.writeHead(403);
      res.end();
      return;
    }
    try {
      let info = await stat(file);
      if (info.isDirectory()) {
        file = path.join(file, "index.html");
        info = await stat(file);
      }
      const type = types[path.extname(file)] || "application/octet-stream";
      let body = await readFile(file);
      const headers = {
        "Content-Type": type,
        "Cache-Control": url.pathname.startsWith("/_next/static/")
          ? "public, max-age=31536000, immutable"
          : "no-cache",
        Vary: "Accept-Encoding",
      };
      if (
        /\bgzip\b/.test(req.headers["accept-encoding"] || "") &&
        /^(text\/|application\/(json|xml)|image\/svg\+xml)/.test(type)
      ) {
        const key = `${file}:${info.mtimeMs}`;
        if (!compressed.has(key)) {
          if (compressed.size > 300) compressed.clear();
          compressed.set(key, gzipSync(body));
        }
        body = compressed.get(key);
        headers["Content-Encoding"] = "gzip";
      }
      headers["Content-Length"] = String(body.length);
      res.writeHead(200, headers);
      res.end(req.method === "HEAD" ? undefined : body);
    } catch {
      res.writeHead(404, { "Content-Type": "text/html; charset=utf-8" });
      res.end(
        req.method === "HEAD"
          ? undefined
          : await readFile(path.join(root, "404.html")),
      );
    }
  } catch {
    res.writeHead(400);
    res.end("Bad request");
  }
}).listen(port, "127.0.0.1", () =>
  console.log(`Static preview http://127.0.0.1:${port}`),
);
