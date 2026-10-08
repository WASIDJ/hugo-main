export interface Heading {
  level: number;
  id: string;
  text: string;
}
export interface Post {
  paneKey: string;
  id: string;
  path: string;
  title: string;
  description: string;
  date: string;
  updated: string;
  author: string;
  tags: string[];
  categories: string[];
  image: string;
  readingMinutes: number;
  comments: boolean;
}
export interface Page extends Post {
  file: string;
  html: string;
  plain: string;
  headings: Heading[];
  section: string;
}
export interface Project {
  id: string;
  name: string;
  label: string;
  color: string;
  tags: string[];
  description: string;
  problem: string;
  contribution: string;
  tradeoff: string;
  repo: string;
  evidence: string;
  diagram: string[];
}
export interface SiteLink {
  title: string;
  description: string;
  website: string;
}
export interface Route {
  kind: string;
  title: string;
  description: string;
  pageId?: string;
  target?: string;
  taxonomy?: "tags" | "categories";
  term?: string;
}
export interface Catalog {
  routes: Record<string, Route>;
  pages: Pick<Page, "path" | "title" | "paneKey" | "section">[];
  posts: Post[];
  projects: Project[];
  friends: SiteLink[];
  contentSha: string;
}
