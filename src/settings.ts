import { App, PluginSettingTab, Setting, setIcon } from "obsidian";
import type DiaryViewPlugin from "./main";
import type { MoodIconItem } from "./diary/mood";

export interface DiaryViewSettings {
	dailyQuoteApiUrl: string;
	dailyQuoteFrontmatterKey: string;
	dailyWeatherFrontmatterKey: string;
	dailyImageFrontmatterKey: string;
	dailyNoteHeading: string;
	weatherLanguage: "en" | "zh";
	useFirstImageAsArtwork: boolean;
	moodFrontmatterKey: string;
	moodLanguage: "en" | "zh";
	customMoodIcons: MoodIconItem[];
}

export const DEFAULT_SETTINGS: DiaryViewSettings = {
	dailyQuoteApiUrl: "",
	dailyQuoteFrontmatterKey: "daily-quote",
	dailyWeatherFrontmatterKey: "daily-weather",
	dailyImageFrontmatterKey: "daily-image",
	dailyNoteHeading: "",
	weatherLanguage: "en",
	useFirstImageAsArtwork: false,
	moodFrontmatterKey: "daily-mood",
	moodLanguage: "en",
	customMoodIcons: [],
};

export class DiaryViewSettingTab extends PluginSettingTab {
	plugin: DiaryViewPlugin;

	constructor(app: App, plugin: DiaryViewPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;

		containerEl.empty();

		new Setting(containerEl)
			.setName("Daily note heading")
			.setDesc("Optional. Enter one or more Markdown headings. The diary view uses the first matching heading, and creates the first one when none exist.")
			.addTextArea((text) => {
				text.inputEl.rows = 3;
				text
					.setPlaceholder("Diary\nJournal\nDaily note")
					.setValue(this.plugin.settings.dailyNoteHeading)
					.onChange(async (value) => {
						this.plugin.settings.dailyNoteHeading = value.trim();
						await this.plugin.saveSettings();
						await this.plugin.refreshAllDiaryViews();
					});
			});

		new Setting(containerEl)
			.setName("Quote frontmatter key")
			.setDesc("Frontmatter property used to read and save the daily quote.")
			.addText((text) => {
				text
					.setPlaceholder("daily-quote")
					.setValue(this.plugin.settings.dailyQuoteFrontmatterKey)
					.onChange(async (value) => {
						const nextValue = value.trim() || DEFAULT_SETTINGS.dailyQuoteFrontmatterKey;
						this.plugin.settings.dailyQuoteFrontmatterKey = nextValue;
						await this.plugin.saveSettings();
						await this.plugin.refreshAllDiaryViews();
					});
			});

		new Setting(containerEl)
			.setName("Daily quote API")
			.setDesc("Optional. The diary view requests this URL once per daily note, then caches the quote in frontmatter.")
			.addText((text) => {
				text.inputEl.type = "url";
				text
					.setPlaceholder("https://example.com/daily-quote")
					.setValue(this.plugin.settings.dailyQuoteApiUrl)
					.onChange(async (value) => {
						this.plugin.settings.dailyQuoteApiUrl = value.trim();
						await this.plugin.saveSettings();
					});
			});

		new Setting(containerEl)
			.setName("Weather frontmatter key")
			.setDesc("Frontmatter property used to read the daily weather icon.")
			.addText((text) => {
				text
					.setPlaceholder("daily-weather")
					.setValue(this.plugin.settings.dailyWeatherFrontmatterKey)
					.onChange(async (value) => {
						const nextValue = value.trim() || DEFAULT_SETTINGS.dailyWeatherFrontmatterKey;
						this.plugin.settings.dailyWeatherFrontmatterKey = nextValue;
						await this.plugin.saveSettings();
						await this.plugin.refreshAllDiaryViews();
					});
			});

		new Setting(containerEl)
			.setName("Weather language")
			.setDesc("Display language for the weather picker menu.")
			.addDropdown((dropdown) => {
				dropdown
					.addOption("en", "English")
					.addOption("zh", "中文")
					.setValue(this.plugin.settings.weatherLanguage)
					.onChange(async (value) => {
						this.plugin.settings.weatherLanguage = value as "en" | "zh";
						await this.plugin.saveSettings();
						await this.plugin.refreshAllDiaryViews();
					});
			});

		new Setting(containerEl)
			.setName("Image frontmatter key")
			.setDesc("Frontmatter property used to read the diary image URL or path.")
			.addText((text) => {
				text
					.setPlaceholder("daily-image")
					.setValue(this.plugin.settings.dailyImageFrontmatterKey)
					.onChange(async (value) => {
						const nextValue = value.trim() || DEFAULT_SETTINGS.dailyImageFrontmatterKey;
						this.plugin.settings.dailyImageFrontmatterKey = nextValue;
						await this.plugin.saveSettings();
					});
			});

		new Setting(containerEl)
			.setName("Use first image as artwork")
			.setDesc("When enabled and no image frontmatter is set, the first image in the daily note is used as the diary artwork. When disabled, the default illustration is shown.")
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
			.setName("Mood frontmatter key")
			.setDesc("Frontmatter property used to read and save the daily mood icon.")
			.addText((text) => {
				text
					.setPlaceholder("daily-mood")
					.setValue(this.plugin.settings.moodFrontmatterKey)
					.onChange(async (value) => {
						const nextValue = value.trim() || DEFAULT_SETTINGS.moodFrontmatterKey;
						this.plugin.settings.moodFrontmatterKey = nextValue;
						await this.plugin.saveSettings();
						await this.plugin.refreshAllDiaryViews();
					});
			});

		new Setting(containerEl)
			.setName("Mood language")
			.setDesc("Display language for built-in mood descriptions.")
			.addDropdown((dropdown) => {
				dropdown
					.addOption("en", "English")
					.addOption("zh", "中文")
					.setValue(this.plugin.settings.moodLanguage)
					.onChange(async (value) => {
						this.plugin.settings.moodLanguage = value as "en" | "zh";
						await this.plugin.saveSettings();
						await this.plugin.refreshAllDiaryViews();
					});
			});

		containerEl.createDiv({ cls: "diary-settings-mood-heading", text: "Custom mood icons" });
		containerEl.createDiv({
			cls: "diary-settings-mood-desc",
			text: "Add custom Lucide icon names and descriptions. Icons appear alongside the built-in mood icons in the diary view.",
		});

		this.renderCustomMoodIcons(containerEl);

		new Setting(containerEl)
			.setName("Add mood icon")
			.addButton((btn) => {
				btn
					.setButtonText("Add icon")
					.setClass("diary-settings-mood-add-btn")
					.onClick(async () => {
						this.plugin.settings.customMoodIcons.push({ name: "", description: "" });
						await this.plugin.saveSettings();
						this.display();
					});
			});
	}

