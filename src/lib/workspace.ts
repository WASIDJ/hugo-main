export type Axis = "x" | "y";
export type Leaf = { kind: "leaf"; id: string; content: string };
export type Split = {
  kind: "split";
  id: string;
  axis: Axis;
  ratio: number;
  first: Tree;
  second: Tree;
};
export type Tree = Leaf | Split;
export const leaves = (tree: Tree): Leaf[] =>
  tree.kind === "leaf"
    ? [tree]
    : [...leaves(tree.first), ...leaves(tree.second)];
export const count = (tree: Tree) => leaves(tree).length;
export function replace(tree: Tree, id: string, node: Tree): Tree {
  if (tree.id === id) return node;
  return tree.kind === "leaf"
    ? tree
    : {
        ...tree,
        first: replace(tree.first, id, node),
        second: replace(tree.second, id, node),
      };
}
export function split(
  tree: Tree,
  id: string,
  axis: Axis,
  newId: string,
  content: string,
): Tree {
  if (count(tree) >= 4) return tree;
  const current = leaves(tree).find((l) => l.id === id);
  return current
    ? replace(tree, id, {
        kind: "split",
        id: `split-${newId}`,
        axis,
        ratio: 0.5,
        first: current,
        second: { kind: "leaf", id: newId, content },
      })
    : tree;
}
export function remove(tree: Tree, id: string): Tree | null {
  if (tree.kind === "leaf") return tree.id === id ? null : tree;
  const first = remove(tree.first, id),
    second = remove(tree.second, id);
  return first && second ? { ...tree, first, second } : first || second;
}
export function resize(tree: Tree, id: string, ratio: number): Tree {
  if (tree.kind === "leaf") return tree;
  return tree.id === id
    ? { ...tree, ratio: Math.max(0.2, Math.min(0.8, ratio)) }
    : {
        ...tree,
        first: resize(tree.first, id, ratio),
        second: resize(tree.second, id, ratio),
      };
}
export function resizeParent(
  tree: Tree,
  focus: string,
  axis: Axis,
  delta: number,
): Tree {
  if (tree.kind === "leaf") return tree;
  if (
    tree.axis === axis &&
    ((tree.first.kind === "leaf" && tree.first.id === focus) ||
      (tree.second.kind === "leaf" && tree.second.id === focus))
  )
    return resize(tree, tree.id, tree.ratio + delta);
  const first = resizeParent(tree.first, focus, axis, delta),
    second = resizeParent(tree.second, focus, axis, delta);
  if (first !== tree.first || second !== tree.second)
    return { ...tree, first, second };
  if (tree.axis === axis && leaves(tree).some((l) => l.id === focus))
    return resize(tree, tree.id, tree.ratio + delta);
  return tree;
}
export function defaultTree(home: boolean): Tree {
  return home
    ? {
        kind: "split",
        id: "root",
        axis: "x",
        ratio: 0.52,
        first: { kind: "leaf", id: "main", content: "main" },
        second: {
          kind: "split",
          id: "right",
          axis: "y",
          ratio: 0.54,
          first: { kind: "leaf", id: "journal", content: "articles" },
          second: { kind: "leaf", id: "builds", content: "projects" },
        },
      }
    : { kind: "leaf", id: "main", content: "main" };
}
export function validTree(value: unknown, allowed: Set<string>): value is Tree {
  let n = 0;
  const ids = new Set<string>();
  const walk = (v: unknown, depth: number): boolean => {
    if (!v || typeof v !== "object" || depth > 4) return false;
    const t = v as Tree;
    if (typeof t.id !== "string" || !t.id || ids.has(t.id)) return false;
    ids.add(t.id);
    if (t.kind === "leaf")
      return (
        ++n <= 4 && typeof t.content === "string" && allowed.has(t.content)
      );
    return (
      t.kind === "split" &&
      ["x", "y"].includes(t.axis) &&
      Number.isFinite(t.ratio) &&
      t.ratio >= 0.2 &&
      t.ratio <= 0.8 &&
      walk(t.first, depth + 1) &&
      walk(t.second, depth + 1)
    );
  };
  return (
    walk(value, 0) &&
    n > 0 &&
    leaves(value as Tree).filter((l) => l.content === "main").length <= 1
  );
}
