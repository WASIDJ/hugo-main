import Link from "./link";
import {
  ArrowUpRight,
  GitBranch,
  Layers,
  Terminal,
  BookOpen,
  MapPin,
  ArrowRight,
  Mail,
} from "lucide-react";
import type { Catalog, Post, Project, SiteLink } from "@/lib/types";
const date = (value: string) =>
  value
    ? new Intl.DateTimeFormat("zh-CN", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        timeZone: "Asia/Shanghai",
      })
        .format(new Date(value))
        .replaceAll("/", ".")
    : "";
export function Intro() {
  return (
    <section className="terminal-whoami">
      <h1>Ryou</h1>
      <p>Go / Backend · AI Infra · Agent Engineering</p>
      <p>
        <Link href="/post/">posts/</Link>
        {"  "}
        <Link href="/page/projects/">projects/</Link>
        {"  "}
        <Link href="/page/关于/">about.md</Link>
        {"  "}
        <Link href="/page/友链/">links.md</Link>
      </p>
      <p className="terminal-usage"># Ctrl+q ?</p>
    </section>
  );
}
export function PostList({
  posts,
  compact = false,
  title = "文章",
  subtitle = "实践留下的记录，思考留下的线索。",
}: {
  posts: Post[];
  compact?: boolean;
  title?: string;
  subtitle?: string;
}) {
  return (
    <section className={`listing ${compact ? "compact" : ""}`}>
      <div className="section-heading">
        <div>
          <span className="eyebrow">JOURNAL / 文字与思考</span>
          <h1>{compact ? "最近写下的" : title}</h1>
          {!compact && <p>{subtitle}</p>}
        </div>
        <Link
          href={compact ? "/post/" : "/page/archives/"}
          className="text-link"
        >
          {compact ? "全部文章" : "按时间归档"} <ArrowUpRight size={14} />
        </Link>
      </div>
      <div className="post-list">
        {posts.slice(0, compact ? 3 : undefined).map((p, i) => (
          <Link key={p.path} href={p.path} className="post-row">
            <span className="post-index">{String(i + 1).padStart(2, "0")}</span>
            <div>
              <div className="post-meta">
                <time dateTime={p.date}>{date(p.date)}</time>
                <span>{p.categories[0] || "随笔"}</span>
                <span>{p.readingMinutes} min</span>
              </div>
              <h2>{p.title}</h2>
              {!compact && <p>{p.description}</p>}
              <div className="post-tags">
                {p.tags.slice(0, 3).map((t) => (
                  <span key={t}>#{t}</span>
                ))}
              </div>
            </div>
            <ArrowUpRight className="row-arrow" size={18} />
          </Link>
        ))}
      </div>
      {!posts.length && <p className="empty">这个主题暂时没有已发布文章。</p>}
      {!compact && (
        <div className="listing-footer">
          <Link href="/tags/">
            浏览标签 <ArrowRight size={14} />
          </Link>
          <Link href="/categories/">
            浏览分类 <ArrowRight size={14} />
          </Link>
          <a href="/index.xml">RSS ↗</a>
        </div>
      )}
    </section>
  );
}
export function Projects({
  projects,
  compact = false,
}: {
  projects: Project[];
  compact?: boolean;
}) {
  return (
    <section className={`project-listing ${compact ? "compact" : ""}`}>
      <div className="section-heading">
        <div>
          <span className="eyebrow">LAB / 开源与实验</span>
          <h1>{compact ? "正在构建的世界" : "项目与工程实践"}</h1>
          {!compact && <p>从真实问题出发，让实现、取舍与代码共同说明。</p>}
        </div>
        {compact && (
          <Link href="/page/projects/" className="text-link">
            全部项目 <ArrowUpRight size={14} />
          </Link>
        )}
      </div>
      <div className={compact ? "project-mini-grid" : "project-grid"}>
        {projects.slice(0, compact ? 2 : undefined).map((p, i) =>
          compact ? (
            <Link
              key={p.id}
              href={`/page/projects/#${p.id}`}
              className={`project-mini accent-${p.color}`}
            >
              <div>
                <GitBranch size={18} />
                <ArrowUpRight size={14} />
              </div>
              <h2>{p.name}</h2>
              <p>{p.description}</p>
              <span>{p.tags.join(" · ")}</span>
            </Link>
          ) : (
            <article
              className={`project-card accent-${p.color}`}
              key={p.id}
              id={p.id}
            >
              <div className="project-top">
                <span>
                  {String(i + 1).padStart(2, "0")} / {p.label}
                </span>
                <GitBranch size={20} />
              </div>
              <h2>{p.name}</h2>
              <p className="project-description">{p.description}</p>
              <div className="architecture" aria-label="项目模块">
                {p.diagram.map((d, j) => (
                  <div key={d}>
                    <span>{d}</span>
                    {j < p.diagram.length - 1 && <ArrowRight size={14} />}
                  </div>
                ))}
              </div>
              <div className="case-detail">
                <h3>问题</h3>
                <p>{p.problem}</p>
                <h3>实践与贡献</h3>
                <p>{p.contribution}</p>
                <h3>技术取舍</h3>
                <p>{p.tradeoff}</p>
              </div>
              <div className="project-bottom">
                <div className="skill-tags">
                  {p.tags.map((t) => (
                    <span key={t}>{t}</span>
                  ))}
                </div>
                <a href={p.evidence} target="_blank" rel="noreferrer">
                  阅读源码与说明 <ArrowUpRight size={14} />
                </a>
              </div>
            </article>
          ),
        )}
      </div>
    </section>
  );
}
export function About() {
  return (
    <section className="about">
      <div className="command">
        <span className="prompt">~ $</span> cat about.md
      </div>
      <span className="eyebrow">THE HUMAN BEHIND THE TERMINAL</span>
      <h1>关于我</h1>
      <p className="lead">一个喜欢折腾技术，也希望留时间思考的人。</p>
      <p>
        我是 Ryou，计算机专业，生活在上海。日常关注 Go 后端、Linux、容器与 AI
        基础设施，也尝试用 Agent 构建工具与工作流。
      </p>
      <p>
        我把个人网站当作自己的长期记录：代码留下实践，文章留下判断，阅读为下一次决策提供材料。
      </p>
      <div className="about-grid">
        <div>
          <Terminal />
          <h2>工程与实践</h2>
          <p>
            Go、Docker、Linux、Git，以及围绕 Agent
            的开发实验。更关心系统怎么工作，也关心它能否真正解决问题。
          </p>
        </div>
        <div>
          <BookOpen />
          <h2>阅读与思考</h2>
          <p>
            保留阅读、写作、思考和实践的时间。愿意暴露开放问题，也愿意根据反馈修改判断。
          </p>
        </div>
      </div>
      <h2>可以从哪里了解我？</h2>
      <p>
        <Link href="/page/projects/">从项目与技术取舍开始</Link>，或
        <Link href="/post/">读一些文章</Link>
        。这里既有工程内容，也有个人兴趣与思考。
      </p>
      <div className="contact-card">
        <div>
          <span className="eyebrow">LET’S TALK</span>
          <h2>交流想法，或者一起构建。</h2>
        </div>
        <a href="mailto:qaqnoname@163.com">
          <Mail size={17} /> qaqnoname@163.com <ArrowUpRight size={15} />
        </a>
        <a href="https://github.com/WASIDJ" target="_blank" rel="noreferrer">
          GitHub / WASIDJ <ArrowUpRight size={15} />
        </a>
        <a href="/images/wechat-qr.svg">
          WeChat / wasidj <ArrowUpRight size={15} />
        </a>
      </div>
    </section>
  );
}
export function Friends({ friends }: { friends: SiteLink[] }) {
  return (
    <section className="listing">
      <span className="eyebrow">LINKS / 连接</span>
      <h1>友链与常用网站</h1>
      <p>互联网上的一些入口。</p>
      <div className="friend-list">
        {friends.map((f) => (
          <a key={f.website} href={f.website} target="_blank" rel="noreferrer">
            <Layers size={22} />
            <div>
              <h2>{f.title}</h2>
              <p>{f.description}</p>
            </div>
            <ArrowUpRight size={18} />
          </a>
        ))}
        <a href="https://antping.com/web" target="_blank" rel="noreferrer">
          <Terminal size={22} />
          <div>
            <h2>网站测速</h2>
            <p>检查网站的访问情况。</p>
          </div>
          <ArrowUpRight size={18} />
        </a>
      </div>
    </section>
  );
}
export function Archives({ posts }: { posts: Post[] }) {
  const years = [
    ...new Set(posts.map((p) => p.date.slice(0, 4) || "未标注年份")),
  ];
  return (
    <section className="listing">
      <span className="eyebrow">TIMELINE / 归档</span>
      <h1>写作时间线</h1>
      <p>共 {posts.length} 篇已发布文章。</p>
      {years.map((y) => (
        <div key={y} className="archive-year">
          <h2>{y}</h2>
          {posts
            .filter((p) => (p.date.slice(0, 4) || "未标注年份") === y)
            .map((p) => (
              <Link key={p.path} href={p.path}>
                <time>{date(p.date)}</time>
                <span>{p.title}</span>
                <ArrowUpRight size={16} />
              </Link>
            ))}
        </div>
      ))}
    </section>
  );
}
export function Taxonomy({
  posts,
  type,
}: {
  posts: Post[];
  type: "tags" | "categories";
}) {
  const names = [...new Set(posts.flatMap((p) => p[type]))];
  return (
    <section className="listing">
      <span className="eyebrow">EXPLORE / 主题</span>
      <h1>{type === "tags" ? "标签" : "分类"}</h1>
      <div className="taxonomy-grid">
        {names.map((name) => (
          <Link
            key={name}
            href={`/${type}/${name
              .toLowerCase()
              .trim()
              .replace(/\s+/g, "-")
              .replace(/[^\p{L}\p{N}_-]/gu, "")}/`}
          >
            <span>{name}</span>
            <small>
              {posts.filter((p) => p[type].includes(name)).length} 篇
            </small>
            <ArrowUpRight size={14} />
          </Link>
        ))}
      </div>
    </section>
  );
}
export function PaneSummary({
  content,
  catalog,
}: {
  content: string;
  catalog: Catalog;
}) {
  if (content === "intro") return <Intro />;
  if (content === "projects")
    return <Projects projects={catalog.projects} compact />;
  return <PostList posts={catalog.posts} compact />;
}
