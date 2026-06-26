import { App, PluginSettingTab, Setting, setIcon, moment } from "obsidian";
import type DiaryViewPlugin from "./main";
import type { MoodIconItem } from "./diary/mood";
import { t, LANGUAGES, type Language } from "./i18n";

export interface CustomFrontmatterOption {
	name: string;
	icon: string;
	color?: string;
}

export interface CustomFrontmatterPicker {
	key: string;
	label: string;
	options: CustomFrontmatterOption[];
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
	dailyWeatherFrontmatterKey: string;
	dailyImageFrontmatterKey: string;
	dailyNoteHeading: string;
	language: Language;
	startOfWeek: number;
	weekendDays: number[];
	useFirstImageAsArtwork: boolean;
	moodFrontmatterKey: string;
	customMoodIcons: MoodIconItem[];
	customFrontmatterPickers: CustomFrontmatterPicker[];
}

export const DEFAULT_SETTINGS: DiaryViewSettings = {
	dailyQuoteApiUrl: "",
	dailyQuoteFrontmatterKey: "daily-quote",
	dailyWeatherFrontmatterKey: "daily-weather",
	dailyImageFrontmatterKey: "daily-image",
	dailyNoteHeading: "",
	language: detectLanguage(),
	startOfWeek: 1,
	weekendDays: [0, 6],
	useFirstImageAsArtwork: false,
	moodFrontmatterKey: "daily-mood",
	customMoodIcons: [],
	customFrontmatterPickers: [],
};

export class DiaryViewSettingTab extends PluginSettingTab {
	plugin: DiaryViewPlugin;

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

		// ── Language ──
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

		// ── Daily note heading ──
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

		// ── Quote frontmatter key ──
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

		// ── Daily quote API ──
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

		// ── Weather frontmatter key ──
		new Setting(containerEl)
			.setName(t("settings.weather-key.name", lang))
			.setDesc(t("settings.weather-key.desc", lang))
			.addText((text) => {
				text
					.setPlaceholder(t("settings.weather-key.placeholder", lang))
					.setValue(this.plugin.settings.dailyWeatherFrontmatterKey)
					.onChange(async (value) => {
						const nextValue = value.trim() || DEFAULT_SETTINGS.dailyWeatherFrontmatterKey;
						this.plugin.settings.dailyWeatherFrontmatterKey = nextValue;
						await this.plugin.saveSettings();
						await this.plugin.refreshAllDiaryViews();
					});
			});
			
		// ── Mood frontmatter key ──
		new Setting(containerEl)
			.setName(t("settings.mood-key.name", lang))
			.setDesc(t("settings.mood-key.desc", lang))
			.addText((text) => {
				text
					.setPlaceholder(t("settings.mood-key.placeholder", lang))
					.setValue(this.plugin.settings.moodFrontmatterKey)
					.onChange(async (value) => {
						const nextValue = value.trim() || DEFAULT_SETTINGS.moodFrontmatterKey;
						this.plugin.settings.moodFrontmatterKey = nextValue;
						await this.plugin.saveSettings();
						await this.plugin.refreshAllDiaryViews();
					});
			});

		// ── Image frontmatter key ──
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

		// ── Use first image as artwork ──
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

		// ── Custom mood icons heading ──
		containerEl.createDiv({ cls: "diary-settings-mood-heading", text: t("settings.custom-mood.heading", lang) });
		containerEl.createDiv({
			cls: "diary-settings-mood-desc",
			text: t("settings.custom-mood.desc", lang),
		});

		this.renderCustomMoodIcons(containerEl);

		new Setting(containerEl)
			.setName(t("settings.custom-mood.add-btn", lang))
			.addButton((btn) => {
				btn
					.setButtonText(t("settings.custom-mood.add-btn", lang))
					.setClass("diary-settings-mood-add-btn")
					.onClick(async () => {
						this.plugin.settings.customMoodIcons.push({ name: "", description: "" });
						await this.plugin.saveSettings();
						this.display();
					});
			});

