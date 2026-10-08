import { test } from "node:test";
import assert from "node:assert/strict";
import {
  initialTmux,
  tmuxReducer,
  sessionOf,
  windowOf,
  restoreTmux,
  sections,
} from "../src/lib/tmux";
import { split, leaves } from "../src/lib/workspace";
const paths = new Set([
  ...sections.map((s) => s.path),
  "/post/example/",
  "shell",
]);
test("URL initialization selects the real window and starts with one terminal pane", () => {
  const s = initialTmux("/post/example/");
  assert.equal(windowOf(s).path, "/post/example/");
  assert.equal(leaves(windowOf(s).tree).length, 1);
  assert.equal(s.mouse, false);
  assert.equal(sessionOf(s).windows.length, 5);
});
test("session creation, renaming, switching, last-session and closing are distinct from windows", () => {
  let s = initialTmux();
  const first = s.activeSession;
  s = tmuxReducer(s, { type: "new-session" });
  const second = s.activeSession;
  assert.notEqual(first, second);
  assert.equal(sessionOf(s).windows.length, 1);
  s = tmuxReducer(s, { type: "rename-session", name: "mini" });
  assert.equal(sessionOf(s).name, "mini");
  s = tmuxReducer(s, { type: "last-session" });
  assert.equal(s.activeSession, first);
  s = tmuxReducer(s, { type: "next-session", delta: 1 });
  assert.equal(s.activeSession, second);
  s = tmuxReducer(s, { type: "close-session" });
  assert.equal(s.activeSession, first);
  assert.equal(s.sessions.length, 1);
});
test("new windows keep the current path, rename persists on navigation, and closing leaves another window", () => {
  let s = initialTmux("/post/");
  const before = sessionOf(s).windows.length;
  s = tmuxReducer(s, { type: "new-window" });
  assert.equal(windowOf(s).path, "/post/");
  assert.equal(sessionOf(s).windows.length, before + 1);
  s = tmuxReducer(s, { type: "rename-window", name: "notes" });
  s = tmuxReducer(s, { type: "path", path: "/page/关于/" });
  assert.equal(windowOf(s).name, "notes");
  s = tmuxReducer(s, { type: "close-window" });
  assert.equal(sessionOf(s).windows.length, before);
  s = tmuxReducer(s, { type: "next-window", delta: 1 });
  assert(windowOf(s));
});
test("opening a document in a split retains the other pane and resizing state", () => {
  let s = initialTmux();
  const w = windowOf(s),
    tree = split(w.tree, w.focus, "x", "right", "shell");
  s = tmuxReducer(s, { type: "pane", tree, focus: "right" });
  s = tmuxReducer(s, { type: "navigate-pane", path: "/post/example/" });
  assert.equal(leaves(windowOf(s).tree).length, 2);
  assert.equal(
    leaves(windowOf(s).tree).find((p) => p.id === "right")?.content,
    "/post/example/",
  );
  assert.equal(windowOf(s).path, "/post/example/");
});
test("persistent sessions reject bad references, unknown routes and serial reuse", () => {
  const s = initialTmux();
  assert(restoreTmux(s, paths));
  assert.equal(restoreTmux({ ...s, activeSession: "missing" }, paths), null);
  assert.equal(restoreTmux({ ...s, serial: 1 }, paths), null);
  const bad = structuredClone(s);
  windowOf(bad).path = "/private/";
  assert.equal(restoreTmux(bad, paths), null);
});
