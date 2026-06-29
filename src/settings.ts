import { AbstractInputSuggest, App, getIconIds, PluginSettingTab, Setting, setIcon, moment } from "obsidian";
import type DiaryViewPlugin from "./main";
import { t, LANGUAGES, type Language } from "./i18n";

export interface CustomFrontmatterOption {
	name: string;
	icon: string;
	color?: string;
}

export type CustomFrontmatterPickerType = "options" | "text";

export interface CustomFrontmatterPicker {
	id: string;
	key: string;
	label: string;
	type?: CustomFrontmatterPickerType;
	options: CustomFrontmatterOption[];
}

interface BuiltinPickerOptionDefinition {
	icon: string;
	nameEn: string;
	nameZh: string;
}

class IconSuggest extends AbstractInputSuggest<string> {
	private readonly iconIds = getIconIds().sort((a, b) => a.localeCompare(b));

	protected getSuggestions(query: string): string[] {
		const normalizedQuery = query.trim().toLowerCase();
		const matches = normalizedQuery
			? this.iconIds.filter((iconId) => iconId.toLowerCase().includes(normalizedQuery))
			: this.iconIds;

		return matches.slice(0, 80);
	}

	renderSuggestion(iconId: string, el: HTMLElement): void {
		const rowEl = el.createDiv({ cls: "diary-settings-icon-suggest-item" });
		const iconEl = rowEl.createSpan({ cls: "diary-settings-icon-suggest-preview" });
		setIcon(iconEl, iconId);
		rowEl.createSpan({ cls: "diary-settings-icon-suggest-name", text: iconId });
	}
}

/**
 * Detect the user's preferred language from Obsidian's locale setting.
 * Falls back to browser language, then English.
 */
export function detectLanguage(): Language {
	// 1) Obsidian's moment locale
	const obsidianLocale = moment.locale();
	if (obsidianLocale === "zh-cn" || obsidianLocale === "zh-tw" || obsidianLocale === "zh") {
		return "zh";
	}

	// 2) Browser language
	if (typeof navigator !== "undefined") {
		const navLang = navigator.language?.toLowerCase() ?? "";
		if (navLang.startsWith("zh")) {
			return "zh";
		}
	}

	// 3) Default
	return "en";
}

export interface DiaryViewSettings {
	dailyQuoteApiUrl: string;
	dailyQuoteFrontmatterKey: string;
	dailyImageFrontmatterKey: string;
	dailyImageDescFrontmatterKey: string;
	dailyNoteHeading: string;
	language: Language;
	startOfWeek: number;
	weekendDays: number[];
	useFirstImageAsArtwork: boolean;
	autoUpdateFirstImageToFrontmatter: boolean;
	customFrontmatterPickers: CustomFrontmatterPicker[];
}

