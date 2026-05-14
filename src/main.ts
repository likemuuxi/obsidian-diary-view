import { MarkdownView, Notice, Plugin, TFile, WorkspaceLeaf, normalizePath } from "obsidian";
import { DiaryView } from "./diary/DiaryView";
import { DEFAULT_SETTINGS, DiaryViewSettingTab, type DiaryViewSettings } from "./settings";
import { VIEW_TYPE_DIARY, type DailyNotesConfig } from "./types";
import { t } from "./i18n";

const DEFAULT_DAILY_NOTE_FORMAT = "YYYY-MM-DD";

export default class DiaryViewPlugin extends Plugin {
	settings: DiaryViewSettings = { ...DEFAULT_SETTINGS };
	dailyNotesConfig: DailyNotesConfig | null = null;
	private suppressedVaultRefreshUntil = new Map<string, number>();

	async onload(): Promise<void> {
		await this.loadSettings();
		await this.loadDailyNotesConfig();

		this.registerView(
			VIEW_TYPE_DIARY,
			(leaf) => new DiaryView(leaf, this),
		);

		this.addSettingTab(new DiaryViewSettingTab(this.app, this));

		this.addRibbonIcon("notebook-tabs", t("app.ribbon-tooltip", this.settings.language), () => {
			void this.activateDiaryView();
		});

		this.addCommand({
			id: "open",
			name: t("app.command-open", this.settings.language),
			callback: () => {
				void this.activateDiaryView();
			},
		});

		this.registerEvent(this.app.vault.on("create", (file) => this.handleVaultChange(file)));
		this.registerEvent(this.app.vault.on("modify", (file) => this.handleVaultChange(file)));
		this.registerEvent(this.app.vault.on("delete", (file) => this.handleVaultChange(file)));
		this.registerEvent(this.app.vault.on("rename", (file) => this.handleVaultChange(file)));
	}

	onunload(): void {
		const diaryLeaves = this.app.workspace.getLeavesOfType(VIEW_TYPE_DIARY);
		for (const leaf of diaryLeaves) {
			void leaf.setViewState({ type: "empty" });
		}
	}

	async activateDiaryView(leaf?: WorkspaceLeaf): Promise<void> {
		const targetLeaf = leaf ?? this.app.workspace.getLeaf(false);
		if (!targetLeaf) {
			new Notice(t("app.no-leaf", this.settings.language));
			return;
		}

		await targetLeaf.setViewState({
			type: VIEW_TYPE_DIARY,
			active: true,
		});
		void this.app.workspace.revealLeaf(targetLeaf);
	}

	async refreshAllDiaryViews(): Promise<void> {
		const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE_DIARY);
		await Promise.all(
			leaves.map(async (leaf) => {
				if (leaf.view instanceof DiaryView) {
					await leaf.view.refresh();
				}
			}),
		);
	}

	async loadSettings(): Promise<void> {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData() as Partial<DiaryViewSettings>);
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
	}

	suppressVaultRefresh(path: string, durationMs = 400): void {
		this.suppressedVaultRefreshUntil.set(path, Date.now() + durationMs);
	}

	async loadDailyNotesConfig(): Promise<void> {
		try {
			const raw = await this.app.vault.adapter.read(this.getDailyNotesConfigPath());
			const parsed = JSON.parse(raw) as Partial<DailyNotesConfig>;
			this.dailyNotesConfig = {
				folder: (parsed.folder ?? "").trim(),
				format: (parsed.format ?? DEFAULT_DAILY_NOTE_FORMAT).trim(),
				template: parsed.template,
			};
		} catch {
			this.dailyNotesConfig = null;
		}
	}

	getDailyNotesFolder(): string {
		return this.dailyNotesConfig?.folder ?? "";
	}

	getDailyNotesDateFormat(): string {
		return this.dailyNotesConfig?.format || DEFAULT_DAILY_NOTE_FORMAT;
	}

	private getDailyNotesConfigPath(): string {
		return normalizePath(`${this.app.vault.configDir}/daily-notes.json`);
	}

	private handleVaultChange(file: unknown): void {
		if (!(file instanceof TFile) || file.extension !== "md") {
			return;
		}

		const suppressedUntil = this.suppressedVaultRefreshUntil.get(file.path);
		if (suppressedUntil && suppressedUntil > Date.now()) {
			this.suppressedVaultRefreshUntil.delete(file.path);
			return;
		}

		if (suppressedUntil) {
			this.suppressedVaultRefreshUntil.delete(file.path);
		}

		void this.refreshAllDiaryViews();
	}

	async openSourceFile(path: string): Promise<void> {
		const file = this.app.vault.getAbstractFileByPath(path);
		if (!(file instanceof TFile)) {
			new Notice(t("app.file-not-found", this.settings.language));
			return;
		}

		const leaf = this.app.workspace.getLeaf(false);
		if (leaf?.view instanceof MarkdownView && leaf.view.file?.path === path) {
			return;
		}

		await leaf.openFile(file);
	}
}
