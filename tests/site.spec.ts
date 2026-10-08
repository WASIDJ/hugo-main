import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
const key = async (page: Page, value: string) => {
  await expect(page.locator(".terminal-shell")).toHaveAttribute(
    "data-ready",
    "true",
  );
  await page.keyboard.press("Control+q");
  await page.keyboard.press(value);
};
const command = async (page: Page, text: string) => {
  const active = page
    .locator(".pane.is-focused")
    .getByRole("textbox", { name: "终端命令" });
  await active.focus();
  await active.fill(text);
  await active.press("Enter");
};
test("repository keyboard splits, focuses, resizes, zooms, closes and restores panes", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Ryou", exact: true }),
  ).toBeVisible();
  await expect(page.locator("[data-pane]")).toHaveCount(1);
  await expect(
    page.locator(".shell-header,.pane-header,.pane-controls,.statusbar"),
  ).toHaveCount(0);
  await key(page, "v");
  await expect(page.locator("[data-pane]")).toHaveCount(2);
  await page.keyboard.press("Alt+h");
  await expect(page.locator("[data-pane]").first()).toHaveClass(/is-focused/);
  const separator = page.getByRole("separator");
  const initial = await separator.getAttribute("aria-valuenow");
  await page.keyboard.press("Alt+Shift+l");
  await expect(separator).not.toHaveAttribute("aria-valuenow", initial!);
  await key(page, "z");
  await expect(page.locator("[data-pane]")).toHaveCount(1);
  await page.reload();
  await key(page, "z");
  await expect(page.locator("[data-pane]")).toHaveCount(2);
  await page.keyboard.press("Alt+l");
  await key(page, "x");
  await expect(page.locator("[data-pane]")).toHaveCount(1);
  await key(page, "3");
  await expect(page).toHaveURL(/projects/);
  await expect(
    page.getByRole("heading", { name: "项目与工程实践" }),
  ).toBeVisible();
  await page.keyboard.press("Alt+p");
  await expect(page).toHaveURL(/\/post\/$/);
});
test("mouse is off by default and Ctrl+q m controls pointer pane selection", async ({
  page,
}) => {
  await page.goto("/");
  await key(page, "v");
  await expect(page.locator(".terminal-shell")).toHaveAttribute(
    "data-mouse",
    "off",
  );
  await page
    .locator(".pane")
    .first()
    .click({ position: { x: 20, y: 30 } });
  await expect(page.locator(".pane").nth(1)).toHaveClass(/is-focused/);
  await key(page, "m");
  await expect(page.locator(".terminal-shell")).toHaveAttribute(
    "data-mouse",
    "on",
  );
  await page
    .locator(".pane")
    .first()
    .click({ position: { x: 20, y: 30 } });
  await expect(page.locator(".pane").first()).toHaveClass(/is-focused/);
});
test("session and window CRUD use the exact separate tmux bindings", async ({
  page,
}) => {
  await page.goto("/");
  await key(page, "Control+c");
  await expect(page.locator(".tmux-windows>span")).toHaveCount(1);
  await key(page, "Control+r");
  await page.getByRole("textbox", { name: "rename session:" }).fill("mini");
  await page.keyboard.press("Enter");
  await expect(page.locator(".tmux-session")).toContainText("mini");
  await key(page, "c");
  await expect(page.locator(".tmux-windows>span")).toHaveCount(2);
  await key(page, "r");
  await page.getByRole("textbox", { name: "rename window:" }).fill("notes");
  await page.keyboard.press("Enter");
  await expect(page.locator(".tmux-windows .current")).toContainText("notes");
  await key(page, "X");
  await expect(page.getByRole("dialog")).toContainText("kill window notes?");
  await page.keyboard.press("n");
  await expect(page.locator(".tmux-windows>span")).toHaveCount(2);
  await key(page, "X");
  await page.keyboard.press("y");
  await expect(page.locator(".tmux-windows>span")).toHaveCount(1);
  await key(page, "b");
  await expect(page.locator(".tmux-session")).toContainText("blog");
  await key(page, "u");
  await expect(
    page.getByRole("listbox", { name: "choose-session" }).getByRole("option"),
  ).toHaveCount(2);
  await page.keyboard.press("j");
  await page.keyboard.press("Enter");
  await expect(page.locator(".tmux-session")).toContainText("mini");
  await key(page, "Q");
  await expect(page.locator(".tmux-session")).toContainText("blog");
});
test("keyboard fzf URL picker and page picker open documents without clicking", async ({
  page,
}) => {
  await page.goto("/");
  await key(page, "o");
  await expect(page.getByRole("dialog")).toContainText("fzf-url");
  await page.keyboard.press("/");
  await page.getByRole("textbox", { name: "筛选菜单" }).fill("projects");
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/projects/);
  await page.locator(".pane.is-focused").focus();
  await page.keyboard.press("/");
  await page.keyboard.press("/");
  await page.getByRole("textbox", { name: "筛选菜单" }).fill("Ghostty");
  await page.keyboard.press("Enter");
  await expect(page.locator(".article-header h1")).toContainText("Ghostty");
});
test("copy mode supports v, movement and clipboard y", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto("/");
  await key(page, "Enter");
  await expect(page.getByRole("region", { name: "copy-mode" })).toBeVisible();
  await page.keyboard.press("v");
  await page.keyboard.press("l");
  await page.keyboard.press("l");
  await page.keyboard.press("y");
  await expect(
    page.getByRole("region", { name: "copy-mode" }),
  ).not.toBeVisible();
  expect(
    (await page.evaluate(() => navigator.clipboard.readText())).length,
  ).toBeGreaterThan(0);
});
test("terminal commands, theme and persistence stay keyboard operated", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.locator(".terminal-shell")).toHaveAttribute(
    "data-ready",
    "true",
  );
  await command(page, "theme light");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await command(page, "font 16");
  await expect(page.locator(".terminal-shell")).toHaveCSS(
    "font-size",
    "21.3333px",
  );
  await command(page, "projects");
  await expect(page).toHaveURL(/projects/);
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await key(page, "?");
  await expect(page.getByRole("dialog")).toContainText("SESSION");
  await page.keyboard.press("q");
  await expect(page.getByRole("dialog")).not.toBeVisible();
});
test("article HTML, math, canonical, original comments and 404 remain intact", async ({
  page,
  request,
}) => {
  await page.goto("/post/2026-08-22-counting-sort/");
  await expect(page.locator(".article-header h1")).toContainText("计数排序");
  await expect(page.locator(".katex").first()).toBeVisible();
  await expect(page.locator("link[rel=canonical]")).toHaveAttribute(
    "href",
    "https://www.jeffkafka.top/post/2026-08-22-counting-sort/",
  );
  await expect(page.locator(".terminal-shell")).toHaveAttribute(
    "data-ready",
    "true",
  );
  await command(page, "comments");
  await expect(page.locator("script[data-repo]")).toHaveAttribute(
    "data-term",
    "/post/2026-08-22-counting-sort/",
  );
  await page.goto("/post/Counting%20Sort/");
  await expect(page.locator(".article-header h1")).toContainText("计数排序");
  expect((await request.get("/does-not-exist/")).status()).toBe(404);
  expect((await request.get("/post/sidenote-animation-test/")).status()).toBe(
    404,
  );
});
test("responsive terminal uses repository font, padding and plain shell chrome", async ({
  page,
}) => {
  for (const width of [375, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/");
    await page.evaluate(() => document.fonts.ready);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBeTruthy();
    await expect(page.locator(".terminal-shell")).toHaveCSS("padding", "12px");
    await expect(page.locator(".terminal-shell")).toHaveCSS(
      "font-size",
      "24px",
    );
    await expect(page.locator(".terminal-shell")).toHaveCSS(
      "font-family",
      /Terminal Mono/,
    );
    await page.screenshot({ path: `test-results/terminal-${width}.png` });
  }
  const axe = await new AxeBuilder({ page }).analyze();
  expect(axe.violations).toEqual([]);
});
test("no JavaScript preserves readable text and fallback navigation", async ({
  browser,
}) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  await page.goto("/post/2026-08-22-counting-sort/");
  await expect(page.locator(".prose")).toContainText("计数排序");
  await page
    .getByRole("navigation", { name: "主导航" })
    .getByRole("link", { name: "projects" })
    .click();
  await expect(
    page.getByRole("heading", { name: "项目与工程实践" }),
  ).toBeVisible();
  await context.close();
});

