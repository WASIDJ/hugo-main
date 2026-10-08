"use client";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { usePathname, useRouter } from "next/navigation";
import Link from "./link";
import {
  Terminal,
  Search,
  Sun,
  Moon,
  Settings,
  Maximize2,
  Minimize2,
  X,
  SplitSquareHorizontal,
  SplitSquareVertical,
  ArrowUpRight,
  Keyboard,
  RotateCcw,
  BookOpen,
  GitBranch,
  User,
  Link as LinkIcon,
  House,
} from "lucide-react";
import type { Catalog, Page } from "@/lib/types";
import {
  type Tree,
  type Leaf,
  type Axis,
  leaves,
  split,
  remove,
  resize,
  resizeParent,
  replace,
  defaultTree,
  validTree,
} from "@/lib/workspace";
import { PaneSummary } from "./views";
import { Article } from "./article";
const windows = [
  { path: "/", label: "首页", name: "home", Icon: House },
  { path: "/post/", label: "文章", name: "journal", Icon: BookOpen },
  { path: "/page/projects/", label: "项目", name: "projects", Icon: GitBranch },
  { path: "/page/关于/", label: "关于", name: "about", Icon: User },
  { path: "/page/友链/", label: "友链", name: "links", Icon: LinkIcon },
];
const getStorage = (key: string) => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};
const setStorage = (key: string, value: string) => {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* Optional preferences only. */
  }
};
const editable = (el: EventTarget | null) =>
  el instanceof HTMLElement &&
  !!el.closest('input,textarea,select,[contenteditable="true"]');
type Chord = {
  key: string;
  ctrl: boolean;
  alt: boolean;
  meta: boolean;
  shift: boolean;
};
const defaultPrefix: Chord = {
  key: "q",
  ctrl: true,
  alt: false,
  meta: false,
  shift: false,
};
const eventKey = (e: KeyboardEvent) =>
  e.altKey && /^Key[A-Z]$/.test(e.code)
    ? e.code.slice(3).toLowerCase()
    : e.key.toLowerCase();
const matches = (e: KeyboardEvent, c: Chord) =>
  eventKey(e) === c.key &&
  e.ctrlKey === c.ctrl &&
  e.altKey === c.alt &&
  e.metaKey === c.meta &&
  e.shiftKey === c.shift;
const chordLabel = (c: Chord) =>
  [
    c.ctrl ? "Ctrl" : null,
    c.alt ? "Alt" : null,
    c.meta ? "Cmd" : null,
    c.shift ? "Shift" : null,
    c.key.toUpperCase(),
  ]
    .filter(Boolean)
    .join("+");
