import fs from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import sharp from "sharp";
import { execFileSync } from "node:child_process";
import { parseSource, renderMarkdown, slugify, xmlEscape } from "./content.mjs";
const origin = "https://www.jeffkafka.top";
const git = (args) =>
  execFileSync("git", ["-C", "content", ...args], {
    encoding: "utf8",
    maxBuffer: 15 * 1024 * 1024,
  });
const sha = git(["rev-parse", "HEAD"]).trim();
const files = git(["ls-tree", "-rz", "--name-only", "HEAD"])
  .split("\0")
  .filter(Boolean);
await fs.mkdir(".generated", { recursive: true });
await fs.rm("public", { recursive: true, force: true });
await fs.mkdir("public/panes", { recursive: true });
await fs.cp("static", "public", { recursive: true });
await sharp("static/og-card.svg").png().toFile("public/og-card.png");
// Preserve only assets from the committed content snapshot.
for (const file of files.filter(
  (f) =>
    /\.(png|jpe?g|gif|webp|svg|avif|pdf)$/i.test(f) &&
    !f.split("/").some((part) => part.startsWith(".")),
)) {
  if (file.includes("..")) throw new Error("Unsafe asset path");
  const dest = path.join("public", file);
  await fs.mkdir(path.dirname(dest), { recursive: true });
  await fs.writeFile(
    dest,
    execFileSync("git", ["-C", "content", "show", `HEAD:${file}`], {
      maxBuffer: 25 * 1024 * 1024,
    }),
  );
}
const pages = [];
const skipped = [];
const warnings = [];
for (const file of files.filter((f) => /^(post|page)\/.*\.md$/i.test(f))) {
  if (
    file.split("/").some((part) => part.startsWith(".")) ||
    file.endsWith("/_index.md")
  ) {
    skipped.push(file);
    continue;
  }
  const raw = git(["show", `HEAD:${file}`]);
  let page;
  try {
    page = parseSource(raw, file);
  } catch (error) {
    throw new Error(`${file}: ${error.message}`);
  }
  if (page.draft) {
    skipped.push(file);
    continue;
  }
  const rendered = await renderMarkdown(page.content, page.title);
  warnings.push(
    ...rendered.unsupported.map(
      (s) => `${file}: unsupported Hugo shortcode ${s}`,
    ),
  );
  const { content, ...meta } = page;
  pages.push({
    ...meta,
    ...rendered,
    paneKey: createHash("sha256").update(page.path).digest("hex").slice(0, 32),
    readingMinutes: Math.max(1, Math.ceil(rendered.plain.length / 600)),
  });
}
const posts = pages
  .filter((p) => p.section === "post")
  .sort((a, b) => b.date.localeCompare(a.date));
const routes = {};
const add = (p, route) => {
  if (routes[p] && JSON.stringify(routes[p]) !== JSON.stringify(route))
    throw new Error(`Route collision: ${p}`);
  routes[p] = route;
};
add("/", {
  kind: "home",
  title: "Ryou · 构建，阅读，思考",
  description:
    "Ryou 的个人工作台：Go、AI Infra 与 Agent 工程实践，开源项目，以及阅读和思考。",
});
add("/post/", {
  kind: "posts",
  title: "文章",
  description: "技术实践、阅读与个人思考。",
});
for (const page of pages) {
  const kind =
    page.section === "post"
      ? "article"
      : page.path.includes("projects")
        ? "projects"
        : page.path.includes("search")
          ? "search"
          : page.path.includes("archives")
            ? "archives"
            : page.path.includes("友链")
              ? "friends"
              : page.path === "/page/关于/"
                ? "about"
                : "page";
  add(page.path, {
    kind,
    pageId: page.path,
    title: page.title,
    description: page.description,
  });
  for (const alias of page.aliases)
    if (alias !== page.path)
      add(alias, {
        kind: "alias",
        target: page.path,
        title: page.title,
        description: page.description,
      });
}
add("/page/", {
  kind: "about",
  title: "关于 Ryou",
  description: "关于我的技术实践、阅读、写作与联系信息。",
});
for (const type of ["tags", "categories"]) {
  add(`/${type}/`, {
    kind: "taxonomy",
    taxonomy: type,
    title: type === "tags" ? "标签" : "分类",
    description: "按主题探索文章。",
  });
  const names = [...new Set(posts.flatMap((p) => p[type]))];
  for (const name of names)
    add(`/${type}/${slugify(name)}/`, {
      kind: "posts",
      taxonomy: type,
      term: name,
      title: name,
      description: `关于 ${name} 的文章与实践。`,
    });
}
const legacy = JSON.parse(
  await fs.readFile("migration/legacy-routes.json", "utf8"),
);
for (const file of legacy.paths) {
  const p = "/" + file.replace(/index\.html$/, "");
  if (routes[p]) continue;
  const taxonomy = p.match(/^\/(tags|categories)\/([^/]+)\/$/);
  if (taxonomy) {
    add(p, {
      kind: "posts",
      taxonomy: taxonomy[1],
      term: taxonomy[2],
      title: taxonomy[2],
      description: `关于 ${taxonomy[2]} 的内容。`,
    });
    continue;
  }
  const target = p.replace(/(?:page\/\d+\/)+$/, "");
  if (routes[target])
    add(p, {
      kind: "alias",
      target,
      title: routes[target].title,
      description: routes[target].description,
    });
  else throw new Error(`Unmapped legacy route: ${p}`);
}
const routeMap = legacy.paths.map((file) => {
  const p = "/" + file.replace(/index\.html$/, "");
  return { legacy: p, canonical: routes[p].target || p };
});
const index = posts.map(
  ({ plain, html, headings, unsupported, ...meta }) => meta,
);
const safeLinks = (links) =>
  links.filter(
    (l) => typeof l.website === "string" && /^https?:\/\//.test(l.website),
  );
