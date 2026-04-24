import { App, PluginSettingTab, Setting } from "obsidian";
import type DiaryViewPlugin from "./main";

export interface DiaryViewSettings {
	dailyQuoteApiUrl: string;
	dailyImageFrontmatterKey: string;
	dailyNoteHeading: string;
}

export const DEFAULT_SETTINGS: DiaryViewSettings = {
	dailyQuoteApiUrl: "",
	dailyImageFrontmatterKey: "daily-image",
	dailyNoteHeading: "",
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
			.setDesc("Optional. The diary view requests this URL once per daily note, then caches the quote in frontmatter as daily-quote.")
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
			.setName("Daily note heading")
			.setDesc("Optional. When set, the diary view reads and writes only the content under this Markdown heading.")
			.addText((text) => {
				text
					.setPlaceholder("Diary")
					.setValue(this.plugin.settings.dailyNoteHeading)
					.onChange(async (value) => {
						this.plugin.settings.dailyNoteHeading = value.trim();
						await this.plugin.saveSettings();
						await this.plugin.refreshAllDiaryViews();
					});
			});
	}
}
