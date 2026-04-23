import { ItemView, MarkdownRenderer, normalizePath, requestUrl, setIcon, TFile, WorkspaceLeaf } from "obsidian";
import type DiaryViewPlugin from "../main";
import {
	DAILY_QUOTE_FRONTMATTER_KEY,
	readArtworkImage,
	readDailyQuote,
	readWeatherIcon,
	splitFrontmatter,
} from "./frontmatter";
import { VIEW_TYPE_DIARY } from "../types";

interface DiaryDateItem {
	id: string;
	label: string | null;
	date: Date;
	path: string;
	day: string;
	month: string;
	dayOfWeek: string;
	year: string;
	fullDay: string;
}

interface DiaryPageContent {
	imageCaption: string;
	artworkImage: string | null;
	promptTitle: string;
	promptText: string;
	promptPlaceholder: string;
	time: string;
	streak: string;
	msg: string;
	filePath: string;
	markdown: string;
	wordCount: number;
	exists: boolean;
	weatherIcon: string;
}

export class DiaryView extends ItemView {
	private plugin: DiaryViewPlugin;
	private dates: DiaryDateItem[] = [];
	private activeDateId = "";
	private previousDateId = "";
	private pendingDateId: string | null = null;
	private direction: "next" | "prev" = "next";
	private isAnimating = false;
	private isMarkdownPreview = true;
	private animationFallbackId: number | null = null;
	private saveTimers = new Map<string, number>();
	private promptSaveTimers = new Map<string, number>();
	private drafts = new Map<string, string>();
	private promptDrafts = new Map<string, string>();
	private renderVersion = 0;
	private pendingQuoteRequests = new Map<string, Promise<string | null>>();

	constructor(leaf: WorkspaceLeaf, plugin: DiaryViewPlugin) {
		super(leaf);
		this.plugin = plugin;
		this.dates = this.buildDateItems();
		this.activeDateId = this.dates[0]?.id ?? this.formatDateId(new Date());
		this.previousDateId = this.activeDateId;
	}

	getViewType(): string {
		return VIEW_TYPE_DIARY;
	}

	getDisplayText(): string {
		return "Diary";
	}

	getIcon(): string {
		return "book-open-text";
	}

	async onOpen(): Promise<void> {
		this.containerEl.addClass("diary-view");
		await this.render();
	}

	async onClose(): Promise<void> {
		if (this.animationFallbackId !== null) {
			window.clearTimeout(this.animationFallbackId);
			this.animationFallbackId = null;
		}
		this.saveTimers.forEach((timerId) => window.clearTimeout(timerId));
		this.saveTimers.clear();
		this.promptSaveTimers.forEach((timerId) => window.clearTimeout(timerId));
		this.promptSaveTimers.clear();
		this.contentEl.empty();
	}

	async refresh(): Promise<void> {
		this.dates = this.buildDateItems();
		if (!this.dates.some((date) => date.id === this.activeDateId)) {
			this.activeDateId = this.dates[0]?.id ?? this.formatDateId(new Date());
			this.previousDateId = this.activeDateId;
			this.pendingDateId = null;
			this.isAnimating = false;
		}
		await this.render();
	}

