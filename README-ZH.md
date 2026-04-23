中文 | [English](https://github.com/likemuuxi/obsidian-diary-view/blob/master/README.md)

# Diary View

Diary View 是一款 Obsidian 社区插件，可以把你的每日笔记呈现为一本翻页日记。它希望提供一种更安静、更有仪式感的阅读和书写体验：最近的每日笔记会以书页形式展示，当前笔记可以直接预览或编辑，诸如每日一语、天气图标这类小信息也会保存在笔记自己的 frontmatter 中。

<img width="1671" height="1274" alt="image" src="https://github.com/user-attachments/assets/8cd71ded-3ac8-45f6-b1b0-e2b811441fe1" />

## 功能

- 通过左侧栏图标或 `Open diary view` 命令打开专属日记视图。
- 以书页布局和翻页动画浏览最近 7 天的每日笔记。
- 在日记视图中预览 Markdown 渲染结果，也可以切换到编辑模式。
- 编辑右页顶部的 prompt 文本，内容会写入 frontmatter 的 `daily-quote` 字段。
- 可选配置每日一语 API。插件只会在当前笔记没有 `daily-quote` 时请求一次，并把结果缓存到 frontmatter。
- 可通过 frontmatter 的 `daily-weather` 自定义每日天气图标。
- 可通过 frontmatter 的 `daily-image` 为某一天替换左页默认插画。
- 编辑正文时会保留每日笔记已有的 frontmatter。

## Frontmatter

Diary View 会读取和写入每日笔记中的几个可选 frontmatter 字段。

```yaml
---
daily-quote: "写一句属于今天的话。"
daily-weather: cloud-sun
daily-image: "https://example.com/photo.jpg"
---
```

`daily-quote` 会显示在右页顶部的 prompt 卡片中，并且可以直接在日记视图里编辑。即使你把它清空，插件也会保留一个空的 `daily-quote` 值，因此下一次渲染时不会再被 API 自动覆盖。

`daily-weather` 可以填写 Obsidian/Lucide 图标名，例如 `sun`、`cloud`、`cloud-rain`、`cloud-snow` 或 `wind`。也支持一些常见天气词映射，例如 `clear`、`cloudy`、`rain`、`snow`、`storm`、`晴`、`多云`、`雨`、`雪`。

`daily-image` 会替换左页的默认插画。未填写或为空时，Diary View 会继续显示内置插画。

## 设置

在 **设置 -> 第三方插件 -> Diary View** 中可以配置：

- **Daily quote API**：可选的每日一语接口 URL。接口可以返回纯文本，也可以返回 JSON；插件会尝试读取 `hitokoto`、`quote`、`content`、`text`、`sentence`、`message` 或 `data` 等常见字段。

插件默认离线工作。只有当你填写了 Daily quote API URL 时，它才会发起网络请求。

## 每日笔记

Diary View 会优先读取 Obsidian 的每日笔记配置：

- `folder` 决定每日笔记存放位置。
- `format` 决定每日笔记文件名格式。

如果没有找到每日笔记配置，Diary View 会默认使用库根目录下的 `YYYY-MM-DD.md`。

## 安装

本地开发或手动测试时，将以下文件复制到：

```text
<Vault>/.obsidian/plugins/diary-view/
```

必需文件：

- `main.js`
- `manifest.json`
- `styles.css`

然后重新加载 Obsidian，并在 **设置 -> 第三方插件** 中启用插件。

## 开发

安装依赖：

```bash
npm install
```

启动开发构建：

```bash
npm run dev
```

生成生产构建：

```bash
npm run build
```

## 灵感来源

本插件的笔记本氛围、以日记为中心的交互方式，以及翻页式呈现，受到 Dear Diary 的启发：

- Dear Diary 仓库：https://github.com/thebuggeddev/dear-diary
- Dear Diary 演示：https://dear-diary-three.vercel.app/

Diary View 是围绕 Obsidian 本地每日笔记和 vault frontmatter 构建的插件，运行时不依赖 Dear Diary。
