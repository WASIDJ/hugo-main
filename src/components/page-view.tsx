import type { Metadata } from "next";
import { site, catalog } from "@/lib/site";
import { Workspace } from "./workspace";
import {
  Intro,
  PostList,
  Projects,
  About,
  Friends,
  Archives,
  Taxonomy,
} from "./views";
import { Article } from "./article";
import { Search } from "./search";
export function metadataFor(path: string): Metadata {
  const r = site.routes[path],
    canonical = r?.target || path,
    page = site.pages.find((p) => p.path === canonical);
  return {
    title: r?.title,
    description:
      r?.description ||
      page?.description ||
      "Ryou 的工程实践、开源项目与个人思考。",
    alternates: {
      canonical: site.origin + canonical,
      types: { "application/rss+xml": "/index.xml" },
    },
    robots: r?.kind === "alias" ? { index: false, follow: true } : undefined,
    openGraph: {
      type: page?.section === "post" ? "article" : "website",
      url: site.origin + canonical,
      title: r?.title,
      description: r?.description,
      images: [
        {
          url: "/og-card.png",
          width: 1200,
          height: 630,
          alt: "Ryou · 构建，阅读，思考",
        },
      ],
      ...(page?.section === "post"
        ? {
            publishedTime: page.date || undefined,
            modifiedTime: page.updated || undefined,
            authors: [site.origin + "/page/关于/"],
          }
        : {}),
    },
    twitter: {
      card: "summary_large_image",
      title: r?.title,
      description: r?.description,
      images: ["/og-card.png"],
    },
  };
}
export function PageView({ path }: { path: string }) {
  const route = site.routes[path];
  const canonical = route.target || path;
  const r = site.routes[canonical];
  const page = site.pages.find((p) => p.path === canonical);
  const posts = r.term
    ? site.posts.filter((p) => p[r.taxonomy!].includes(r.term!))
    : site.posts;
  let content;
  switch (r.kind) {
    case "home":
      content = <Intro />;
      break;
    case "article":
      content = page ? <Article page={page} /> : <p>文章不存在。</p>;
      break;
    case "page":
      content = page ? (
        <Article page={page} track={false} />
      ) : (
        <p>页面不存在。</p>
      );
      break;
    case "projects":
      content = <Projects projects={catalog.projects} />;
      break;
    case "about":
      content = <About />;
      break;
    case "friends":
      content = <Friends friends={catalog.friends} />;
      break;
    case "archives":
      content = <Archives posts={posts} />;
      break;
    case "search":
      content = <Search />;
      break;
    case "taxonomy":
      content = <Taxonomy posts={posts} type={r.taxonomy!} />;
      break;
    default:
      content = <PostList posts={posts} title={r.title} />;
  }
  const schema =
    page?.section === "post"
      ? {
          "@context": "https://schema.org",
          "@type": "BlogPosting",
          headline: page.title,
          description: page.description,
          datePublished: page.date || undefined,
          dateModified: page.updated || undefined,
          author: {
            "@type": "Person",
            "@id": `${site.origin}/#person`,
            name: page.author,
            url: `${site.origin}/page/关于/`,
          },
          mainEntityOfPage: site.origin + canonical,
          inLanguage: "zh-CN",
        }
      : r.kind === "about"
        ? {
            "@context": "https://schema.org",
            "@type": "Person",
            "@id": `${site.origin}/#person`,
            name: "Ryou",
            url: site.origin + "/page/关于/",
            sameAs: [
              "https://github.com/WASIDJ",
              "https://space.bilibili.com/354814866",
            ],
          }
        : null;
  const breadcrumbs = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      {
        "@type": "ListItem",
        position: 1,
        name: "首页",
        item: site.origin + "/",
      },
      ...(canonical !== "/"
        ? [
            {
              "@type": "ListItem",
              position: 2,
              name: r.title,
              item: site.origin + canonical,
            },
          ]
        : []),
    ],
  };
  return (
    <>
      <Workspace
        key={path}
        catalog={catalog}
        home={r.kind === "home"}
        title={r.title}
        canonical={canonical}
      >
        {route.kind === "alias" && (
          <div className="alias-note">
            此链接对应
            <LinkTo path={canonical} label="文章或栏目主页面" />。
          </div>
        )}
        {content}
      </Workspace>
      {schema && <JsonLd value={schema} />}
      <JsonLd value={breadcrumbs} />
    </>
  );
}
function LinkTo({ path, label }: { path: string; label: string }) {
  return <a href={path}>{label}</a>;
}
function JsonLd({ value }: { value: unknown }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{
        __html: JSON.stringify(value).replaceAll("<", "\\u003c"),
      }}
    />
  );
}