	private async render(): Promise<void> {
		const renderVersion = ++this.renderVersion;
		const { contentEl } = this;

		const currentDate = this.getDateById(this.activeDateId);
		const previousDate = this.getDateById(this.previousDateId);
		const pendingDate = this.pendingDateId ? this.getDateById(this.pendingDateId) : currentDate;
		const contentById = await this.loadContentByIds([currentDate.id, previousDate.id, pendingDate.id]);
		if (renderVersion !== this.renderVersion) {
			return;
		}

		contentEl.empty();

		const currentContent = contentById.get(currentDate.id) ?? this.createMissingContent(currentDate);
		const previousContent = contentById.get(previousDate.id) ?? this.createMissingContent(previousDate);
		const pendingContent = contentById.get(pendingDate.id) ?? currentContent;
		const incomingDate = this.direction === "next" ? pendingDate : currentDate;
		const incomingContent = this.direction === "next" ? pendingContent : currentContent;
		const outgoingDate = this.direction === "next" ? currentDate : previousDate;
		const outgoingContent = this.direction === "next" ? currentContent : previousContent;
		const calendarDates = this.dates.slice(0, 7);
		const shouldAnimate = this.isAnimating;

		const shellEl = contentEl.createDiv({ cls: "diary-shell" });
		const stageEl = shellEl.createDiv({ cls: "diary-stage" });
		const notebookEl = stageEl.createDiv({ cls: "diary-notebook" });
		notebookEl.createDiv({ cls: "diary-notebook-stitch" });

		const pagesWrapEl = notebookEl.createDiv({ cls: "diary-pages-wrap" });
		pagesWrapEl.createDiv({ cls: "diary-page-stack is-front" });
		pagesWrapEl.createDiv({ cls: "diary-page-stack is-back" });

		const leftBaseEl = pagesWrapEl.createDiv({ cls: "diary-base-page is-left" });
		const leftMobileEl = leftBaseEl.createDiv({ cls: "diary-mobile-only" });
		this.renderLeftPage(leftMobileEl, currentDate, currentContent, calendarDates);

		const leftDesktopEl = leftBaseEl.createDiv({ cls: "diary-desktop-only" });
		this.renderLeftPage(leftDesktopEl, currentDate, currentContent, calendarDates);

		const rightBaseEl = pagesWrapEl.createDiv({ cls: "diary-base-page is-right diary-desktop-only" });
		await this.renderRightPage(rightBaseEl, currentContent);

		if (shouldAnimate) {
			const flipPageEl = pagesWrapEl.createDiv({
				cls: `diary-flip-page diary-desktop-only ${this.direction === "next" ? "is-next" : "is-prev"}`,
			});
			const flipFrontEl = flipPageEl.createDiv({ cls: "diary-flip-face is-front" });
			this.renderLeftPage(
				flipFrontEl,
				this.direction === "next" ? incomingDate : outgoingDate,
				this.direction === "next" ? incomingContent : outgoingContent,
				calendarDates,
			);

			const flipBackEl = flipPageEl.createDiv({ cls: "diary-flip-face is-back" });
			await this.renderRightPage(
				flipBackEl,
				this.direction === "next" ? outgoingContent : incomingContent,
				true,
			);

			const completeAnimation = (): void => {
				if (this.pendingDateId !== null) {
					this.activeDateId = this.pendingDateId;
					this.pendingDateId = null;
				}
				this.previousDateId = this.activeDateId;
				this.isAnimating = false;
				if (this.animationFallbackId !== null) {
					window.clearTimeout(this.animationFallbackId);
					this.animationFallbackId = null;
				}
				void this.render();
			};

			flipPageEl.addEventListener("animationend", completeAnimation, { once: true });
			this.animationFallbackId = window.setTimeout(completeAnimation, 1200);

			window.requestAnimationFrame(() => {
				flipPageEl.addClass("is-animating");
			});
		} else {
			this.isAnimating = false;
		}

		pagesWrapEl.createDiv({ cls: "diary-spine-shadow is-left" });
		pagesWrapEl.createDiv({ cls: "diary-spine-shadow is-right" });
		pagesWrapEl.createDiv({ cls: "diary-spine-crease" });

		["12%", "24%", "36%", "48%", "60%", "72%", "84%"].forEach((top) => {
			this.renderSpineRing(pagesWrapEl, top);
		});
	}

