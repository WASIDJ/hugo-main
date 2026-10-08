import fs from "node:fs/promises";
import path from "node:path";
import assert from "node:assert/strict";
const site = JSON.parse(await fs.readFile(".generated/site.json", "utf8"));
const routeMap = JSON.parse(await fs.readFile("out/route-map.json", "utf8"));
for (const [route, entry] of Object.entries(site.routes)) {
  const html = await fs.readFile(path.join("out", route, "index.html"), "utf8");
  const canonical = encodeURI(site.origin + (entry.target || route));
  assert(html.includes('rel="canonical"'), `No canonical ${route}`);
  assert(
    html.includes(canonical.replaceAll("&", "&amp;")),
    `Wrong canonical ${route}`,
  );
  assert(!html.includes("llm-crawler-instructions"), `Hidden prompt ${route}`);
  assert(html.includes("application/ld+json"), `No JSON-LD ${route}`);
}
for (const row of routeMap)
  await fs.access(path.join("out", row.legacy, "index.html"));
for (const name of [
  "CNAME",
  "google940f2cda594812fc.html",
  "BingSiteAuth.xml",
  ".nojekyll",
  "robots.txt",
  "sitemap.xml",
  "index.xml",
  "search-index.json",
  "404.html",
])
  await fs.access(path.join("out", name));
const report = JSON.parse(await fs.readFile(".generated/report.json", "utf8"));
const search = JSON.parse(await fs.readFile("out/search-index.json", "utf8"));
assert.equal(search.length, report.published);
const sitemap = await fs.readFile("out/sitemap.xml", "utf8"),
  feed = await fs.readFile("out/index.xml", "utf8");
for (const file of report.skipped) {
  const slug = path.basename(file, ".md").toLowerCase().replace(/\s+/g, "-");
  assert(
    !search.some((p) => p.path === `/post/${slug}/`),
    `Draft in search ${file}`,
  );
  assert(!sitemap.includes(`/post/${slug}/`), `Draft in sitemap ${file}`);
  assert(!feed.includes(`/post/${slug}/`), `Draft in feed ${file}`);
}
console.log(
  `Export verified: ${Object.keys(site.routes).length} pages, ${routeMap.length} legacy URLs, ${report.published} published posts. Verification files, canonical, JSON-LD, RSS and draft exclusion passed.`,
);
