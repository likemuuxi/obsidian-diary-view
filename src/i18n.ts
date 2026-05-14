export type Language = "en" | "zh";

export const LANGUAGES: Array<{ value: Language; label: string }> = [
	{ value: "en", label: "English" },
	{ value: "zh", label: "中文" },
];

// ── Translation Dictionary ──────────────────────────────────────────

const dict: Record<string, Record<Language, string>> = {
	// ── App / General ──
	"app.name":                              { en: "Diary",                        zh: "日记" },
	"app.ribbon-tooltip":                    { en: "Open diary view",             zh: "打开日记视图" },
	"app.command-open":                      { en: "Open diary view",             zh: "打开日记视图" },
	"app.no-leaf":                           { en: "No workspace leaf available.", zh: "没有可用的工作区面板" },
	"app.file-not-found":                    { en: "Source file no longer exists.",zh: "原始文件已不存在" },
	"app.cannot-locate-paragraph":           { en: "Could not locate the selected paragraph.", zh: "无法定位选中的段落" },

	// ── Settings ──
	"settings.daily-note-heading.name":      { en: "Daily note heading",           zh: "日记标题" },
	"settings.daily-note-heading.desc":      { en: "Optional. Enter one or more Markdown headings. The diary view uses the first matching heading, and creates the first one when none exist.", zh: "可选。输入一个或多个 Markdown 标题。日记视图使用第一个匹配的标题，若不存在则创建第一个。" },
	"settings.daily-note-heading.placeholder":{ en: "Diary\nJournal\nDaily note",   zh: "日记\n日志\n日常记录" },
	"settings.quote-key.name":               { en: "Quote frontmatter key",        zh: "语录 frontmatter 键名" },
	"settings.quote-key.desc":               { en: "Frontmatter property used to read and save the daily quote.", zh: "用于读取和保存每日语录的 frontmatter 属性名" },
	"settings.quote-key.placeholder":        { en: "daily-quote",                  zh: "daily-quote" },
	"settings.quote-api.name":               { en: "Daily quote API",              zh: "每日语录 API" },
	"settings.quote-api.desc":               { en: "Optional. The diary view requests this URL once per daily note, then caches the quote in frontmatter.", zh: "可选。日记视图为每篇日记请求一次此 URL，然后将语录缓存到 frontmatter。" },
	"settings.quote-api.placeholder":        { en: "https://example.com/daily-quote", zh: "https://example.com/daily-quote" },
	"settings.weather-key.name":             { en: "Weather frontmatter key",      zh: "天气 frontmatter 键名" },
	"settings.weather-key.desc":             { en: "Frontmatter property used to read the daily weather icon.", zh: "用于读取每日天气图标的 frontmatter 属性名" },
	"settings.weather-key.placeholder":      { en: "daily-weather",                zh: "daily-weather" },
	"settings.image-key.name":               { en: "Image frontmatter key",        zh: "图片 frontmatter 键名" },
	"settings.image-key.desc":               { en: "Frontmatter property used to read the diary image URL or path.", zh: "用于读取日记图片 URL 或路径的 frontmatter 属性名" },
	"settings.image-key.placeholder":        { en: "daily-image",                  zh: "daily-image" },
	"settings.use-first-image.name":         { en: "Use first image as artwork",   zh: "使用首张图片作为插图" },
	"settings.use-first-image.desc":         { en: "When enabled and no image frontmatter is set, the first image in the daily note is used as the diary artwork. When disabled, the default illustration is shown.", zh: "启用后，若未设置图片 frontmatter，日记中的第一张图片将被用作日记插图。禁用则显示默认插图。" },
	"settings.mood-key.name":                { en: "Mood frontmatter key",         zh: "心情 frontmatter 键名" },
	"settings.mood-key.desc":                { en: "Frontmatter property used to read and save the daily mood icon.", zh: "用于读取和保存每日心情图标的 frontmatter 属性名" },
	"settings.mood-key.placeholder":         { en: "daily-mood",                   zh: "daily-mood" },
	"settings.custom-mood.heading":          { en: "Custom mood icons",            zh: "自定义心情图标" },
	"settings.custom-mood.desc":             { en: "Add custom Lucide icon names and descriptions. Icons appear alongside the built-in mood icons in the diary view.", zh: "添加自定义 Lucide 图标名称和描述。图标会与内置心情图标一起显示在日记视图中。" },
	"settings.custom-mood.add-btn":          { en: "Add icon",                     zh: "添加图标" },
	"settings.custom-mood.name-placeholder": { en: "Lucide icon name (e.g. smile)",zh: "Lucide 图标名（如 smile）" },
	"settings.custom-mood.desc-placeholder": { en: "Description (e.g. Happy)",     zh: "描述（如 开心）" },
	"settings.custom-mood.color-tooltip":    { en: "Color",                        zh: "颜色" },
	"settings.custom-mood.remove-tooltip":   { en: "Remove",                       zh: "删除" },
	"settings.language.name":                { en: "Language",                     zh: "界面语言" },
	"settings.language.desc":                { en: "Display language for the diary view UI.", zh: "日记视图界面的显示语言" },

	// ── Calendar / Date ──
	"calendar.month.0":                      { en: "January",                      zh: "一月" },
	"calendar.month.1":                      { en: "February",                     zh: "二月" },
	"calendar.month.2":                      { en: "March",                        zh: "三月" },
	"calendar.month.3":                      { en: "April",                        zh: "四月" },
	"calendar.month.4":                      { en: "May",                          zh: "五月" },
	"calendar.month.5":                      { en: "June",                         zh: "六月" },
	"calendar.month.6":                      { en: "July",                         zh: "七月" },
	"calendar.month.7":                      { en: "August",                       zh: "八月" },
	"calendar.month.8":                      { en: "September",                    zh: "九月" },
	"calendar.month.9":                      { en: "October",                      zh: "十月" },
	"calendar.month.10":                     { en: "November",                     zh: "十一月" },
	"calendar.month.11":                     { en: "December",                     zh: "十二月" },
	"calendar.weekday.short.0":              { en: "Su",                           zh: "日" },
	"calendar.weekday.short.1":              { en: "Mo",                           zh: "一" },
	"calendar.weekday.short.2":              { en: "Tu",                           zh: "二" },
	"calendar.weekday.short.3":              { en: "We",                           zh: "三" },
	"calendar.weekday.short.4":              { en: "Th",                           zh: "四" },
	"calendar.weekday.short.5":              { en: "Fr",                           zh: "五" },
	"calendar.weekday.short.6":              { en: "Sa",                           zh: "六" },
	"calendar.today":                        { en: "Today",                        zh: "今天" },
	"calendar.yesterday":                    { en: "Yesterday",                    zh: "昨天" },
	"calendar.tomorrow":                     { en: "Tomorrow",                     zh: "明天" },
	"calendar.prev-month":                   { en: "Previous month",               zh: "上个月" },
	"calendar.next-month":                   { en: "Next month",                   zh: "下个月" },
	"calendar.pick-date":                    { en: "Pick a date",                  zh: "选择日期" },

	"settings.start-of-week.name":           { en: "Start of week",                zh: "一周开始" },
	"settings.start-of-week.desc":           { en: "Which day the calendar week starts on.", zh: "日历中每周的起始日。" },
	"settings.start-of-week.monday":         { en: "Monday",                       zh: "周一" },
	"settings.start-of-week.sunday":         { en: "Sunday",                       zh: "周日" },
	"settings.weekend-days.name":            { en: "Weekend days",                 zh: "休息日" },
	"settings.weekend-days.desc":            { en: "Select which days are highlighted as weekend in the calendar.", zh: "选择日历中高亮显示为休息日的日期。" },
	"calendar.weekday.long.0":               { en: "Sunday",                       zh: "星期日" },
	"calendar.weekday.long.1":               { en: "Monday",                       zh: "星期一" },
	"calendar.weekday.long.2":               { en: "Tuesday",                      zh: "星期二" },
	"calendar.weekday.long.3":               { en: "Wednesday",                    zh: "星期三" },
	"calendar.weekday.long.4":               { en: "Thursday",                     zh: "星期四" },
	"calendar.weekday.long.5":               { en: "Friday",                       zh: "星期五" },
	"calendar.weekday.long.6":               { en: "Saturday",                     zh: "星期六" },

	// ── Weather ──
	"weather.picker-title":                  { en: "Weather",                      zh: "天气" },

	// ── Mood ──
	"mood.picker-title":                     { en: "Mood",                         zh: "心情" },
	"mood.clear":                            { en: "Clear mood",                   zh: "清除心情" },
	"mood.set-placeholder":                  { en: "Set mood",                     zh: "设置心情" },

	// ── Quote / Prompt ──
	"quote.title":                           { en: "Daily quote",                  zh: "每日语录" },
	"quote.placeholder-existing":            { en: "Write a sentence for today...", zh: "为今天写一句话吧……" },
	"quote.placeholder-new":                 { en: "Write a sentence to create this daily note...", zh: "写一句话来创建这篇日记……" },

	// ── Daily note content ──
	"content.heading":                       { en: "Daily note content",           zh: "日记内容" },
	"content.empty-title":                   { en: "No daily note exists for this date yet.", zh: "此日期还没有日记" },
	"content.empty-preview":                 { en: "There is no content to preview yet.", zh: "还没有可预览的内容" },
	"content.empty-summary":                 { en: "Daily note is empty.",         zh: "日记为空" },
	"content.preview-btn":                   { en: "Preview Markdown",             zh: "预览 Markdown" },
	"content.edit-btn":                      { en: "Switch to editing",            zh: "切换到编辑" },
	"content.textarea-placeholder":          { en: "Write this daily note...",     zh: "开始写日记吧……" },
	"content.no-note-caption":               { en: "No note yet",                  zh: "暂无日记" },
	"content.save-notice":                   { en: "Saved.",                       zh: "已保存" },

	// ── Word count ──
	"wordcount.chars":                       { en: "{count} chars",                zh: "{count} 字" },

	// ── Wikilink ──
	"wikilink.type-file":                    { en: "File",                         zh: "文件" },
	"wikilink.type-heading":                 { en: "Heading",                      zh: "标题" },
	"wikilink.type-paragraph":               { en: "Paragraph",                    zh: "段落" },
	"wikilink.type-block":                   { en: "Block",                        zh: "块" },
};

// ── Helper ──

/**
 * Get a translated string for the given key and language.
 * Falls back to English if the key or language is missing.
 */
export function t(key: string, lang: Language): string {
	const entry = dict[key];
	if (!entry) {
		console.warn(`[diary-view] Missing i18n key: "${key}"`);
		return key;
	}
	return entry[lang] ?? entry.en ?? key;
}

/**
 * Get a translated string with `{count}` placeholder replaced.
 */
export function tCount(key: string, lang: Language, count: number): string {
	return t(key, lang).replace("{count}", String(count));
}

/**
 * Get month name by index (0 = January).
 */
export function getMonthName(index: number, lang: Language): string {
	return t(`calendar.month.${index}`, lang);
}

/**
 * Get short weekday name by index (0 = Sunday).
 */
export function getShortWeekday(index: number, lang: Language): string {
	return t(`calendar.weekday.short.${index}`, lang);
}