	private renderLeftPage(
		parentEl: HTMLElement,
		dateInfo: DiaryDateItem,
		content: DiaryPageContent,
		calendarDates: DiaryDateItem[],
	): void {
		const pageEl = parentEl.createDiv({ cls: "diary-page diary-page-left" });

		const headerEl = pageEl.createDiv({ cls: "diary-page-header" });
		const dayInfoEl = headerEl.createDiv({ cls: "diary-day-info" });
		const sunEl = dayInfoEl.createDiv({ cls: "diary-day-icon" });
		setIcon(sunEl, content.weatherIcon);
		const dayTextEl = dayInfoEl.createDiv({ cls: "diary-day-text" });
		dayTextEl.createSpan({ cls: "diary-day-name", text: dateInfo.fullDay });
		dayTextEl.createSpan({ cls: "diary-day-date", text: `${dateInfo.month} ${dateInfo.day}, ${dateInfo.year}` });

		const settingsButtonEl = headerEl.createEl("button", {
			cls: "diary-header-button",
			attr: {
				type: "button",
				"aria-label": content.exists ? `Open ${content.filePath}` : `Create and open ${content.filePath}`,
				title: content.exists ? `Open ${content.filePath}` : `Create and open ${content.filePath}`,
			},
		});
		setIcon(settingsButtonEl, content.exists ? "file-check-2" : "file-question");
		settingsButtonEl.addEventListener("click", () => {
			void this.openDailyNote(content.filePath);
		});

		const artworkWrapEl = pageEl.createDiv({ cls: "diary-artwork-wrap" });
		const artworkCardEl = artworkWrapEl.createDiv({ cls: "diary-artwork-card" });
		const artworkEl = artworkCardEl.createDiv({ cls: "diary-artwork" });
		const artworkImageSource = this.resolveArtworkImageSource(content.artworkImage, content.filePath);
		if (artworkImageSource) {
			artworkEl.addClass("has-custom-image");
			artworkEl.createEl("img", {
				cls: "diary-artwork-image",
				attr: {
					src: artworkImageSource,
					alt: content.imageCaption,
					loading: "lazy",
					referrerpolicy: "no-referrer",
				},
			});
		} else {
			const skyEl = artworkEl.createDiv({ cls: "diary-artwork-sky" });
			this.renderCloud(skyEl, "is-main");
			this.renderCloud(skyEl, "is-small");
			const seaEl = artworkEl.createDiv({ cls: "diary-artwork-sea" });
			const boatEl = seaEl.createDiv({ cls: "diary-artwork-boat" });
			boatEl.createDiv({ cls: "diary-artwork-boat-person" });
			boatEl.createDiv({ cls: "diary-artwork-boat-base" });
			artworkEl.createDiv({ cls: "diary-artwork-sand" });
		}
		artworkWrapEl.createSpan({ cls: "diary-artwork-caption", text: content.imageCaption });

		const calendarEl = pageEl.createDiv({ cls: "diary-calendar" });
		calendarDates.forEach((date) => {
			const itemEl = calendarEl.createDiv({
				cls: `diary-calendar-item${date.id === this.activeDateId ? " is-active" : ""}`,
			});
			itemEl.addEventListener("click", () => {
				this.handleDateChange(date.id);
			});
			itemEl.createSpan({ cls: "diary-calendar-dow", text: date.dayOfWeek });
			itemEl.createSpan({ cls: "diary-calendar-number", text: date.day });
		});

		const streakEl = pageEl.createDiv({ cls: "diary-streak" });
		streakEl.createEl("h3", { text: content.streak });
		streakEl.createEl("p", { text: content.msg });
	}