		// ── Custom frontmatter pickers ──
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
							key: "",
							label: "",
							options: [],
						});
						await this.plugin.saveSettings();
						this.display();
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

			const headerEl = cardEl.createDiv({ cls: "diary-settings-picker-card-header" });
			const fieldsEl = headerEl.createDiv({ cls: "diary-settings-picker-card-fields" });
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

			headerEl.createEl("button", {
				cls: "diary-settings-picker-card-remove",
				attr: {
					type: "button",
					"aria-label": t("settings.custom-picker.remove-tooltip", lang),
					title: t("settings.custom-picker.remove-tooltip", lang),
				},
			}, (btnEl) => {
				setIcon(btnEl, "trash-2");
				btnEl.addEventListener("click", async () => {
					this.plugin.settings.customFrontmatterPickers.splice(index, 1);
					await this.plugin.saveSettings();
					this.display();
					await this.plugin.refreshAllDiaryViews();
				});
			});

			const optionsWrap = cardEl.createDiv({ cls: "diary-settings-picker-options" });
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
				colorInput.setCssProps({
					height: "28px",
					width: "40px",
					padding: "0",
					border: "none",
					cursor: "pointer",
				});

				const updateOptPreview = (): void => {
					iconPreview.empty();
					iconPreview.style.color = opt.color || "";
					if (iconInput.value.trim()) {
						setIcon(iconPreview, iconInput.value.trim());
					}
				};

				iconInput.addEventListener("input", () => {
					void (async () => {
						this.plugin.settings.customFrontmatterPickers[index]!.options[optIndex]!.icon = iconInput.value.trim();
						updateOptPreview();
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
						this.plugin.settings.customFrontmatterPickers[index]!.options[optIndex]!.color = colorInput.value.trim();
						updateOptPreview();
						await this.plugin.saveSettings();
						await this.plugin.refreshAllDiaryViews();
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
			}).addEventListener("click", async () => {
				this.plugin.settings.customFrontmatterPickers[index]!.options.push({ name: "", icon: "" });
				await this.plugin.saveSettings();
				this.display();
			});
		}
	}

	private renderCustomMoodIcons(containerEl: HTMLElement): void {
		const lang = this.lang();
		const icons = this.plugin.settings.customMoodIcons;
		for (let i = 0; i < icons.length; i++) {
			const index = i;
			const icon = icons[index]!;
			const setting = new Setting(containerEl)
				.setClass("diary-settings-mood-item");

			const iconPreview = setting.controlEl.createDiv({ cls: "diary-settings-mood-preview" });
			if (icon.color) {
				iconPreview.style.color = icon.color;
			}
			if (icon.name) {
				setIcon(iconPreview, icon.name);
			}

			const fieldsEl = setting.controlEl.createDiv({ cls: "diary-settings-mood-fields" });
			const nameInput = fieldsEl.createEl("input", {
				cls: "diary-settings-mood-input",
				attr: {
					type: "text",
					placeholder: t("settings.custom-mood.name-placeholder", lang),
					value: icon.name,
				},
			});
			const descInput = fieldsEl.createEl("input", {
				cls: "diary-settings-mood-input",
				attr: {
					type: "text",
					placeholder: t("settings.custom-mood.desc-placeholder", lang),
					value: icon.description,
				},
			});
			const colorInput = fieldsEl.createEl("input", {
				cls: "diary-settings-mood-color",
				attr: {
					type: "color",
					title: t("settings.custom-mood.color-tooltip", lang),
				},
			});
			colorInput.value = (icon.color && /^#[0-9a-fA-F]{6}$/.test(icon.color)) ? icon.color : "#9e9e9e";
			colorInput.setCssProps({
				height: "28px",
				width: "40px",
				padding: "0",
				border: "none",
				cursor: "pointer",
			});

			const updatePreview = (): void => {
				iconPreview.empty();
				iconPreview.style.color = icon.color || "";
				if (nameInput.value.trim()) {
					setIcon(iconPreview, nameInput.value.trim());
				}
			};

			nameInput.addEventListener("input", () => {
				void (async () => {
					this.plugin.settings.customMoodIcons[index]!.name = nameInput.value.trim();
					updatePreview();
					await this.plugin.saveSettings();
					await this.plugin.refreshAllDiaryViews();
				})();
			});

			descInput.addEventListener("input", () => {
				void (async () => {
					this.plugin.settings.customMoodIcons[index]!.description = descInput.value.trim();
					await this.plugin.saveSettings();
					await this.plugin.refreshAllDiaryViews();
				})();
			});

			colorInput.addEventListener("input", () => {
				void (async () => {
					this.plugin.settings.customMoodIcons[index]!.color = colorInput.value.trim();
					updatePreview();
					await this.plugin.saveSettings();
					await this.plugin.refreshAllDiaryViews();
				})();
			});

			setting.addExtraButton((extraBtn) => {
				extraBtn
					.setIcon("trash-2")
					.setTooltip(t("settings.custom-mood.remove-tooltip", lang))
					.onClick(async () => {
						this.plugin.settings.customMoodIcons.splice(index, 1);
						await this.plugin.saveSettings();
						this.display();
						await this.plugin.refreshAllDiaryViews();
					});
			});
		}
	}
}
