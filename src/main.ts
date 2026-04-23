import { MarkdownView, Notice, Plugin, TFile, WorkspaceLeaf, normalizePath } from "obsidian";
import { DiaryView } from "./diary/DiaryView";
import { DEFAULT_SETTINGS, DiaryViewSettingTab, type DiaryViewSettings } from "./settings";
import { VIEW_TYPE_DIARY, type DailyNotesConfig } from "./types";

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

		this.addRibbonIcon("book-open-text", "Open diary view", () => {
			void this.activateDiaryView();
		});

		this.addCommand({
			id: "open-diary-view",
			name: "Open diary view",
			callback: () => {
				void this.activateDiaryView();
			},
		});

		this.registerEvent(this.app.vault.on("create", (file) => this.handleVaultChange(file)));
		this.registerEvent(this.app.vault.on("modify", (file) => this.handleVaultChange(file)));
		this.registerEvent(this.app.vault.on("delete", (file) => this.handleVaultChange(file)));
		this.registerEvent(this.app.vault.on("rename", (file) => this.handleVaultChange(file)));
	}

	async onunload(): Promise<void> {
		const diaryLeaves = this.app.workspace.getLeavesOfType(VIEW_TYPE_DIARY);
		for (const leaf of diaryLeaves) {
			await leaf.setViewState({ type: "empty" });
		}
	}

	async activateDiaryView(leaf?: WorkspaceLeaf): Promise<void> {
		const targetLeaf = leaf ?? this.app.workspace.getLeaf(false);
		if (!targetLeaf) {
			new Notice("No workspace leaf available.");
			return;
		}

		await targetLeaf.setViewState({
			type: VIEW_TYPE_DIARY,
			active: true,
		});
		this.app.workspace.revealLeaf(targetLeaf);
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
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
	}

	suppressVaultRefresh(path: string, durationMs = 400): void {
		this.suppressedVaultRefreshUntil.set(path, Date.now() + durationMs);
	}

	async loadDailyNotesConfig(): Promise<void> {
		const configPath = normalizePath(`${this.app.vault.configDir}/daily-notes.json`);
		try {
			const raw = await this.app.vault.adapter.read(configPath);
			const parsed = JSON.parse(raw) as Partial<DailyNotesConfig>;
			this.dailyNotesConfig = {
				folder: (parsed.folder ?? "").trim(),
				format: (parsed.format ?? "YYYY-MM-DD").trim(),
				template: parsed.template,
			};
		} catch (error) {
			this.dailyNotesConfig = null;
			console.error("Failed to read daily-notes config", error);
		}
	}

	getDailyNotesFolder(): string {
		return this.dailyNotesConfig?.folder ?? "";
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
			new Notice("Source file no longer exists.");
			return;
		}

		const leaf = this.app.workspace.getLeaf(false);
		if (leaf?.view instanceof MarkdownView && leaf.view.file?.path === path) {
			return;
		}

		await leaf.openFile(file);
	}
}