	private async renderRightPage(parentEl: HTMLElement, content: DiaryPageContent, isBackFace = false): Promise<void> {
		const pageEl = parentEl.createDiv({
			cls: `diary-page diary-page-right${isBackFace ? " is-backface" : ""}`,
		});
		const currentMarkdown = this.drafts.get(content.filePath) ?? content.markdown;
		const isPreview = this.isMarkdownPreview && !isBackFace;

		const promptCardEl = pageEl.createDiv({ cls: "diary-prompt-card" });
		const promptMetaEl = promptCardEl.createDiv({ cls: "diary-prompt-meta" });
		const promptLabelEl = promptMetaEl.createDiv({ cls: "diary-prompt-label" });
		const headphoneEl = promptLabelEl.createDiv({ cls: "diary-prompt-label-icon" });
		setIcon(headphoneEl, "notebook-text");
		promptLabelEl.createSpan({ text: content.promptTitle });
		promptMetaEl.createSpan({ cls: "diary-prompt-time", text: content.time });

		const promptTextEl = promptCardEl.createEl("textarea", {
			cls: "diary-prompt-text",
			attr: {
				placeholder: content.promptPlaceholder,
				"aria-label": `Edit daily quote for ${content.filePath}`,
			},
		});
		promptTextEl.value = this.promptDrafts.get(content.filePath) ?? content.promptText;
		promptTextEl.readOnly = isBackFace;
		this.resizePromptTextarea(promptTextEl);
		if (!isBackFace) {
			promptTextEl.addEventListener("input", () => {
				this.promptDrafts.set(content.filePath, promptTextEl.value);
				this.scheduleDailyPromptSave(content.filePath, promptTextEl.value);
				this.resizePromptTextarea(promptTextEl);
			});
		}

		const promptDecorationEl = promptCardEl.createDiv({ cls: "diary-prompt-decoration" });
		promptDecorationEl.createSpan();
		promptDecorationEl.createSpan();
		promptDecorationEl.createSpan();

		const intentionWrapEl = pageEl.createDiv({ cls: "diary-intention-wrap" });
		const intentionHeadEl = intentionWrapEl.createDiv({ cls: "diary-intention-head" });
		const intentionLabelEl = intentionHeadEl.createDiv({ cls: "diary-intention-label" });
		const quillEl = intentionLabelEl.createDiv({ cls: "diary-intention-icon" });
		setIcon(quillEl, content.exists ? "notebook-tabs" : "file-plus-2");
		intentionLabelEl.createDiv({
			cls: "diary-intention-title",
			text: content.exists ? "Daily note content" : "No daily note exists for this date yet.",
		});
		const previewButtonEl = this.renderPromptAction(
			intentionHeadEl,
			isPreview ? "pencil" : "eye",
			isPreview ? "Switch to editing" : "Preview Markdown",
		);
		previewButtonEl.addClass("diary-preview-toggle", "is-toggle");
		previewButtonEl.toggleClass("is-active", isPreview);
		if (!isBackFace) {
			previewButtonEl.addEventListener("click", () => {
				this.isMarkdownPreview = !this.isMarkdownPreview;
				void this.render();
			});
		} else {
			previewButtonEl.disabled = true;
		}

		const linedPaperEl = intentionWrapEl.createDiv({ cls: "diary-lined-paper" });
		let footerCountEl: HTMLElement;
		if (isPreview) {
			const previewEl = linedPaperEl.createDiv({ cls: "diary-markdown-preview markdown-rendered" });
			if (currentMarkdown.trim()) {
				await MarkdownRenderer.render(this.app, currentMarkdown, previewEl, content.filePath, this);
				this.bindMarkdownLinks(previewEl, content.filePath);
			} else {
				previewEl.createDiv({ cls: "diary-note-empty", text: "There is no content to preview yet." });
			}
		} else {
			const textareaEl = linedPaperEl.createEl("textarea", {
				cls: "diary-intention-textarea",
				attr: {
					placeholder: "Write this daily note...",
					"aria-label": `Edit daily note ${content.filePath}`,
				},
			});
			textareaEl.value = currentMarkdown;
			textareaEl.readOnly = isBackFace;
			if (!isBackFace) {
				textareaEl.addEventListener("input", () => {
					this.drafts.set(content.filePath, textareaEl.value);
					this.scheduleDailyNoteSave(content.filePath, textareaEl.value);
					this.updateFooterWordCount(footerCountEl, textareaEl.value);
				});
			}
		}

		const footerEl = pageEl.createDiv({ cls: "diary-page-footer" });
		const footerLabelEl = footerEl.createDiv({ cls: "diary-page-footer-label" });
		const targetEl = footerLabelEl.createDiv({ cls: "diary-page-footer-icon" });
		setIcon(targetEl, "folder-open");
		footerLabelEl.createSpan({ text: content.filePath });
		footerCountEl = footerEl.createSpan({
			cls: "diary-page-footer-count",
			text: this.formatWordCount(this.countWords(currentMarkdown)),
		});
	}

	private renderPromptAction(parentEl: HTMLElement, icon: string, label: string): HTMLButtonElement {
		const buttonEl = parentEl.createEl("button", {
			cls: "diary-prompt-action",
			attr: { type: "button", "aria-label": label, title: label },
		});
		setIcon(buttonEl, icon);
		return buttonEl;
	}

	private renderCloud(parentEl: HTMLElement, variant: string): void {
		const cloudEl = parentEl.createDiv({ cls: `diary-artwork-cloud ${variant}` });
		cloudEl.createDiv({ cls: "diary-artwork-cloud-part is-left" });
		cloudEl.createDiv({ cls: "diary-artwork-cloud-part is-center" });
		cloudEl.createDiv({ cls: "diary-artwork-cloud-part is-right" });
	}

