import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs/promises";
import {
  parseSource,
  renderMarkdown,
  localPath,
  slugify,
  xmlEscape,
} from "../scripts/content.mjs";
test("Chinese routes and relative aliases retain Hugo conventions", () => {
  const page = parseSource(
    "---\ntitle: 测试\ndate: 2026-08-22\naliases:\n  - Counting Sort\n  - /old/\n---\n正文",
    "post/LLM AGENT时代.md",
  );
  assert.equal(page.path, "/post/llm-agent时代/");
  assert.deepEqual(page.aliases, ["/post/Counting Sort/", "/old/"]);
  assert.equal(slugify("Data-Structure"), "data-structure");
  assert.throws(() => localPath("//evil.example"));
  assert.throws(() => localPath("/../private"));
});
test("compiler supports math, callouts, tables, footnotes and highlighted code", async () => {
  const input =
    '## 小节\n\n> [!tip] 提示\n> 保留内容\n\n$O(N)$\n\n| A | B |\n| - | - |\n| 1 | 2 |\n\n脚注[^one]\n\n[^one]: 来源。\n\n```go\nfmt.Println("ok")\n```\n\n```mermaid\ngraph LR\n A-->B\n```';
  const result = await renderMarkdown(input);
  assert.match(result.html, /katex/);
  assert.match(result.html, /callout-title/);
  assert.match(result.html, /<table>/);
  assert.match(result.html, /data-footnote-ref/);
  assert.match(result.html, /shiki/);
  assert.match(result.html, /mermaid-source/);
  assert.equal(result.headings[0].text, "小节");
});
test("raw HTML is sanitized and unknown Hugo syntax is reported", async () => {
  const result = await renderMarkdown(
    '<script>alert(1)</script>\n\n<a href="javascript:alert(1)" onclick="alert(2)">unsafe</a>\n\n{{< private >}}',
  );
  assert(!result.html.includes("<script"));
  assert(!result.html.includes("onclick"));
  assert(!result.html.includes("javascript:"));
  assert.equal(result.unsupported.length, 1);
  assert.equal(xmlEscape("<&>"), "&lt;&amp;&gt;");
});
test("prepared content contains only committed publications and maps every old route", async () => {
  execFileSync("node", ["scripts/prepare.mjs"], { stdio: "pipe" });
  const site = JSON.parse(await fs.readFile(".generated/site.json", "utf8"));
  const report = JSON.parse(
    await fs.readFile(".generated/report.json", "utf8"),
  );
  const legacy = JSON.parse(
    await fs.readFile("migration/legacy-routes.json", "utf8"),
  );
  assert.equal(report.published, site.posts.length);
  assert(report.published > 0);
  assert(
    site.pages.every(
      (p: any) =>
        !p.file.split("/").some((segment: string) => segment.startsWith(".")),
    ),
  );
  assert(!site.pages.some((p: any) => p.draft));
  for (const file of legacy.paths)
    assert(site.routes["/" + file.replace(/index\.html$/, "")]);
  for (const route of Object.values(site.routes) as any[])
    if (route.kind === "alias") assert(site.routes[route.target]);
});

test("matching source title renders once and retains its fragment anchor", async () => {
  const result = await renderMarkdown("# 测试标题\n\n正文。", "测试标题");
  assert(!result.html.includes("<h1"));
  assert(result.html.includes('id="测试标题"'));
  assert(result.html.includes("正文。"));
});
