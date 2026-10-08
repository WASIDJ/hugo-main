// Explicit live integration test; only the owned temporary tmux window is changed.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { chromium } from "@playwright/test";
const target = process.env.MINI_SSH_HOST || "mini-t";
const url = process.env.MINI_SSH_URL;
if (!url) throw new Error("Set MINI_SSH_URL to the private HTTPS portal");
const ssh = (command) =>
  execFileSync(
    "ssh",
    [
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
      target,
      command,
    ],
    { encoding: "utf8" },
  ).trim();
const previous = ssh(
  '/opt/homebrew/bin/tmux display-message -p -t mini "#{window_id}"',
);
const windowId = ssh(
  '/opt/homebrew/bin/tmux new-window -d -t mini -n wasm-validation -P -F "#{window_id}"',
);
if (!/^@\d+$/.test(previous) || !/^@\d+$/.test(windowId))
  throw new Error("Unexpected tmux window id");
const browser = await chromium.launch({
  channel: process.platform === "darwin" ? "chrome" : undefined,
  headless: true,
  args: process.env.MINI_SSH_DIRECT === "1" ? ["--no-proxy-server"] : [],
});
const context = await browser.newContext({
  ignoreHTTPSErrors: process.env.MINI_SSH_TEST_TLS === "1",
  viewport: { width: 1440, height: 1000 },
});
const page = await context.newPage();
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
const text = () =>
  page.evaluate(() =>
    Array.from(
      { length: window.sshTerminal?.buffer.active.length || 0 },
      (_, i) =>
        window.sshTerminal.buffer.active.getLine(i)?.translateToString(),
    ).join("\n"),
  );
const waitFor = async (word) =>
  page.waitForFunction(
    (word) =>
      Array.from(
        { length: window.sshTerminal?.buffer.active.length || 0 },
        (_, i) =>
          window.sshTerminal.buffer.active.getLine(i)?.translateToString(),
      )
        .join("\n")
        .includes(word),
    word,
    { timeout: 30000 },
  );
try {
  ssh(`/opt/homebrew/bin/tmux select-window -t ${windowId}`);
  await page.goto(url);
  await waitFor("wasm-validation");
  await page.keyboard.type(
    'printf \'__WASM_PROOF__:%s:%s\\n\' "$(uname -s)" "$(id -un)"',
  );
  await page.keyboard.press("Enter");
  await waitFor("__WASM_PROOF__:Darwin:");
  assert.match(await text(), /__WASM_PROOF__:Darwin:/);
  await page.keyboard.type("printf '__UTF8__:");
  await page.keyboard.insertText("中文");
  await page.keyboard.type("\\n'");
  await page.keyboard.press("Enter");
  await waitFor("__UTF8__:中文");
  const before = Number(
    ssh(
      `/opt/homebrew/bin/tmux display-message -p -t ${windowId} "#{window_panes}"`,
    ),
  );
  await page.keyboard.press("Control+q");
  await page.keyboard.press("v");
  await page.waitForTimeout(500);
  assert.equal(
    Number(
      ssh(
        `/opt/homebrew/bin/tmux display-message -p -t ${windowId} "#{window_panes}"`,
      ),
    ),
    before + 1,
    "Ctrl+q v reaches real tmux",
  );
  await page.setViewportSize({ width: 1000, height: 700 });
  await page.waitForTimeout(500);
  const dimensions = await page.evaluate(() => ({
    cols: window.sshTerminal.cols,
    rows: window.sshTerminal.rows,
  }));
  const remote = ssh(
    `/opt/homebrew/bin/tmux display-message -p -t ${windowId} "#{window_width} #{window_height}"`,
  )
    .split(" ")
    .map(Number);
  assert.equal(remote[0], dimensions.cols);
  assert.equal(remote[1], dimensions.rows - 1, "tmux reserves one status row");
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.reload();
  await waitFor("wasm-validation");
  assert.equal(
    Number(
      ssh(
        `/opt/homebrew/bin/tmux display-message -p -t ${windowId} "#{window_panes}"`,
      ),
    ),
    before + 1,
    "refresh preserves remote panes",
  );
  assert.equal(
    await page.evaluate(() =>
      indexedDB
        .databases()
        .then((list) => list.some((db) => db.name === "mini-wasm-memory")),
    ),
    false,
    "private keys are not persisted",
  );
  // Disconnect/reconnect exercises the client lifecycle in the same WASM page.
  await page.keyboard.press("Control+q");
  await page.keyboard.press("d");
  await waitFor("连接已关闭");
  await page.keyboard.press("Enter");
  await waitFor("wasm-validation");
  assert.equal(
    Number(
      ssh(
        `/opt/homebrew/bin/tmux display-message -p -t ${windowId} "#{window_panes}"`,
      ),
    ),
    before + 1,
    "Enter reconnect preserves tmux panes",
  );
  // A changed host pin must abort before SSH authentication or a PTY is opened.
  await page.route("**/config.json", async (route) => {
    const response = await route.fetch();
    const cfg = await response.json();
    cfg.hosts[0].key =
      "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIFNM0+i+1dEDi0RbH6HTTzYfk6fsPcCWxAIemKsEYdW3";
    await route.fulfill({ response, json: cfg });
  });
  await page.reload();
  await waitFor("pinned SSH host key rejected");
  assert(
    !(await text()).includes("Choice>"),
    "host key mismatch cannot be bypassed",
  );
  assert.deepEqual(errors, []);
  console.log(
    "PASS: real Darwin SSH, UTF-8, tmux keys, PTY resize, refresh, Enter reconnect, memory-only keys, strict host pin",
  );
} catch (error) {
  console.log(
    "FAILED TERMINAL:",
    await text().catch(() => "navigation failed"),
  );
  await page.screenshot({ path: ".cache/ssh-portal/failure.png" });
  throw error;
} finally {
  await browser.close();
  ssh(`/opt/homebrew/bin/tmux select-window -t ${previous}`);
  ssh(`/opt/homebrew/bin/tmux kill-window -t ${windowId}`);
}
