"use client";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { usePathname, useRouter } from "next/navigation";
import { useTmux } from "./tmux-provider";
import {
  sessionOf,
  windowOf,
  normalizePath,
  pageName,
  sections,
  type TmuxAction,
} from "@/lib/tmux";
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
} from "@/lib/workspace";
import type { Catalog, Page } from "@/lib/types";
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

type PickerRow = {
  id: string;
  label: string;
  detail: string;
  activate: () => void;
  remove?: () => void;
};
type Overlay =
  | { type: "picker"; title: string; rows: PickerRow[] }
  | {
      type: "prompt";
      title: string;
      initial: string;
      submit: (value: string) => void;
    }
  | { type: "confirm"; title: string; accept: () => void }
  | { type: "help" }
  | { type: "status" };
const keyOf = (e: KeyboardEvent) =>
  e.altKey && /^Key[A-Z]$/.test(e.code)
    ? e.code.slice(3).toLowerCase()
    : e.key.toLowerCase();
const editable = (el: EventTarget | null) =>
  el instanceof HTMLElement &&
  !!el.closest("input,textarea,select,[contenteditable=true]");
const read = (key: string) => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};
const save = (key: string, value: string) => {
  try {
    localStorage.setItem(key, value);
  } catch {}
};

function RemotePage({ path, catalog }: { path: string; catalog: Catalog }) {
  const route = catalog.routes[path];
  const canonical = route?.target || path;
  const actual = catalog.routes[canonical];
  const [page, setPage] = useState<Page | null>(null),
    [error, setError] = useState(false);
  const metadata = catalog.pages.find((p) => p.path === canonical);
  useEffect(() => {
    setPage(null);
    setError(false);
    if (!metadata || !["article", "page"].includes(actual?.kind)) return;
    const controller = new AbortController();
    fetch(`/panes/${metadata.paneKey}.json`, { signal: controller.signal })
      .then((r) => {
        if (!r.ok) throw new Error("load");
        return r.json();
      })
      .then(setPage)
      .catch((e) => {
        if (e.name !== "AbortError") setError(true);
      });
    return () => controller.abort();
  }, [canonical, metadata?.paneKey, actual?.kind]);
  if (canonical === "/") return <Intro />;
  if (actual?.kind === "projects")
    return <Projects projects={catalog.projects} />;
  if (actual?.kind === "about") return <About />;
  if (actual?.kind === "friends") return <Friends friends={catalog.friends} />;
  if (actual?.kind === "archives") return <Archives posts={catalog.posts} />;
  if (actual?.kind === "search") return <Search />;
  if (actual?.kind === "taxonomy")
    return <Taxonomy posts={catalog.posts} type={actual.taxonomy!} />;
  if (actual?.kind === "posts")
    return (
      <PostList
        posts={
          actual.term
            ? catalog.posts.filter((p) =>
                p[actual.taxonomy!].includes(actual.term!),
              )
            : catalog.posts
        }
        title={actual.title}
      />
    );
  if (page) return <Article page={page} track={false} />;
  return (
    <p role="status">
      {error ? "cat: 内容加载失败；用 open 命令重新打开此路径。" : "loading…"}
    </p>
  );
}
function ShellInput({
  path,
  active,
  execute,
}: {
  path: string;
  active: boolean;
  execute: (command: string) => void;
}) {
  const [command, setCommand] = useState("");
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (active) input.current?.focus({ preventScroll: true });
  }, [active]);
  return (
    <form
      className="terminal-prompt"
      onSubmit={(e) => {
        e.preventDefault();
        execute(command);
        setCommand("");
      }}
    >
      <div className="shell-directory">
        <span>{path === "/" ? "~" : `~/blog${path}`}</span>
        <span className="shell-branch">main</span>
      </div>
      <label>
        <span className="shell-chevron">&gt;</span>
        <span className="sr-only">终端命令</span>
        <input
          ref={input}
          value={command}
          onChange={(e) => setCommand(e.target.value)}
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
          aria-label="终端命令"
        />
      </label>
    </form>
  );
}
const help = `prefix = Ctrl+q

SESSION
  prefix Ctrl+c    new-session
  prefix u         choose-session (j/k, Enter, x)
  prefix g         switch-session prompt
  prefix ) / (     next / previous session
  prefix Ctrl+r    rename-session
  prefix b         last-session
  prefix Q         kill-session

WINDOW
  prefix c         new-window
  prefix 1–9       select-window
  Alt+n / Alt+p    next / previous window
  prefix r / ,     rename-window
  prefix X         kill-window (y/n)
  prefix w         choose-window

PANE
  prefix v / s     split right / down
  Alt+h/j/k/l      select pane
  Alt+Shift+hjkl   resize pane
  prefix x         kill-pane
  prefix z         zoom / restore
  prefix m         toggle mouse (default: off)
  Alt+v / s / z    Ghostty split / zoom
  Alt+=            equalize splits

COPY / LINKS
  prefix Enter     copy-mode
  h/j/k/l          move cursor / scroll
  v                begin selection
  y                copy selection and exit
  prefix o         fzf URLs (type, arrows, Enter)
  prefix ?         this help

COMMANDS
  whoami · ls · posts · projects · about · links
  open <path|number> · cat <slug> · search <words>
  theme dark|light · font <size> · comments · clear

Esc / q closes this overlay.`;
export function Workspace({
  children,
  catalog,
  canonical = "/",
  title = "zsh",
}: {
  children: ReactNode;
  catalog: Catalog;
  canonical?: string;
  title?: string;
  home?: boolean;
}) {
  const { state, dispatch, ready } = useTmux();
  const router = useRouter(),
    pathname = usePathname();
  const session = sessionOf(state),
    win = windowOf(state);
  const tree = win.tree,
    focus = win.focus,
    zoom = win.zoom;
  const [armed, setArmed] = useState(false),
    [overlay, setOverlay] = useState<Overlay | null>(null),
    [query, setQuery] = useState(""),
    [selected, setSelected] = useState(0),
    [clock, setClock] = useState("--:--"),
    [notice, setNotice] = useState(""),
    [theme, setTheme] = useState("dark"),
    [fontSize, setFontSize] = useState(18),
    [prefix, setPrefix] = useState("q");
  const [copy, setCopy] = useState<{
    text: string;
    cursor: number;
    anchor: number | null;
  } | null>(null);
  const surface = useRef<HTMLElement>(null),
    dialog = useRef<HTMLDialogElement>(null),
    promptInput = useRef<HTMLInputElement>(null),
    copyPre = useRef<HTMLPreElement>(null),
    serial = useRef(0),
    interaction = useRef<"keyboard" | "pointer">("keyboard");
  useEffect(() => {
    if (ready) dispatch({ type: "path", path: normalizePath(pathname) });
  }, [pathname, ready, dispatch]);
  useEffect(() => {
    const t = read("ryou-theme");
    if (t === "light") setTheme("light");
    const size = Number(read("ryou-terminal-font"));
    if (size >= 10 && size <= 30) setFontSize(size);
    const p = read("ryou-terminal-prefix");
    if (p?.length === 1) setPrefix(p);
    const tick = () =>
      setClock(
        new Intl.DateTimeFormat("en-GB", {
          hour: "2-digit",
          minute: "2-digit",
          timeZone: "Asia/Shanghai",
        }).format(new Date()),
      );
    tick();
    const id = setInterval(tick, 60000);
    return () => clearInterval(id);
  }, []);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    if (ready) save("ryou-theme", theme);
  }, [theme, ready]);
  useEffect(() => {
    if (ready) save("ryou-terminal-font", String(fontSize));
  }, [fontSize, ready]);
  useEffect(() => {
    if (overlay) {
      setQuery(overlay.type === "prompt" ? overlay.initial : "");
      setSelected(0);
      dialog.current?.showModal();
      if (overlay.type === "prompt") promptInput.current?.focus();
      else dialog.current?.focus();
    } else dialog.current?.close();
  }, [overlay]);
  const change = useCallback(
    (action: TmuxAction, navigate = true) => {
      dispatch(action);
      if (navigate) {
        // Reducer owns the target; route synchronization runs after state commit.
        setPendingNavigation(true);
      }
    },
    [dispatch],
  );
  const [pendingNavigation, setPendingNavigation] = useState(false);
  useEffect(() => {
    if (pendingNavigation) {
      setPendingNavigation(false);
      const path = windowOf(state).path;
      if (normalizePath(pathname) !== path) router.push(path);
    }
  }, [state, pendingNavigation, pathname, router]);
  const setPane = useCallback(
    (update: Extract<TmuxAction, { type: "pane" }>) => dispatch(update),
    [dispatch],
  );
  const selectPane = useCallback(
    (id: string) => {
      interaction.current = "keyboard";
      dispatch({ type: "pane", focus: id });
      requestAnimationFrame(() =>
        surface.current
          ?.querySelector<HTMLElement>(`[data-pane="${id}"]`)
          ?.focus({ preventScroll: true }),
      );
    },
    [dispatch],
  );
  const open = useCallback(
    (path: string) => {
      const clean = normalizePath(path);
      if (!catalog.routes[clean]) {
        setNotice(`open: no such page: ${path}`);
        return;
      }
      dispatch({ type: "navigate-pane", path: clean });
      router.push(clean);
      setOverlay(null);
    },
    [catalog, dispatch, focus, tree, router],
  );
  const picker = useCallback(
    (mode: "sessions" | "windows" | "urls" | "pages") => {
      let rows: PickerRow[] = [];
      if (mode === "sessions")
        rows = state.sessions.map((s, i) => ({
          id: s.id,
          label: `${i}: ${s.name}`,
          detail: `${s.windows.length} windows${s.id === session.id ? " (attached)" : ""}`,
          activate: () => change({ type: "session", id: s.id }),
          remove: () => change({ type: "close-session", id: s.id }),
        }));
      if (mode === "windows")
        rows = session.windows.map((w, i) => ({
          id: w.id,
          label: `${i + 1}: ${w.name}${w.id === win.id ? "*" : ""}`,
          detail: w.path,
          activate: () => change({ type: "window", id: w.id }),
        }));
      if (mode === "pages")
        rows = [
          ...sections.map((s) => ({
            id: s.path,
            label: s.name,
            detail: s.path,
            activate: () => open(s.path),
          })),
          ...catalog.posts.map((p) => ({
            id: p.path,
            label: p.title,
            detail: p.path,
            activate: () => open(p.path),
          })),
        ];
      if (mode === "urls") {
        const pane = surface.current?.querySelector<HTMLElement>(
          `[data-pane="${focus}"]`,
        );
        const urls = [
          ...(pane?.querySelectorAll<HTMLAnchorElement>("a[href]") || []),
        ].map((a) => ({
          id: a.href,
          label: a.textContent?.trim() || a.href,
          detail: a.href,
          activate: () => {
            const url = new URL(a.href);
            if (url.origin === location.origin) {
              if (url.pathname === location.pathname && url.hash) {
                pane
                  ?.querySelector(
                    `[id="${CSS.escape(decodeURIComponent(url.hash.slice(1)))}"]`,
                  )
                  ?.scrollIntoView();
                return;
              }
              if (catalog.routes[normalizePath(url.pathname)]) {
                open(url.pathname);
                return;
              }
            }
            if (["http:", "https:", "mailto:"].includes(url.protocol))
              location.assign(url.href);
          },
        }));
        rows = urls.filter(
          (r, i) => urls.findIndex((u) => u.id === r.id) === i,
        );
      }
      setOverlay({
        type: "picker",
        title:
          mode === "urls"
            ? "fzf-url"
            : mode === "sessions"
              ? "choose-session"
              : mode === "windows"
                ? "choose-window"
                : "open page",
        rows,
      });
    },
    [state, session, win, focus, catalog, change, open],
  );
  const splitPane = useCallback(
    (axis: Axis) => {
      const pane = surface.current?.querySelector<HTMLElement>(
        `[data-pane="${focus}"]`,
      );
      const rect = pane?.getBoundingClientRect();
      if (
        (axis === "x" && (rect?.width || 0) < fontSize * 24) ||
        (axis === "y" && (rect?.height || 0) < fontSize * 10)
      ) {
        setNotice("create pane failed: pane too small");
        return;
      }
      if (leaves(tree).length >= 32) {
        setNotice("create pane failed: pane limit");
        return;
      }
      const id = `pane-${Date.now()}-${serial.current++}`;
      setPane({
        type: "pane",
        tree: split(tree, focus, axis, id, "shell"),
        focus: id,
        zoom: null,
      });
    },
    [focus, tree, fontSize, setPane],
  );
  const closePane = useCallback(() => {
    const next = remove(tree, focus);
    if (next)
      setPane({
        type: "pane",
        tree: next,
        focus: leaves(next)[0].id,
        zoom: null,
      });
    else change({ type: "close-window" });
  }, [tree, focus, setPane, change]);
  const move = useCallback(
    (key: string) => {
      const panes = [
        ...(surface.current?.querySelectorAll<HTMLElement>("[data-pane]") ||
          []),
      ];
      const current = panes.find((p) => p.dataset.pane === focus);
      if (!current) return;
      const r = current.getBoundingClientRect(),
        x = r.left + r.width / 2,
        y = r.top + r.height / 2;
      const candidates = panes
        .filter((p) => p !== current)
        .map((p) => {
          const q = p.getBoundingClientRect();
          return {
            id: p.dataset.pane!,
            x: q.left + q.width / 2,
            y: q.top + q.height / 2,
          };
        })
        .filter((p) =>
          key === "h"
            ? p.x < x
            : key === "l"
              ? p.x > x
              : key === "j"
                ? p.y > y
                : p.y < y,
        )
        .sort(
          (a, b) => Math.hypot(a.x - x, a.y - y) - Math.hypot(b.x - x, b.y - y),
        );
      if (candidates[0]) selectPane(candidates[0].id);
    },
    [focus, selectPane],
  );
  const execute = useCallback(
    (input: string) => {
      const [command, ...rest] = input.trim().split(/\s+/);
      const arg = rest.join(" ");
      if (!command) return;
      if (command === "help") {
        setOverlay({ type: "help" });
        return;
      }
      if (["whoami", "home"].includes(command)) {
        open("/");
        return;
      }
      const paths: Record<string, string> = {
        ls: "/post/",
        posts: "/post/",
        projects: "/page/projects/",
        about: "/page/关于/",
        links: "/page/友链/",
        archives: "/page/archives/",
      };
      if (paths[command]) {
        open(paths[command]);
        return;
      }
      if (command === "open" || command === "cat") {
        const target = /^\d+$/.test(arg)
          ? catalog.posts[Number(arg) - 1]?.path
          : catalog.pages.find(
              (p) =>
                p.path === normalizePath(arg) ||
                p.path.split("/").filter(Boolean).at(-1) === arg,
            )?.path;
        if (target) open(target);
        else setNotice(`cat: no such page: ${arg}`);
        return;
      }
      if (command === "search") {
        open("/page/search/");
        if (arg) router.push(`/page/search/?q=${encodeURIComponent(arg)}`);
        return;
      }
      if (command === "theme" && ["dark", "light"].includes(arg)) {
        setTheme(arg);
        return;
      }
      if (command === "font" && Number(arg) >= 10 && Number(arg) <= 30) {
        setFontSize(Number(arg));
        return;
      }
      if (command === "bind" && /^[a-z]$/i.test(arg)) {
        setPrefix(arg.toLowerCase());
        save("ryou-terminal-prefix", arg.toLowerCase());
        setNotice(`prefix: Ctrl+${arg.toUpperCase()}`);
        return;
      }
      if (command === "comments") {
        surface.current
          ?.querySelector(`[data-pane="${focus}"] .article`)
          ?.dispatchEvent(new CustomEvent("tmux:comments", { bubbles: true }));
        return;
      }
      if (command === "clear") {
        setPane({
          type: "pane",
          tree: replace(tree, focus, {
            kind: "leaf",
            id: focus,
            content: "shell",
          }),
        });
        return;
      }
      if (command === "pwd") {
        setNotice(win.path);
        return;
      }
      setNotice(`zsh: command not found: ${command}`);
    },
    [open, catalog, focus, tree, win.path, setPane],
  );
  const filtered =
    overlay?.type === "picker"
      ? overlay.rows.filter((r) =>
          `${r.label} ${r.detail}`.toLowerCase().includes(query.toLowerCase()),
        )
      : [];
  useEffect(() => {
    setSelected((i) => Math.min(i, Math.max(0, filtered.length - 1)));
  }, [filtered.length]);
  useEffect(() => {
    const listener = (e: KeyboardEvent) => {
      interaction.current = "keyboard";
      if (["Control", "Shift", "Alt", "Meta"].includes(e.key) || e.isComposing)
        return;
      if (overlay) {
        if (e.key === "Escape" || (e.key === "q" && !editable(e.target))) {
          e.preventDefault();
          setOverlay(null);
          return;
        }
        if (overlay.type === "confirm") {
          if (e.key.toLowerCase() === "y") {
            e.preventDefault();
            overlay.accept();
            setOverlay(null);
          } else if (e.key.toLowerCase() === "n") {
            e.preventDefault();
            setOverlay(null);
          }
          return;
        }
        if (overlay.type === "prompt") {
          if (e.key === "Enter") {
            e.preventDefault();
            overlay.submit(query);
            setOverlay(null);
          }
          return;
        }
        if (overlay.type === "picker") {
          if (
            ["ArrowDown", "ArrowUp"].includes(e.key) ||
            (e.ctrlKey && ["j", "k", "n", "p"].includes(keyOf(e))) ||
            (!editable(e.target) && ["j", "k"].includes(e.key))
          ) {
            e.preventDefault();
            const delta =
              ["ArrowDown", "j", "n"].includes(e.key) ||
              ["j", "n"].includes(keyOf(e))
                ? 1
                : -1;
            setSelected(
              (i) =>
                (i + delta + Math.max(filtered.length, 1)) %
                Math.max(filtered.length, 1),
            );
            return;
          }
          if (e.key === "Enter") {
            e.preventDefault();
            filtered[selected]?.activate();
            setOverlay(null);
            return;
          }
          if (
            !editable(e.target) &&
            e.key === "x" &&
            overlay.title === "choose-session"
          ) {
            e.preventDefault();
            filtered[selected]?.remove?.();
            setOverlay(null);
            return;
          }
          if (e.key === "/" && !editable(e.target)) {
            e.preventDefault();
            promptInput.current?.focus();
            return;
          }
        }
        return;
      }
      if (copy) {
        if (e.key === "Escape" || e.key === "q") {
          e.preventDefault();
          setCopy(null);
          return;
        }
        if (e.key === "v") {
          e.preventDefault();
          setCopy((c) =>
            c ? { ...c, anchor: c.anchor === null ? c.cursor : null } : c,
          );
          return;
        }
        if (
          [
            "h",
            "j",
            "k",
            "l",
            "ArrowLeft",
            "ArrowRight",
            "ArrowUp",
            "ArrowDown",
          ].includes(e.key)
        ) {
          e.preventDefault();
          setCopy((c) => {
            if (!c) return c;
            let cursor = c.cursor;
            if (["h", "ArrowLeft"].includes(e.key)) cursor--;
            if (["l", "ArrowRight"].includes(e.key)) cursor++;
            if (["j", "ArrowDown"].includes(e.key)) {
              const lineStart = c.text.lastIndexOf("\n", c.cursor - 1) + 1,
                next = c.text.indexOf("\n", c.cursor);
              if (next >= 0) {
                const end = c.text.indexOf("\n", next + 1);
                cursor = Math.min(
                  next + 1 + c.cursor - lineStart,
                  end < 0 ? c.text.length - 1 : end,
                );
              }
            }
            if (["k", "ArrowUp"].includes(e.key)) {
              const start = c.text.lastIndexOf("\n", c.cursor - 1) + 1;
              if (start > 0) {
                const previous = c.text.lastIndexOf("\n", start - 2) + 1;
                cursor = Math.min(previous + c.cursor - start, start - 1);
              }
            }
            return {
              ...c,
              cursor: Math.max(0, Math.min(c.text.length - 1, cursor)),
            };
          });
          return;
        }
        if (e.key === "y") {
          e.preventDefault();
          const start =
              copy.anchor === null
                ? copy.cursor
                : Math.min(copy.anchor, copy.cursor),
            end =
              copy.anchor === null
                ? copy.text.indexOf("\n", start)
                : Math.max(copy.anchor, copy.cursor) + 1;
          void navigator.clipboard
            .writeText(copy.text.slice(start, end < 0 ? copy.text.length : end))
            .then(() => {
              setCopy(null);
              setNotice("copied");
            })
            .catch(() =>
              setNotice(
                "clipboard unavailable: select and copy with browser keys",
              ),
            );
          return;
        }
        return;
      }
      if (e.ctrlKey && !e.altKey && !e.metaKey && keyOf(e) === prefix) {
        e.preventDefault();
        if (armed) {
          setArmed(false);
          setNotice("^Q");
        } else setArmed(true);
        return;
      }
      if (armed) {
        e.preventDefault();
        setArmed(false);
        if (e.ctrlKey && keyOf(e) === "c") {
          change({ type: "new-session" });
          return;
        }
        if (e.ctrlKey && keyOf(e) === "r") {
          setOverlay({
            type: "prompt",
            title: "rename session:",
            initial: session.name,
            submit: (name) => change({ type: "rename-session", name }, false),
          });
          return;
        }
        if (e.ctrlKey && keyOf(e) === "u") {
          setOverlay({ type: "status" });
          return;
        }
        if (e.key === "Enter") {
          const pane = surface.current?.querySelector<HTMLElement>(
            `[data-pane="${focus}"] .pane-body`,
          );
          setCopy({ text: pane?.innerText || "", cursor: 0, anchor: null });
          return;
        }
        if (e.key === "Q") {
          change({ type: "close-session" });
          return;
        }
        if (e.key === "X") {
          setOverlay({
            type: "confirm",
            title: `kill window ${win.name}? (y/n)`,
            accept: () => change({ type: "close-window" }),
          });
          return;
        }
        if (e.key === ")" || e.key === "(") {
          change({ type: "next-session", delta: e.key === ")" ? 1 : -1 });
          return;
        }
        if (/^[1-9]$/.test(e.key)) {
          const target = session.windows[Number(e.key) - 1];
          if (target) change({ type: "window", id: target.id });
          return;
        }
        if (e.key === "c") change({ type: "new-window" });
        else if (e.key === "u") picker("sessions");
        else if (e.key === "w") picker("windows");
        else if (e.key === "g")
          setOverlay({
            type: "prompt",
            title: "switch to session:",
            initial: "",
            submit: (value) => {
              const target =
                state.sessions.find(
                  (s) => s.name === value || s.id === value,
                ) || state.sessions[Number(value)];
              if (target) change({ type: "session", id: target.id });
              else setNotice(`session not found: ${value}`);
            },
          });
        else if (e.key === "b") change({ type: "last-session" });
        else if (e.key === "r" || e.key === ",")
          setOverlay({
            type: "prompt",
            title: "rename window:",
            initial: win.name,
            submit: (name) => change({ type: "rename-window", name }, false),
          });
        else if (e.key === "v") splitPane("x");
        else if (e.key === "s") splitPane("y");
        else if (e.key === "z")
          setPane({ type: "pane", zoom: zoom ? null : focus });
        else if (e.key === "x") closePane();
        else if (e.key === "m") {
          change({ type: "mouse" }, false);
          setNotice(`mouse: ${state.mouse ? "off" : "on"}`);
        } else if (e.key === "o") picker("urls");
        else if (e.key === "?") setOverlay({ type: "help" });
        return;
      }
      if (e.key === "Escape") return;
      const k = keyOf(e);
      if (e.altKey && !e.ctrlKey && !e.metaKey) {
        if (["n", "p"].includes(k)) {
          e.preventDefault();
          change({ type: "next-window", delta: k === "n" ? 1 : -1 });
          return;
        }
        if (["h", "j", "k", "l"].includes(k)) {
          e.preventDefault();
          if (e.shiftKey)
            setPane({
              type: "pane",
              tree: resizeParent(
                tree,
                focus,
                k === "h" || k === "l" ? "x" : "y",
                k === "h" || k === "k" ? -0.05 : 0.05,
              ),
            });
          else move(k);
          return;
        }
        if (["v", "s", "z"].includes(k)) {
          e.preventDefault();
          if (k === "z") setPane({ type: "pane", zoom: zoom ? null : focus });
          else splitPane(k === "v" ? "x" : "y");
          return;
        }
        if (e.key === "=" || e.code === "Equal") {
          e.preventDefault();
          const equal = (node: Tree): Tree =>
            node.kind === "leaf"
              ? node
              : {
                  ...node,
                  ratio: 0.5,
                  first: equal(node.first),
                  second: equal(node.second),
                };
          setPane({ type: "pane", tree: equal(tree) });
          return;
        }
      }
      if (editable(e.target)) return;
      if (["ArrowDown", "ArrowUp", "j", "k"].includes(e.key)) {
        e.preventDefault();
        surface.current
          ?.querySelector(`[data-pane="${focus}"] .pane-body`)
          ?.scrollBy({
            top:
              fontSize * 3 * (e.key === "j" || e.key === "ArrowDown" ? 1 : -1),
          });
        return;
      }
      if (e.key === "/" && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        picker("pages");
        return;
      }
      if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
        const input = surface.current?.querySelector<HTMLInputElement>(
          `[data-pane="${focus}"] .terminal-prompt input`,
        );
        input?.focus({ preventScroll: true });
      }
    };
    window.addEventListener("keydown", listener);
    return () => window.removeEventListener("keydown", listener);
  }, [
    overlay,
    query,
    filtered,
    selected,
    copy,
    armed,
    prefix,
    state,
    session,
    win,
    tree,
    focus,
    zoom,
    fontSize,
    change,
    picker,
    move,
    closePane,
    splitPane,
    setPane,
  ]);
  useEffect(() => {
    if (!copy || !copyPre.current) return;
    copyPre.current
      .querySelector(".copy-cursor")
      ?.scrollIntoView({ block: "nearest" });
  }, [copy?.cursor]);
  const renderLeaf = (leaf: Leaf) => (
    <section
      key={leaf.id}
      className={`pane ${focus === leaf.id ? "is-focused is-mobile-selected" : ""}`}
      data-pane={leaf.id}
      tabIndex={-1}
      aria-label={`pane ${leaf.id}`}
      onPointerDown={(event) => {
        interaction.current = "pointer";
        if (state.mouse) selectPane(leaf.id);
        else if (
          (event.target as HTMLElement).closest(".terminal-prompt input")
        )
          event.preventDefault();
      }}
      onFocus={() => {
        if (!copy && (state.mouse || interaction.current === "keyboard"))
          dispatch({ type: "pane", focus: leaf.id });
      }}
    >
      <div className="pane-body" data-pane-scroll>
        {leaf.content === "shell" ? null : (catalog.routes[leaf.content]
            ?.target || leaf.content) === canonical ? (
          children
        ) : (
          <RemotePage path={leaf.content} catalog={catalog} />
        )}
        <ShellInput
          path={win.path}
          active={
            focus === leaf.id && leaf.content === "shell" && !overlay && !copy
          }
          execute={execute}
        />
      </div>
      {copy && focus === leaf.id && (
        <div className="terminal-copy" role="region" aria-label="copy-mode">
          <div className="copy-indicator">
            [{copy.cursor}/{copy.text.length}]
            {copy.anchor !== null ? " VISUAL" : ""}
          </div>
          <pre ref={copyPre}>
            {copy.text.split("").map((char, index) => (
              <span
                key={index}
                className={
                  index === copy.cursor
                    ? "copy-cursor"
                    : copy.anchor !== null &&
                        index >= Math.min(copy.cursor, copy.anchor) &&
                        index <= Math.max(copy.cursor, copy.anchor)
                      ? "copy-selected"
                      : undefined
                }
              >
                {char}
              </span>
            ))}
          </pre>
        </div>
      )}
    </section>
  );
  const renderTree = (node: Tree): ReactNode =>
    node.kind === "leaf" ? (
      renderLeaf(node)
    ) : (
      <div
        className={`split split-${node.axis}`}
        key={node.id}
        data-split={node.id}
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
          aria-orientation={node.axis === "x" ? "vertical" : "horizontal"}
          aria-label={node.axis === "x" ? "调整左右分屏" : "调整上下分屏"}
          aria-valuemin={20}
          aria-valuemax={80}
          aria-valuenow={Math.round(node.ratio * 100)}
          tabIndex={state.mouse ? 0 : -1}
          onPointerDown={(e) => {
            if (!state.mouse) return;
            e.preventDefault();
            const handle = e.currentTarget,
              box = handle.parentElement!.getBoundingClientRect();
            handle.setPointerCapture(e.pointerId);
            const drag = (event: PointerEvent) =>
              setPane({
                type: "pane",
                tree: resize(
                  tree,
                  node.id,
                  node.axis === "x"
                    ? (event.clientX - box.left) / box.width
                    : (event.clientY - box.top) / box.height,
                ),
              });
            const done = () => {
              handle.removeEventListener("pointermove", drag);
              handle.removeEventListener("pointerup", done);
              handle.removeEventListener("pointercancel", done);
            };
            handle.addEventListener("pointermove", drag);
            handle.addEventListener("pointerup", done);
            handle.addEventListener("pointercancel", done);
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
  const zoomed = zoom ? leaves(tree).find((p) => p.id === zoom) : null;
  return (
    <div
      className="terminal-shell terminal-native"
      data-ready={ready ? "true" : "false"}
      data-mouse={state.mouse ? "on" : "off"}
      data-copy={copy ? "on" : "off"}
      style={{ fontSize: `${fontSize}px` }}
      onClickCapture={(e) => {
        if (
          !state.mouse &&
          e.detail > 0 &&
          !e.ctrlKey &&
          !e.metaKey &&
          (e.target as HTMLElement).closest("a[href]")
        )
          e.preventDefault();
      }}
    >
      <main id="workspace" className="workspace" ref={surface}>
        {zoomed ? renderLeaf(zoomed) : renderTree(tree)}
      </main>
      <footer
        className="tmux-status"
        aria-label="tmux status"
        data-session={session.id}
        data-window={win.id}
      >
        <span className={`tmux-session ${armed ? "is-prefix" : ""}`}>
          <span className="power-cap"></span>
          <span className="segment-icon"></span>
          <span className="segment-text">{session.name}</span>
          <span className="power-cap end-cap"></span>
        </span>
        <nav className="tmux-windows" aria-label="tmux windows">
          {session.windows.map((w, i) => (
            <span
              key={w.id}
              className={w.id === win.id ? "current" : ""}
              data-window-id={w.id}
            >
              <span className="window-index">{i + 1}</span>
              <span>{w.name}</span>
              {w.id === win.id && <span>*</span>}
            </span>
          ))}
        </nav>
        <span className="tmux-modules">
          <span className="tmux-module command-module">
            <span className="power-cap"></span>
            <span className="segment-icon"></span>
            <span className="segment-text">
              {copy
                ? "copy-mode"
                : leaves(tree).find((p) => p.id === focus)?.content === "shell"
                  ? "zsh"
                  : "less"}
            </span>
          </span>
          <span className="tmux-module host-module">
            <span className="power-cap"></span>
            <span className="segment-icon">󰒋</span>
            <span className="segment-text">wasidj</span>
          </span>
          <span className="tmux-module time-module">
            <span className="power-cap"></span>
            <span className="segment-icon">󰃰</span>
            <span className="segment-text">{clock}</span>
            <span className="power-cap end-cap"></span>
          </span>
        </span>
      </footer>
      {(notice || armed) && (
        <div className="tmux-message" role="status">
          {armed ? `prefix Ctrl+${prefix.toUpperCase()}` : notice}
        </div>
      )}
      <dialog
        ref={dialog}
        className="tmux-dialog"
        tabIndex={-1}
        onCancel={() => {
          setOverlay(null);
          setArmed(false);
        }}
        onClose={() => setOverlay(null)}
      >
        {overlay?.type === "picker" && (
          <>
            <div className="tmux-popup-title">{overlay.title}</div>
            <label className="fzf-query">
              <span>&gt;</span>
              <input
                ref={promptInput}
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setSelected(0);
                }}
                aria-label="筛选菜单"
                autoComplete="off"
              />
            </label>
            <div
              className="tmux-options"
              role="listbox"
              aria-label={overlay.title}
            >
              {filtered.map((row, i) => (
                <div
                  key={row.id}
                  role="option"
                  aria-selected={i === selected}
                  className={i === selected ? "selected" : ""}
                >
                  <span>{i === selected ? "▶" : " "}</span>
                  <span>{row.label}</span>
                  <span>{row.detail}</span>
                </div>
              ))}
            </div>
            <div className="tmux-popup-hint">
              {filtered.length}/{overlay.rows.length} · ↑↓ / j k · Enter · /
              filter · Esc
              {overlay.title === "choose-session" ? " · x delete" : ""}
            </div>
          </>
        )}
        {overlay?.type === "prompt" && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              overlay.submit(query);
              setOverlay(null);
            }}
          >
            <label>
              {overlay.title}{" "}
              <input
                ref={promptInput}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                aria-label={overlay.title}
                autoComplete="off"
              />
            </label>
          </form>
        )}
        {overlay?.type === "confirm" && <p>{overlay.title}</p>}
        {overlay?.type === "help" && <pre>{help}</pre>}
        {overlay?.type === "status" && (
          <pre>{`session: ${session.name}\nwindow: ${win.name}\npanes: ${leaves(tree).length}\nmouse: ${state.mouse ? "on" : "off"}\ncopy-mode: ${copy ? "on" : "off"}\n\nEsc / q`}</pre>
        )}
      </dialog>
      <noscript>
        <nav className="terminal-fallback" aria-label="主导航">
          {sections.map((s) => (
            <a key={s.path} href={s.path}>
              {s.name}
            </a>
          ))}
        </nav>
      </noscript>
    </div>
  );
}
