"use client";
import { useEffect, useState } from "react";
/** ASCII/lean p10k layout from WASIDJ/.config/p10k.zsh. */
export function P10kHeader({
  path = "/",
  revision = 0,
}: {
  path?: string;
  revision?: number;
}) {
  const [time, setTime] = useState("--:--:--");
  useEffect(() => {
    setTime(
      new Intl.DateTimeFormat("en-GB", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        timeZone: "Asia/Shanghai",
      }).format(new Date()),
    );
  }, [path, revision]);
  const location = path === "/" ? "~/blog" : `~/blog${path.replace(/\/$/, "")}`;
  const split = location.lastIndexOf("/");
  return (
    <div className="p10k-first-line" aria-label="p10k prompt">
      <span className="p10k-directory">
        <span className="p10k-parent">{location.slice(0, split + 1)}</span>
        <span className="p10k-anchor">{location.slice(split + 1)}</span>
      </span>
      <span className="p10k-git">main</span>
      <span className="p10k-gap" aria-hidden="true">
        {"-".repeat(256)}
      </span>
      <time className="p10k-time" suppressHydrationWarning>
        {time}
      </time>
    </div>
  );
}