const friends = safeLinks(
  pages.find((p) => p.path === "/page/友链/")?.links || [],
);
const projectCards = JSON.parse(
  await fs.readFile("src/lib/projects.json", "utf8"),
);
const site = {
  origin,
  contentSha: sha,
  pages,
  routes,
  posts: index,
  friends,
  projects: projectCards,
};
await fs.writeFile(".generated/site.json", JSON.stringify(site));
for (const p of pages)
  await fs.writeFile(`public/panes/${p.paneKey}.json`, JSON.stringify(p));
await fs.writeFile(
  "public/search-index.json",
  JSON.stringify(
    posts.map((p) => ({
      title: p.title,
      path: p.path,
      description: p.description,
      tags: p.tags,
      plain: p.plain,
      date: p.date,
    })),
  ),
);
await fs.writeFile("public/route-map.json", JSON.stringify(routeMap, null, 2));
await fs.writeFile(
  "public/build-info.json",
  JSON.stringify(
    {
      contentSha: sha,
      sourceRepo: "WASIDJ/blog-content",
      renderer: "Next.js",
      legacySha: legacy.commit,
    },
    null,
    2,
  ),
);
const canonical = Object.keys(routes).filter((p) => routes[p].kind !== "alias");
await fs.writeFile(
  "public/sitemap.xml",
  `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${canonical
    .map((p) => {
      const page = pages.find((x) => x.path === p);
      return `<url><loc>${xmlEscape(origin + p)}</loc>${page?.updated ? `<lastmod>${xmlEscape(page.updated)}</lastmod>` : ""}</url>`;
    })
    .join("")}</urlset>`,
);
const feed = (title, entries) =>
  `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>${xmlEscape(title)}</title><link>${origin}/</link><description>Ryou 的技术实践与个人思考</description>${entries.map((p) => `<item><title>${xmlEscape(p.title)}</title><link>${xmlEscape(origin + p.path)}</link><guid>${xmlEscape(origin + p.path)}</guid><description>${xmlEscape(p.description || p.plain.slice(0, 180))}</description>${p.date ? `<pubDate>${new Date(p.date).toUTCString()}</pubDate>` : ""}</item>`).join("")}</channel></rss>`;
for (const p of canonical) {
  const route = routes[p];
  if (!["home", "posts", "taxonomy", "about"].includes(route.kind)) continue;
  const entries = route.term
    ? posts.filter((x) => x[route.taxonomy].includes(route.term))
    : posts;
  const dest = path.join("public", p, "index.xml");
  await fs.mkdir(path.dirname(dest), { recursive: true });
  await fs.writeFile(dest, feed(route.title, entries));
}
await fs.writeFile(
  "public/robots.txt",
  `User-agent: *\nAllow: /\nDisallow: /panes/\nSitemap: ${origin}/sitemap.xml\n`,
);
await fs.writeFile("public/.nojekyll", "");
await fs.writeFile(
  ".generated/report.json",
  JSON.stringify(
    {
      contentSha: sha,
      published: posts.length,
      skipped,
      warnings,
      legacyRoutes: routeMap.length,
    },
    null,
    2,
  ),
);
console.log(
  `Content ${sha.slice(0, 12)}: ${posts.length} posts, ${skipped.length} drafts/internal files excluded, ${Object.keys(routes).length} routes (${routeMap.length} legacy).`,
);
if (warnings.length) {
  console.warn(warnings.join("\n"));
  if (process.env.CI)
    throw new Error("Resolve unsupported content before deploying");
}