test("keyboard copy selects and copies a full emoji grapheme in the browser", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto("/");
  await expect(page.locator(".terminal-shell")).toHaveAttribute(
    "data-ready",
    "true",
  );
  // A terminal output fixture, independent of which articles are currently published.
  await page.locator(".pane-body").evaluate((element) => {
    const text = document.createElement("p");
    text.textContent = "👩‍💻e\u0301中文";
    element.prepend(text);
  });
  await key(page, "Enter");
  await page.keyboard.press("v");
  await page.keyboard.press("y");
  await expect(
    page.getByRole("region", { name: "copy-mode" }),
  ).not.toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe("👩‍💻");
});

test("closing a popup cannot dismiss a subsequently opened session picker", async ({
  page,
}) => {
  await page.goto("/");
  for (let i = 0; i < 4; i++) {
    await key(page, "?");
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.keyboard.press("q");
    await key(page, "u");
    await expect(
      page.getByRole("listbox", { name: "choose-session" }),
    ).toBeVisible();
    await page.keyboard.press("Escape");
  }
});

test("p10k matches the configured ASCII two-line prompt and ANSI colors", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.locator(".terminal-shell")).toHaveAttribute(
    "data-ready",
    "true",
  );
  const prompt = page.locator(".terminal-prompt");
  await expect(prompt.locator(".p10k-directory")).toHaveText("~/blog");
  await expect(prompt.locator(".p10k-git")).toHaveText("main");
  await expect(prompt.locator(".p10k-gap")).toContainText("---");
  await expect(prompt.locator(".p10k-time")).toHaveText(/^\d{2}:\d{2}:\d{2}$/);
  await expect(prompt.locator(".shell-chevron")).toHaveText(">");
  await expect(prompt.locator(".p10k-anchor")).toHaveCSS(
    "color",
    "rgb(0, 175, 255)",
  );
  await expect(prompt.locator(".shell-chevron")).toHaveCSS(
    "color",
    "rgb(95, 215, 0)",
  );
  await expect(
    page.locator(
      ".shell-header,.pane-header,.pane-controls,.hero-actions,.statusbar",
    ),
  ).toHaveCount(0);
});

