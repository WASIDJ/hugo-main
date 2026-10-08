import "./wasm_exec.js";
import { Terminal, FitAddon } from "./xterm.mjs";
const terminal = new Terminal({
  fontFamily: "FiraCodeNerd, monospace",
  fontSize: 24,
  lineHeight: 1.15,
  cursorStyle: "bar",
  cursorBlink: true,
  macOptionIsMeta: true,
  scrollback: 10000,
  allowProposedApi: false,
  theme: {
    background: "#1e1e2e",
    foreground: "#cdd6f4",
    cursor: "#f5e0dc",
    selectionBackground: "#585b7080",
    black: "#45475a",
    red: "#f38ba8",
    green: "#a6e3a1",
    yellow: "#f9e2af",
    blue: "#89b4fa",
    magenta: "#f5c2e7",
    cyan: "#94e2d5",
    white: "#bac2de",
    brightBlack: "#585b70",
    brightRed: "#f38ba8",
    brightGreen: "#a6e3a1",
    brightYellow: "#f9e2af",
    brightBlue: "#89b4fa",
    brightMagenta: "#f5c2e7",
    brightCyan: "#94e2d5",
    brightWhite: "#a6adc8",
  },
});
const fit = new FitAddon();
terminal.loadAddon(fit);
await document.fonts.load("24px FiraCodeNerd");
terminal.open(document.querySelector("#terminal"));
fit.fit();
terminal.focus();
new ResizeObserver(() => fit.fit()).observe(
  document.querySelector("#terminal"),
);
// Renderer access is useful for diagnostics; private keys stay inside WASM.
window.sshTerminal = terminal;
let session,
  restarting = false,
  ready;
window.sshApp = { sshIsReady: () => ready() };
const wasmReady = new Promise((resolve) => {
  ready = resolve;
});
try {
  const go = new Go();
  const result = await WebAssembly.instantiateStreaming(
    fetch("./ssh.wasm"),
    go.importObject,
  );
  go.run(result.instance).catch(showError);
  await wasmReady;
  connect();
} catch (error) {
  showError(error);
}
async function connect() {
  if (restarting) return;
  restarting = true;
  try {
    const response = await fetch("./config.json", {
      credentials: "same-origin",
      cache: "no-store",
    });
    if (!response.ok) throw new Error(`身份认证失败 (${response.status})`);
    const config = await response.json();
    config.term = terminal;
    session = await window.sshApp.start(config);
    restarting = false;
    await session.done;
    terminal.writeln("\r\n[连接已关闭；按 Enter 重连]");
  } catch (error) {
    restarting = false;
    showError(error);
  }
  session = undefined;
  const reconnect = terminal.onData((data) => {
    if (data === "\r") {
      reconnect.dispose();
      terminal.reset();
      connect();
    }
  });
}
function showError(error) {
  terminal.writeln(
    `\r\n[SSH: ${String(error.message || error).replace(/[\x00-\x1f\x7f-\x9f]/g, "")}]`,
  );
}
window.addEventListener("beforeunload", () => session?.close());
// Every tmux/vi/Alt key goes straight to SSH; there is no simulated key layer.
terminal.attachCustomKeyEventHandler((event) => {
  if (
    event.metaKey &&
    event.key.toLowerCase() === "c" &&
    terminal.hasSelection()
  )
    return false;
  if (event.metaKey && event.key.toLowerCase() === "v") return false;
  return true;
});
