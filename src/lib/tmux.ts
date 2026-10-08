import { type Tree, leaves, validTree, replace } from "./workspace";
export interface TmuxWindow {
  id: string;
  name: string;
  path: string;
  tree: Tree;
  focus: string;
  zoom: string | null;
  renamed: boolean;
}
export interface TmuxSession {
  id: string;
  name: string;
  windows: TmuxWindow[];
  activeWindow: string;
}
export interface TmuxState {
  version: 2;
  sessions: TmuxSession[];
  activeSession: string;
  lastSession: string | null;
  mouse: boolean;
  serial: number;
}
export const sections = [
  { path: "/", name: "home" },
  { path: "/post/", name: "journal" },
  { path: "/page/projects/", name: "projects" },
  { path: "/page/关于/", name: "about" },
  { path: "/page/友链/", name: "links" },
];
export const normalizePath = (path: string) => {
  try {
    return decodeURI(path).replace(/\/+$/, "") + "/";
  } catch {
    return "/";
  }
};
export const pageName = (path: string) =>
  sections.find((s) => s.path === path)?.name ||
  path.split("/").filter(Boolean).at(-1) ||
  "zsh";
export function newWindow(
  id: string,
  path: string,
  name = pageName(path),
): TmuxWindow {
  return {
    id,
    name,
    path,
    tree: { kind: "leaf", id: `${id}-main`, content: path },
    focus: `${id}-main`,
    zoom: null,
    renamed: false,
  };
}
export function initialTmux(path = "/"): TmuxState {
  path = normalizePath(path);
  const windows = sections.map((s, i) =>
    newWindow(`w${i + 1}`, s.path, s.name),
  );
  let active = windows.find((w) => w.path === path);
  if (!active) {
    const index =
      path.startsWith("/post/") ||
      path.startsWith("/tags/") ||
      path.startsWith("/categories/")
        ? 1
        : 3;
    windows[index] = newWindow(windows[index].id, path);
    active = windows[index];
  }
  return {
    version: 2,
    sessions: [{ id: "s0", name: "blog", windows, activeWindow: active.id }],
    activeSession: "s0",
    lastSession: null,
    mouse: false,
    serial: 6,
  };
}
export const sessionOf = (state: TmuxState) =>
  state.sessions.find((s) => s.id === state.activeSession)!;
export const windowOf = (state: TmuxState) => {
  const s = sessionOf(state);
  return s.windows.find((w) => w.id === s.activeWindow)!;
};
export type TmuxAction =
  | { type: "restore"; state: TmuxState }
  | { type: "path"; path: string }
  | { type: "navigate-pane"; path: string }
  | { type: "session"; id: string }
  | { type: "next-session"; delta: number }
  | { type: "last-session" }
  | { type: "new-session" }
  | { type: "rename-session"; name: string }
  | { type: "close-session"; id?: string }
  | { type: "window"; id: string }
  | { type: "next-window"; delta: number }
  | { type: "new-window" }
  | { type: "rename-window"; name: string }
  | { type: "close-window" }
  | { type: "pane"; tree?: Tree; focus?: string; zoom?: string | null }
  | { type: "mouse" }
  | { type: "reset"; path: string };
