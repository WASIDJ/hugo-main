import { test } from "node:test";
import assert from "node:assert/strict";
import {
  defaultTree,
  leaves,
  split,
  remove,
  resize,
  resizeParent,
  validTree,
} from "../src/lib/workspace";
test("terminal splits exceed the old four-pane cap and collapse branches on close", () => {
  let tree = defaultTree(true);
  for (let i = 0; i < 5; i++)
    tree = split(tree, "main", "x", `extra-${i}`, "intro");
  assert.equal(leaves(tree).length, 8);
  const next = remove(tree, "extra-4")!;
  assert.equal(leaves(next).length, 7);
});
test("last pane removal returns null so UI can restore canonical layout", () => {
  assert.equal(remove(defaultTree(false), "main"), null);
});
test("resizing clamps proportions and targets the nearest matching parent", () => {
  const tree = defaultTree(true);
  assert.equal((resize(tree, "root", 0.99) as any).ratio, 0.8);
  assert.equal((resize(tree, "root", -0.1) as any).ratio, 0.2);
  const next = resizeParent(tree, "journal", "y", 0.05) as any;
  assert(Math.abs(next.second.ratio - 0.59) < 1e-9);
  assert.equal(next.ratio, 0.52);
});
test("persistence rejects corrupt, oversized, duplicated or unavailable content", () => {
  const allowed = new Set(["main", "articles", "projects"]);
  assert(validTree(defaultTree(true), allowed));
  assert(!validTree({ ...defaultTree(false), content: "private" }, allowed));
  assert(
    !validTree(
      {
        kind: "split",
        id: "root",
        axis: "x",
        ratio: 0.5,
        first: defaultTree(false),
        second: defaultTree(false),
      },
      allowed,
    ),
  );
  assert(!validTree({ ...defaultTree(true), ratio: NaN }, allowed));
  assert(
    validTree({ kind: "leaf", id: "other", content: "articles" }, allowed),
  );
});