const helpRows = [
  ["1–5", "切换栏目窗口"],
  ["v / s", "左右 / 上下分屏"],
  ["z", "放大 / 还原 pane"],
  ["x", "关闭 pane"],
  ["o", "当前内容链接"],
  ["u", "栏目选择器"],
  ["b", "上一栏目"],
  ["?", "快捷键与设置"],
];
function RemoteContent({ id, paneKey }: { id: string; paneKey: string }) {
  const [page, setPage] = useState<Page | null>(null),
    [failed, setFailed] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    setPage(null);
    setFailed(false);
    fetch(`/panes/${paneKey}.json`, {
      signal: controller.signal,
    })
      .then((r) => {
        if (!r.ok) throw new Error("content");
        return r.json();
      })
      .then(setPage)
      .catch((e) => {
        if (e.name !== "AbortError") setFailed(true);
      });
    return () => controller.abort();
  }, [id, paneKey]);
  return page ? (
    <Article page={page} track={false} />
  ) : (
    <div className="loading-content" role="status">
      {failed ? (
        <>
          <p>内容暂时无法加载。</p>
          <Link href={id}>
            打开完整页面 <ArrowUpRight size={14} />
          </Link>
        </>
      ) : (
        <p>正在打开文章…</p>
      )}
    </div>
  );
}
export function Workspace({
  children,
  catalog,
  home = false,
  title = "workspace",
  canonical = "/",
}: {
  children: ReactNode;
  catalog: Catalog;
  home?: boolean;
  title?: string;
  canonical?: string;
}) {
  const router = useRouter(),
    pathname = usePathname();
  const [tree, setTree] = useState<Tree>(() => defaultTree(home));
  const [focus, setFocus] = useState("main"),
    [zoom, setZoom] = useState<string | null>(null);
  const [theme, setTheme] = useState("dark"),
    [enabled, setEnabled] = useState(true),
    [prefix, setPrefix] = useState<Chord>(defaultPrefix),
    [armed, setArmed] = useState(false),
    [recording, setRecording] = useState(false),
    [restored, setRestored] = useState(false);
  const [modal, setModal] = useState<
      null | "settings" | "windows" | "content" | "links"
    >(null),
    [splitAxis, setSplitAxis] = useState<Axis | null>(null),
    [notice, setNotice] = useState(""),
    [clock, setClock] = useState("--:--"),
    [modalQuery, setModalQuery] = useState("");
  const dialog = useRef<HTMLDialogElement>(null),
    surface = useRef<HTMLDivElement>(null),
    previousPath = useRef("/"),
    timer = useRef<ReturnType<typeof setTimeout> | null>(null),
    counter = useRef(0),
    wasRestored = useRef(false);
  const allowed = new Set([
    "main",
    "intro",
    "articles",
    "projects",
    ...catalog.posts.map((p) => p.path),
  ]);
  const active =
    canonical === "/"
      ? 0
      : canonical.startsWith("/post/") ||
          canonical.startsWith("/tags/") ||
          canonical.startsWith("/categories/")
        ? 1
        : canonical.includes("projects")
          ? 2
          : canonical.includes("友链")
            ? 4
            : 3;
  const persistKey = `ryou-workspace:v1:${canonical}`;
  useEffect(() => {
    try {
      const saved = getStorage(persistKey);
      if (saved) {
        const value = JSON.parse(saved);
        if (validTree(value.tree, allowed)) {
          setTree(value.tree);
          setFocus(
            leaves(value.tree).some((l) => l.id === value.focus)
              ? value.focus
              : leaves(value.tree)[0].id,
          );
          if (value.zoom && leaves(value.tree).some((l) => l.id === value.zoom))
            setZoom(value.zoom);
        }
      }
    } catch {
      /* Ignore stale or corrupt layouts. */
    }
    wasRestored.current = true;
    setRestored(true);
    const savedTheme = getStorage("ryou-theme");
    if (savedTheme === "light") setTheme("light");
    setEnabled(getStorage("ryou-keys") !== "off");
    try {
      const saved = JSON.parse(getStorage("ryou-prefix") || "null");
      if (
        saved &&
        typeof saved.key === "string" &&
        saved.key.length === 1 &&
        ["ctrl", "alt", "meta", "shift"].every(
          (k) => typeof saved[k] === "boolean",
        )
      )
        setPrefix(saved);
    } catch {
      /* Use tmux default. */
    }
    const tick = () =>
      setClock(
        new Intl.DateTimeFormat("en-GB", {
          hour: "2-digit",
          minute: "2-digit",
          timeZone: "Asia/Shanghai",
        }).format(new Date()),
      );
    tick();
    const interval = setInterval(tick, 60000);
    return () => {
      clearInterval(interval);
      if (timer.current) clearTimeout(timer.current);
    };
    // Each route owns its layout and is remounted by the server view.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [persistKey]);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    if (restored) setStorage("ryou-theme", theme);
  }, [theme, restored]);
  useEffect(() => {
    if (wasRestored.current)
      setStorage(persistKey, JSON.stringify({ tree, focus, zoom }));
  }, [tree, focus, zoom, persistKey]);
  useEffect(() => {
    if (modal) {
      setModalQuery("");
      dialog.current?.showModal();
    } else dialog.current?.close();
  }, [modal]);
  const notify = useCallback((message: string) => setNotice(message), []);
  const focusPane = useCallback((id: string) => {
    setFocus(id);
    surface.current
      ?.querySelector<HTMLElement>(`[data-pane="${id}"]`)
      ?.focus({ preventScroll: true });
  }, []);
  const navigate = useCallback(
    (path: string) => {
      previousPath.current = pathname;
      setStorage("ryou-previous-window", pathname);
      router.push(path);
      setModal(null);
    },
    [pathname, router],
  );
  const startSplit = useCallback(
    (axis: Axis) => {
      if (leaves(tree).length >= 4) {
        notify("最多同时打开 4 个 pane。");
        return;
      }
      setSplitAxis(axis);
      setModal("content");
    },
    [tree, notify],
  );
  const chooseContent = (content: string) => {
    if (splitAxis) {
      const id = `pane-${Date.now()}-${counter.current++}`;
      setTree((t) => split(t, focus, splitAxis, id, content));
      setFocus(id);
      setZoom(null);
    } else {
      const target = leaves(tree).find((l) => l.id === focus);
      if (target && target.content !== "main")
        setTree((t) => replace(t, focus, { ...target, content }));
    }
    setModal(null);
    setSplitAxis(null);
  };
  const closePane = useCallback(() => {
    const next = remove(tree, focus);
    if (!next) {
      setTree(defaultTree(home));
      setFocus("main");
      setZoom(null);
      notify("已恢复当前栏目的默认布局。");
      return;
    }
    setTree(next);
    setFocus(leaves(next)[0].id);
    setZoom(null);
  }, [tree, focus, home, notify]);
  const move = useCallback(
    (direction: string) => {
      const elements = [
        ...(surface.current?.querySelectorAll<HTMLElement>("[data-pane]") ||
          []),
      ];
      const current = elements.find((e) => e.dataset.pane === focus);
      if (!current) return;
      const r = current.getBoundingClientRect(),
        x = r.left + r.width / 2,
        y = r.top + r.height / 2;
      const candidates = elements
        .filter((e) => e !== current)
        .map((e) => {
          const rect = e.getBoundingClientRect();
          return {
            id: e.dataset.pane!,
            x: rect.left + rect.width / 2,
            y: rect.top + rect.height / 2,
          };
        })
        .filter((p) =>
          direction === "h"
            ? p.x < x
            : direction === "l"
              ? p.x > x
              : direction === "k"
                ? p.y < y
                : p.y > y,
        )
        .sort(
          (a, b) => Math.hypot(a.x - x, a.y - y) - Math.hypot(b.x - x, b.y - y),
        );
      if (candidates[0]) focusPane(candidates[0].id);
    },
    [focus, focusPane],
  );
  useEffect(() => {
    const listener = (e: KeyboardEvent) => {
      if (recording) {
        e.preventDefault();
        if (e.key === "Escape") {
          setRecording(false);
          return;
        }
        if (["Control", "Shift", "Alt", "Meta"].includes(e.key)) return;
        if (e.key.length !== 1 || !(e.ctrlKey || e.altKey || e.metaKey)) {
          notify("请使用带 Ctrl、Alt 或 Cmd 的字母组合。");
          return;
        }
        const next = {
          key: eventKey(e),
          ctrl: e.ctrlKey,
          alt: e.altKey,
          meta: e.metaKey,
          shift: e.shiftKey,
        };
        setPrefix(next);
        setStorage("ryou-prefix", JSON.stringify(next));
        setRecording(false);
        return;
      }
      if (e.key === "Escape") {
        setArmed(false);
        if (modal) setModal(null);
        return;
      }
      if (!enabled || modal || editable(e.target)) return;
      if (matches(e, prefix)) {
        e.preventDefault();
        setArmed(true);
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(() => setArmed(false), 2000);
        return;
      }
      if (armed) {
        e.preventDefault();
        setArmed(false);
        if (timer.current) clearTimeout(timer.current);
        const key = eventKey(e);
        if (/^[1-5]$/.test(key)) navigate(windows[Number(key) - 1].path);
        else if (key === "v") startSplit("x");
        else if (key === "s") startSplit("y");
        else if (key === "z") setZoom((z) => (z ? null : focus));
        else if (key === "x") closePane();
        else if (key === "o") setModal("links");
        else if (key === "u") setModal("windows");
        else if (key === "b")
          navigate(getStorage("ryou-previous-window") || previousPath.current);
        else if (key === "?") setModal("settings");
        return;
      }
      if (
        e.altKey &&
        !e.ctrlKey &&
        !e.metaKey &&
        !e.shiftKey &&
        ["n", "p"].includes(eventKey(e))
      ) {
        e.preventDefault();
        navigate(windows[(active + (eventKey(e) === "n" ? 1 : 4)) % 5].path);
        return;
      }
      if (
        e.altKey &&
        !e.ctrlKey &&
        !e.metaKey &&
        ["h", "j", "k", "l"].includes(eventKey(e))
      ) {
        e.preventDefault();
        const key = eventKey(e);
        if (e.shiftKey) {
          const axis = key === "h" || key === "l" ? "x" : "y";
          setTree((t) =>
            resizeParent(
              t,
              focus,
              axis,
              key === "h" || key === "k" ? -0.05 : 0.05,
            ),
          );
        } else move(key);
        return;
      }
    };
    window.addEventListener("keydown", listener);
    return () => window.removeEventListener("keydown", listener);
  }, [
    recording,
    enabled,
    modal,
    prefix,
    armed,
    focus,
    navigate,
    startSplit,
    closePane,
    move,
    notify,
    active,
  ]);
  const paneTitle = (content: string) =>
    content === "main"
      ? home
        ? "whoami"
        : title
      : content === "intro"
        ? "whoami"
        : content === "articles"
          ? "journal.md"
          : content === "projects"
            ? "projects/"
            : catalog.posts.find((p) => p.path === content)?.title || "content";
  const renderLeaf = (leaf: Leaf) => (
    <section
      className={`pane ${focus === leaf.id ? "is-focused is-mobile-selected" : ""}`}
      data-pane={leaf.id}
      key={leaf.id}
      tabIndex={-1}
      aria-label={`Pane: ${paneTitle(leaf.content)}`}
      onPointerDown={() => setFocus(leaf.id)}
      onFocus={() => setFocus(leaf.id)}
    >
      <header className="pane-header">
        <button
          className="pane-name"
          onClick={() => focusPane(leaf.id)}
          aria-label={`聚焦 ${leaves(tree).findIndex((l) => l.id === leaf.id) + 1} ${paneTitle(leaf.content)}`}
        >
          <span className="pane-number">
            {leaves(tree).findIndex((l) => l.id === leaf.id) + 1}
          </span>
          <span>{paneTitle(leaf.content)}</span>
        </button>
        <span className="pane-path">
          {leaf.content === "main"
            ? canonical
            : "~/" + (leaf.content.startsWith("/") ? "journal" : leaf.content)}
        </span>
        <div className="pane-controls">
          <button
            title="左右分屏"
            aria-label="左右分屏"
            onClick={() => {
              setFocus(leaf.id);
              startSplit("x");
            }}
          >
            <SplitSquareHorizontal size={13} />
          </button>
          <button
            title="上下分屏"
            aria-label="上下分屏"
            onClick={() => {
              setFocus(leaf.id);
              startSplit("y");
            }}
          >
            <SplitSquareVertical size={13} />
          </button>
          <button
            title="放大或还原"
            aria-label="放大或还原 pane"
            onClick={() => {
              setFocus(leaf.id);
              setZoom((z) => (z ? null : leaf.id));
            }}
          >
            {zoom ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
          </button>
          {
            <button
              title="关闭 pane"
              aria-label="关闭 pane"
              onClick={() => {
                const next = remove(tree, leaf.id);
                if (next) {
                  setTree(next);
                  setFocus(leaves(next)[0].id);
                } else {
                  setTree(defaultTree(home));
                  setFocus("main");
                }
                setZoom(null);
              }}
            >
              <X size={13} />
            </button>
          }
        </div>
      </header>
      <div className="pane-body" data-pane-scroll>
        {leaf.content === "main" ? (
          children
        ) : ["intro", "articles", "projects"].includes(leaf.content) ? (
          <PaneSummary content={leaf.content} catalog={catalog} />
        ) : (
          <RemoteContent
            id={leaf.content}
            paneKey={
              catalog.posts.find((p) => p.path === leaf.content)?.paneKey ||
              "missing"
            }
          />
        )}
      </div>
    </section>
  );
  const renderTree = (node: Tree): ReactNode => {
    if (node.kind === "leaf") return renderLeaf(node);
    return (
      <div
        className={`split split-${node.axis}`}
        data-split={node.id}
        key={node.id}
      >
        <div
          className="split-part"
          style={{ flexBasis: `${node.ratio * 100}%` }}
        >
          {renderTree(node.first)}
        </div>
        <div
          className={`resize-handle handle-${node.axis}`}
          role="separator"
          tabIndex={0}
          aria-label={node.axis === "x" ? "调整左右分屏" : "调整上下分屏"}
          aria-orientation={node.axis === "x" ? "vertical" : "horizontal"}
          aria-valuemin={20}
          aria-valuemax={80}
          aria-valuenow={Math.round(node.ratio * 100)}
          onKeyDown={(e) => {
            if (
              ["ArrowLeft", "ArrowUp", "ArrowRight", "ArrowDown"].includes(
                e.key,
              )
            ) {
              e.preventDefault();
              e.stopPropagation();
              setTree((t) =>
                resize(
                  t,
                  node.id,
                  node.ratio +
                    (["ArrowLeft", "ArrowUp"].includes(e.key) ? -0.05 : 0.05),
                ),
              );
            }
          }}
          onPointerDown={(e) => {
            e.preventDefault();
            const handle = e.currentTarget;
            handle.setPointerCapture(e.pointerId);
            const container = handle.parentElement!;
            const rect = container.getBoundingClientRect();
            const update = (event: PointerEvent) =>
              setTree((t) =>
                resize(
                  t,
                  node.id,
                  node.axis === "x"
                    ? (event.clientX - rect.left) / rect.width
                    : (event.clientY - rect.top) / rect.height,
                ),
              );
            const stop = () => {
              handle.removeEventListener("pointermove", update);
              handle.removeEventListener("pointerup", stop);
              handle.removeEventListener("pointercancel", stop);
            };
            handle.addEventListener("pointermove", update);
            handle.addEventListener("pointerup", stop);
            handle.addEventListener("pointercancel", stop);
          }}
        />
        <div
          className="split-part"
          style={{ flexBasis: `${(1 - node.ratio) * 100}%` }}
        >
          {renderTree(node.second)}
        </div>
      </div>
    );
  };
  const activeLeaf = zoom ? leaves(tree).find((l) => l.id === zoom) : null;
  const currentLinks =
    modal === "links"
      ? [
          ...(surface.current
            ?.querySelector<HTMLElement>(`[data-pane="${focus}"]`)
            ?.querySelectorAll<HTMLAnchorElement>("a[href]") || []),
        ]
          .map((a) => ({
            href: a.href,
            label: a.textContent?.trim() || a.href,
          }))
          .filter(
            (a, i, list) => list.findIndex((b) => b.href === a.href) === i,
          )
      : [];
  return (
    <div className="terminal-shell" data-ready={restored ? "true" : "false"}>
      <a className="skip-link" href="#workspace">
        跳到内容
      </a>
      <header className="shell-header">
        <Link className="brand" href="/">
          <Terminal size={20} />
          <strong>
            ryou<span>.workspace</span>
          </strong>
        </Link>
        <div className="header-center">
          <span className="live-dot" /> 一个持续生长的个人工作台
        </div>
        <nav className="header-actions" aria-label="站点工具">
          <Link href="/page/search/" aria-label="搜索文章">
            <Search size={17} />
          </Link>
          <button
            onClick={() => setTheme((t) => (t === "dark" ? "light" : "dark"))}
            aria-label={theme === "dark" ? "切换浅色主题" : "切换深色主题"}
          >
            {theme === "dark" ? <Sun size={17} /> : <Moon size={17} />}
          </button>
          <button
            onClick={() => setModal("settings")}
            aria-label="快捷键与设置"
          >
            <Keyboard size={17} />
          </button>
          <a
            href="https://github.com/WASIDJ"
            target="_blank"
            rel="noreferrer"
            className="github-link"
          >
            GitHub <ArrowUpRight size={14} />
          </a>
        </nav>
      </header>
      <div className="workspace-caption" role="region" aria-label="当前位置">
        <span>
          <span className="caption-slash">~/</span> {windows[active].name}
          <span className="caption-sep"> / </span>
          {home ? "welcome" : title}
        </span>
        <button onClick={() => setModal("settings")}>
          <span className="desktop-hint">
            <kbd>{chordLabel(prefix)}</kbd> + <kbd>?</kbd>
          </span>
          <span className="mobile-hint">操作帮助</span>
        </button>
      </div>
      <main
        className={`workspace ${home ? "home-workspace" : "document-workspace"} ${zoom ? "is-zoomed" : ""}`}
        id="workspace"
        ref={surface}
      >
        {activeLeaf ? renderLeaf(activeLeaf) : renderTree(tree)}
      </main>
      <div className="workspace-bottom" role="region" aria-label="工作台状态">
        <span>
          <span className="live-dot" /> {notice || "独立思考 · 开放构建"}
        </span>
        <button
          onClick={() => {
            setTree(defaultTree(home));
            setFocus("main");
            setZoom(null);
            notify("布局已重置。");
          }}
        >
          <RotateCcw size={12} /> 重置布局
        </button>
        <span className="desktop-hint">
          {leaves(tree).length} panes · {zoom ? "zoom" : focus}
        </span>
      </div>
      <footer className="statusbar">
        <button
          className={`session-pill ${armed ? "prefix-active" : ""}`}
          onClick={() => setModal("windows")}
          aria-label={`选择栏目 ${armed ? "PREFIX" : "ryou"}`}
        >
          <Terminal size={15} />
          <span>{armed ? "PREFIX" : "ryou"}</span>
        </button>
        <nav className="window-tabs" aria-label="主导航">
          {windows.map((w, i) => (
            <Link
              key={w.path}
              href={w.path}
              className={active === i ? "active" : ""}
              onClick={() => setStorage("ryou-previous-window", pathname)}
              aria-current={active === i ? "page" : undefined}
            >
              <span>{i + 1}</span>
              <w.Icon size={13} />
              <span>{w.label}</span>
            </Link>
          ))}
        </nav>
        <div className="status-right">
          <span className="status-command">{windows[active].name}</span>
          <span className="status-host">wasidj</span>
          <span className="status-clock">
            {clock} <small>CST</small>
          </span>
        </div>
      </footer>
      <dialog
        ref={dialog}
        className="workspace-dialog"
        onCancel={() => {
          setModal(null);
          setRecording(false);
        }}
        onClose={() => {
          setModal(null);
          setRecording(false);
        }}
      >
        <header>
          <div>
            <span className="eyebrow">WORKSPACE / COMMAND MENU</span>
            <h2>
              {modal === "settings"
                ? "快捷键与设置"
                : modal === "windows"
                  ? "切换栏目"
                  : modal === "links"
                    ? "当前内容链接"
                    : "在新 pane 中打开"}
            </h2>
          </div>
          <button onClick={() => setModal(null)} aria-label="关闭菜单">
            <X size={20} />
          </button>
        </header>
        {modal === "settings" ? (
          <div className="settings-content">
            <div className="quick-actions" aria-label="当前 pane 操作">
              <button onClick={() => startSplit("x")}>左右分屏</button>
              <button onClick={() => startSplit("y")}>上下分屏</button>
              <button
                onClick={() => {
                  setZoom((z) => (z ? null : focus));
                  setModal(null);
                }}
              >
                放大 / 还原
              </button>
              <button
                onClick={() => {
                  closePane();
                  setModal(null);
                }}
              >
                关闭 pane
              </button>
              <button onClick={() => setModal("links")}>链接选择器</button>
              <button
                onClick={() =>
                  navigate(
                    getStorage("ryou-previous-window") || previousPath.current,
                  )
                }
              >
                上一栏目
              </button>
            </div>
            <p>
              沿用我的 tmux
              操作习惯。先按前缀，随后在两秒内按操作键。所有功能也可以点击操作。
            </p>
            <div className="setting-row">
              <label htmlFor="hotkeys">启用键盘快捷键</label>
              <input
                id="hotkeys"
                type="checkbox"
                checked={enabled}
                onChange={(e) => {
                  setEnabled(e.target.checked);
                  setStorage("ryou-keys", e.target.checked ? "on" : "off");
                  setArmed(false);
                }}
              />
            </div>
            <div className="setting-row">
              <span>
                前缀键 <kbd>{chordLabel(prefix)}</kbd>
              </span>
              <button
                className="secondary-button"
                onClick={() => setRecording(true)}
              >
                {recording ? "按下新的组合键，Esc 取消" : "重新绑定"}
              </button>
            </div>
            <p className="setting-note">
              部分浏览器或系统会占用 Ctrl+Q / Alt
              组合键，可重新绑定前缀或使用点击入口。输入框中不会接管快捷键。
            </p>
            <table className="shortcut-table">
              <caption className="sr-only">前缀快捷键</caption>
              <tbody>
                {helpRows.map(([keys, description]) => (
                  <tr key={keys}>
                    <th scope="row">
                      <kbd>{chordLabel(prefix)}</kbd> + <kbd>{keys}</kbd>
                    </th>
                    <td>{description}</td>
                  </tr>
                ))}
                <tr>
                  <th scope="row">
                    <kbd>Alt + h/j/k/l</kbd>
                  </th>
                  <td>切换 pane 焦点</td>
                </tr>
                <tr>
                  <th scope="row">
                    <kbd>Alt + Shift + h/j/k/l</kbd>
                  </th>
                  <td>调整分屏比例</td>
                </tr>
              </tbody>
            </table>
            <a
              className="text-link"
              href="https://github.com/WASIDJ/.config/blob/main/tmux/tmux.conf"
              target="_blank"
              rel="noreferrer"
            >
              查看原始 tmux 配置 <ArrowUpRight size={14} />
            </a>
          </div>
        ) : (
          <div className="picker">
            <label className="search-field">
              <Search size={17} />
              <span className="sr-only">筛选菜单</span>
              <input
                type="search"
                placeholder="筛选…"
                value={modalQuery}
                onChange={(e) => setModalQuery(e.target.value)}
              />
            </label>
            {modal === "windows" &&
              windows
                .filter(
                  (w) =>
                    w.label.includes(modalQuery) || w.name.includes(modalQuery),
                )
                .map((w, i) => (
                  <button key={w.path} onClick={() => navigate(w.path)}>
                    <w.Icon size={18} />
                    <span>
                      {w.label}
                      <small>{w.path}</small>
                    </span>
                    <kbd>{i + 1}</kbd>
                  </button>
                ))}
            {modal === "content" && (
              <>
                {[
                  { id: "intro", label: "个人介绍", note: "whoami" },
                  { id: "articles", label: "精选文章", note: "journal.md" },
                  { id: "projects", label: "代表项目", note: "projects/" },
                ]
                  .filter(
                    (p) =>
                      p.label.includes(modalQuery) ||
                      p.note.includes(modalQuery),
                  )
                  .map((p) => (
                    <button key={p.id} onClick={() => chooseContent(p.id)}>
                      <Terminal size={18} />
                      <span>
                        {p.label}
                        <small>{p.note}</small>
                      </span>
                      <ArrowUpRight size={14} />
                    </button>
                  ))}
                {catalog.posts
                  .filter((p) =>
                    p.title.toLowerCase().includes(modalQuery.toLowerCase()),
                  )
                  .map((p) => (
                    <button key={p.path} onClick={() => chooseContent(p.path)}>
                      <BookOpen size={18} />
                      <span>
                        {p.title}
                        <small>{p.path}</small>
                      </span>
                      <ArrowUpRight size={14} />
                    </button>
                  ))}
              </>
            )}
            {modal === "links" &&
              (currentLinks.length ? (
                currentLinks
                  .filter((l) =>
                    l.label.toLowerCase().includes(modalQuery.toLowerCase()),
                  )
                  .map((l) => (
                    <a
                      key={l.href}
                      href={l.href}
                      onClick={() => setModal(null)}
                    >
                      <LinkIcon size={17} />
                      <span>
                        {l.label}
                        <small>{l.href}</small>
                      </span>
                      <ArrowUpRight size={14} />
                    </a>
                  ))
              ) : (
                <p>这个 pane 暂时没有链接。</p>
              ))}
          </div>
        )}
      </dialog>
    </div>
  );
}