export function tmuxReducer(state: TmuxState, action: TmuxAction): TmuxState {
  if (action.type === "restore") return action.state;
  if (action.type === "reset") return initialTmux(action.path);
  if (action.type === "mouse") return { ...state, mouse: !state.mouse };
  const session = sessionOf(state),
    win = windowOf(state);
  const setSession = (updated: TmuxSession) => ({
    ...state,
    sessions: state.sessions.map((s) => (s.id === updated.id ? updated : s)),
  });
  const setWindow = (updated: TmuxWindow) =>
    setSession({
      ...session,
      windows: session.windows.map((w) => (w.id === updated.id ? updated : w)),
    });
  const switchSession = (id: string) =>
    id !== state.activeSession && state.sessions.some((s) => s.id === id)
      ? { ...state, activeSession: id, lastSession: state.activeSession }
      : state;
  if (action.type === "session") return switchSession(action.id);
  if (action.type === "last-session")
    return state.lastSession ? switchSession(state.lastSession) : state;
  if (action.type === "next-session") {
    const i = state.sessions.findIndex((s) => s.id === state.activeSession);
    return switchSession(
      state.sessions[
        (i + action.delta + state.sessions.length) % state.sessions.length
      ].id,
    );
  }
  if (action.type === "new-session") {
    const id = `s${state.serial}`,
      window = newWindow(`w${state.serial}`, "/", "zsh");
    return {
      ...state,
      serial: state.serial + 1,
      lastSession: session.id,
      activeSession: id,
      sessions: [
        ...state.sessions,
        {
          id,
          name: String(state.serial),
          windows: [window],
          activeWindow: window.id,
        },
      ],
    };
  }
  if (action.type === "rename-session") {
    const name = action.name.trim();
    return name ? setSession({ ...session, name: name.slice(0, 80) }) : state;
  }
  if (action.type === "close-session") {
    const id = action.id || session.id,
      remaining = state.sessions.filter((s) => s.id !== id);
    if (remaining.length === state.sessions.length) return state;
    if (!remaining.length) return initialTmux("/");
    const activeSession =
      state.activeSession === id
        ? (remaining.find((s) => s.id === state.lastSession) || remaining[0]).id
        : state.activeSession;
    return {
      ...state,
      sessions: remaining,
      activeSession,
      lastSession: state.lastSession === id ? null : state.lastSession,
    };
  }
  if (action.type === "window")
    return session.windows.some((w) => w.id === action.id)
      ? setSession({ ...session, activeWindow: action.id })
      : state;
  if (action.type === "next-window") {
    const i = session.windows.findIndex((w) => w.id === win.id);
    return setSession({
      ...session,
      activeWindow:
        session.windows[
          (i + action.delta + session.windows.length) % session.windows.length
        ].id,
    });
  }
  if (action.type === "new-window") {
    const window = newWindow(`w${state.serial}`, win.path, "zsh");
    return {
      ...setSession({
        ...session,
        windows: [...session.windows, window],
        activeWindow: window.id,
      }),
      serial: state.serial + 1,
    };
  }
  if (action.type === "rename-window") {
    const name = action.name.trim();
    return name
      ? setWindow({ ...win, name: name.slice(0, 80), renamed: true })
      : state;
  }
  if (action.type === "close-window") {
    if (session.windows.length === 1)
      return tmuxReducer(state, { type: "close-session" });
    const remaining = session.windows.filter((w) => w.id !== win.id);
    return setSession({
      ...session,
      windows: remaining,
      activeWindow: remaining[Math.max(0, session.windows.indexOf(win) - 1)].id,
    });
  }
  if (action.type === "navigate-pane") {
    const path = normalizePath(action.path);
    return setWindow({
      ...win,
      path,
      name: win.renamed ? win.name : pageName(path),
      tree: replace(win.tree, win.focus, {
        kind: "leaf",
        id: win.focus,
        content: path,
      }),
    });
  }
  if (action.type === "path") {
    const path = normalizePath(action.path);
    if (win.path === path) return state;
    const tree = { kind: "leaf" as const, id: `${win.id}-main`, content: path };
    return setWindow({
      ...win,
      path,
      name: win.renamed ? win.name : pageName(path),
      tree,
      focus: tree.id,
      zoom: null,
    });
  }
  if (action.type === "pane")
    return setWindow({
      ...win,
      ...("tree" in action ? { tree: action.tree! } : {}),
      ...("focus" in action ? { focus: action.focus! } : {}),
      ...("zoom" in action ? { zoom: action.zoom! } : {}),
    });
  return state;
}
export function restoreTmux(
  value: unknown,
  allowed: Set<string>,
): TmuxState | null {
  if (!value || typeof value !== "object") return null;
  const state = value as TmuxState;
  if (
    state.version !== 2 ||
    !Array.isArray(state.sessions) ||
    !state.sessions.length ||
    state.sessions.length > 64 ||
    typeof state.mouse !== "boolean" ||
    !Number.isSafeInteger(state.serial) ||
    state.serial < 6
  )
    return null;
  const ids = new Set<string>();
  let maxSerial = 0;
  for (const session of state.sessions) {
    if (
      !session ||
      typeof session.id !== "string" ||
      ids.has(session.id) ||
      typeof session.name !== "string" ||
      !session.name ||
      session.name.length > 80 ||
      !Array.isArray(session.windows) ||
      !session.windows.length ||
      session.windows.length > 64
    )
      return null;
    ids.add(session.id);
    maxSerial = Math.max(maxSerial, Number(session.id.slice(1)) || 0);
    for (const win of session.windows) {
      if (
        !win ||
        typeof win.id !== "string" ||
        ids.has(win.id) ||
        typeof win.name !== "string" ||
        !win.name ||
        win.name.length > 80 ||
        !allowed.has(win.path) ||
        typeof win.renamed !== "boolean" ||
        !validTree(win.tree, allowed)
      )
        return null;
      ids.add(win.id);
      maxSerial = Math.max(maxSerial, Number(win.id.slice(1)) || 0);
      if (
        !leaves(win.tree).some((p) => p.id === win.focus) ||
        (win.zoom !== null && !leaves(win.tree).some((p) => p.id === win.zoom))
      )
        return null;
    }
    if (!session.windows.some((w) => w.id === session.activeWindow))
      return null;
  }
  if (
    !state.sessions.some((s) => s.id === state.activeSession) ||
    (state.lastSession !== null &&
      !state.sessions.some((s) => s.id === state.lastSession)) ||
    state.serial <= maxSerial
  )
    return null;
  return state;
}
