import { execFileSync } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync, readFileSync } from "node:fs";
const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const host = process.argv[2] || "mini-t";
if (host.startsWith("-")) throw new Error("Expected SSH host alias");
const dist = resolve(root, "ssh-portal/dist");
if (!existsSync(resolve(dist, "mini-ssh-gateway")))
  throw new Error("Run npm run ssh:build first");
const options = [
  "-o",
  "BatchMode=yes",
  "-o",
  "StrictHostKeyChecking=yes",
  "-o",
  "ConnectTimeout=8",
  "-o",
  "RemoteCommand=none",
  "-o",
  "RequestTTY=no",
];
const ssh = (command, input) =>
  execFileSync("ssh", [...options, host, command], { input, encoding: "utf8" });
const stage = ssh("mktemp -d /tmp/mini-ssh-wasm.XXXXXXXX").trim();
if (!/^\/tmp\/mini-ssh-wasm\.[a-zA-Z0-9]+$/.test(stage))
  throw new Error("Unexpected staging directory");
try {
  const archive = execFileSync("tar", ["-czf", "-", "-C", dist, "."], {
    maxBuffer: 32 * 1024 * 1024,
  });
  ssh(`tar -xzf - -C '${stage}'`, archive);
  const result = ssh(
    `python3 - '${stage}'`,
    readFileSync(resolve(root, "ssh-portal/scripts/install.py")),
  );
  console.log(result.trim());
} finally {
  ssh(`rm -rf '${stage}'`);
}
// HTTPS enablement may require a one-time action by the tailnet administrator.
// This command affects only the dedicated port and never enables Funnel.
if (!process.argv.includes("--skip-serve")) {
  const existing = JSON.parse(
    ssh("/opt/homebrew/bin/tailscale serve status --json"),
  );
  const conflicting = Object.keys(existing.Web || {}).some((key) =>
    key.endsWith(":8443"),
  );
  if (conflicting && !JSON.stringify(existing).includes("127.0.0.1:8022"))
    throw new Error(
      "Port 8443 already has a Serve handler; refusing to overwrite",
    );
  execFileSync(
    "ssh",
    [
      ...options,
      host,
      "/opt/homebrew/bin/tailscale serve --bg --yes --https=8443 http://127.0.0.1:8022",
    ],
    { stdio: "inherit" },
  );
}
