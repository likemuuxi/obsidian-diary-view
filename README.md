English | [中文](https://github.com/likemuuxi/obsidian-diary-view/blob/master/README-ZH.md)

# Diary View

Diary View is an Obsidian community plugin that turns your daily notes into a notebook-style diary view. It focuses on a calm reading and writing experience: recent daily notes are shown as pages, the current note can be previewed or edited in place, and small details such as a daily quote and weather icon can be stored directly in each note's frontmatter.

<img width="1671" height="1274" alt="image" src="https://github.com/user-attachments/assets/8cd71ded-3ac8-45b6-b1b0-e2b811441fe1" />

## Features

- Open a dedicated diary view from the ribbon icon or the `Open diary view` command.
- Browse the latest seven daily notes with a page-like layout and flip animation.
- Preview rendered Markdown or switch to editing without leaving the diary view.
- Edit the prompt text at the top of the right page. The text is saved to frontmatter as `daily-quote` by default.
- Optionally fetch a daily quote from a user-configured API. The plugin requests it only when a note does not already have the configured quote property, then caches it in frontmatter.
- Customize the weather icon for a note from frontmatter with `daily-weather` by default.
- Replace the default artwork with a note-specific image from frontmatter with `daily-image`.
- Preserve daily note frontmatter while editing the body content.
- **Full English and Chinese localization** — auto-detects your Obsidian locale, or pick a language in settings.
- **Configurable calendar week** — choose whether the week starts on Monday or Sunday.
- **Custom weekend days** — select which days are highlighted as weekend in the calendar.

## Frontmatter

Diary View reads and writes a few optional frontmatter fields in your daily notes.

```yaml
---
daily-quote: "Write one sentence that belongs to today."
daily-weather: cloud-sun
daily-image: "https://example.com/photo.jpg"
daily-mood: smile
---
```

`daily-quote` is shown in the prompt card at the top of the right page and can be edited directly from the diary view. Clearing the prompt keeps an empty `daily-quote` value, so an API quote will not overwrite your manual choice on the next render. The quote property name can be changed in settings.

`daily-weather` stores the weather for the day. Click the weather icon in the page header to open the built-in picker and select an icon. You can also set it manually in frontmatter — the value can be a Lucide icon name (e.g. `sun`, `cloud-rain`), or common weather words which are automatically mapped to icons. The weather property name can be changed in settings.

`daily-image` replaces the default illustration on the left page. The value can be a URL (`https://…`), a vault-relative path (`photos/sunset.jpg`), or a wikilink (`![[sunset.jpg]]`). If this field is empty or missing, Diary View shows the built-in artwork — or, when **Use first image as artwork** is enabled, the first image found in the note body. The image property name can be changed in settings.

`daily-mood` stores the selected mood icon for the day. Click the mood area on the left page to open the built-in picker. You can also set it manually in frontmatter using a Lucide icon name or the mood's display description. Custom mood icons can be added in settings. The mood property name can be changed in settings.

## Settings

Open **Settings → Community plugins → Diary View** to configure:

- **Language** — Display language for the diary view UI. Auto-detects your Obsidian locale on first use.
- **Start of week** — Choose whether the calendar week starts on **Monday** (default) or **Sunday**.
- **Weekend days** — Select which days are highlighted as weekend in the calendar. Defaults to Saturday and Sunday.
- **Daily note heading** — Optional Markdown headings to read and write. Enter multiple headings on separate lines, or separate them with commas or semicolons. The first matching heading is used; if none exist, the first configured heading is created.
- **Quote frontmatter key** — Frontmatter property used to read and save the daily quote. Defaults to `daily-quote`.
- **Daily quote API** — Optional URL for a daily quote endpoint. The response can be plain text or JSON using common fields such as `hitokoto`, `quote`, `content`, `text`, `sentence`, `message`, or `data`.
- **Weather frontmatter key** — Frontmatter property used to read the daily weather icon. Defaults to `daily-weather`.
- **Image frontmatter key** — Frontmatter property used to read the diary image URL or path. Defaults to `daily-image`.
- **Use first image as artwork** — When enabled and no image frontmatter is set, the first image in the daily note is used as the diary artwork. When disabled, the default illustration is shown.
- **Mood frontmatter key** — Frontmatter property used to read and save the daily mood icon. Defaults to `daily-mood`.
- **Custom mood icons** — Add custom Lucide icon names and descriptions. Icons appear alongside the built-in mood icons in the diary view.

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

Then reload Obsidian and enable the plugin in **Settings → Community plugins**.

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
