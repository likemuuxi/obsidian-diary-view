English | [中文](https://github.com/likemuuxi/obsidian-diary-view/blob/master/README-ZH.md)

# Diary View

Diary View is an Obsidian community plugin that turns your daily notes into a notebook-style diary view. It focuses on a calm reading and writing experience: recent daily notes are shown as pages, the current note can be previewed or edited in place, and small details such as a daily quote and weather icon can be stored directly in each note's frontmatter.

<img width="1671" height="1274" alt="image" src="https://github.com/user-attachments/assets/8cd71ded-3ac8-45f6-b1b0-e2b811441fe1" />

## Features

- Open a dedicated diary view from the ribbon icon or the `Open diary view` command.
- Browse the latest seven daily notes with a page-like layout and flip animation.
- Preview rendered Markdown or switch to editing without leaving the diary view.
- Edit the prompt text at the top of the right page. The text is saved to frontmatter as `daily-quote`.
- Optionally fetch a daily quote from a user-configured API. The plugin requests it only when a note does not already have `daily-quote`, then caches it in frontmatter.
- Customize the weather icon for a note from frontmatter with `daily-weather`.
- Replace the default artwork with a note-specific image from frontmatter with `daily-image`.
- Preserve daily note frontmatter while editing the body content.

## Frontmatter

Diary View reads and writes a few optional frontmatter fields in your daily notes.

```yaml
---
daily-quote: "Write one sentence that belongs to today."
daily-weather: cloud-sun
daily-image: "https://example.com/photo.jpg"
---
```

`daily-quote` is shown in the prompt card and can be edited directly from the diary view. Clearing the prompt keeps an empty `daily-quote` value, so an API quote will not overwrite your manual choice on the next render.

`daily-weather` can be an Obsidian/Lucide icon name such as `sun`, `cloud`, `cloud-rain`, `cloud-snow`, or `wind`. Common weather words such as `clear`, `cloudy`, `rain`, `snow`, `storm`, `晴`, `多云`, `雨`, and `雪` are also mapped to matching icons.

`daily-image` replaces the default illustration on the left page. If it is empty or missing, Diary View keeps the built-in artwork.

## Settings

Open **Settings -> Community plugins -> Diary View** to configure:

- **Daily quote API**: Optional URL for a daily quote endpoint. The response can be plain text or JSON using common fields such as `hitokoto`, `quote`, `content`, `text`, `sentence`, `message`, or `data`.

The plugin works offline by default. It only makes network requests when you add a Daily quote API URL.

## Daily Notes

Diary View uses Obsidian's daily notes configuration when available:

- `folder` decides where notes are stored.
- `format` decides the note filename pattern.

If no daily notes configuration is found, Diary View falls back to notes named `YYYY-MM-DD.md` at the vault root.

## Installation

For local development or manual testing, copy these files into:

```text
<Vault>/.obsidian/plugins/diary-view/
```

Required files:

- `main.js`
- `manifest.json`
- `styles.css`

Then reload Obsidian and enable the plugin in **Settings -> Community plugins**.

## Development

Install dependencies:

```bash
npm install
```

Start the development build:

```bash
npm run dev
```

Create a production build:

```bash
npm run build
```

## Inspiration

This plugin's notebook mood, diary-first interaction model, and page-turning presentation were inspired by Dear Diary:

- Dear Diary repository: https://github.com/thebuggeddev/dear-diary
- Dear Diary demo: https://dear-diary-three.vercel.app/

Diary View is an Obsidian plugin built around local daily notes and vault frontmatter. It does not depend on Dear Diary at runtime.