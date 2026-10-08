"use client";
import { useEffect, useRef, useState } from "react";
import Link from "./link";
import { Search as SearchIcon, ArrowUpRight } from "lucide-react";
type Entry = {
  title: string;
  path: string;
  description: string;
  plain: string;
  tags: string[];
};
let indexPromise: Promise<Entry[]> | undefined;
const load = () =>
  (indexPromise ??= fetch("/search-index.json")
    .then((r) => {
      if (!r.ok) throw new Error("search");
      return r.json();
    })
    .catch((e) => {
      indexPromise = undefined;
      throw e;
    }));
export function Search() {
  const [q, setQ] = useState(""),
    [index, setIndex] = useState<Entry[]>([]),
    [error, setError] = useState(false),
    [ready, setReady] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const initialize = () => {
    load()
      .then((data) => {
        setIndex(data);
        setReady(true);
        setError(false);
      })
      .catch(() => setError(true));
  };
  useEffect(() => {
    initialize();
  }, []);
  const tokens = q.toLocaleLowerCase().trim().split(/\s+/).filter(Boolean);
  const results = tokens.length
    ? index
        .filter((p) =>
          tokens.every((t) =>
            `${p.title} ${p.description} ${p.tags.join(" ")} ${p.plain}`
              .toLocaleLowerCase()
              .includes(t),
          ),
        )
        .sort(
          (a, b) =>
            Number(b.title.toLocaleLowerCase().includes(tokens[0])) -
            Number(a.title.toLocaleLowerCase().includes(tokens[0])),
        )
    : index;
  return (
    <section className="listing search-page">
      <span className="eyebrow">FIND / 全文搜索</span>
      <h1>找一条思路</h1>
      <p>搜索标题、标签与文章正文。</p>
      <label className="search-field">
        <SearchIcon size={20} />
        <span className="sr-only">搜索文章</span>
        <input
          ref={input}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Go、Agent、阅读，或者任何关键词…"
          type="search"
        />
      </label>
      {error ? (
        <div role="alert">
          搜索索引加载失败。<button onClick={initialize}>重试</button>
        </div>
      ) : (
        <p className="search-count" role="status">
          {ready ? `${results.length} 个结果` : "正在载入索引…"}
        </p>
      )}
      <div className="search-results">
        {results.map((p) => (
          <Link key={p.path} href={p.path}>
            <h2>
              {p.title}
              <ArrowUpRight size={16} />
            </h2>
            <p>{p.description || p.plain.slice(0, 140)}</p>
          </Link>
        ))}
      </div>
      <noscript>
        <p>
          全文搜索需要 JavaScript。你也可以<a href="/post/">浏览全部文章</a>或
          <a href="/tags/">按标签查找</a>。
        </p>
      </noscript>
    </section>
  );
}
