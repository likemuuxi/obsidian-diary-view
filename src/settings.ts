import { App, PluginSettingTab, Setting } from "obsidian";
import type DiaryViewPlugin from "./main";

export interface DiaryViewSettings {
	dailyQuoteApiUrl: string;
	dailyQuoteFrontmatterKey: string;
	dailyWeatherFrontmatterKey: string;
	dailyImageFrontmatterKey: string;
	dailyNoteHeading: string;
	weatherLanguage: "en" | "zh";
	useFirstImageAsArtwork: boolean;
}

export const DEFAULT_SETTINGS: DiaryViewSettings = {
	dailyQuoteApiUrl: "",
	dailyQuoteFrontmatterKey: "daily-quote",
	dailyWeatherFrontmatterKey: "daily-weather",
	dailyImageFrontmatterKey: "daily-image",
	dailyNoteHeading: "",
	weatherLanguage: "en",
	useFirstImageAsArtwork: false,
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
	}
}
