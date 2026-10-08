import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import fs from "node:fs/promises";
const key = async (page: any, value: string) => {
  await page.keyboard.press("Control+q");
  await page.keyboard.press(value);
};
test("workspace split, cap, focus, resize, zoom, close, persistence and navigation", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "你好，我是 Ryou" }),
  ).toBeVisible();
  await expect(page.locator("[data-pane]")).toHaveCount(3);
  await key(page, "v");
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByRole("button", { name: "个人介绍 whoami" }).click();
  await expect(page.locator("[data-pane]")).toHaveCount(4);
  await key(page, "s");
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await expect(page.locator("[data-pane]")).toHaveCount(4);
  await key(page, "z");
  await expect(page.locator("[data-pane]")).toHaveCount(1);
  await page.reload();
  await expect(page.locator("[data-pane]")).toHaveCount(1);
  await key(page, "z");
  await expect(page.locator("[data-pane]")).toHaveCount(4);
  await key(page, "x");
  await expect(page.locator("[data-pane]")).toHaveCount(3);
  await page.locator("[data-pane=main] .pane-name").click();
  await page.keyboard.press("Alt+l");
  await expect(page.locator("[data-pane=journal]")).toHaveClass(/is-focused/);
  await page.keyboard.press("Alt+j");
  await expect(page.locator("[data-pane=builds]")).toHaveClass(/is-focused/);
  const separator = page.getByRole("separator", { name: "调整上下分屏" });
  const before = await separator.getAttribute("aria-valuenow");
  await separator.focus();
  await page.keyboard.press("ArrowUp");
  await expect(separator).not.toHaveAttribute("aria-valuenow", before!);
  await key(page, "3");
  await expect(page).toHaveURL(/\/page\/projects\/$/);
  await expect(
    page.getByRole("heading", { name: "项目与工程实践" }),
  ).toBeVisible();
  await page.goBack();
  await expect(page).toHaveURL("/");
  await page.reload();
  await expect(page.locator("[data-pane]")).toHaveCount(3);
});
test("search input does not intercept shortcuts, prefix can be rebound and disabled", async ({
  page,
}) => {
  await page.goto("/page/search/");
  const input = page.getByRole("searchbox", { name: "搜索文章" });
  await input.fill("Go");
  await expect(page.getByRole("status")).toContainText("个结果");
  await page.keyboard.press("Control+q");
  await page.keyboard.press("3");
  await expect(page).toHaveURL(/search/);
  await page.getByRole("button", { name: "快捷键与设置" }).click();
  await page.getByRole("button", { name: "重新绑定" }).click();
  await page.keyboard.press("Control+Shift+a");
  await expect(page.getByRole("dialog")).toContainText("Ctrl+Shift+A");
  await page.keyboard.press("Escape");
  await page.keyboard.press("Tab");
  await page.keyboard.press("Control+Shift+a");
  await page.keyboard.press("3");
  await expect(page).toHaveURL(/projects/);
  await page.getByRole("button", { name: "快捷键与设置" }).click();
  await page.getByRole("checkbox", { name: "启用键盘快捷键" }).uncheck();
  await page.keyboard.press("Escape");
  await page.keyboard.press("Control+Shift+a");
  await page.keyboard.press("1");
  await expect(page).toHaveURL(/projects/);
});
test("article SSR, math, copy, aliases, error responses and comment identity", async ({
  page,
  request,
}) => {
  await page.goto("/post/2026-08-22-counting-sort/");
  await expect(page.locator(".article-header h1")).toContainText("计数排序");
  await expect(page.locator(".katex").first()).toBeVisible();
  await expect(
    page.getByRole("button", { name: "复制代码" }).first(),
  ).toBeVisible();
  await expect(page.locator("link[rel=canonical]")).toHaveAttribute(
    "href",
    "https://www.jeffkafka.top/post/2026-08-22-counting-sort/",
  );
  await page.getByRole("button", { name: "加载 GitHub 评论" }).click();
  await expect(page.locator("script[data-repo]")).toHaveAttribute(
    "data-term",
    "/post/2026-08-22-counting-sort/",
  );
  await page.goto("/post/Counting%20Sort/");
  await expect(page.locator("link[rel=canonical]")).toHaveAttribute(
    "href",
    "https://www.jeffkafka.top/post/2026-08-22-counting-sort/",
  );
  await expect(page.locator(".article-header h1")).toContainText("计数排序");
  expect((await request.get("/does-not-exist/")).status()).toBe(404);
  expect((await request.get("/post/sidenote-animation-test/")).status()).toBe(
    404,
  );
});
test("keyboard menu traps focus and survives Escape", async ({ page }) => {
  await page.goto("/");
  await key(page, "u");
  await expect(page.getByRole("dialog")).toBeVisible();
  for (let i = 0; i < 12; i++) await page.keyboard.press("Tab");
  expect(
    await page.evaluate(() => !!document.activeElement?.closest("dialog")),
  ).toBeTruthy();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).not.toBeVisible();
});
test("responsive layouts, theme and accessibility", async ({ page }) => {
  for (const width of [375, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto("/");
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBeTruthy();
    await page.screenshot({
      path: `test-results/home-${width}.png`,
      fullPage: true,
    });
  }
  const dark = await new AxeBuilder({ page }).analyze();
  expect(dark.violations).toEqual([]);
  await page.getByRole("button", { name: "切换浅色主题" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await page.waitForTimeout(250);
  const light = await new AxeBuilder({ page }).analyze();
  expect(light.violations).toEqual([]);
  await page.screenshot({ path: "test-results/home-light.png" });
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await page.setViewportSize({ width: 375, height: 900 });
  await page.goto("/page/projects/");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBeTruthy();
});
test("no JavaScript still exposes article text and navigation", async ({
  browser,
}) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  await page.goto("/post/2026-08-22-counting-sort/");
  await expect(page.locator(".prose")).toContainText("计数排序");
  await expect(page.getByRole("navigation", { name: "主导航" })).toBeVisible();
  await page
    .getByRole("navigation", { name: "主导航" })
    .getByRole("link", { name: "3 项目" })
    .click();
  await expect(
    page.getByRole("heading", { name: "项目与工程实践" }),
  ).toBeVisible();
  await context.close();
});

test("primary pane closes, last pane restores and corrupt layout is ignored", async ({
  page,
}) => {
  await page.goto("/");
  await page.locator("[data-pane=main] .pane-name").click();
  await key(page, "x");
  await expect(page.locator("[data-pane]")).toHaveCount(2);
  await page.reload();
  await expect(page.locator("[data-pane]")).toHaveCount(2);
  await key(page, "x");
  await expect(page.locator("[data-pane]")).toHaveCount(1);
  await key(page, "x");
  await expect(page.locator("[data-pane]")).toHaveCount(3);
  await page.evaluate(() =>
    localStorage.setItem("ryou-workspace:v1:/", "{invalid json"),
  );
  await page.reload();
  await expect(page.locator("[data-pane]")).toHaveCount(3);
});

test("stats keep original paths, count completion and deduplicate within the session", async ({
  page,
}) => {
  const events: { event: string; path: string }[] = [];
  await page.route("https://www.jeffkafka.top/**", async (route) => {
    const request = route.request(),
      url = new URL(request.url());
    if (url.pathname === "/api/article-stats") {
      if (request.method() === "POST") events.push(request.postDataJSON());
      await route.fulfill({
        json: { views: 42, completions: 7, counted: true },
      });
      return;
    }
    const response = await route.fetch({
      url: "http://127.0.0.1:3000" + url.pathname + url.search,
    });
    await route.fulfill({ response });
  });
  await page.goto("https://www.jeffkafka.top/post/2026-08-22-counting-sort/");
  await expect(page.locator(".article-meta")).toContainText("42 次阅读");
  await expect
    .poll(() => events.filter((e) => e.event === "view").length)
    .toBe(1);
  await page.locator(".pane-body").evaluate((el) => {
    el.scrollTop = el.scrollHeight;
  });
  await expect
    .poll(() => events.filter((e) => e.event === "complete").length)
    .toBe(1);
  expect(
    events.every((e) => e.path === "/post/2026-08-22-counting-sort/"),
  ).toBeTruthy();
  await page.reload();
  await expect(page.locator(".article-meta")).toContainText("42 次阅读");
  expect(events.filter((e) => e.event === "view")).toHaveLength(1);
});

test("remote pane load failure leaves a full-page fallback", async ({
  page,
}) => {
  await page.route("**/panes/**", (route) =>
    route.fulfill({ status: 503, body: "offline" }),
  );
  await page.goto("/");
  await key(page, "v");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: /Ghostty/ })
    .click();
  await expect(page.getByRole("status")).toContainText("内容暂时无法加载");
  await expect(page.getByRole("link", { name: "打开完整页面" })).toBeVisible();
});

