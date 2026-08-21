# Ryou's Blog

这是基于 Hugo 和 Hugo Theme Stack 构建的个人博客。

## 本地开发

```bash
hugo server -D
```

启动后访问 <http://localhost:1313/>。

## 构建

```bash
hugo --minify
```

生成的静态文件位于 `public/`。推送到 `main` 分支后，GitHub Actions 会自动构建并发布到 GitHub Pages。

## 代码块

代码块建议显式声明语言，尤其是 Shell：

````markdown
```bash
git status
```

```shell-session
$ hugo server -D
```
````

使用 `bash` 表示可执行脚本，使用 `shell-session` 表示带终端提示符和输出的记录，使用 `text` 表示普通日志。需要强调代码行时，可以使用 Hugo 的 `hl_lines` 选项：

````markdown
```bash {hl_lines=[2]}
git fetch origin
git rebase origin/main
```
````

## LLM 爬虫提示

文章页会在 HTML 源码中包含一段对普通读者不可见的大模型提示词，用于向抓取文章内容的模型表达本站的内容定位。提示词统一配置在 `hugo.yaml` 的 `params.llmCrawler.prompt` 中；将 `params.llmCrawler.enabled` 设为 `false` 即可关闭。

本站部署为静态页面，不会根据请求 User-Agent 在服务器端动态判断爬虫类型；该提示会随文章 HTML 一起生成。
