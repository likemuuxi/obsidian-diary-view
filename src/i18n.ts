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
	"settings.image-key.name":               { en: "Image frontmatter key",        zh: "图片 frontmatter 键名" },
	"settings.image-key.desc":               { en: "Frontmatter property used to read the diary image URL or path.", zh: "用于读取日记图片 URL 或路径的 frontmatter 属性名" },
	"settings.image-key.placeholder":        { en: "daily-image",                  zh: "daily-image" },
	"settings.image-desc-key.name":          { en: "Image description frontmatter key", zh: "图片描述 frontmatter 键名" },
	"settings.image-desc-key.desc":          { en: "Frontmatter property used to store the diary image alt text.", zh: "用于存储日记图片描述文字（alt text）的 frontmatter 属性名" },
	"settings.image-desc-key.placeholder":   { en: "daily-image-desc",             zh: "daily-image-desc" },
	"caption.placeholder":                   { en: "Add image description...",     zh: "添加图片描述..." },
	"settings.use-first-image.name":         { en: "Use first image as artwork",   zh: "使用首张图片作为插图" },
	"settings.use-first-image.desc":         { en: "When enabled and no image frontmatter is set, the first image in the daily note is used as the diary artwork. When disabled, the default illustration is shown.", zh: "启用后，若未设置图片 frontmatter，日记中的第一张图片将被用作日记插图。禁用则显示默认插图。" },
	"settings.auto-update-first-image.name": { en: "Auto-update first image to frontmatter", zh: "首图自动更新到封面 frontmatter" },
	"settings.auto-update-first-image.desc": { en: "When enabled, the first image in the daily note will automatically update the diary image frontmatter key. This ensures the artwork stays synchronized with the note content.", zh: "启用后，日记中的第一张图片会自动更新到封面 frontmatter 键值，确保插图与日记内容保持同步。" },
	"settings.custom-mood.name-placeholder": { en: "Lucide icon name (e.g. smile)",zh: "Lucide 图标名（如 smile）" },
	"settings.custom-mood.desc-placeholder": { en: "Description (e.g. Happy)",     zh: "描述（如 开心）" },
	"settings.custom-mood.color-tooltip":    { en: "Color",                        zh: "颜色" },
	"settings.custom-mood.color-reset-tooltip": { en: "Reset color",               zh: "恢复默认颜色" },
	"settings.custom-mood.color-random-tooltip": { en: "Random color",             zh: "随机颜色" },
	"settings.custom-picker.heading":        { en: "Frontmatter pickers",          zh: "Frontmatter 选择器" },
	"settings.custom-picker.desc":           { en: "Weather and mood are built-in pickers. Add custom frontmatter keys with selectable options. All pickers appear in the diary view.", zh: "天气和心情为内置选择器。可添加自定义 frontmatter 键及其候选选项，所有选择器都会显示在日记视图中。" },
	"settings.custom-picker.add-btn":        { en: "Add picker",                   zh: "添加选择器" },
	"settings.custom-picker.restore-builtins.name": { en: "Restore built-in pickers", zh: "恢复内置选择器" },
	"settings.custom-picker.restore-builtins.desc": { en: "Reset the built-in weather and mood options to their defaults. Custom pickers are kept.", zh: "将内置天气和心情选项恢复为默认值。自定义选择器会保留。" },
	"settings.custom-picker.restore-builtins.button": { en: "Restore defaults",    zh: "恢复默认" },
	"settings.custom-picker.add-option":     { en: "Add option",                   zh: "添加选项" },
	"settings.custom-picker.type-name":      { en: "Picker type",                  zh: "选择器类型" },
	"settings.custom-picker.type-options":   { en: "Selectable options",           zh: "候选值" },
	"settings.custom-picker.type-text":      { en: "Text input",                   zh: "文本输入" },
	"settings.custom-picker.text-help":      { en: "Only the frontmatter key is configured here. The value is entered from the diary view popup.", zh: "这里只配置 frontmatter 键名，键值在日记视图的弹出框中填写。" },
	"settings.custom-picker.key-placeholder": { en: "Frontmatter key (e.g. energy-level)", zh: "Frontmatter 键名（如 energy-level）" },
	"settings.custom-picker.label-placeholder": { en: "Display label (e.g. Energy)",  zh: "显示名称（如 精力）" },
	"settings.custom-picker.untitled":       { en: "Untitled picker",              zh: "未命名选择器" },
	"settings.custom-picker.option-count":   { en: "options",                      zh: "个选项" },
	"settings.custom-picker.expand-tooltip": { en: "Expand",                       zh: "展开" },
	"settings.custom-picker.collapse-tooltip": { en: "Collapse",                   zh: "折叠" },
	"settings.custom-picker.reset-colors-tooltip": { en: "Reset all colors",       zh: "全部恢复默认颜色" },
	"settings.custom-picker.random-colors-tooltip": { en: "Randomize all colors",   zh: "全部随机颜色" },
	"settings.custom-picker.remove-tooltip": { en: "Remove",                       zh: "删除" },
	"custom-picker.clear":                   { en: "Clear",                        zh: "清除" },
	"custom-picker.save":                    { en: "Save",                         zh: "保存" },
	"custom-picker.text-placeholder":        { en: "Enter value",                  zh: "输入值" },
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
	"content.save-notice":                   { en: "Saved.",                       zh: "已保存" },

	// ── Word count ──
	"wordcount.chars":                       { en: "{count} chars",                zh: "{count} 字" },

	// ── Wikilink ──
	"wikilink.type-file":                    { en: "File",                         zh: "文件" },
	"wikilink.type-heading":                 { en: "Heading",                      zh: "标题" },
	"wikilink.type-paragraph":               { en: "Paragraph",                    zh: "段落" },
	"wikilink.type-block":                   { en: "Block",                        zh: "块" },

	// ── Image picker ──
	"image-picker.no-images":                { en: "No image files found in vault.", zh: "仓库中没有找到图片文件" },
	"image-picker.update-failed":            { en: "Failed to update diary image.", zh: "更新日记图片失败" },
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