const WEATHER_OPTIONS_BUILTIN: BuiltinPickerOptionDefinition[] = [
	{ icon: "sun", nameEn: "sun", nameZh: "晴" },
	{ icon: "sun-dim", nameEn: "sun-dim", nameZh: "晴间多云" },
	{ icon: "sun-medium", nameEn: "sun-medium", nameZh: "温和" },
	{ icon: "sunrise", nameEn: "sunrise", nameZh: "日出" },
	{ icon: "sunset", nameEn: "sunset", nameZh: "日落" },
	{ icon: "cloud-sun", nameEn: "cloud-sun", nameZh: "多云" },
	{ icon: "cloud-sun-rain", nameEn: "cloud-sun-rain", nameZh: "太阳雨" },
	{ icon: "sun-snow", nameEn: "sun-snow", nameZh: "太阳雪" },
	{ icon: "cloud", nameEn: "cloud", nameZh: "阴" },
	{ icon: "cloud-off", nameEn: "cloud-off", nameZh: "少云" },
	{ icon: "cloudy", nameEn: "cloudy", nameZh: "阴天" },
	{ icon: "cloud-fog", nameEn: "cloud-fog", nameZh: "雾" },
	{ icon: "haze", nameEn: "haze", nameZh: "霾" },
	{ icon: "cloud-drizzle", nameEn: "cloud-drizzle", nameZh: "小雨" },
	{ icon: "cloud-rain", nameEn: "cloud-rain", nameZh: "雨" },
	{ icon: "cloud-rain-wind", nameEn: "cloud-rain-wind", nameZh: "大雨" },
	{ icon: "cloud-hail", nameEn: "cloud-hail", nameZh: "冰雹" },
	{ icon: "cloud-lightning", nameEn: "cloud-lightning", nameZh: "雷" },
	{ icon: "cloud-snow", nameEn: "cloud-snow", nameZh: "雪" },
	{ icon: "snowflake", nameEn: "snowflake", nameZh: "雪花" },
	{ icon: "cloud-moon", nameEn: "cloud-moon", nameZh: "夜间多云" },
	{ icon: "cloud-moon-rain", nameEn: "cloud-moon-rain", nameZh: "夜间雨" },
	{ icon: "moon-star", nameEn: "moon-star", nameZh: "夜间晴" },
	{ icon: "wind", nameEn: "wind", nameZh: "风" },
	{ icon: "tornado", nameEn: "tornado", nameZh: "龙卷风" },
	{ icon: "thermometer", nameEn: "thermometer", nameZh: "温度计" },
	{ icon: "thermometer-sun", nameEn: "thermometer-sun", nameZh: "高温" },
	{ icon: "thermometer-snowflake", nameEn: "thermometer-snowflake", nameZh: "低温" },
	{ icon: "umbrella", nameEn: "umbrella", nameZh: "伞" },
	{ icon: "rainbow", nameEn: "rainbow", nameZh: "彩虹" },
	{ icon: "droplets", nameEn: "droplets", nameZh: "水滴" },
	{ icon: "waves", nameEn: "waves", nameZh: "浪" },
];

const MOOD_ICONS_BUILTIN: BuiltinPickerOptionDefinition[] = [
	{ icon: "smile", nameEn: "Happy", nameZh: "开心" },
	{ icon: "laugh", nameEn: "Joyful", nameZh: "喜悦" },
	{ icon: "meh", nameEn: "Neutral", nameZh: "平静" },
	{ icon: "frown", nameEn: "Sad", nameZh: "伤心" },
	{ icon: "angry", nameEn: "Angry", nameZh: "生气" },
	{ icon: "annoyed", nameEn: "Annoyed", nameZh: "烦恼" },
	{ icon: "heart", nameEn: "Love", nameZh: "爱心" },
	{ icon: "heart-crack", nameEn: "Heartbroken", nameZh: "心碎" },
	{ icon: "thumbs-up", nameEn: "Great", nameZh: "很棒" },
	{ icon: "thumbs-down", nameEn: "Bad", nameZh: "很糟" },
	{ icon: "star", nameEn: "Wonderful", nameZh: "棒极了" },
	{ icon: "party-popper", nameEn: "Celebrating", nameZh: "庆祝" },
	{ icon: "leafy-green", nameEn: "Peaceful", nameZh: "宁静" },
	{ icon: "hand-metal", nameEn: "Cheerful", nameZh: "振奋" },
];

function localizeBuiltinName(option: BuiltinPickerOptionDefinition, language: Language): string {
	return language === "zh" ? option.nameZh : option.nameEn;
}

function createBuiltinOptions(
	definitions: BuiltinPickerOptionDefinition[],
	language: Language,
): CustomFrontmatterOption[] {
	return definitions.map((option) => ({
		icon: option.icon,
		name: localizeBuiltinName(option, language),
	}));
}

export function createBuiltinWeatherPicker(weatherKey: string, language: Language): CustomFrontmatterPicker {
	return {
		id: "builtin_weather",
		key: weatherKey,
		label: language === "zh" ? "\u5929\u6c14" : "Weather",
		type: "options",
		options: createBuiltinOptions(WEATHER_OPTIONS_BUILTIN, language),
	};
}

export function createBuiltinMoodPicker(moodKey: string, language: Language): CustomFrontmatterPicker {
	return {
		id: "builtin_mood",
		key: moodKey,
		label: language === "zh" ? "\u5fc3\u60c5" : "Mood",
		type: "options",
		options: createBuiltinOptions(MOOD_ICONS_BUILTIN, language),
	};
}