	private resolveArtworkImageSource(value: string | null, sourcePath: string): string | null {
		if (!value) {
			return null;
		}

		const trimmedValue = value.trim();
		if (!trimmedValue) {
			return null;
		}

		if (/^(?:https?:|data:|app:|obsidian:)/i.test(trimmedValue)) {
			return trimmedValue;
		}

		const linkPath = this.extractEmbeddedLinkPath(trimmedValue);
		const linkedFile = this.app.metadataCache.getFirstLinkpathDest(linkPath, sourcePath);
		if (linkedFile instanceof TFile) {
			return this.app.vault.getResourcePath(linkedFile);
		}

		const directPath = normalizePath(linkPath);
		const directFile = this.app.vault.getAbstractFileByPath(directPath);
		if (directFile instanceof TFile) {
			return this.app.vault.getResourcePath(directFile);
		}

		return trimmedValue;
	}

	private extractEmbeddedLinkPath(value: string): string {
		const embeddedMatch = value.match(/^!?\[\[([^\]]+)]]$/);
		if (!embeddedMatch) {
			return value;
		}

		const [, embeddedPath = value] = embeddedMatch;
		const withoutAlias = embeddedPath.split("|")[0] ?? embeddedPath;
		const withoutHeading = withoutAlias.split("#")[0] ?? withoutAlias;
		return withoutHeading.trim();
	}

	private renderSpineRing(parentEl: HTMLElement, top: string): void {
		const ringEl = parentEl.createDiv({ cls: "diary-spine-ring" });
		ringEl.style.top = top;
		ringEl.innerHTML = `
			<svg width="40" height="16" viewBox="0 0 40 16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
				<circle cx="8" cy="8" r="3.5" class="diary-ring-hole" />
				<circle cx="8" cy="8" r="2.5" class="diary-ring-core" />
				<circle cx="32" cy="8" r="3.5" class="diary-ring-hole" />
				<circle cx="32" cy="8" r="2.5" class="diary-ring-core" />
				<path d="M 6 8.5 C 14 1, 26 1, 34 8.5" class="diary-ring-metal diary-ring-metal-main" />
				<path d="M 6 8 C 14 1, 26 1, 34 8" class="diary-ring-metal diary-ring-metal-highlight" />
				<path d="M 6 9 C 14 2, 26 2, 34 9" class="diary-ring-metal diary-ring-metal-shadow" />
			</svg>
		`;
	}

	private handleDateChange(nextDateId: string): void {
		if (this.isAnimating || nextDateId === this.activeDateId) {
			return;
		}

		const currentIndex = this.dates.findIndex((date) => date.id === this.activeDateId);
		const nextIndex = this.dates.findIndex((date) => date.id === nextDateId);
		this.direction = nextIndex > currentIndex ? "next" : "prev";
		this.previousDateId = this.activeDateId;
		if (this.direction === "next") {
			this.pendingDateId = null;
			this.activeDateId = nextDateId;
		} else {
			this.pendingDateId = nextDateId;
		}
		this.isAnimating = true;

		void this.render();
	}

	private async openDailyNote(path: string): Promise<void> {
		let file = this.app.vault.getAbstractFileByPath(path);
		if (!(file instanceof TFile)) {
			await this.ensureParentFolder(path);
			file = await this.app.vault.create(path, "");
			await this.plugin.refreshAllDiaryViews();
		}

		if (file instanceof TFile) {
			await this.plugin.openSourceFile(file.path);
		}
	}

	private getDateById(id: string): DiaryDateItem {
		return this.dates.find((date) => date.id === id) ?? this.dates[0]!;
	}

	private async loadContentByIds(ids: string[]): Promise<Map<string, DiaryPageContent>> {
		const uniqueIds = [...new Set(ids)];
		const entries = await Promise.all(
			uniqueIds.map(async (id) => {
				const date = this.getDateById(id);
				return [id, await this.loadContentForDate(date)] as const;
			}),
		);
		return new Map(entries);
	}

	private async loadContentForDate(date: DiaryDateItem): Promise<DiaryPageContent> {
		const file = this.app.vault.getAbstractFileByPath(date.path);
		if (!(file instanceof TFile)) {
			return this.createMissingContent(date);
		}

		const rawContent = (await this.app.vault.cachedRead(file)).replace(/\r\n/g, "\n");
		const markdown = splitFrontmatter(rawContent).body.trimEnd();
		const wordCount = this.countWords(markdown);
		const frontmatter = this.app.metadataCache.getFileCache(file)?.frontmatter;
		const dailyQuote = readDailyQuote(frontmatter) ?? await this.fetchAndCacheDailyQuote(file);
		return {
			imageCaption: file.basename,
			artworkImage: readArtworkImage(frontmatter),
			promptTitle: "Daily quote",
			promptText: dailyQuote ?? "",
			promptPlaceholder: "Write a sentence for today...",
			time: this.formatTime(new Date(file.stat.mtime)),
			streak: this.formatWordCount(wordCount),
			msg: "Loaded from your Obsidian daily note.",
			filePath: file.path,
			markdown,
			wordCount,
			exists: true,
			weatherIcon: this.resolveWeatherIcon(readWeatherIcon(frontmatter)),
		};
	}

	private createMissingContent(date: DiaryDateItem): DiaryPageContent {
		return {
			imageCaption: "No note yet",
			artworkImage: null,
			promptTitle: "Daily quote",
			promptText: "",
			promptPlaceholder: "Write a sentence to create this daily note...",
			time: date.path,
			streak: this.formatWordCount(0),
			msg: "Create this daily note in Obsidian to fill the page.",
			filePath: date.path,
			markdown: "",
			wordCount: 0,
			exists: false,
			weatherIcon: "sun",
		};
	}

	private async fetchAndCacheDailyQuote(file: TFile): Promise<string | null> {
		const apiUrl = this.plugin.settings.dailyQuoteApiUrl.trim();
		if (!apiUrl) {
			return null;
		}

		const pendingRequest = this.pendingQuoteRequests.get(file.path);
		if (pendingRequest) {
			return pendingRequest;
		}

		const requestPromise = this.requestDailyQuote(apiUrl)
			.then(async (quote) => {
				if (!quote) {
					return null;
				}

				try {
					this.plugin.suppressVaultRefresh(file.path, 1000);
					await this.app.fileManager.processFrontMatter(file, (frontmatter: Record<string, unknown>) => {
						frontmatter[DAILY_QUOTE_FRONTMATTER_KEY] = quote;
					});
				} catch (error) {
					console.warn("Failed to cache daily quote in frontmatter", error);
				}

				return quote;
			})
			.catch((error: unknown) => {
				console.warn("Failed to request daily quote", error);
				return null;
			})
			.finally(() => {
				this.pendingQuoteRequests.delete(file.path);
			});

		this.pendingQuoteRequests.set(file.path, requestPromise);
		return requestPromise;
	}

	private async requestDailyQuote(apiUrl: string): Promise<string | null> {
		const response = await requestUrl({ url: apiUrl, method: "GET", throw: false });
		if (response.status < 200 || response.status >= 300) {
			return null;
		}

		return this.extractQuoteFromResponse(response.text);
	}

	private extractQuoteFromResponse(responseText: string): string | null {
		const trimmedText = responseText.trim();
		if (!trimmedText) {
			return null;
		}

		try {
			return this.extractQuoteFromJson(JSON.parse(trimmedText));
		} catch {
			return this.cleanQuoteText(trimmedText);
		}
	}

	private extractQuoteFromJson(value: unknown): string | null {
		if (typeof value === "string") {
			return this.cleanQuoteText(value);
		}

		if (Array.isArray(value)) {
			for (const item of value) {
				const quote = this.extractQuoteFromJson(item);
				if (quote) {
					return quote;
				}
			}
			return null;
		}

		if (!value || typeof value !== "object") {
			return null;
		}

		const record = value as Record<string, unknown>;
		const preferredKeys = [
			"hitokoto",
			"quote",
			"content",
			"text",
			"sentence",
			"message",
			"data",
		];
		for (const key of preferredKeys) {
			const quote = this.extractQuoteFromJson(record[key]);
			if (quote) {
				return quote;
			}
		}

		return null;
	}

	private cleanQuoteText(value: string): string | null {
		const quote = value.replace(/\s+/g, " ").trim();
		return quote || null;
	}

	private resolveWeatherIcon(value: string | null): string {
		if (!value) {
			return "sun";
		}

		const normalized = value.trim().toLowerCase();
		const weatherIconByValue: Record<string, string> = {
			clear: "sun",
			sun: "sun",
			sunny: "sun",
			晴: "sun",
			cloud: "cloud",
			cloudy: "cloud",
			阴: "cloud",
			多云: "cloud-sun",
			overcast: "cloud",
			fog: "cloud-fog",
			foggy: "cloud-fog",
			雾: "cloud-fog",
			haze: "cloud-fog",
			rain: "cloud-rain",
			rainy: "cloud-rain",
			雨: "cloud-rain",
			小雨: "cloud-drizzle",
			drizzle: "cloud-drizzle",
			大雨: "cloud-rain-wind",
			storm: "cloud-lightning",
			thunder: "cloud-lightning",
			雷雨: "cloud-lightning",
			snow: "cloud-snow",
			snowy: "cloud-snow",
			雪: "cloud-snow",
			wind: "wind",
			windy: "wind",
			风: "wind",
		};

		return weatherIconByValue[normalized] ?? value.trim();
	}

	private buildDateItems(): DiaryDateItem[] {
		const today = new Date();
		today.setHours(0, 0, 0, 0);
		return Array.from({ length: 7 }, (_, index) => {
			const date = new Date(today);
			date.setDate(today.getDate() - index);
			return {
				id: this.formatDateId(date),
				label: index === 0 ? "Today" : index === 1 ? "Yesterday" : this.formatDatePart(date, "shortWeekday"),
				date,
				path: this.getDailyNotePath(date),
				day: this.formatDatePart(date, "day"),
				month: this.formatDatePart(date, "shortMonth"),
				dayOfWeek: this.formatDatePart(date, "shortWeekday"),
				year: this.formatDatePart(date, "year"),
				fullDay: this.formatDatePart(date, "longWeekday"),
			};
		});
	}

	private getDailyNotePath(date: Date): string {
		const folder = this.plugin.getDailyNotesFolder();
		const format = this.plugin.dailyNotesConfig?.format ?? "YYYY-MM-DD";
		const fileName = this.formatDateByPattern(date, format);
		return normalizePath(folder ? `${folder}/${fileName}.md` : `${fileName}.md`);
	}

	private formatDateByPattern(date: Date, pattern: string): string {
		const year = String(date.getFullYear());
		const month = String(date.getMonth() + 1).padStart(2, "0");
		const day = String(date.getDate()).padStart(2, "0");
		return (pattern || "YYYY-MM-DD")
			.replace(/YYYY/g, year)
			.replace(/MM/g, month)
			.replace(/DD/g, day);
	}

	private formatDateId(date: Date): string {
		return this.formatDateByPattern(date, "YYYY-MM-DD");
	}

	private formatDatePart(date: Date, part: "day" | "shortMonth" | "shortWeekday" | "longWeekday" | "year"): string {
		if (part === "day") {
			return String(date.getDate()).padStart(2, "0");
		}
		if (part === "year") {
			return String(date.getFullYear());
		}
		if (part === "shortMonth") {
			return date.toLocaleDateString(undefined, { month: "short" });
		}
		return date.toLocaleDateString(undefined, { weekday: part === "shortWeekday" ? "short" : "long" });
	}

	private formatTime(date: Date): string {
		return date.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
	}

	private countWords(markdown: string): number {
		const normalized = markdown
			.replace(/```[\s\S]*?```/g, " ")
			.replace(/`[^`]*`/g, " ")
			.replace(/!\[[^\]]*]\([^)]*\)/g, " ")
			.replace(/\[[^\]]+]\([^)]*\)/g, (match) => match.replace(/^\[|\]\([^)]*\)$/g, " "))
			.replace(/\[\[([^\]|]+)(?:\|([^\]]+))?]]/g, "$2 $1")
			.replace(/https?:\/\/\S+/g, " ")
			.replace(/[#>*_[\]()`~!|:-]/g, " ")
			.trim();
		if (!normalized) {
			return 0;
		}

		const cjkMatches = normalized.match(/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/gu) ?? [];
		const latinWordMatches = normalized
			.replace(/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/gu, " ")
			.match(/[\p{L}\p{N}]+(?:['’.-][\p{L}\p{N}]+)*/gu) ?? [];
		return cjkMatches.length + latinWordMatches.length;
	}

	private formatWordCount(count: number): string {
		return `${count} chars`;
	}

	private createPreviewText(markdown: string): string {
		const firstLine = markdown
			.split("\n")
			.map((line) => line.replace(/^#+\s*/, "").trim())
			.find(Boolean);
		return firstLine ?? "Daily note is empty.";
	}

	private scheduleDailyNoteSave(path: string, markdown: string): void {
		const existingTimer = this.saveTimers.get(path);
		if (existingTimer !== undefined) {
			window.clearTimeout(existingTimer);
		}

		const timerId = window.setTimeout(() => {
			this.saveTimers.delete(path);
			void this.saveDailyNote(path, markdown);
		}, 500);
		this.saveTimers.set(path, timerId);
	}

	private scheduleDailyPromptSave(path: string, promptText: string): void {
		const existingTimer = this.promptSaveTimers.get(path);
		if (existingTimer !== undefined) {
			window.clearTimeout(existingTimer);
		}

		const timerId = window.setTimeout(() => {
			this.promptSaveTimers.delete(path);
			void this.saveDailyPrompt(path, promptText);
		}, 500);
		this.promptSaveTimers.set(path, timerId);
	}

	private async saveDailyPrompt(path: string, promptText: string): Promise<void> {
		let file = this.app.vault.getAbstractFileByPath(path);
		const shouldRefreshAfterSave = !(file instanceof TFile);
		if (!(file instanceof TFile)) {
			await this.ensureParentFolder(path);
			this.plugin.suppressVaultRefresh(path, 1000);
			file = await this.app.vault.create(path, "");
		}

		if (!(file instanceof TFile)) {
			return;
		}

		const normalizedPromptText = promptText.trim();
		try {
			this.plugin.suppressVaultRefresh(path, 1000);
			await this.app.fileManager.processFrontMatter(file, (frontmatter: Record<string, unknown>) => {
				frontmatter[DAILY_QUOTE_FRONTMATTER_KEY] = normalizedPromptText;
			});
			this.promptDrafts.set(path, normalizedPromptText);
			if (shouldRefreshAfterSave) {
				await this.plugin.refreshAllDiaryViews();
			}
		} catch (error) {
			console.warn("Failed to save daily prompt in frontmatter", error);
		}
	}

	private async saveDailyNote(path: string, markdown: string): Promise<void> {
		const normalizedMarkdown = markdown.replace(/\r\n/g, "\n").trimEnd();
		const file = this.app.vault.getAbstractFileByPath(path);
		if (file instanceof TFile) {
			const rawContent = (await this.app.vault.cachedRead(file)).replace(/\r\n/g, "\n");
			const { frontmatter } = splitFrontmatter(rawContent);
			const nextContent = frontmatter
				? normalizedMarkdown
					? `${frontmatter}\n\n${normalizedMarkdown}`
					: frontmatter
				: normalizedMarkdown;
			this.plugin.suppressVaultRefresh(path);
			await this.app.vault.modify(file, nextContent);
		} else {
			await this.ensureParentFolder(path);
			this.plugin.suppressVaultRefresh(path);
			await this.app.vault.create(path, normalizedMarkdown);
		}

		await this.plugin.refreshAllDiaryViews();
	}

	private async ensureParentFolder(path: string): Promise<void> {
		const parts = path.split("/");
		parts.pop();
		let currentPath = "";
		for (const part of parts) {
			currentPath = currentPath ? `${currentPath}/${part}` : part;
			if (!currentPath || this.app.vault.getAbstractFileByPath(currentPath)) {
				continue;
			}
			await this.app.vault.createFolder(currentPath).catch(() => undefined);
		}
	}

	private updateFooterWordCount(parentEl: HTMLElement, markdown: string): void {
		parentEl.setText(this.formatWordCount(this.countWords(markdown)));
	}

	private resizePromptTextarea(textareaEl: HTMLTextAreaElement): void {
		textareaEl.style.height = "auto";
		textareaEl.style.height = `${textareaEl.scrollHeight}px`;
	}

	private bindMarkdownLinks(parentEl: HTMLElement, sourcePath: string): void {
		parentEl.addEventListener("click", (event) => {
			const target = event.target as HTMLElement | null;
			const linkEl = target?.closest("a.internal-link");
			if (!(linkEl instanceof HTMLAnchorElement)) {
				return;
			}

			event.preventDefault();
			event.stopPropagation();
			void this.app.workspace.openLinkText(
				linkEl.getAttribute("data-href") ?? linkEl.getAttribute("href") ?? "",
				sourcePath,
				false,
			);
		});
	}
}
