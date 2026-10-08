import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import remarkRehype from "remark-rehype";
import rehypeRaw from "rehype-raw";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";
import rehypeKatex from "rehype-katex";
import rehypeSlug from "rehype-slug";
import rehypeStringify from "rehype-stringify";
import { visit } from "unist-util-visit";
import { codeToHast } from "shiki";
import { parse as parseYaml } from "yaml";

export const slugify = (s) =>
  String(s)
    .normalize("NFC")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^\p{L}\p{N}_-]/gu, "");
export function localPath(value) {
  if (
    typeof value !== "string" ||
    /^[a-z][a-z0-9+.-]*:/i.test(value) ||
    !value.trim() ||
    /[?#\\\u0000-\u001f]/u.test(value)
  )
    throw new Error(`Invalid local path: ${value}`);
  const path = value.startsWith("/") ? value : `/${value}`;
  if (
    path.startsWith("//") ||
    path.split("/").some((p) => p === "." || p === "..")
  )
    throw new Error(`Unsafe local path: ${value}`);
  return path.replace(/\/+$/, "") + "/";
}
export function parseSource(raw, file) {
  const frontmatter = raw.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  const data = frontmatter ? parseYaml(frontmatter[1]) || {} : {};
  const content = frontmatter ? raw.slice(frontmatter[0].length) : raw;
  const section = file.split("/")[0];
  const stem = file.replace(/\.md$/i, "").split("/").at(-1);
  const path = data.url
    ? localPath(data.url)
    : `/${section}/${slugify(data.slug || stem)}/`;
  const date = (v) => (v ? new Date(v).toISOString() : "");
  const list = (v) => (Array.isArray(v) ? v.map(String) : v ? [String(v)] : []);
  return {
    id: path,
    path,
    file,
    title: String(data.title || stem),
    description: String(data.description || ""),
    date: date(data.date),
    updated: date(data.lastmod || data.date),
    tags: list(data.tags),
    categories: list(data.categories),
    aliases: list(data.aliases).map((a) =>
      localPath(a.startsWith("/") ? a : `/${section}/${a}`),
    ),
    draft: data.draft === true,
    image: typeof data.image === "string" ? data.image : "",
    author: String(data.author || "Ryou"),
    links: Array.isArray(data.links) ? data.links : [],
    content,
    section,
    comments: data.comments !== false,
  };
}
function callouts() {
  return (tree) =>
    visit(tree, "blockquote", (node) => {
      const first = node.children[0];
      const text = first?.children?.[0];
      if (text?.type !== "text") return;
      const match = text.value.match(
        /^\[!([\w-]+)\]([+-])?\s*([^\n]*)(?:\n|$)/,
      );
      if (!match) return;
      text.value = text.value.slice(match[0].length);
      node.data = {
        hProperties: {
          className: ["callout", `callout-${match[1].toLowerCase()}`],
        },
      };
      node.children.unshift({
        type: "paragraph",
        data: { hProperties: { className: ["callout-title"] } },
        children: [{ type: "text", value: match[3] || match[1].toUpperCase() }],
      });
    });
}
function wikiLinks() {
  return (tree) =>
    visit(tree, "text", (node, index, parent) => {
      if (!parent || parent.type === "link") return;
      const pattern = /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g;
      const nodes = [];
      let pos = 0,
        m;
      while ((m = pattern.exec(node.value))) {
        nodes.push({ type: "text", value: node.value.slice(pos, m.index) });
        const target = m[1];
        const url = /^https?:\/\//.test(target)
          ? target
          : `/${target.replace(/^\//, "")}`;
        nodes.push({
          type: "link",
          url,
          children: [{ type: "text", value: m[2] || target }],
        });
        pos = m.index + m[0].length;
      }
      if (pos) {
        nodes.push({ type: "text", value: node.value.slice(pos) });
        parent.children.splice(index, 1, ...nodes);
        return index + nodes.length;
      }
    });
}
const schema = {
  ...defaultSchema,
  clobberPrefix: "",
  attributes: {
    ...defaultSchema.attributes,
    "*": [...(defaultSchema.attributes["*"] || []), "className", "id"],
    code: [
      ...(defaultSchema.attributes.code || []),
      ["className", /^language-/, /^math-/],
    ],
    a: [
      ...(defaultSchema.attributes.a || []),
      "dataFootnoteRef",
      "dataFootnoteBackref",
      "ariaLabel",
    ],
    section: [...(defaultSchema.attributes.section || []), "dataFootnotes"],
    img: [
      ...(defaultSchema.attributes.img || []),
      "loading",
      "width",
      "height",
    ],
  },
};
function decorate() {
  return async (tree) => {
    const jobs = [];
    visit(tree, "element", (node, index, parent) => {
      if (node.tagName === "img") {
        node.properties.loading = "lazy";
        node.properties.alt ||= "文章配图";
      }
      if (
        node.tagName === "a" &&
        /^https?:\/\//.test(String(node.properties.href))
      ) {
        node.properties.rel = ["noopener", "noreferrer"];
      }
      if (node.tagName === "pre" && node.children[0]?.tagName === "code") {
        const code = node.children[0];
        const language =
          code.properties.className
            ?.find((c) => c.startsWith("language-"))
            ?.slice(9) || "text";
        const value = code.children.map((c) => c.value || "").join("");
        if (language === "mermaid") {
          node.properties.className = ["mermaid-source"];
          return;
        }
        jobs.push(
          (async () => {
            let highlighted;
            try {
              highlighted = await codeToHast(value, {
                lang: language,
                themes: { dark: "catppuccin-mocha", light: "catppuccin-latte" },
                defaultColor: "dark",
              });
            } catch {
              highlighted = await codeToHast(value, {
                lang: "text",
                themes: { dark: "catppuccin-mocha", light: "catppuccin-latte" },
                defaultColor: "dark",
              });
            }
            parent.children[index] = highlighted.children[0];
          })(),
        );
      }
    });
    await Promise.all(jobs);
  };
}
function deduplicateTitle({ title }) {
  return (tree) => {
    const first = tree.children.find((node) => node.type === "element");
    const text = (node) =>
      node.type === "text"
        ? node.value
        : (node.children || []).map(text).join("");
    const normalize = (value) => value.replace(/\s+/g, "").trim();
    if (
      title &&
      first?.tagName === "h1" &&
      normalize(text(first)) === normalize(title)
    ) {
      first.tagName = "span";
      first.properties = {
        id: first.properties.id,
        ariaHidden: "true",
        className: ["source-title-anchor"],
      };
      first.children = [];
    }
  };
}
export async function renderMarkdown(content, title = "") {
  const unsupported = [...content.matchAll(/\{\{[<%][\s\S]*?[>%]\}\}/g)].map(
    (m) => m[0],
  );
  const html = String(
    await unified()
      .use(remarkParse)
      .use(remarkGfm)
      .use(remarkMath)
      .use(callouts)
      .use(wikiLinks)
      .use(remarkRehype, { allowDangerousHtml: true })
      .use(rehypeRaw)
      .use(rehypeSanitize, schema)
      .use(rehypeKatex, { strict: "ignore", throwOnError: false })
      .use(rehypeSlug)
      .use(decorate)
      .use(deduplicateTitle, { title })
      .use(rehypeStringify)
      .process(content),
  );
  const headings = [
    ...html.matchAll(/<h([23]) id="([^"]+)"[^>]*>(.*?)<\/h\1>/gs),
  ].map((m) => ({
    level: Number(m[1]),
    id: m[2],
    text: m[3].replace(/<[^>]*>/g, ""),
  }));
  const plain = content
    .replace(/```[^\n]*\n([\s\S]*?)```/g, "$1")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/[#*`>\[\]]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return { html, headings, plain, unsupported };
}
export const xmlEscape = (s) =>
  String(s).replace(
    /[<>&"']/g,
    (c) =>
      ({
        "<": "&lt;",
        ">": "&gt;",
        "&": "&amp;",
        '"': "&quot;",
        "'": "&apos;",
      })[c],
  );
