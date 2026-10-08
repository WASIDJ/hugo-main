import { execFileSync } from "node:child_process";
import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  cpSync,
  existsSync,
  rmSync,
} from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const work = resolve(root, ".cache/ssh-portal");
const upstream = resolve(work, "sshterm");
const output = resolve(root, "ssh-portal/dist");
const commit = "86cc3e666a34b2b3835ae832502ea123a02bb072";
const run = (program, args, cwd = root, env = {}) =>
  execFileSync(program, args, {
    cwd,
    stdio: "inherit",
    env: { ...process.env, ...env },
  });
mkdirSync(work, { recursive: true });
if (!existsSync(resolve(upstream, ".git")))
  run("git", ["clone", "https://github.com/c2FmZQ/sshterm.git", upstream]);
run("git", ["fetch", "origin", commit], upstream);
run("git", ["checkout", "--detach", "--force", commit], upstream);
function replace(file, from, to) {
  const path = resolve(upstream, file),
    source = readFileSync(path, "utf8");
  if (!source.includes(from)) throw new Error(`Upstream patch drift: ${file}`);
  writeFileSync(path, source.replace(from, to));
}
// A tmux attach command needs a PTY just like the interactive SSH shell.
replace(
  "go/internal/app/ssh.go",
  'if command != "" {\n\t\treturn session.Run(command)\n\t}',
  'if command != "" && a.cfg.AutoConnect == nil {\n\t\treturn session.Run(command)\n\t}',
);
replace(
  "go/internal/app/ssh.go",
  'session.RequestPty("xterm",',
  'session.RequestPty("xterm-256color",',
);
replace(
  "go/internal/app/ssh.go",
  "defer a.inShell.Store(false)\n\tif err := session.Shell();",
  'defer a.inShell.Store(false)\n\tif command != "" { return session.Run(command) }\n\tif err := session.Shell();',
);
// Dedicated portal always negotiates the previously verified ED25519 host key.
replace(
  "go/internal/app/ssh.go",
  "User: username,",
  "User: username,\n\t\tHostKeyAlgorithms: []string{ssh.KeyAlgoED25519},",
);
replace(
  "go/internal/app/ssh.go",
  'a.term.Printf("Host key for %s is trusted.\\n", hostname)',
  'if a.cfg.AutoConnect == nil { a.term.Printf("Host key for %s is trusted.\\n", hostname) }',
);
replace(
  "go/internal/app/ssh.go",
  'a.term.Printf("Host key for %s is not trusted',
  'if a.cfg.AutoConnect != nil { return fmt.Errorf("pinned SSH host key rejected for %s", hostname) }\n\ta.term.Printf("Host key for %s is not trusted',
);
// Only the real remote prompt/status line is shown on direct connection.
replace(
  "go/internal/start.go",
  "cfg.Term = term\n",
  "cfg.Term = term\n\tif cfg.AutoConnect == nil {\n",
);
replace(
  "go/internal/start.go",
  'cfg.Term.Call("writeln", "")\n',
  'cfg.Term.Call("writeln", "")\n\t}\n',
);
run(
  "gofmt",
  ["-w", "internal/app/ssh.go", "internal/start.go"],
  resolve(upstream, "go"),
);
run(
  "npm",
  ["ci", "--ignore-scripts", "--no-audit", "--no-fund"],
  resolve(upstream, "xterm"),
);
run("npx", ["--no-install", "rollup", "-c"], resolve(upstream, "xterm"));
rmSync(output, { recursive: true, force: true });
mkdirSync(output, { recursive: true });
run(
  "go",
  [
    "build",
    "-trimpath",
    "-ldflags=-s -w",
    "-o",
    resolve(output, "ssh.wasm"),
    ".",
  ],
  resolve(upstream, "go"),
  { GOOS: "js", GOARCH: "wasm" },
);
const goroot = execFileSync("go", ["env", "GOROOT"], {
  encoding: "utf8",
}).trim();
cpSync(
  resolve(goroot, "lib/wasm/wasm_exec.js"),
  resolve(output, "wasm_exec.js"),
);
cpSync(resolve(upstream, "docroot/xterm.mjs"), resolve(output, "xterm.mjs"));
cpSync(
  resolve(upstream, "xterm/node_modules/@xterm/xterm/css/xterm.css"),
  resolve(output, "xterm.css"),
);
cpSync(
  resolve(upstream, "xterm/node_modules/@xterm/xterm/LICENSE"),
  resolve(output, "XTERM-LICENSE"),
);
cpSync(resolve(upstream, "LICENSE"), resolve(output, "SSH-TERM-LICENSE"));
cpSync(
  resolve(root, "static/fonts/FiraCodeNerdFontMono.woff2"),
  resolve(output, "FiraCodeNerdFontMono.woff2"),
);
cpSync(
  resolve(root, "static/fonts/FiraCode-LICENSE.txt"),
  resolve(output, "FONT-LICENSE"),
);
cpSync(resolve(root, "ssh-portal/client"), output, { recursive: true });
run(
  "go",
  [
    "build",
    "-trimpath",
    "-ldflags=-s -w",
    "-o",
    resolve(output, "mini-ssh-gateway"),
    ".",
  ],
  resolve(root, "ssh-portal/gateway"),
  { GOOS: "darwin", GOARCH: "arm64" },
);
writeFileSync(
  resolve(output, "build.json"),
  JSON.stringify(
    {
      sshterm: commit,
      go: execFileSync("go", ["version"], { encoding: "utf8" }).trim(),
    },
    null,
    2,
  ) + "\n",
);
console.log("Built private SSH portal:", output);
