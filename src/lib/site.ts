import raw from "../../.generated/site.json";
import type { Catalog, Page, Route } from "./types";
export const site = raw as unknown as Omit<Catalog, "pages"> & {
  origin: string;
  pages: Page[];
  routes: Record<string, Route>;
};
export const catalog: Catalog = {
  routes: site.routes,
  pages: site.pages.map(({ path, title, paneKey, section }) => ({
    path,
    title,
    paneKey,
    section,
  })),
  posts: site.posts,
  projects: site.projects,
  friends: site.friends,
  contentSha: site.contentSha,
};
export const dateLabel = (date: string) =>
  date
    ? new Intl.DateTimeFormat("zh-CN", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        timeZone: "Asia/Shanghai",
      })
        .format(new Date(date))
        .replaceAll("/", ".")
    : "";
