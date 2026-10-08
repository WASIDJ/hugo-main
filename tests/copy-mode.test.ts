import { test } from "node:test";
import assert from "node:assert/strict";
import {
  enterCopyMode,
  moveCopyCursor,
  toggleCopySelection,
  selectedCopyText,
} from "../src/lib/copy-mode";
test("vi copy never divides Chinese, emoji, flags or combining characters", () => {
  const buffer = enterCopyMode("中👩‍💻🇨🇳e\u0301文");
  assert.deepEqual(buffer.units, ["中", "👩‍💻", "🇨🇳", "e\u0301", "文"]);
  let selected = moveCopyCursor(buffer, "l");
  selected = toggleCopySelection(selected);
  assert.equal(selectedCopyText(selected), "👩‍💻");
  selected = moveCopyCursor(selected, "l");
  assert.equal(selectedCopyText(selected), "👩‍💻🇨🇳");
});
test("vertical navigation and reversed visual selections preserve complete graphemes", () => {
  let buffer = enterCopyMode("甲👩‍💻乙\n一e\u0301二\n末");
  buffer = moveCopyCursor(buffer, "l");
  buffer = moveCopyCursor(buffer, "j");
  assert.equal(buffer.units[buffer.cursor], "e\u0301");
  buffer = moveCopyCursor(buffer, "k");
  assert.equal(buffer.units[buffer.cursor], "👩‍💻");
  buffer = toggleCopySelection(buffer);
  buffer = moveCopyCursor(buffer, "h");
  assert.equal(selectedCopyText(buffer), "甲👩‍💻");
});
test("empty buffers and boundary movements remain valid", () => {
  let buffer = enterCopyMode("");
  for (const key of ["h", "j", "k", "l"] as const)
    buffer = moveCopyCursor(buffer, key);
  assert.equal(buffer.cursor, 0);
  assert.equal(selectedCopyText(buffer), "");
  buffer = enterCopyMode("😀");
  buffer = toggleCopySelection(buffer);
  buffer = moveCopyCursor(buffer, "l");
  assert.equal(selectedCopyText(buffer), "😀");
});