test("mobile article scroll updates reading progress and article content is accessible", async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 900 });
  await page.goto("/post/2026-08-22-counting-sort/");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBeTruthy();
  await page.evaluate(() =>
    window.scrollTo(0, document.documentElement.scrollHeight),
  );
  await expect(page.getByRole("progressbar")).toHaveAttribute(
    "aria-valuenow",
    "100",
  );
  await page.screenshot({
    path: "test-results/article-mobile.png",
    fullPage: true,
  });
});

test("footnotes become wide sidenotes and mobile popups with Escape dismissal", async ({
  page,
}) => {
  const { renderMarkdown } = await import("../scripts/content.mjs");
  const compiled = await renderMarkdown(
    "## 引用\n\n第一处引用[^one]，以及另一处[^two]。\n\n[^one]: 第一条边注。\n[^two]: 第二条边注。",
  );
  const site = JSON.parse(await fs.readFile(".generated/site.json", "utf8"));
  const fixture = {
    ...site.pages.find((p: any) => p.path === site.posts[0].path),
    ...compiled,
    comments: false,
  };
  await page.route("**/panes/**", (route) => route.fulfill({ json: fixture }));
  await page.goto("/");
  await key(page, "v");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: /Ghostty/ })
    .click();
  await key(page, "z");
  await expect(page.locator(".sidenote").first()).toBeVisible();
  expect(
    await page
      .locator(".sidenote")
      .evaluateAll(
        (nodes) =>
          nodes[1].getBoundingClientRect().top >=
          nodes[0].getBoundingClientRect().bottom,
      ),
  ).toBeTruthy();
  await page.setViewportSize({ width: 375, height: 900 });
  await page.locator("a[data-footnote-ref]").first().click();
  await expect(page.getByRole("dialog", { name: "脚注" })).toContainText(
    "第一条边注",
  );
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "脚注" })).not.toBeVisible();
});

test("real published article loads into a split pane without encoded filename failures", async ({
  page,
}) => {
  await page.goto("/");
  await key(page, "v");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: /Ghostty/ })
    .click();
  await expect(page.locator(".article-header h1")).toContainText("Ghostty");
  await expect(page.locator(".loading-content")).toHaveCount(0);
});

test("macOS Option glyphs still operate panes and column shortcuts", async ({
  page,
}) => {
  await page.goto("/");
  await page.locator("[data-pane=builds] .pane-name").click();
  await page.evaluate(() =>
    window.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "˚",
        code: "KeyK",
        altKey: true,
        bubbles: true,
      }),
    ),
  );
  await expect(page.locator("[data-pane=journal]")).toHaveClass(/is-focused/);
  await page.evaluate(() =>
    window.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "˜",
        code: "KeyN",
        altKey: true,
        bubbles: true,
      }),
    ),
  );
  await expect(page).toHaveURL(/\/post\/$/);
});
