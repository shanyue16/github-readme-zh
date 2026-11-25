# GitHub README 中文版自动替换

一个用于[脚本猫](https://scriptcat.org/)的用户脚本：打开 GitHub 仓库时，如果仓库里存在中文版 README，就自动用它替换页面上默认显示的 README，并提供一键切回原版的按钮。

整个项目只有一个文件：`github-readme-zh.user.js`，无需构建、无第三方依赖。

## 功能特性

- 自动识别多种中文 README 命名，大小写不敏感：`README_ZH.md`、`README_zh.md`、`README_zh-CN.md`、`README.zh-CN.md`、`README_zh_CN.md`、`README_CN.md`、`README_zh-Hans.md` 等。
- 先用兜底正则匹配 `README_<zh/cn 语言标记>.md`，未显式列出的写法（如 `README_zh-TW.md`）也能识别。
- 优先从页面文件列表中发现实际存在的中文 README，**只对命中的文件发一次请求**；文件列表不可用时才逐个候选名尝试。
- 直接复用 GitHub 自身渲染后的 HTML，表格、任务列表、emoji、相对图片链接等显示效果与 GitHub 原生一致。
- 支持分支名中包含 `/`；分支识别失败时回退到 GitHub 支持的 `HEAD` 引用。
- 兼容 GitHub 的 Turbo / pjax 页面导航，README 异步加载时也能捕获。
- README 上方显示提示条，可一键在「中文版 / 原版」之间切换。
- 找不到中文 README 时静默跳过，不影响原页面。

## 安装

1. 安装并启用脚本猫浏览器扩展。
2. 任选一种方式导入脚本：
   - 在脚本猫中新建脚本，把 `github-readme-zh.user.js` 的全部内容粘贴进去保存；
   - 或把 `.user.js` 文件直接拖入脚本猫窗口导入。
3. 首次运行时如弹出跨域连接授权提示，请允许访问 `github.com`（脚本中存在 `@connect github.com` 声明）。

## 使用

安装后打开任意 GitHub 仓库首页或目录页即可。例如仓库中同时存在 `README.md` 和 `README_zh-CN.md` 时，页面会自动显示 `README_zh-CN.md` 的内容，并显示如下提示条：

> 📄 已自动切换为中文 README（README_zh-CN.md）　[查看原版]

点击「查看原版」可切回 `README.md`，再点一次「切回中文版」即可恢复。

## 配置

打开脚本顶部的 `CONFIG` 对象即可修改：

| 配置项 | 说明 | 默认值 |
| --- | --- | --- |
| `filenames` | 候选文件名数组，按优先级排列，大小写不敏感 | 16 种常见中文 README 命名 |
| `namePattern` | 候选文件名的兜底正则 | `^readme[._-](?:zh\|cn\|zh[-_.][a-z]{2,5}\|cn[-_.][a-z]{2,5})\.md$`（忽略大小写） |
| `showNotice` | 是否显示「已切换」提示条 | `true` |
| `noticeText` | 提示条文字 | `已自动切换为中文 README` |
| `timeout` | 请求超时时间（毫秒） | `15000` |

如果团队使用了自定义的命名，把它加入 `filenames` 数组即可。

## 工作原理

1. 匹配 `https://github.com/*/*`，并排除设置、搜索等非仓库路径，只处理仓库首页与目录页。
2. 从页面的文件链接推断当前分支；推断失败时使用 `HEAD`。
3. 从文件列表 DOM 中查找符合规则的中文 README；找到后请求它的 blob 页面，否则按候选名逐个尝试。
4. 用 `DOMParser` 提取 blob 页面中的 `article.markdown-body`，把当前 README 的 `innerHTML` 替换为该内容，并插入提示条。
5. 监听 `turbo:load`、`pjax:end`、`popstate`，配合 `MutationObserver` 处理页面导航和异步渲染。

## 常见问题

**没有自动切换？**

- 确认仓库中确实存在符合命名规则的中文 README，且位于仓库根目录。
- 打开浏览器控制台，查看是否有 `[README_ZH]` 开头的日志，例如 `HTTP 404` 表示文件不存在或分支推断有误。
- 确认脚本猫已启用，并且允许脚本连接 `github.com`。

**显示的是英文原版？**

- 点击提示条上的「查看原版」会切换回原版，再点一次即可切回中文版。

**不想看到提示条？**

- 把 `CONFIG.showNotice` 改为 `false`。

## 开发

修改脚本后可用 Node 做一次语法检查：

```bash
node --check github-readme-zh.user.js
```

## 许可证

本项目采用 [GNU General Public License v3.0](LICENSE) 开源协议。你可以自由使用、修改和分发，但需遵守 GPL-3.0 的条款。