function getPickerType(picker: CustomFrontmatterPicker): CustomFrontmatterPickerType {
	return picker.type ?? "options";
}

function isBuiltinPicker(picker: CustomFrontmatterPicker): boolean {
	return picker.id === "builtin_weather" || picker.id === "builtin_mood";
}

function hueToRgb(p: number, q: number, t: number): number {
	let normalized = t;
	if (normalized < 0) normalized += 1;
	if (normalized > 1) normalized -= 1;
	if (normalized < 1 / 6) return p + (q - p) * 6 * normalized;
	if (normalized < 1 / 2) return q;
	if (normalized < 2 / 3) return p + (q - p) * (2 / 3 - normalized) * 6;
	return p;
}

function randomHexColor(): string {
	const hue = Math.random();
	const saturation = 0.65 + Math.random() * 0.16;
	const lightness = 0.48 + Math.random() * 0.12;
	const q = lightness < 0.5 ? lightness * (1 + saturation) : lightness + saturation - lightness * saturation;
	const p = 2 * lightness - q;
	const channels = [
		hueToRgb(p, q, hue + 1 / 3),
		hueToRgb(p, q, hue),
		hueToRgb(p, q, hue - 1 / 3),
	];
	return `#${channels.map((channel) => Math.round(channel * 255).toString(16).padStart(2, "0")).join("")}`;
}

function restoreBuiltinPickerOptions(settings: DiaryViewSettings, language: Language): void {
	const pickers = settings.customFrontmatterPickers ?? [];
	const weatherPicker = pickers.find((p) => p.id === "builtin_weather");
	const moodPicker = pickers.find((p) => p.id === "builtin_mood");
	const weatherKey = weatherPicker?.key?.trim() || "daily-weather";
	const moodKey = moodPicker?.key?.trim() || "daily-mood";
	const customPickers = pickers.filter((p) => p.id !== "builtin_weather" && p.id !== "builtin_mood");

	settings.customFrontmatterPickers = [
		createBuiltinWeatherPicker(weatherKey, language),
		createBuiltinMoodPicker(moodKey, language),
		...customPickers,
	];
}

function localizeBuiltinPicker(
	picker: CustomFrontmatterPicker,
	definitions: BuiltinPickerOptionDefinition[],
	language: Language,
	label: string,
): CustomFrontmatterPicker {
	const colorsByIcon = new Map<string, string>();
	for (const option of picker.options) {
		if (option.icon && option.color) {
			colorsByIcon.set(option.icon, option.color);
		}
	}

	return {
		...picker,
		label,
		options: definitions.map((option) => {
			const color = colorsByIcon.get(option.icon);
			return {
				icon: option.icon,
				name: localizeBuiltinName(option, language),
				...(color ? { color } : {}),
			};
		}),
	};
}

function localizeBuiltinPickers(settings: DiaryViewSettings, language: Language): void {
	settings.customFrontmatterPickers = (settings.customFrontmatterPickers ?? []).map((picker) => {
		if (picker.id === "builtin_weather") {
			return localizeBuiltinPicker(picker, WEATHER_OPTIONS_BUILTIN, language, language === "zh" ? "\u5929\u6c14" : "Weather");
		}

		if (picker.id === "builtin_mood") {
			return localizeBuiltinPicker(picker, MOOD_ICONS_BUILTIN, language, language === "zh" ? "\u5fc3\u60c5" : "Mood");
		}

		return picker;
	});
}

const defaultLanguage = detectLanguage();

export const DEFAULT_SETTINGS: DiaryViewSettings = {
	dailyQuoteApiUrl: "",
	dailyQuoteFrontmatterKey: "daily-quote",
	dailyImageFrontmatterKey: "daily-image",
	dailyImageDescFrontmatterKey: "daily-image-desc",
	dailyNoteHeading: "",
	language: defaultLanguage,
	startOfWeek: 1,
	weekendDays: [0, 6],
	useFirstImageAsArtwork: false,
	autoUpdateFirstImageToFrontmatter: false,
	customFrontmatterPickers: [
		createBuiltinWeatherPicker("daily-weather", defaultLanguage),
		createBuiltinMoodPicker("daily-mood", defaultLanguage),
	],
};