test("p10k shows the configured error prompt after an unknown command", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.locator(".terminal-shell")).toHaveAttribute(
    "data-ready",
    "true",
  );
  await command(page, "does-not-exist");
  await expect(page.locator(".terminal-prompt .shell-chevron")).toHaveCSS(
    "color",
    "rgb(255, 0, 0)",
  );
  await command(page, "pwd");
  await expect(page.locator(".terminal-prompt .shell-chevron")).toHaveCSS(
    "color",
    "rgb(95, 215, 0)",
  );
});

test("the terminal defaults to personal Mocha without inheriting the old website theme", async ({
  page,
}) => {
  await page.addInitScript(() => localStorage.setItem("ryou-theme", "light"));
  await page.goto("/");
  await expect(page.locator(".terminal-shell")).toHaveAttribute(
    "data-ready",
    "true",
  );
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await command(page, "theme light");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
});

test("opening the home terminal focuses the zsh input for immediate keyboard use", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.locator(".terminal-shell")).toHaveAttribute(
    "data-ready",
    "true",
  );
  await expect(
    page.locator('.pane.is-focused input[aria-label="终端命令"]'),
  ).toBeFocused();
  await page.keyboard.type("projects");
  await page.keyboard.press("Enter");
  await expect(
    page.getByRole("heading", { name: "项目与工程实践" }),
  ).toBeVisible();
});

test("keyboard-selected windows stay visible in the narrow tmux status bar", async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 900 });
  await page.goto("/");
  await key(page, "5");
  await expect(page.locator(".tmux-windows .current")).toContainText("links");
  await expect
    .poll(() =>
      page.locator(".tmux-windows").evaluate((nav) => {
        const current = nav.querySelector(".current")!;
        const outer = nav.getBoundingClientRect(),
          inner = current.getBoundingClientRect();
        return inner.left >= outer.left - 1 && inner.right <= outer.right + 1;
      }),
    )
    .toBe(true);
  await key(page, "1");
  await expect
    .poll(() => page.locator(".tmux-windows").evaluate((nav) => nav.scrollLeft))
    .toBe(0);
});