	private renderCustomMoodIcons(containerEl: HTMLElement): void {
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
					placeholder: "Lucide icon name (e.g. smile)",
					value: icon.name,
				},
			});
			const descInput = fieldsEl.createEl("input", {
				cls: "diary-settings-mood-input",
				attr: {
					type: "text",
					placeholder: "Description (e.g. Happy)",
					value: icon.description,
				},
			});
			const colorInput = fieldsEl.createEl("input", {
				cls: "diary-settings-mood-color",
				attr: {
					type: "color",
					title: "Color",
				},
			});
			colorInput.value = (icon.color && /^#[0-9a-fA-F]{6}$/.test(icon.color)) ? icon.color : "#9e9e9e";
			colorInput.style.height = "28px";
			colorInput.style.width = "40px";
			colorInput.style.padding = "0";
			colorInput.style.border = "none";
			colorInput.style.cursor = "pointer";

			const updatePreview = (): void => {
				iconPreview.empty();
				iconPreview.style.color = icon.color || "";
				if (nameInput.value.trim()) {
					setIcon(iconPreview, nameInput.value.trim());
				}
			};

			nameInput.addEventListener("input", async () => {
				this.plugin.settings.customMoodIcons[index]!.name = nameInput.value.trim();
				updatePreview();
				await this.plugin.saveSettings();
				await this.plugin.refreshAllDiaryViews();
			});

			descInput.addEventListener("input", async () => {
				this.plugin.settings.customMoodIcons[index]!.description = descInput.value.trim();
				await this.plugin.saveSettings();
				await this.plugin.refreshAllDiaryViews();
			});

			colorInput.addEventListener("input", async () => {
				this.plugin.settings.customMoodIcons[index]!.color = colorInput.value.trim();
				updatePreview();
				await this.plugin.saveSettings();
				await this.plugin.refreshAllDiaryViews();
			});


			setting.addExtraButton((extraBtn) => {
				extraBtn
					.setIcon("trash-2")
					.setTooltip("Remove")
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
