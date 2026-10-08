# 个人终端配置对齐

用户最后明确要求：“直接就是终端样式 zsh p10k + tmux 我的个人配置，极简、直白。”因此当前实现直接依据仓库配置，移除网页式布局；不再把取得旧图片作为发布前置条件，也不声称对不可读取图片做过像素比对。

## 依据

配置来源：[WASIDJ/.config](https://github.com/WASIDJ/.config/tree/b5af7423eb7021ffb45cbe4ecec19c0ba76f5c3e)。

| 要求          | 当前实现和验证                                                                                                     |
| ------------- | ------------------------------------------------------------------------------------------------------------------ |
| zsh + p10k    | 使用仓库的 ASCII 两行布局；目录和 Git 分支、`-` 填充、`HH:mm:ss` 时间、第二行 `>`；成功/失败提示符对应 ANSI 76/196 |
| p10k 色值     | 路径 31、anchor 39 且粗体、Git clean 76、gap 238、time 66；浏览器验证实际 RGB 值                                   |
| Ghostty       | FiraCode Nerd Font Mono、18pt、12px 内边距、Catppuccin Mocha、无窗口装饰；字体本地托管并保留许可                   |
| tmux          | 独立 session/window、底部只读状态栏、`Ctrl+q`、方向与分屏、确认关闭 window、默认 mouse off、vi 复制模式            |
| 极简          | 首屏只有身份、目录入口、提示符和底部状态栏；没有 hero、卡片布局、顶部工具栏或 pane 按钮                            |
| 全键盘        | 页面与 URL picker、窗口/session 操作、复制与配置命令均可由键盘完成；`Ctrl+q m` 可显式开启鼠标                      |
| Mac mini 区域 | [设计分析](mac-mini-terminal-plan.md) 已记录，用户之后实现；当前不提供真实 PTY/SSH 连接                            |

Ghostty 的 `font-size` 单位为 pt，因此 CSS 使用 18pt，浏览器的计算值为 24px。[Ghostty 官方说明](https://ghostty.org/docs/config/reference#font-size)

## 验证

- 17 个单元测试：内容编译、旧路由、session/window、pane、Unicode grapheme 复制与持久化校验。
- 15 个浏览器场景：键盘管理、鼠标开关、vi 复制、快捷键列表、命令、字体/响应式、p10k 结构/色值/错误提示、旧主题隔离、文章公式/评论标识、404、无 JS 阅读及弹层切换。
- 167 条旧站 URL、canonical、JSON-LD、验证文件、RSS、sitemap 和草稿排除检查通过。
- 默认暗色首页 Axe 检查通过。
- 当前界面：[终端首页](preview/terminal.png)。旧版 Lighthouse 数值不作为本版的性能证明。

网页 session/window 是浏览器本地状态；博客命令用于导航，不执行系统 shell。原配置中的私人 Codex 周额度脚本不在公共站点运行。未来真实终端应使用独立认证来源，并将按键直接交给原有 `mini` 会话。