export class DiaryViewSettingTab extends PluginSettingTab {
	plugin: DiaryViewPlugin;
	private expandedPickerIds = new Set<string>();

	constructor(app: App, plugin: DiaryViewPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	private lang(): Language {
		return this.plugin.settings.language;
	}

	display(): void {
		const { containerEl } = this;
		const lang = this.lang();
		containerEl.empty();

		new Setting(containerEl)
			.setName(t("settings.language.name", lang))
			.setDesc(t("settings.language.desc", lang))
			.addDropdown((dropdown) => {
				for (const l of LANGUAGES) {
					dropdown.addOption(l.value, l.label);
				}
				dropdown.setValue(this.plugin.settings.language)
					.onChange(async (value) => {
						this.plugin.settings.language = value as Language;
						localizeBuiltinPickers(this.plugin.settings, this.plugin.settings.language);
						await this.plugin.saveSettings();
						this.display();
						await this.plugin.refreshAllDiaryViews();
					});
			});

		new Setting(containerEl)
			.setName(t("settings.start-of-week.name", lang))
			.setDesc(t("settings.start-of-week.desc", lang))
			.addDropdown((dropdown) => {
				dropdown
					.addOption("1", t("settings.start-of-week.monday", lang))
					.addOption("0", t("settings.start-of-week.sunday", lang));
				dropdown.setValue(String(this.plugin.settings.startOfWeek))
					.onChange(async (value) => {
						this.plugin.settings.startOfWeek = Number(value);
						await this.plugin.saveSettings();
						this.display();
						await this.plugin.refreshAllDiaryViews();
					});
			});

		const weekendSetting = new Setting(containerEl)
			.setName(t("settings.weekend-days.name", lang))
			.setDesc(t("settings.weekend-days.desc", lang))
			.setClass("diary-settings-weekend-days");

		const weekendWrapEl = weekendSetting.controlEl.createDiv({ cls: "diary-weekend-checkboxes" });
		const startOfWeek = this.plugin.settings.startOfWeek;
		for (let i = 0; i < 7; i++) {
			const dow = (startOfWeek + i) % 7;
			const checked = this.plugin.settings.weekendDays.includes(dow);
			const labelEl = weekendWrapEl.createEl("label", { cls: "diary-weekend-checkbox-label" });
			const checkbox = labelEl.createEl("input", {
				cls: "diary-weekend-checkbox",
				attr: { type: "checkbox", value: String(dow) },
			});
			checkbox.checked = checked;
			labelEl.createSpan({ text: t(`calendar.weekday.short.${dow}`, lang) });
			checkbox.addEventListener("change", () => {
				void (async () => {
					if (checkbox.checked) {
						if (!this.plugin.settings.weekendDays.includes(dow)) {
							this.plugin.settings.weekendDays.push(dow);
							this.plugin.settings.weekendDays.sort((a, b) => a - b);
						}
					} else {
						this.plugin.settings.weekendDays = this.plugin.settings.weekendDays.filter((d) => d !== dow);
					}
					await this.plugin.saveSettings();
					await this.plugin.refreshAllDiaryViews();
				})();
			});
		}

		new Setting(containerEl)
			.setName(t("settings.daily-note-heading.name", lang))
			.setDesc(t("settings.daily-note-heading.desc", lang))
			.addTextArea((text) => {
				text.inputEl.rows = 3;
				text
					.setPlaceholder(t("settings.daily-note-heading.placeholder", lang))
					.setValue(this.plugin.settings.dailyNoteHeading)
					.onChange(async (value) => {
						this.plugin.settings.dailyNoteHeading = value.trim();
						await this.plugin.saveSettings();
						await this.plugin.refreshAllDiaryViews();
					});
			});

		new Setting(containerEl)
			.setName(t("settings.quote-key.name", lang))
			.setDesc(t("settings.quote-key.desc", lang))
			.addText((text) => {
				text
					.setPlaceholder(t("settings.quote-key.placeholder", lang))
					.setValue(this.plugin.settings.dailyQuoteFrontmatterKey)
					.onChange(async (value) => {
						const nextValue = value.trim() || DEFAULT_SETTINGS.dailyQuoteFrontmatterKey;
						this.plugin.settings.dailyQuoteFrontmatterKey = nextValue;
						await this.plugin.saveSettings();
						await this.plugin.refreshAllDiaryViews();
					});
			});

		new Setting(containerEl)
			.setName(t("settings.quote-api.name", lang))
			.setDesc(t("settings.quote-api.desc", lang))
			.addText((text) => {
				text.inputEl.type = "url";
				text
					.setPlaceholder(t("settings.quote-api.placeholder", lang))
					.setValue(this.plugin.settings.dailyQuoteApiUrl)
					.onChange(async (value) => {
						this.plugin.settings.dailyQuoteApiUrl = value.trim();
						await this.plugin.saveSettings();
					});
			});

		new Setting(containerEl)
			.setName(t("settings.image-key.name", lang))
			.setDesc(t("settings.image-key.desc", lang))
			.addText((text) => {
				text
					.setPlaceholder(t("settings.image-key.placeholder", lang))
					.setValue(this.plugin.settings.dailyImageFrontmatterKey)
					.onChange(async (value) => {
						const nextValue = value.trim() || DEFAULT_SETTINGS.dailyImageFrontmatterKey;
						this.plugin.settings.dailyImageFrontmatterKey = nextValue;
						await this.plugin.saveSettings();
				});
		});

		new Setting(containerEl)
			.setName(t("settings.image-desc-key.name", lang))
			.setDesc(t("settings.image-desc-key.desc", lang))
			.addText((text) => {
				text
					.setPlaceholder(t("settings.image-desc-key.placeholder", lang))
					.setValue(this.plugin.settings.dailyImageDescFrontmatterKey)
					.onChange(async (value) => {
						const nextValue = value.trim() || DEFAULT_SETTINGS.dailyImageDescFrontmatterKey;
						this.plugin.settings.dailyImageDescFrontmatterKey = nextValue;
						await this.plugin.saveSettings();
					});
			});

		new Setting(containerEl)
			.setName(t("settings.use-first-image.name", lang))
			.setDesc(t("settings.use-first-image.desc", lang))
			.addToggle((toggle) => {
				toggle
					.setValue(this.plugin.settings.useFirstImageAsArtwork)
					.onChange(async (value) => {
						this.plugin.settings.useFirstImageAsArtwork = value;
						await this.plugin.saveSettings();
						await this.plugin.refreshAllDiaryViews();
					});
			});

		new Setting(containerEl)
			.setName(t("settings.auto-update-first-image.name", lang))
			.setDesc(t("settings.auto-update-first-image.desc", lang))
			.addToggle((toggle) => {
				toggle
					.setValue(this.plugin.settings.autoUpdateFirstImageToFrontmatter)
					.onChange(async (value) => {
						this.plugin.settings.autoUpdateFirstImageToFrontmatter = value;
						await this.plugin.saveSettings();
					});
			});

		containerEl.createDiv({ cls: "diary-settings-mood-heading", text: t("settings.custom-picker.heading", lang) });
		containerEl.createDiv({
			cls: "diary-settings-mood-desc",
			text: t("settings.custom-picker.desc", lang),
		});

		this.renderCustomFrontmatterPickers(containerEl);

		new Setting(containerEl)
			.setName(t("settings.custom-picker.add-btn", lang))
			.addButton((btn) => {
				btn
					.setButtonText(t("settings.custom-picker.add-btn", lang))
					.setClass("diary-settings-mood-add-btn")
					.onClick(async () => {
						this.plugin.settings.customFrontmatterPickers.push({
							id: `custom_${Date.now()}`,
							key: "",
							label: "",
							type: "options",
							options: [],
						});
						await this.plugin.saveSettings();
						this.display();
					});
			});

		new Setting(containerEl)
			.setName(t("settings.custom-picker.restore-builtins.name", lang))
			.setDesc(t("settings.custom-picker.restore-builtins.desc", lang))
			.addButton((btn) => {
				btn
					.setButtonText(t("settings.custom-picker.restore-builtins.button", lang))
					.onClick(async () => {
						restoreBuiltinPickerOptions(this.plugin.settings, lang);
						await this.plugin.saveSettings();
						this.display();
						await this.plugin.refreshAllDiaryViews();
					});
			});
	}

	private renderCustomFrontmatterPickers(containerEl: HTMLElement): void {
		const lang = this.lang();
		const pickers = this.plugin.settings.customFrontmatterPickers;
		for (let i = 0; i < pickers.length; i++) {
			const index = i;
			const picker = pickers[index]!;
			const cardEl = containerEl.createDiv({ cls: "diary-settings-picker-card" });
			const pickerId = picker.id || `picker_${index}`;
			const isExpanded = this.expandedPickerIds.has(pickerId);
			cardEl.toggleClass("is-expanded", isExpanded);
			cardEl.toggleClass("is-collapsed", !isExpanded);

			const headerEl = cardEl.createDiv({ cls: "diary-settings-picker-card-header" });
			const pickerType = getPickerType(picker);
			const isBuiltin = isBuiltinPicker(picker);
			const toggleEl = headerEl.createEl("button", {
				cls: "diary-settings-picker-card-toggle",
				attr: {
					type: "button",
					"aria-expanded": String(isExpanded),
					title: t(isExpanded ? "settings.custom-picker.collapse-tooltip" : "settings.custom-picker.expand-tooltip", lang),
				},
			});
			const toggleIconEl = toggleEl.createSpan({ cls: "diary-settings-picker-card-toggle-icon" });
			setIcon(toggleIconEl, "chevron-right");
			const summaryEl = toggleEl.createSpan({ cls: "diary-settings-picker-card-summary" });
			const title = picker.label.trim() || picker.key.trim() || t("settings.custom-picker.untitled", lang);
			summaryEl.createSpan({ cls: "diary-settings-picker-card-title", text: title });
			summaryEl.createSpan({
				cls: "diary-settings-picker-card-meta",
				text: pickerType === "text"
					? t("settings.custom-picker.type-text", lang)
					: `${picker.options.length} ${t("settings.custom-picker.option-count", lang)}`,
			});
			toggleEl.addEventListener("click", () => {
				if (this.expandedPickerIds.has(pickerId)) {
					this.expandedPickerIds.delete(pickerId);
				} else {
					this.expandedPickerIds.add(pickerId);
				}
				this.display();
			});

			if (pickerType === "options") {
				headerEl.createEl("button", {
					cls: "diary-settings-picker-card-action",
					attr: {
						type: "button",
						"aria-label": t("settings.custom-picker.reset-colors-tooltip", lang),
						title: t("settings.custom-picker.reset-colors-tooltip", lang),
					},
				}, (btnEl) => {
					setIcon(btnEl, "rotate-ccw");
					btnEl.addEventListener("click", () => void (async () => {
						for (const option of this.plugin.settings.customFrontmatterPickers[index]!.options) {
							delete option.color;
						}
						await this.plugin.saveSettings();
						this.display();
						await this.plugin.refreshAllDiaryViews();
					})());
				});

				headerEl.createEl("button", {
					cls: "diary-settings-picker-card-action",
					attr: {
						type: "button",
						"aria-label": t("settings.custom-picker.random-colors-tooltip", lang),
						title: t("settings.custom-picker.random-colors-tooltip", lang),
					},
				}, (btnEl) => {
					setIcon(btnEl, "shuffle");
					btnEl.addEventListener("click", () => void (async () => {
						for (const option of this.plugin.settings.customFrontmatterPickers[index]!.options) {
							option.color = randomHexColor();
						}
						await this.plugin.saveSettings();
						this.display();
						await this.plugin.refreshAllDiaryViews();
					})());
				});
			}

			const bodyEl = cardEl.createDiv({ cls: "diary-settings-picker-card-body" });
			bodyEl.toggleClass("is-hidden", !isExpanded);
			const fieldsEl = bodyEl.createDiv({ cls: "diary-settings-picker-card-fields" });
			const keyInput = fieldsEl.createEl("input", {
				cls: "diary-settings-mood-input",
				attr: {
					type: "text",
					placeholder: t("settings.custom-picker.key-placeholder", lang),
					value: picker.key,
				},
			});
			const labelInput = fieldsEl.createEl("input", {
				cls: "diary-settings-mood-input",
				attr: {
					type: "text",
					placeholder: t("settings.custom-picker.label-placeholder", lang),
					value: picker.label,
				},
			});

			keyInput.addEventListener("input", () => {
				void (async () => {
					this.plugin.settings.customFrontmatterPickers[index]!.key = keyInput.value.trim();
					await this.plugin.saveSettings();
					await this.plugin.refreshAllDiaryViews();
				})();
			});

			labelInput.addEventListener("input", () => {
				void (async () => {
					this.plugin.settings.customFrontmatterPickers[index]!.label = labelInput.value.trim();
					await this.plugin.saveSettings();
					await this.plugin.refreshAllDiaryViews();
				})();
			});

			if (!isBuiltin) {
				new Setting(bodyEl)
					.setClass("diary-settings-picker-type-setting")
					.setName(t("settings.custom-picker.type-name", lang))
					.addDropdown((dropdown) => {
						dropdown
							.addOption("options", t("settings.custom-picker.type-options", lang))
							.addOption("text", t("settings.custom-picker.type-text", lang))
							.setValue(pickerType)
							.onChange(async (value) => {
								this.plugin.settings.customFrontmatterPickers[index]!.type = value as CustomFrontmatterPickerType;
								await this.plugin.saveSettings();
								this.display();
								await this.plugin.refreshAllDiaryViews();
							});
					});
			}

			headerEl.createEl("button", {
				cls: "diary-settings-picker-card-remove",
				attr: {
					type: "button",
					"aria-label": t("settings.custom-picker.remove-tooltip", lang),
					title: t("settings.custom-picker.remove-tooltip", lang),
				},
			}, (btnEl) => {
				setIcon(btnEl, "trash-2");
				btnEl.addEventListener("click", () => void (async () => {
					this.plugin.settings.customFrontmatterPickers.splice(index, 1);
					this.expandedPickerIds.delete(pickerId);
					await this.plugin.saveSettings();
					this.display();
					await this.plugin.refreshAllDiaryViews();
				})());
			});

			if (pickerType === "text") {
				bodyEl.createDiv({ cls: "diary-settings-picker-help", text: t("settings.custom-picker.text-help", lang) });
				continue;
			}

			const optionsWrap = bodyEl.createDiv({ cls: "diary-settings-picker-options" });
			const options = picker.options;
			for (let j = 0; j < options.length; j++) {
				const optIndex = j;
				const opt = options[optIndex]!;
				const optSetting = new Setting(optionsWrap)
					.setClass("diary-settings-mood-item");

				const iconPreview = optSetting.controlEl.createDiv({ cls: "diary-settings-mood-preview" });
				if (opt.color) {
					iconPreview.style.color = opt.color;
				}
				if (opt.icon) {
					setIcon(iconPreview, opt.icon);
				}

				const optFields = optSetting.controlEl.createDiv({ cls: "diary-settings-mood-fields" });
				const iconInput = optFields.createEl("input", {
					cls: "diary-settings-mood-input",
					attr: {
						type: "text",
						placeholder: t("settings.custom-mood.name-placeholder", lang),
						value: opt.icon,
					},
				});
				const nameInput = optFields.createEl("input", {
					cls: "diary-settings-mood-input",
					attr: {
						type: "text",
						placeholder: t("settings.custom-mood.desc-placeholder", lang),
						value: opt.name,
					},
				});
				const colorInput = optFields.createEl("input", {
					cls: "diary-settings-mood-color",
					attr: {
						type: "color",
						title: t("settings.custom-mood.color-tooltip", lang),
					},
				});
				colorInput.value = (opt.color && /^#[0-9a-fA-F]{6}$/.test(opt.color)) ? opt.color : "#9e9e9e";

				const colorActions = optFields.createDiv({ cls: "diary-settings-mood-color-actions" });
				colorActions.appendChild(colorInput);
				const resetColorButton = colorActions.createEl("button", {
					cls: "diary-settings-mood-icon-button",
					attr: {
						type: "button",
						title: t("settings.custom-mood.color-reset-tooltip", lang),
						"aria-label": t("settings.custom-mood.color-reset-tooltip", lang),
					},
				});
				setIcon(resetColorButton, "rotate-ccw");
				const randomColorButton = colorActions.createEl("button", {
					cls: "diary-settings-mood-icon-button",
					attr: {
						type: "button",
						title: t("settings.custom-mood.color-random-tooltip", lang),
						"aria-label": t("settings.custom-mood.color-random-tooltip", lang),
					},
				});
				setIcon(randomColorButton, "shuffle");

				const updateOptPreview = (): void => {
					iconPreview.empty();
					iconPreview.style.color = opt.color || "";
					if (iconInput.value.trim()) {
						setIcon(iconPreview, iconInput.value.trim());
					}
				};
				const saveOptionColor = async (color?: string): Promise<void> => {
					if (color) {
						this.plugin.settings.customFrontmatterPickers[index]!.options[optIndex]!.color = color;
						colorInput.value = /^#[0-9a-fA-F]{6}$/.test(color) ? color : "#9e9e9e";
					} else {
						delete this.plugin.settings.customFrontmatterPickers[index]!.options[optIndex]!.color;
						colorInput.value = "#9e9e9e";
					}
					updateOptPreview();
					await this.plugin.saveSettings();
					await this.plugin.refreshAllDiaryViews();
				};

				iconInput.addEventListener("input", () => {
					void (async () => {
						this.plugin.settings.customFrontmatterPickers[index]!.options[optIndex]!.icon = iconInput.value.trim();
						updateOptPreview();
						await this.plugin.saveSettings();
						await this.plugin.refreshAllDiaryViews();
					})();
				});
				new IconSuggest(this.app, iconInput).onSelect((iconId) => {
					iconInput.value = iconId;
					this.plugin.settings.customFrontmatterPickers[index]!.options[optIndex]!.icon = iconId;
					updateOptPreview();
					void (async () => {
						await this.plugin.saveSettings();
						await this.plugin.refreshAllDiaryViews();
					})();
				});
				nameInput.addEventListener("input", () => {
					void (async () => {
						this.plugin.settings.customFrontmatterPickers[index]!.options[optIndex]!.name = nameInput.value.trim();
						await this.plugin.saveSettings();
						await this.plugin.refreshAllDiaryViews();
					})();
				});
				colorInput.addEventListener("input", () => {
					void (async () => {
						await saveOptionColor(colorInput.value.trim());
					})();
				});
				resetColorButton.addEventListener("click", () => {
					void (async () => {
						await saveOptionColor();
					})();
				});
				randomColorButton.addEventListener("click", () => {
					void (async () => {
						await saveOptionColor(randomHexColor());
					})();
				});

				optSetting.addExtraButton((extraBtn) => {
					extraBtn
						.setIcon("trash-2")
						.setTooltip(t("settings.custom-picker.remove-tooltip", lang))
						.onClick(async () => {
							this.plugin.settings.customFrontmatterPickers[index]!.options.splice(optIndex, 1);
							await this.plugin.saveSettings();
							this.display();
							await this.plugin.refreshAllDiaryViews();
						});
				});
			}

			optionsWrap.createEl("button", {
				cls: "diary-settings-picker-option-add",
				attr: {
					type: "button",
				},
				text: t("settings.custom-picker.add-option", lang),
		}).addEventListener("click", () => void (async () => {
			this.plugin.settings.customFrontmatterPickers[index]!.options.push({ name: "", icon: "" });
			await this.plugin.saveSettings();
			this.display();
		})());
		}
	}
}
