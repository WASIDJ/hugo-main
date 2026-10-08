"use client";
import { useEffect, useRef, useState } from "react";
import Link from "./link";
import { ArrowUpRight, ArrowLeft, Copy, Check } from "lucide-react";
import type { Page } from "@/lib/types";
const statsUrl = "/api/article-stats";
function sessionGet(key: string) {
  try {
    return sessionStorage.getItem(key);
  } catch {
    return null;
  }
}
function sessionSet(key: string) {
  try {
    sessionStorage.setItem(key, "1");
  } catch {
    /* Storage may be disabled. */
  }
}
export function Article({
  page,
  track = true,
}: {
  page: Page;
  track?: boolean;
}) {
  const article = useRef<HTMLElement>(null),
    comments = useRef<HTMLDivElement>(null);
  const [stats, setStats] = useState<{
    views: number;
    completions: number;
  } | null>(null);
  const [progress, setProgress] = useState(0);
  const [showComments, setShowComments] = useState(false);
  useEffect(() => {
    const element = article.current;
    if (!element) return;
    let stopped = false;
    const local = ["localhost", "127.0.0.1", "::1"].includes(location.hostname);
    const endpoint = local
      ? "https://www.jeffkafka.top/api/article-stats"
      : statsUrl;
    const request = async (event?: "view" | "complete") => {
      try {
        const response = await fetch(
          event
            ? endpoint
            : `${endpoint}?path=${encodeURIComponent(page.path)}`,
          event
            ? {
                method: "POST",
                credentials: "include",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ path: page.path, event }),
                keepalive: true,
              }
            : { credentials: "include" },
        );
        if (!response.ok) return;
        const data = await response.json();
        if (!stopped && typeof data.views === "number") setStats(data);
        if (event) sessionSet(`article-${event}:${page.path}`);
      } catch {
        /* Reading remains available offline. */
      }
    };
    if (track && !local)
      void request(
        local || sessionGet(`article-view:${page.path}`) ? undefined : "view",
      );
    const scroll = element.closest(".pane-body") as HTMLElement | null;
    let completePending = false;
    const update = () => {
      if (!scroll) return;
      const mobile = getComputedStyle(scroll).overflowY === "visible";
      const maximum = mobile
        ? document.documentElement.scrollHeight - window.innerHeight
        : scroll.scrollHeight - scroll.clientHeight;
      const position = mobile ? window.scrollY : scroll.scrollTop;
      const percentage =
        maximum > 0 ? Math.min(100, Math.round((position / maximum) * 100)) : 0;
      setProgress(percentage);
      if (
        track &&
        !local &&
        percentage >= 90 &&
        !completePending &&
        !sessionGet(`article-complete:${page.path}`)
      ) {
        completePending = true;
        void request("complete");
      }
    };
    scroll?.addEventListener("scroll", update, { passive: true });
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    update();
    return () => {
      stopped = true;
      scroll?.removeEventListener("scroll", update);
      window.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, [page.path, track]);
  useEffect(() => {
    const root = article.current;
    if (!root) return;
    let cancelled = false;
    const cleanups: (() => void)[] = [];
    root
      .querySelectorAll<HTMLPreElement>("pre:not(.mermaid-source)")
      .forEach((pre) => {
        const button = document.createElement("button");
        button.className = "copy-code";
        button.type = "button";
        button.textContent = "复制";
        button.setAttribute("aria-label", "复制代码");
        const handler = async () => {
          try {
            await navigator.clipboard.writeText(
              pre.querySelector("code")?.textContent || "",
            );
            button.textContent = "已复制";
          } catch {
            button.textContent = "请选择代码复制";
          }
        };
        button.addEventListener("click", handler);
        pre.append(button);
        cleanups.push(() => {
          button.removeEventListener("click", handler);
          button.remove();
        });
      });
    const diagrams = [
      ...root.querySelectorAll<HTMLPreElement>("pre.mermaid-source"),
    ];
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        observer.unobserve(entry.target);
        void (async () => {
          const { default: mermaid } = await import("mermaid");
          if (cancelled) return;
          mermaid.initialize({
            startOnLoad: false,
            securityLevel: "strict",
            theme: "dark",
            fontFamily: "monospace",
            suppressErrorRendering: true,
          });
          const pre = entry.target as HTMLPreElement;
          try {
            const { svg } = await mermaid.render(
              `diagram-${crypto.randomUUID()}`,
              pre.textContent || "",
            );
            if (cancelled) return;
            const figure = document.createElement("figure");
            figure.className = "diagram";
            figure.setAttribute("aria-label", "文章流程图");
            figure.innerHTML = svg;
            pre.before(figure);
            pre.classList.add("diagram-rendered");
            cleanups.push(() => {
              figure.remove();
              pre.classList.remove("diagram-rendered");
            });
          } catch {
            pre.classList.add("diagram-fallback");
          }
        })();
      }
    });
    diagrams.forEach((d) => observer.observe(d));
    cleanups.push(() => observer.disconnect());
    const refs = [
      ...root.querySelectorAll<HTMLAnchorElement>("a[data-footnote-ref]"),
    ];
    const rail = document.createElement("aside");
    rail.className = "sidenote-rail";
    rail.setAttribute("aria-label", "文章边注");
    if (refs.length) root.dataset.notesEnhanced = "true";
    root.querySelector(".prose")?.append(rail);
    const notes: { ref: HTMLAnchorElement; note: HTMLElement }[] = [];
    refs.forEach((ref, i) => {
      const id = ref.getAttribute("href")?.slice(1);
      const source = id
        ? root.querySelector<HTMLElement>(`[id="${CSS.escape(id)}"]`)
        : null;
      if (!source) return;
      const note = document.createElement("div");
      note.className = "sidenote";
      note.innerHTML = `<span class="sidenote-number">${i + 1}</span>${source.innerHTML}`;
      rail.append(note);
      notes.push({ ref, note });
      const handler = (event: MouseEvent) => {
        event.preventDefault();
        if (getComputedStyle(rail).display !== "none") {
          note.scrollIntoView({ block: "nearest", behavior: "smooth" });
          note.tabIndex = -1;
          note.focus({ preventScroll: true });
          return;
        }
        let popup = root.querySelector<HTMLElement>(".footnote-popup");
        if (popup) {
          const same = popup.dataset.note === id;
          popup.remove();
          if (same) return;
        }
        popup = document.createElement("div");
        popup.className = "footnote-popup";
        popup.dataset.note = id;
        popup.setAttribute("role", "dialog");
        popup.setAttribute("aria-label", "脚注");
        popup.innerHTML = source.innerHTML;
        const close = document.createElement("button");
        close.type = "button";
        close.textContent = "关闭脚注";
        close.addEventListener("click", () => {
          popup?.remove();
          ref.focus();
        });
        popup.append(close);
        ref.after(popup);
        close.focus();
      };
      ref.addEventListener("click", handler);
      cleanups.push(() => ref.removeEventListener("click", handler));
    });
    const onEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      const popup = root.querySelector<HTMLElement>(".footnote-popup");
      if (popup) {
        const ref = popup.previousElementSibling as HTMLElement;
        popup.remove();
        ref?.focus();
      }
    };
    root.addEventListener("keydown", onEscape);
    cleanups.push(() => root.removeEventListener("keydown", onEscape));
    const layout = () => {
      let top = 0;
      const prose = root.querySelector(".prose");
      if (!prose) return;
      const base = prose.getBoundingClientRect().top;
      notes.forEach(({ ref, note }) => {
        const target = ref.getBoundingClientRect().top - base;
        top = Math.max(target, top);
        note.style.top = `${top}px`;
        top += note.offsetHeight + 24;
      });
    };
    const ro = new ResizeObserver(layout);
    ro.observe(root);
    layout();
    cleanups.push(() => {
      ro.disconnect();
      rail.remove();
      delete root.dataset.notesEnhanced;
      root.querySelectorAll(".footnote-popup").forEach((p) => p.remove());
    });
    if (refs.length)
      void import("rough-notation").then(({ annotate }) => {
        if (cancelled || matchMedia("(prefers-reduced-motion: reduce)").matches)
          return;
        const annotations = refs.map((ref) =>
          annotate(ref, {
            type: "circle",
            color: "#cba6f7",
            animate: true,
            animationDuration: 400,
            strokeWidth: 1,
            padding: 3,
          }),
        );
        const io = new IntersectionObserver((entries) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting) {
              annotations[
                refs.indexOf(entry.target as HTMLAnchorElement)
              ]?.show();
              io.unobserve(entry.target);
            }
          });
        });
        refs.forEach((ref) => io.observe(ref));
        cleanups.push(() => {
          io.disconnect();
          annotations.forEach((a) => a.remove());
        });
      });
    return () => {
      cancelled = true;
      cleanups.forEach((fn) => fn());
    };
  }, [page.html]);
  useEffect(() => {
    if (!showComments || !comments.current) return;
    const element = comments.current;
    const theme =
      document.documentElement.dataset.theme === "light"
        ? "light"
        : "dark_dimmed";
    const script = document.createElement("script");
    script.src = "https://giscus.app/client.js";
    script.async = true;
    script.crossOrigin = "anonymous";
    const attrs = {
      repo: "WASIDJ/wasidj.github.io",
      "repo-id": "R_kgDOQ6dAPA",
      category: "Announcements",
      "category-id": "DIC_kwDOQ6dAPM4C1ERt",
      mapping: "specific",
      term: encodeURI(page.path),
      strict: "0",
      "reactions-enabled": "1",
      "emit-metadata": "0",
      "input-position": "bottom",
      theme: theme,
      lang: "zh-CN",
      loading: "lazy",
    };
    Object.entries(attrs).forEach(([k, v]) =>
      script.setAttribute(`data-${k}`, v),
    );
    element.append(script);
    return () => {
      element.replaceChildren();
    };
  }, [showComments, page.path]);
  return (
    <article className="article" ref={article} data-article-path={page.path}>
      <div
        className="reading-progress"
        aria-label={`阅读进度 ${progress}%`}
        role="progressbar"
        aria-valuenow={progress}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <span style={{ width: `${progress}%` }} />
      </div>
      <Link className="article-back text-link" href="/post/">
        <ArrowLeft size={14} /> 返回文章
      </Link>
      <header className="article-header">
        <div className="eyebrow">
          {page.categories.join(" / ") || "JOURNAL"}
        </div>
        <h1>{page.title}</h1>
        <div className="article-meta">
          <span>{page.author}</span>
          {page.date && (
            <time dateTime={page.date}>{page.date.slice(0, 10)}</time>
          )}
          <span>{page.readingMinutes} min read</span>
          {stats && (
            <span>
              {stats.views} 次阅读 · {stats.completions} 次读完
            </span>
          )}
        </div>
        {page.description && (
          <p className="article-summary">{page.description}</p>
        )}
        <div className="post-tags">
          {page.tags.map((t) => (
            <Link
              key={t}
              href={`/tags/${t.toLowerCase().replace(/\s+/g, "-")}/`}
            >
              #{t}
            </Link>
          ))}
        </div>
      </header>
      {page.headings.length > 0 && (
        <details className="toc">
          <summary>
            文章目录 <span>{page.headings.length} sections</span>
          </summary>
          <nav aria-label="文章目录">
            {page.headings.map((h) => (
              <a
                key={h.id}
                className={`toc-depth-${h.level}`}
                href={`#${h.id}`}
                onClick={(e) => {
                  const target = article.current?.querySelector(
                    `[id="${CSS.escape(h.id)}"]`,
                  );
                  if (target) {
                    e.preventDefault();
                    target.scrollIntoView({
                      behavior: matchMedia("(prefers-reduced-motion: reduce)")
                        .matches
                        ? "instant"
                        : "smooth",
                      block: "start",
                    });
                  }
                }}
              >
                {h.text}
              </a>
            ))}
          </nav>
        </details>
      )}
      <div className="prose" dangerouslySetInnerHTML={{ __html: page.html }} />
      <footer className="article-footer">
        {page.updated && <span>内容更新于 {page.updated.slice(0, 10)}</span>}
        <a
          href={`https://github.com/WASIDJ/blog-content/blob/main/${page.file || ""}`}
          target="_blank"
          rel="noreferrer"
        >
          查看文章来源 <ArrowUpRight size={14} />
        </a>
      </footer>
      {page.comments && (
        <section className="comments">
          <h2>交流与讨论</h2>
          {!showComments ? (
            <button
              className="secondary-button"
              onClick={() => setShowComments(true)}
            >
              加载 GitHub 评论
            </button>
          ) : (
            <div ref={comments} />
          )}
          <p>
            也可以<a href="mailto:qaqnoname@163.com">通过邮件联系我</a>。
          </p>
        </section>
      )}
    </article>
  );
}
