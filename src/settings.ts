import { App, PluginSettingTab, Setting } from "obsidian";
import type DiaryViewPlugin from "./main";

export interface DiaryViewSettings {
	dailyQuoteApiUrl: string;
}

export const DEFAULT_SETTINGS: DiaryViewSettings = {
	dailyQuoteApiUrl: "",
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
	}
}
