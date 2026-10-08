"use client";
import {
  createContext,
  useContext,
  useEffect,
  useReducer,
  useState,
  type Dispatch,
  type ReactNode,
} from "react";
import { usePathname } from "next/navigation";
import {
  initialTmux,
  tmuxReducer,
  restoreTmux,
  type TmuxState,
  type TmuxAction,
} from "@/lib/tmux";
const Context = createContext<{
  state: TmuxState;
  dispatch: Dispatch<TmuxAction>;
  ready: boolean;
} | null>(null);
export function TmuxProvider({
  children,
  paths,
}: {
  children: ReactNode;
  paths: string[];
}) {
  const pathname = usePathname();
  const [state, dispatch] = useReducer(tmuxReducer, pathname, (path) =>
    initialTmux(path),
  );
  const [ready, setReady] = useState(false);
  useEffect(() => {
    try {
      const value = JSON.parse(localStorage.getItem("ryou-tmux:v2") || "null");
      const saved = restoreTmux(value, new Set([...paths, "shell"]));
      if (saved) {
        dispatch({ type: "restore", state: { ...saved, mouse: false } });
      }
    } catch {
      /* Bad stored sessions do not stop the terminal. */
    }
    setReady(true);
  }, []);
  useEffect(() => {
    if (!ready) return;
    try {
      localStorage.setItem("ryou-tmux:v2", JSON.stringify(state));
    } catch {
      /* Browser storage is optional. */
    }
  }, [state, ready]);
  return (
    <Context.Provider value={{ state, dispatch, ready }}>
      {children}
    </Context.Provider>
  );
}
export const useTmux = () => {
  const value = useContext(Context);
  if (!value) throw new Error("Missing tmux provider");
  return value;
};
