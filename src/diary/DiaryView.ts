import { ItemView, MarkdownRenderer, moment, normalizePath, Notice, requestUrl, setIcon, TFile, TFolder, WorkspaceLeaf } from "obsidian";
import $ from "jquery";
import "turn.js";
import type DiaryViewPlugin from "../main";
import {
	DEFAULT_DAILY_IMAGE_FRONTMATTER_KEY,
	DEFAULT_DAILY_QUOTE_FRONTMATTER_KEY,
	DEFAULT_DAILY_WEATHER_FRONTMATTER_KEY,
	type DiarySection,
	extractFirstImage,
	readAllBodyUnderHeadings,
	readArtworkImage,
	readDailyQuote,
	readFrontmatterString,
	readWeatherIcon,
	splitFrontmatter,
	writeAllBodyUnderHeadings,
} from "./frontmatter";
import { VIEW_TYPE_DIARY } from "../types";
import {
	applyWikilinkSuggestion,
	createBlockId,
	expandEmptyAnchorToCurrentFile,
	getWikilinkSuggestions,
	parseWikilinkContext,
	type WikilinkContext,
	type WikilinkSuggestion,
} from "./wikilink";
import { getAllMoodIcons, type MoodIconItem } from "./mood";

const AUTOSAVE_DELAY_MS = 1500;
const DESKTOP_BREAKPOINT_QUERY = "(min-width: 960px)";
const SWIPE_MIN_DISTANCE_PX = 90;
const TURN_NATIVE_CORNER_SIZE_PX = 120;

interface DiaryDateItem {
	id: string;
	label: string | null;
	date: Date;
	path: string;
	hasNote: boolean;
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
	filePath: string;
	sections: DiarySection[];
	markdown: string;
	wordCount: number;
	exists: boolean;
	weatherIcon: string;
	weatherValue: string | null;
	moodIconName: string | null;
	moodDescription: string | null;
}

type TurnBook = {
	turn: (...args: unknown[]) => unknown;
};

export class DiaryView extends ItemView {
	private plugin: DiaryViewPlugin;
	private dates: DiaryDateItem[] = [];
	private activeDateId = "";
	private isMarkdownPreview = true;
	private saveTimers = new Map<string, number>();
	private promptSaveTimers = new Map<string, number>();
	private drafts = new Map<string, string>();
	private promptDrafts = new Map<string, string>();
	private renderVersion = 0;
	private pendingQuoteRequests = new Map<string, Promise<string | null>>();
	private renderedContentByPath = new Map<string, DiaryPageContent>();
	private datePickerOpen = false;
	private datePickerMonth = new Date().getMonth();
	private datePickerYear = new Date().getFullYear();
	private datePickerCleanup: (() => void) | null = null;
	private weatherPickerOpen = false;
	private weatherPickerCleanup: (() => void) | null = null;
	private moodPickerOpen = false;
	private moodPickerCleanup: (() => void) | null = null;
	private usingTurnBook = false;
	private turnBookEl: HTMLElement | null = null;
	private turnViewportEl: HTMLElement | null = null;
	private turnLeftFillEl: HTMLElement | null = null;
	private turnRightFillEl: HTMLElement | null = null;
	private turnBookReady = false;
	private turnResizeObserver: ResizeObserver | null = null;
	private turnResizeFrame: number | null = null;

	constructor(leaf: WorkspaceLeaf, plugin: DiaryViewPlugin) {
		super(leaf);
		this.plugin = plugin;
		this.dates = this.buildDateItems();
		this.activeDateId = this.formatDateId(new Date());
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
		this.registerDomEvent(window, "resize", () => {
			const shouldUseTurnBook = this.shouldUsePageFlip();
			if (shouldUseTurnBook !== this.usingTurnBook) {
				void this.render();
				return;
			}
			if (shouldUseTurnBook) {
				this.scheduleTurnBookResize();
			}
		});
		this.registerDomEvent(window, "mouseup", () => {
			this.hideTurnDragFills();
		});
		this.registerDomEvent(window, "blur", () => {
			this.hideTurnDragFills();
		});
		await this.render();
	}

	async onClose(): Promise<void> {
		this.closeDatePicker();
		this.closeWeatherPicker();
		this.closeMoodPicker();
		this.turnResizeObserver?.disconnect();
		this.turnResizeObserver = null;
		if (this.turnResizeFrame !== null) {
			window.cancelAnimationFrame(this.turnResizeFrame);
			this.turnResizeFrame = null;
		}
		await this.flushPendingSaves();
		this.contentEl.empty();
	}

	async refresh(): Promise<void> {
		this.dates = this.buildDateItems();
		if (!this.dates.some((date) => date.id === this.activeDateId)) {
			this.activeDateId = this.formatDateId(new Date());
		}
		await this.render();
	}

	private async render(): Promise<void> {
		this.closeDatePicker();
		this.closeWeatherPicker();
		const renderVersion = ++this.renderVersion;
		const useTurnBook = this.shouldUsePageFlip();
		const contentIds = useTurnBook
			? this.dates.map((date) => date.id)
			: [this.getDateById(this.activeDateId).id];
		const contentById = await this.loadContentByIds(contentIds);
		if (renderVersion !== this.renderVersion) {
			return;
		}

		this.renderedContentByPath = new Map(Array.from(contentById.values()).map((content) => [content.filePath, content]));
		this.usingTurnBook = useTurnBook;
		if (useTurnBook) {
			await this.renderDesktopTurnBook(contentById);
		} else {
			this.turnResizeObserver?.disconnect();
			this.turnResizeObserver = null;
			this.turnBookEl = null;
			this.turnViewportEl = null;
			this.turnLeftFillEl = null;
			this.turnRightFillEl = null;
			this.turnBookReady = false;
			await this.renderMobileNotebook(contentById);
		}
	}

	private async renderDesktopTurnBook(contentById: Map<string, DiaryPageContent>): Promise<void> {
		const { contentEl } = this;
		contentEl.empty();

		const shellEl = contentEl.createDiv({ cls: "diary-shell" });
		const stageEl = shellEl.createDiv({ cls: "diary-stage" });
		const notebookEl = stageEl.createDiv({ cls: "diary-notebook" });
		notebookEl.createDiv({ cls: "diary-notebook-stitch" });

		const pagesWrapEl = notebookEl.createDiv({ cls: "diary-pages-wrap is-turn-book" });
		pagesWrapEl.createDiv({ cls: "diary-page-stack is-front" });
		pagesWrapEl.createDiv({ cls: "diary-page-stack is-back" });

		const viewportEl = pagesWrapEl.createDiv({ cls: "diary-turn-viewport" });
		const leftFillEl = viewportEl.createDiv({ cls: "diary-turn-side-fill is-left" });
		const rightFillEl = viewportEl.createDiv({ cls: "diary-turn-side-fill is-right" });
		const turnBookEl = viewportEl.createDiv({ cls: "diary-turn-book" });
		const calendarDates = this.dates.slice(0, 7);

		turnBookEl.createDiv({ cls: "diary-turn-sheet is-placeholder" });
		for (const dateInfo of this.dates) {
			const content = contentById.get(dateInfo.id) ?? this.createMissingContent(dateInfo);
			const leftEl = turnBookEl.createDiv({ cls: "diary-turn-sheet is-left" });
			leftEl.dataset.dateId = dateInfo.id;
			this.renderLeftPage(leftEl, dateInfo, content, calendarDates);
			const rightEl = turnBookEl.createDiv({ cls: "diary-turn-sheet is-right" });
			rightEl.dataset.dateId = dateInfo.id;
			await this.renderRightPage(rightEl, content);
		}

		this.turnBookEl = turnBookEl;
		this.turnViewportEl = viewportEl;
		this.turnLeftFillEl = leftFillEl;
		this.turnRightFillEl = rightFillEl;
		this.turnBookReady = false;
		this.bindTurnDragGuard(viewportEl);
		this.bindMouseSwipeGesture(pagesWrapEl);
		this.ensureTurnBookInitialized();
		this.attachTurnBookResize(viewportEl);
	}

	private async renderMobileNotebook(contentById: Map<string, DiaryPageContent>): Promise<void> {
		const { contentEl } = this;
		contentEl.empty();

		const currentDate = this.getDateById(this.activeDateId);
		const currentContent = contentById.get(currentDate.id) ?? this.createMissingContent(currentDate);
		const calendarDates = this.dates.slice(0, 7);

		const shellEl = contentEl.createDiv({ cls: "diary-shell" });
		const stageEl = shellEl.createDiv({ cls: "diary-stage" });
		const notebookEl = stageEl.createDiv({ cls: "diary-notebook" });
		const pagesWrapEl = notebookEl.createDiv({ cls: "diary-pages-wrap" });

		const leftBaseEl = pagesWrapEl.createDiv({ cls: "diary-base-page is-left" });
		const leftMobileEl = leftBaseEl.createDiv({ cls: "diary-mobile-only" });
		this.renderLeftPage(leftMobileEl, currentDate, currentContent, calendarDates);

		const mobileSpineEl = pagesWrapEl.createDiv({ cls: "diary-mobile-spine" });
		[-92, -46, 0, 46, 92].forEach((offset) => {
			this.renderMobileSpineRing(mobileSpineEl, offset);
		});

		const rightBaseEl = pagesWrapEl.createDiv({ cls: "diary-base-page is-right" });
		await this.renderRightPage(rightBaseEl, currentContent);
	}

	private ensureTurnBookInitialized(): void {
		if (!this.turnBookEl || !this.turnViewportEl || this.turnBookReady) {
			return;
		}

		const turnBook = this.getTurnBook();
		if (!turnBook) {
			this.usingTurnBook = false;
			void this.render();
			return;
		}

		const width = this.turnViewportEl.clientWidth;
		const height = this.turnViewportEl.clientHeight;
		if (!width || !height) {
			this.scheduleTurnBookResize();
			return;
		}

		const activeTurnPage = this.getTurnPageForDate(this.activeDateId) ?? 2;
		turnBook.turn({
			width,
			height,
			display: "double",
			duration: 950,
			gradients: true,
			acceleration: true,
			page: activeTurnPage,
			pages: this.getTotalTurnPages(),
			when: {
				turning: (event: { preventDefault: () => void }, page: number) => {
					if (page < this.getFirstTurnPage()) {
						this.hideTurnDragFills();
						event.preventDefault();
						return;
					}
					// Clear visual active marker during animation
					this.updateCalendarActiveState(null);
				},
				turned: (_event: unknown, page: number) => {
					this.hideTurnDragFills();
					const nextDateId = this.getDateIdForTurnPage(page);
					if (!nextDateId || nextDateId === this.activeDateId) {
						return;
					}
					this.activeDateId = nextDateId;
					this.updateCalendarActiveState();
				},
			},
		});
		this.turnBookReady = true;
		this.updateCalendarActiveState();
	}

	private attachTurnBookResize(viewportEl: HTMLElement): void {
		this.turnResizeObserver?.disconnect();
		this.turnResizeObserver = new ResizeObserver(() => {
			this.scheduleTurnBookResize();
		});
		this.turnResizeObserver.observe(viewportEl);
	}

	private scheduleTurnBookResize(): void {
		if (this.turnResizeFrame !== null) {
			window.cancelAnimationFrame(this.turnResizeFrame);
		}
		this.turnResizeFrame = window.requestAnimationFrame(() => {
			this.turnResizeFrame = null;
			if (!this.turnBookEl || !this.turnViewportEl) {
				return;
			}

			if (!this.turnBookReady) {
				this.ensureTurnBookInitialized();
				return;
			}

			const width = this.turnViewportEl.clientWidth;
			const height = this.turnViewportEl.clientHeight;
			if (!width || !height) {
				return;
			}

			this.getTurnBook()?.turn("size", width, height);
		});
	}

	private bindMouseSwipeGesture(targetEl: HTMLElement): void {
		let pointerId: number | null = null;
		let startX = 0;
		let startY = 0;
		let allowSwipe = false;

		targetEl.addEventListener("pointerdown", (event) => {
			if (event.pointerType === "touch" || event.button !== 0 || this.isInteractiveTarget(event.target)) {
				return;
			}
			pointerId = event.pointerId;
			startX = event.clientX;
			startY = event.clientY;
			allowSwipe = !this.isNearNativeTurnCorner(event);
		});

		targetEl.addEventListener("pointerup", (event) => {
			if (pointerId !== event.pointerId) {
				return;
			}

			const deltaX = event.clientX - startX;
			const deltaY = event.clientY - startY;
			pointerId = null;
			if (!allowSwipe) {
				allowSwipe = false;
				return;
			}
			allowSwipe = false;

			if (Math.abs(deltaX) < SWIPE_MIN_DISTANCE_PX || Math.abs(deltaX) <= Math.abs(deltaY)) {
				return;
			}

			if (deltaX < 0) {
				this.turnToAdjacentDate("next");
			} else {
				this.turnToAdjacentDate("prev");
			}
		});

		targetEl.addEventListener("pointercancel", (event) => {
			if (pointerId === event.pointerId) {
				pointerId = null;
				allowSwipe = false;
			}
		});
	}

	private bindTurnDragGuard(targetEl: HTMLElement): void {
		targetEl.addEventListener("mousedown", (event) => {
			if (this.shouldBlockBoundaryTurn(event)) {
				event.preventDefault();
				event.stopPropagation();
				return;
			}
			if (this.shouldShowTurnDragFills(event)) {
				this.showTurnDragFills();
			}
		}, true);
	}

	private shouldBlockBoundaryTurn(event: MouseEvent): boolean {
		if (!this.turnViewportEl || this.isInteractiveTarget(event.target)) {
			return false;
		}

		const rect = this.turnViewportEl.getBoundingClientRect();
		const localX = event.clientX - rect.left;
		const localY = event.clientY - rect.top;
		const nearLeftEdge = localX <= TURN_NATIVE_CORNER_SIZE_PX;
		const nearTop = localY <= TURN_NATIVE_CORNER_SIZE_PX;
		const nearBottom = localY >= rect.height - TURN_NATIVE_CORNER_SIZE_PX;
		const isLeftCorner = nearLeftEdge && (nearTop || nearBottom);
		if (!isLeftCorner) {
			return false;
		}

		return this.activeDateId === this.dates[0]?.id;
	}

	private shouldShowTurnDragFills(event: MouseEvent): boolean {
		if (!this.turnViewportEl || this.isInteractiveTarget(event.target)) {
			return false;
		}

		const rect = this.turnViewportEl.getBoundingClientRect();
		const localX = event.clientX - rect.left;
		const localY = event.clientY - rect.top;
		const nearLeftEdge = localX <= TURN_NATIVE_CORNER_SIZE_PX;
		const nearRightEdge = localX >= rect.width - TURN_NATIVE_CORNER_SIZE_PX;
		const nearTop = localY <= TURN_NATIVE_CORNER_SIZE_PX;
		const nearBottom = localY >= rect.height - TURN_NATIVE_CORNER_SIZE_PX;
		const isCorner = (nearLeftEdge || nearRightEdge) && (nearTop || nearBottom);
		if (!isCorner) {
			return false;
		}

		return nearLeftEdge || nearRightEdge;
	}

	private showTurnDragFills(): void {
		if (!this.turnLeftFillEl || !this.turnRightFillEl) {
			return;
		}

		this.syncTurnFillSide(this.turnLeftFillEl, this.getActiveLeftTurnSheet(), "left");
		this.syncTurnFillSide(this.turnRightFillEl, this.getAdjacentRightTurnSheet(), "right");
	}

	private syncTurnFillSide(targetEl: HTMLElement, sourceEl: HTMLElement | null, side: "left" | "right"): void {
		targetEl.empty();
		if (!sourceEl) {
			targetEl.removeClass("is-visible");
			return;
		}

		const cloneEl = sourceEl.cloneNode(true);
		if (!(cloneEl instanceof HTMLElement)) {
			targetEl.removeClass("is-visible");
			return;
		}

		cloneEl.removeClass("is-left", "is-right");
		cloneEl.addClass("is-overlay-copy", `is-${side}`);
		targetEl.appendChild(cloneEl);
		targetEl.addClass("is-visible");
	}

	private hideTurnDragFills(): void {
		for (const fillEl of [this.turnLeftFillEl, this.turnRightFillEl]) {
			if (!fillEl) {
				continue;
			}
			fillEl.removeClass("is-visible");
			fillEl.empty();
		}
	}

	private getActiveLeftTurnSheet(): HTMLElement | null {
		if (!this.turnBookEl) {
			return null;
		}
		return this.turnBookEl.querySelector<HTMLElement>(`.diary-turn-sheet.is-left[data-date-id="${this.activeDateId}"]`);
	}

	private getAdjacentRightTurnSheet(): HTMLElement | null {
		if (!this.turnBookEl) {
			return null;
		}

		const activeIndex = this.dates.findIndex((date) => date.id === this.activeDateId);
		const nextDateId = this.dates[activeIndex + 1]?.id ?? this.activeDateId;
		return this.turnBookEl.querySelector<HTMLElement>(`.diary-turn-sheet.is-right[data-date-id="${nextDateId}"]`);
	}

	private isNearNativeTurnCorner(event: PointerEvent): boolean {
		if (!this.turnViewportEl) {
			return false;
		}

		const rect = this.turnViewportEl.getBoundingClientRect();
		const localX = event.clientX - rect.left;
		const localY = event.clientY - rect.top;
		const nearLeft = localX <= TURN_NATIVE_CORNER_SIZE_PX;
		const nearRight = localX >= rect.width - TURN_NATIVE_CORNER_SIZE_PX;
		const nearTop = localY <= TURN_NATIVE_CORNER_SIZE_PX;
		const nearBottom = localY >= rect.height - TURN_NATIVE_CORNER_SIZE_PX;
		return (nearLeft || nearRight) && (nearTop || nearBottom);
	}

	private isInteractiveTarget(target: EventTarget | null): boolean {
		const element = this.getEventTargetElement(target);
		if (!element) {
			return false;
		}
		return Boolean(element.closest("button, textarea, input, select, a, .markdown-rendered, .diary-lined-paper"));
	}

	private getEventTargetElement(target: EventTarget | null): HTMLElement | null {
		if (target instanceof HTMLElement) {
			return target;
		}

		if (target instanceof Text) {
			return target.parentElement;
		}

		return null;
	}

	private turnToAdjacentDate(direction: "next" | "prev"): void {
		if (!this.turnBookEl || !this.turnBookReady) {
			return;
		}

		if (direction === "prev" && this.activeDateId === this.dates[0]?.id) {
			return;
		}

		this.getTurnBook()?.turn(direction === "next" ? "next" : "previous");
	}

	private turnToDate(nextDateId: string): void {
		const nextTurnPage = this.getTurnPageForDate(nextDateId);
		if (nextTurnPage === null) {
			return;
		}

		if (this.turnBookEl && this.turnBookReady) {
			this.getTurnBook()?.turn("page", nextTurnPage);
			return;
		}

		this.activeDateId = nextDateId;
		void this.render();
	}

	private getTurnPageForDate(dateId: string): number | null {
		const index = this.dates.findIndex((date) => date.id === dateId);
		return index === -1 ? null : index * 2 + 2;
	}

	private getDateIdForTurnPage(page: number): string | null {
		if (page < 2) {
			return this.dates[0]?.id ?? null;
		}

		const index = Math.floor((page - 2) / 2);
		return this.dates[index]?.id ?? null;
	}

	private getTotalTurnPages(): number {
		return this.dates.length * 2 + 1;
	}

	private getFirstTurnPage(): number {
		return 2;
	}

	private updateCalendarActiveState(overrideDateId?: string | null): void {
		const targetId = overrideDateId !== undefined ? overrideDateId : this.activeDateId;
		for (const itemEl of Array.from(this.contentEl.querySelectorAll<HTMLElement>(".diary-calendar-item[data-date-id]"))) {
			itemEl.toggleClass("is-active", targetId !== null && itemEl.dataset.dateId === targetId);
		}
	}

	private renderLeftPage(
		parentEl: HTMLElement,
		dateInfo: DiaryDateItem,
		content: DiaryPageContent,
		calendarDates: DiaryDateItem[],
	): void {
		const pageEl = parentEl.createDiv({ cls: "diary-page diary-page-left" });
		this.renderPageBindingMarks(pageEl, "right");

		const headerEl = pageEl.createDiv({ cls: "diary-page-header" });
		const dayInfoEl = headerEl.createDiv({ cls: "diary-day-info diary-weather-trigger" });
		const sunEl = dayInfoEl.createDiv({ cls: "diary-day-icon" });
		sunEl.dataset.filePath = content.filePath;
		setIcon(sunEl, content.weatherIcon);
		const dayTextEl = dayInfoEl.createDiv({ cls: "diary-day-text" });
		dayTextEl.createSpan({ cls: "diary-day-name", text: dateInfo.fullDay });
		dayTextEl.createSpan({ cls: "diary-day-date", text: `${dateInfo.month} ${dateInfo.day}, ${dateInfo.year}` });
		dayInfoEl.addEventListener("click", (evt) => {
			this.toggleWeatherPicker(dayInfoEl, content);
			evt.stopPropagation();
		});

		const datePickerButtonEl = headerEl.createEl("button", {
			cls: "diary-header-button",
			attr: {
				type: "button",
				"aria-label": "Pick a date",
				title: "Pick a date",
			},
		});
		setIcon(datePickerButtonEl, "calendar");
		datePickerButtonEl.addEventListener("click", (evt) => {
			this.toggleDatePicker(datePickerButtonEl, dateInfo);
			evt.stopPropagation();
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

		const moodWrapEl = artworkWrapEl.createDiv({ cls: "diary-mood-wrap" });
		const moodTriggerEl = moodWrapEl.createDiv({ cls: "diary-mood-trigger" });
		moodTriggerEl.dataset.filePath = content.filePath;
		if (content.moodIconName) {
			moodTriggerEl.addClass("has-mood");
			const moodIconEl = moodTriggerEl.createDiv({ cls: "diary-mood-icon" });
			const match = this.resolveMoodIcon(content.moodIconName);
			if (match?.color) {
				moodIconEl.style.color = match.color;
			}
			setIcon(moodIconEl, content.moodIconName);
			if (content.moodDescription) {
				const textEl = moodTriggerEl.createSpan({ cls: "diary-mood-text", text: content.moodDescription });
				if (match?.color) {
					textEl.style.color = match.color;
				}
			}
		} else {
			moodTriggerEl.createSpan({ cls: "diary-mood-placeholder", text: "Set mood" });
		}
		moodTriggerEl.addEventListener("click", (evt) => {
			this.toggleMoodPicker(moodTriggerEl, content);
			evt.stopPropagation();
		});

		const calendarEl = pageEl.createDiv({ cls: "diary-calendar" });
		calendarDates.forEach((date) => {
			const dow = date.date.getDay();
			const isWeekend = dow === 0 || dow === 6;
			const itemEl = calendarEl.createDiv({
				cls: `diary-calendar-item${isWeekend ? " is-weekend" : ""}${date.id === this.activeDateId ? " is-active" : ""}${date.hasNote ? " has-note" : ""}`,
			});
			itemEl.dataset.dateId = date.id;
			itemEl.addEventListener("click", () => {
				this.handleDateChange(date.id);
			});
			itemEl.createSpan({ cls: "diary-calendar-dow", text: date.dayOfWeek });
			itemEl.createSpan({ cls: "diary-calendar-number", text: date.day });
			itemEl.createSpan({ cls: "diary-calendar-note-dot", attr: { "aria-hidden": "true" } });
		});
	}

	private async renderRightPage(parentEl: HTMLElement, content: DiaryPageContent, isBackFace = false): Promise<void> {
		this.renderedContentByPath.set(content.filePath, content);
		const pageEl = parentEl.createDiv({
			cls: `diary-page diary-page-right${isBackFace ? " is-backface" : ""}`,
		});
		pageEl.dataset.filePath = content.filePath;
		this.renderPageBindingMarks(pageEl, "left");
		const isPreview = this.isMarkdownPreview && !isBackFace;

		const promptCardEl = pageEl.createDiv({ cls: "diary-prompt-card" });
		const promptMetaEl = promptCardEl.createDiv({ cls: "diary-prompt-meta" });
		const promptLabelEl = promptMetaEl.createDiv({ cls: "diary-prompt-label" });
		const headphoneEl = promptLabelEl.createDiv({ cls: "diary-prompt-label-icon" });
		setIcon(headphoneEl, "notebook-text");
		promptLabelEl.createSpan({ text: content.promptTitle });
		promptMetaEl.createSpan({ cls: "diary-prompt-time", text: content.time });

		const promptEditorWrapEl = promptCardEl.createDiv({ cls: "diary-prompt-editor-wrap" });
		const promptTextEl = promptEditorWrapEl.createEl("textarea", {
			cls: "diary-prompt-text",
			attr: {
				placeholder: content.promptPlaceholder,
				"aria-label": `Edit daily quote for ${content.filePath}`,
			},
		});
		const promptWikilinkSuggestEl = promptEditorWrapEl.createDiv({ cls: "diary-wikilink-suggest", attr: { hidden: "hidden" } });
		promptTextEl.value = this.promptDrafts.get(content.filePath) ?? content.promptText;
		promptTextEl.readOnly = isBackFace;
		this.resizePromptTextarea(promptTextEl);
		if (!isBackFace) {
			promptTextEl.addEventListener("input", () => {
				this.promptDrafts.set(content.filePath, promptTextEl.value);
				this.scheduleDailyPromptSave(content.filePath, promptTextEl.value);
				this.resizePromptTextarea(promptTextEl);
			});
			promptTextEl.addEventListener("blur", () => {
				void this.flushPendingPromptSave(content.filePath);
			});
			this.bindTextareaWikilinkSuggest(promptTextEl, promptWikilinkSuggestEl, content.filePath, (value) => {
				this.promptDrafts.set(content.filePath, value);
				this.scheduleDailyPromptSave(content.filePath, value);
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
		const intentionActionsEl = intentionHeadEl.createDiv({ cls: "diary-intention-actions" });


		const previewButtonEl = this.renderPromptAction(
			intentionActionsEl,
			"eye",
			"Preview Markdown",
		);
		previewButtonEl.addClass("diary-preview-toggle", "is-toggle", "diary-preview-mode-button");
		this.updatePreviewToggleButton(previewButtonEl, isPreview);
		if (!isBackFace) {
			previewButtonEl.addEventListener("click", () => {
				void this.updateMarkdownPreviewMode(!this.isMarkdownPreview);
			});
		} else {
			previewButtonEl.disabled = true;
		}

		const linedPaperEl = intentionWrapEl.createDiv({ cls: "diary-lined-paper" });
		const footerEl = pageEl.createDiv({ cls: "diary-page-footer" });
		const footerLabelEl = footerEl.createDiv({ cls: "diary-page-footer-label is-clickable" });
		if (!isBackFace) {
			footerLabelEl.addEventListener("click", () => {
				void this.openDailyNote(content.filePath);
			});
		}
		const targetEl = footerLabelEl.createDiv({ cls: "diary-page-footer-icon" });
		setIcon(targetEl, "folder-open");
		footerLabelEl.createSpan({ text: content.filePath });
		const footerCountEl = footerEl.createSpan({
			cls: "diary-page-footer-count",
		});
		await this.renderMarkdownEditorBody(linedPaperEl, footerCountEl, content, isBackFace);
	}

	private async updateMarkdownPreviewMode(isPreview: boolean): Promise<void> {
		if (this.isMarkdownPreview === isPreview) {
			return;
		}

		this.isMarkdownPreview = isPreview;
		const renderVersion = this.renderVersion;
		const pageEls = Array.from(this.contentEl.querySelectorAll<HTMLElement>(".diary-page-right"));
		await Promise.all(pageEls.map(async (pageEl) => {
			if (renderVersion !== this.renderVersion || pageEl.hasClass("is-backface")) {
				return;
			}

			const filePath = pageEl.dataset.filePath;
			const content = filePath ? this.renderedContentByPath.get(filePath) : undefined;
			const linedPaperEl = pageEl.querySelector<HTMLElement>(".diary-lined-paper");
			const footerCountEl = pageEl.querySelector<HTMLElement>(".diary-page-footer-count");
			const previewButtonEl = pageEl.querySelector<HTMLButtonElement>(".diary-preview-mode-button");
			if (!content || !linedPaperEl || !footerCountEl) {
				return;
			}

			if (previewButtonEl) {
				this.updatePreviewToggleButton(previewButtonEl, isPreview);
			}
			await this.renderMarkdownEditorBody(linedPaperEl, footerCountEl, content, false);
		}));
	}

	private async renderMarkdownEditorBody(
		linedPaperEl: HTMLElement,
		footerCountEl: HTMLElement,
		content: DiaryPageContent,
		isBackFace: boolean,
	): Promise<void> {
		linedPaperEl.empty();
		const hasSections = content.sections.length > 0;
		const fullMarkdown = this.drafts.has(content.filePath)
			? this.drafts.get(content.filePath)!
			: hasSections
				? content.sections.map((s) => (s.heading ? `${s.heading}\n${s.content}` : s.content)).join("\n\n")
				: "";
		this.updateFooterWordCount(footerCountEl, fullMarkdown);

		if (this.isMarkdownPreview && !isBackFace) {
			const previewEl = linedPaperEl.createDiv({ cls: "diary-markdown-preview markdown-rendered" });
			previewEl.addEventListener("dblclick", () => {
				void this.updateMarkdownPreviewMode(false);
			});
			if (fullMarkdown.trim()) {
				await MarkdownRenderer.render(this.app, fullMarkdown, previewEl, content.filePath, this);
				this.bindMarkdownLinks(previewEl, content.filePath);
			} else {
				previewEl.createDiv({ cls: "diary-note-empty", text: "There is no content to preview yet." });
			}
			return;
		}

		const editorWrapEl = linedPaperEl.createDiv({ cls: "diary-intention-editor-wrap" });
		const textareaEl = editorWrapEl.createEl("textarea", {
			cls: "diary-intention-textarea",
			attr: {
				placeholder: "Write this daily note...",
				"aria-label": `Edit daily note ${content.filePath}`,
			},
		});
		const wikilinkSuggestEl = editorWrapEl.createDiv({ cls: "diary-wikilink-suggest", attr: { hidden: "hidden" } });
		textareaEl.value = fullMarkdown;
		textareaEl.readOnly = isBackFace;
		if (isBackFace) {
			return;
		}

		textareaEl.addEventListener("input", () => {
			this.drafts.set(content.filePath, textareaEl.value);
			this.scheduleDailyNoteSave(content.filePath, textareaEl.value);
			this.updateFooterWordCount(footerCountEl, textareaEl.value);
		});
		textareaEl.addEventListener("blur", () => {
			void this.flushPendingNoteSave(content.filePath);
		});
		this.bindTextareaWikilinkSuggest(textareaEl, wikilinkSuggestEl, content.filePath, (value) => {
			this.drafts.set(content.filePath, value);
			this.scheduleDailyNoteSave(content.filePath, value);
			this.updateFooterWordCount(footerCountEl, value);
		});
	}

	private updatePreviewToggleButton(buttonEl: HTMLButtonElement, isPreview: boolean): void {
		const label = isPreview ? "Switch to editing" : "Preview Markdown";
		buttonEl.setAttribute("aria-label", label);
		buttonEl.setAttribute("title", label);
		buttonEl.toggleClass("is-active", isPreview);
		setIcon(buttonEl, isPreview ? "pencil" : "eye");
	}

	private renderPromptAction(parentEl: HTMLElement, icon: string, label: string): HTMLButtonElement {
		const buttonEl = parentEl.createEl("button", {
			cls: "diary-prompt-action",
			attr: { type: "button", "aria-label": label, title: label },
		});
		setIcon(buttonEl, icon);
		return buttonEl;
	}

	private renderPageBindingMarks(parentEl: HTMLElement, side: "left" | "right"): void {
		const bindingEl = parentEl.createDiv({ cls: `diary-page-binding is-${side}` });
		["12%", "24%", "36%", "48%", "60%", "72%", "84%"].forEach((top, index) => {
			const markEl = bindingEl.createDiv({ cls: `diary-page-binding-mark is-${side} is-mark-${index + 1}` });
			markEl.style.top = top;
			markEl.createDiv({ cls: "diary-page-binding-punch" });
			markEl.createDiv({ cls: "diary-page-binding-ring-shadow" });
			markEl.createDiv({ cls: "diary-page-binding-ring" });
			markEl.createDiv({ cls: "diary-page-binding-ring-highlight" });
		});
	}

	private renderCloud(parentEl: HTMLElement, variant: string): void {
		const cloudEl = parentEl.createDiv({ cls: `diary-artwork-cloud ${variant}` });
		cloudEl.createDiv({ cls: "diary-artwork-cloud-part is-left" });
		cloudEl.createDiv({ cls: "diary-artwork-cloud-part is-center" });
		cloudEl.createDiv({ cls: "diary-artwork-cloud-part is-right" });
	}

	private toggleDatePicker(anchorEl: HTMLElement, currentDate: DiaryDateItem): void {
		if (this.datePickerOpen) {
			this.closeDatePicker();
			return;
		}

		const activeDate = this.getDateById(this.activeDateId);
		this.datePickerMonth = activeDate.date.getMonth();
		this.datePickerYear = activeDate.date.getFullYear();
		this.datePickerOpen = true;

		const panelEl = document.body.createDiv({ cls: "diary-date-picker" });
		this.renderDatePickerContent(panelEl);

		const anchorRect = anchorEl.getBoundingClientRect();
		const panelHeight = panelEl.offsetHeight || 320;
		const panelWidth = panelEl.offsetWidth || 300;
		let top = anchorRect.bottom + 8;
		let left = anchorRect.left + anchorRect.width / 2 - panelWidth / 2;
		if (top + panelHeight > window.innerHeight) {
			top = anchorRect.top - panelHeight - 8;
		}
		if (left < 8) left = 8;
		if (left + panelWidth > window.innerWidth - 8) left = window.innerWidth - panelWidth - 8;
		panelEl.style.top = `${top}px`;
		panelEl.style.left = `${left}px`;

		const onClickOutside = (evt: MouseEvent): void => {
			if (!panelEl.contains(evt.target as Node) && evt.target !== anchorEl) {
				this.closeDatePicker();
			}
		};

		const onKeyDown = (evt: KeyboardEvent): void => {
			if (evt.key === "Escape") {
				this.closeDatePicker();
			}
		};

		document.addEventListener("click", onClickOutside, true);
		document.addEventListener("keydown", onKeyDown);
		this.datePickerCleanup = () => {
			document.removeEventListener("click", onClickOutside, true);
			document.removeEventListener("keydown", onKeyDown);
			panelEl.remove();
		};
	}

	private closeDatePicker(): void {
		if (this.datePickerCleanup) {
			this.datePickerCleanup();
			this.datePickerCleanup = null;
		}
		this.datePickerOpen = false;
	}

	private toggleWeatherPicker(anchorEl: HTMLElement, content: DiaryPageContent): void {
		if (this.weatherPickerOpen) {
			this.closeWeatherPicker();
			return;
		}

		this.weatherPickerOpen = true;

		const panelEl = document.body.createDiv({ cls: "diary-weather-picker" });
		this.renderWeatherPickerContent(panelEl, content);

		const anchorRect = anchorEl.getBoundingClientRect();
		const panelHeight = panelEl.offsetHeight || 300;
		const panelWidth = panelEl.offsetWidth || 260;
		let top = anchorRect.bottom + 8;
		let left = anchorRect.left + anchorRect.width / 2 - panelWidth / 2;
		if (top + panelHeight > window.innerHeight) {
			top = anchorRect.top - panelHeight - 8;
		}
		if (left < 8) left = 8;
		if (left + panelWidth > window.innerWidth - 8) left = window.innerWidth - panelWidth - 8;
		panelEl.style.top = `${top}px`;
		panelEl.style.left = `${left}px`;

		const onClickOutside = (evt: MouseEvent): void => {
			if (!panelEl.contains(evt.target as Node) && evt.target !== anchorEl) {
				this.closeWeatherPicker();
			}
		};

		const onKeyDown = (evt: KeyboardEvent): void => {
			if (evt.key === "Escape") {
				this.closeWeatherPicker();
			}
		};

		document.addEventListener("click", onClickOutside, true);
		document.addEventListener("keydown", onKeyDown);
		this.weatherPickerCleanup = () => {
			document.removeEventListener("click", onClickOutside, true);
			document.removeEventListener("keydown", onKeyDown);
			panelEl.remove();
		};
	}

	private closeWeatherPicker(): void {
		if (this.weatherPickerCleanup) {
			this.weatherPickerCleanup();
			this.weatherPickerCleanup = null;
		}
		this.weatherPickerOpen = false;
	}

	private renderWeatherPickerContent(panelEl: HTMLElement, content: DiaryPageContent): void {
		const weatherOptions = this.getWeatherOptions();
		const currentIcon = content.weatherIcon;

		panelEl.createDiv({ cls: "diary-weather-picker-title", text: "Weather" });

		const gridEl = panelEl.createDiv({ cls: "diary-weather-picker-grid" });
		for (const option of weatherOptions) {
			const isActive = currentIcon === option.icon;
			const itemEl = gridEl.createEl("button", {
				cls: `diary-weather-picker-item${isActive ? " is-active" : ""}`,
				attr: {
					type: "button",
					"aria-label": option.label,
					title: option.label,
				},
			});
			const iconEl = itemEl.createDiv({ cls: "diary-weather-picker-icon" });
			setIcon(iconEl, option.icon);
			itemEl.createSpan({ cls: "diary-weather-picker-label", text: option.label });
			itemEl.addEventListener("click", (evt) => {
				evt.stopPropagation();
				this.closeWeatherPicker();
				void this.applyWeatherChange(content.filePath, option.value);
			});
		}
	}

	private async applyWeatherChange(filePath: string, value: string): Promise<void> {
		let file = this.app.vault.getAbstractFileByPath(filePath);
		if (!(file instanceof TFile)) {
			await this.ensureParentFolder(filePath);
			this.plugin.suppressVaultRefresh(filePath, 1500);
			file = await this.app.vault.create(filePath, "");
		}

		if (!(file instanceof TFile)) {
			return;
		}

		try {
			this.plugin.suppressVaultRefresh(filePath, 1500);
			await this.app.fileManager.processFrontMatter(file, (frontmatter: Record<string, unknown>) => {
				frontmatter[this.getDailyWeatherFrontmatterKey()] = value;
			});
		} catch (error) {
			console.warn("Failed to save weather in frontmatter", error);
		}

		const resolvedIcon = this.resolveWeatherIcon(value);
		const cached = this.renderedContentByPath.get(filePath);
		if (cached) {
			cached.weatherValue = value;
			cached.weatherIcon = resolvedIcon;
		}

		this.updateWeatherIcons(filePath, resolvedIcon);
	}

	private updateWeatherIcons(filePath: string, iconName: string): void {
		const iconEls = Array.from(this.contentEl.querySelectorAll<HTMLElement>(`.diary-day-icon[data-file-path="${CSS.escape(filePath)}"]`));
		for (const iconEl of iconEls) {
			setIcon(iconEl, iconName);
		}
	}

	private resolveMoodIcon(value: string): MoodIconItem | null {
		const allIcons = getAllMoodIcons(this.plugin.settings.customMoodIcons, this.plugin.settings.moodLanguage);
		const allIconsEn = getAllMoodIcons(this.plugin.settings.customMoodIcons, "en");
		
		return allIcons.find((item) => {
			if (item.name === value || item.description === value || item.descriptionZh === value) return true;
			const enMatch = allIconsEn.find(i => i.name === item.name);
			return !!(enMatch && enMatch.description === value);
		}) ?? null;
	}

	private toggleMoodPicker(anchorEl: HTMLElement, content: DiaryPageContent): void {
		if (this.moodPickerOpen) {
			this.closeMoodPicker();
			return;
		}

		this.moodPickerOpen = true;

		const panelEl = document.body.createDiv({ cls: "diary-mood-picker" });
		this.renderMoodPickerContent(panelEl, content);

		const anchorRect = anchorEl.getBoundingClientRect();
		const panelHeight = panelEl.offsetHeight || 300;
		const panelWidth = panelEl.offsetWidth || 260;
		let top = anchorRect.bottom + 8;
		let left = anchorRect.left + anchorRect.width / 2 - panelWidth / 2;
		if (top + panelHeight > window.innerHeight) {
			top = anchorRect.top - panelHeight - 8;
		}
		if (left < 8) left = 8;
		if (left + panelWidth > window.innerWidth - 8) left = window.innerWidth - panelWidth - 8;
		panelEl.style.top = `${top}px`;
		panelEl.style.left = `${left}px`;

		const onClickOutside = (evt: MouseEvent): void => {
			if (!panelEl.contains(evt.target as Node) && evt.target !== anchorEl) {
				this.closeMoodPicker();
			}
		};

		const onKeyDown = (evt: KeyboardEvent): void => {
			if (evt.key === "Escape") {
				this.closeMoodPicker();
			}
		};

		document.addEventListener("click", onClickOutside, true);
		document.addEventListener("keydown", onKeyDown);
		this.moodPickerCleanup = () => {
			document.removeEventListener("click", onClickOutside, true);
			document.removeEventListener("keydown", onKeyDown);
			panelEl.remove();
		};
	}

	private closeMoodPicker(): void {
		if (this.moodPickerCleanup) {
			this.moodPickerCleanup();
			this.moodPickerCleanup = null;
		}
		this.moodPickerOpen = false;
	}

	private renderMoodPickerContent(panelEl: HTMLElement, content: DiaryPageContent): void {
		const allIcons = getAllMoodIcons(this.plugin.settings.customMoodIcons, this.plugin.settings.moodLanguage);
		const currentIcon = content.moodIconName;

		const headerEl = panelEl.createDiv({ cls: "diary-mood-picker-header" });
		headerEl.createDiv({ cls: "diary-mood-picker-title", text: "Mood" });
		if (currentIcon) {
			const clearBtn = headerEl.createEl("button", {
				cls: "diary-mood-picker-clear",
				attr: {
					type: "button",
					"aria-label": "Clear mood",
					title: "Clear mood",
				},
			});
			setIcon(clearBtn, "x");
			clearBtn.addEventListener("click", (evt) => {
				evt.stopPropagation();
				this.closeMoodPicker();
				void this.applyMoodChange(content.filePath, null);
			});
		}

		const gridEl = panelEl.createDiv({ cls: "diary-mood-picker-grid" });
		for (const icon of allIcons) {
			const isActive = currentIcon === icon.name;
			const itemEl = gridEl.createEl("button", {
				cls: `diary-mood-picker-item${isActive ? " is-active" : ""}`,
				attr: {
					type: "button",
					"aria-label": icon.description || icon.name,
					title: icon.description || icon.name,
				},
			});
			const iconEl = itemEl.createDiv({ cls: "diary-mood-picker-icon" });
			if (icon.color) {
				iconEl.style.color = icon.color;
			}
			setIcon(iconEl, icon.name);
			const labelEl = itemEl.createSpan({ cls: "diary-mood-picker-label", text: icon.description || icon.name });
			if (icon.color) {
				labelEl.style.color = icon.color;
			}
			itemEl.addEventListener("click", (evt) => {
				evt.stopPropagation();
				this.closeMoodPicker();
				void this.applyMoodChange(content.filePath, icon.name);
			});
		}
	}

	private async applyMoodChange(filePath: string, iconName: string | null): Promise<void> {
		let file = this.app.vault.getAbstractFileByPath(filePath);
		if (!(file instanceof TFile)) {
			await this.ensureParentFolder(filePath);
			this.plugin.suppressVaultRefresh(filePath, 1500);
			file = await this.app.vault.create(filePath, "");
		}

		if (!(file instanceof TFile)) {
			return;
		}

		const moodKey = this.plugin.settings.moodFrontmatterKey?.trim() || "daily-mood";
		const match = iconName ? this.resolveMoodIcon(iconName) : null;

		try {
			this.plugin.suppressVaultRefresh(filePath, 1500);
			await this.app.fileManager.processFrontMatter(file, (frontmatter: Record<string, unknown>) => {
				if (iconName === null) {
					delete frontmatter[moodKey];
				} else {
					frontmatter[moodKey] = match ? (match.description || match.name) : iconName;
				}
			});
		} catch (error) {
			console.warn("Failed to save mood in frontmatter", error);
		}

		const cached = this.renderedContentByPath.get(filePath);
		if (cached) {
			cached.moodIconName = iconName;
			const match = iconName ? this.resolveMoodIcon(iconName) : null;
			cached.moodDescription = match?.description ?? null;
		}

		this.updateMoodDisplay(filePath, iconName, cached?.moodDescription ?? null);
	}

	private updateMoodDisplay(filePath: string, iconName: string | null, description: string | null): void {
		const moodTriggers = Array.from(this.contentEl.querySelectorAll<HTMLElement>(`.diary-mood-trigger[data-file-path="${CSS.escape(filePath)}"]`));
		const match = iconName ? this.resolveMoodIcon(iconName) : null;
		for (const triggerEl of moodTriggers) {
			triggerEl.empty();
			triggerEl.classList.toggle("has-mood", !!iconName);
			if (iconName) {
				const moodIconEl = triggerEl.createDiv({ cls: "diary-mood-icon" });
				if (match?.color) {
					moodIconEl.style.color = match.color;
				}
				setIcon(moodIconEl, iconName);
				if (description) {
					const textEl = triggerEl.createSpan({ cls: "diary-mood-text", text: description });
					if (match?.color) {
						textEl.style.color = match.color;
					}
				}
			} else {
				triggerEl.createSpan({ cls: "diary-mood-placeholder", text: "Set mood" });
			}
		}
	}

	private static readonly WEATHER_OPTIONS: Array<{
		icon: string;
		labelEn: string;
		labelZh: string;
	}> = [
		{ icon: "sun", labelEn: "Sun", labelZh: "晴" },
		{ icon: "sun-dim", labelEn: "Sun dim", labelZh: "晴间多云" },
		{ icon: "sun-medium", labelEn: "Sun medium", labelZh: "温和" },
		{ icon: "sunrise", labelEn: "Sunrise", labelZh: "日出" },
		{ icon: "sunset", labelEn: "Sunset", labelZh: "日落" },
		{ icon: "cloud-sun", labelEn: "Partly cloudy", labelZh: "多云" },
		{ icon: "cloud-sun-rain", labelEn: "Sun shower", labelZh: "太阳雨" },
		{ icon: "sun-snow", labelEn: "Sun snow", labelZh: "太阳雪" },
		{ icon: "cloud", labelEn: "Cloud", labelZh: "阴" },
		{ icon: "cloud-off", labelEn: "Cloud off", labelZh: "少云" },
		{ icon: "cloudy", labelEn: "Cloudy", labelZh: "阴天" },
		{ icon: "cloud-fog", labelEn: "Fog", labelZh: "雾" },
		{ icon: "haze", labelEn: "Haze", labelZh: "霾" },
		{ icon: "cloud-drizzle", labelEn: "Drizzle", labelZh: "小雨" },
		{ icon: "cloud-rain", labelEn: "Rain", labelZh: "雨" },
		{ icon: "cloud-rain-wind", labelEn: "Heavy rain", labelZh: "大雨" },
		{ icon: "cloud-hail", labelEn: "Hail", labelZh: "冰雹" },
		{ icon: "cloud-lightning", labelEn: "Thunder", labelZh: "雷" },
		{ icon: "cloud-snow", labelEn: "Snow", labelZh: "雪" },
		{ icon: "snowflake", labelEn: "Snowflake", labelZh: "雪花" },
		{ icon: "cloud-moon", labelEn: "Night cloudy", labelZh: "夜间多云" },
		{ icon: "cloud-moon-rain", labelEn: "Night rain", labelZh: "夜间雨" },
		{ icon: "moon-star", labelEn: "Night clear", labelZh: "夜间晴" },
		{ icon: "wind", labelEn: "Wind", labelZh: "风" },
		{ icon: "tornado", labelEn: "Tornado", labelZh: "龙卷风" },
		{ icon: "thermometer", labelEn: "Thermometer", labelZh: "温度计" },
		{ icon: "thermometer-sun", labelEn: "Hot", labelZh: "高温" },
		{ icon: "thermometer-snowflake", labelEn: "Cold", labelZh: "低温" },
		{ icon: "umbrella", labelEn: "Umbrella", labelZh: "伞" },
		{ icon: "rainbow", labelEn: "Rainbow", labelZh: "彩虹" },
		{ icon: "droplets", labelEn: "Droplets", labelZh: "水滴" },
		{ icon: "waves", labelEn: "Waves", labelZh: "浪" },
	];

	private getWeatherOptions(): Array<{ value: string; icon: string; label: string }> {
		const isZh = this.plugin.settings.weatherLanguage === "zh";
		return DiaryView.WEATHER_OPTIONS.map((opt) => ({
			value: isZh ? opt.labelZh : opt.icon,
			icon: opt.icon,
			label: isZh ? opt.labelZh : opt.labelEn,
		}));
	}

	private renderDatePickerContent(panelEl: HTMLElement): void {
		const monthNames = [
			"January", "February", "March", "April", "May", "June",
			"July", "August", "September", "October", "November", "December",
		];
		const weekDays = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

		const headerEl = panelEl.createDiv({ cls: "diary-date-picker-header" });
		const prevBtn = headerEl.createEl("button", {
			cls: "diary-date-picker-nav",
			attr: { type: "button", "aria-label": "Previous month" },
		});
		setIcon(prevBtn, "chevron-left");
		prevBtn.addEventListener("click", (evt) => {
			evt.stopPropagation();
			this.datePickerMonth--;
			if (this.datePickerMonth < 0) {
				this.datePickerMonth = 11;
				this.datePickerYear--;
			}
			this.refreshDatePickerContent(panelEl);
		});

		headerEl.createSpan({ cls: "diary-date-picker-title", text: `${monthNames[this.datePickerMonth]} ${this.datePickerYear}` });

		const nextBtn = headerEl.createEl("button", {
			cls: "diary-date-picker-nav",
			attr: { type: "button", "aria-label": "Next month" },
		});
		setIcon(nextBtn, "chevron-right");
		nextBtn.addEventListener("click", (evt) => {
			evt.stopPropagation();
			this.datePickerMonth++;
			if (this.datePickerMonth > 11) {
				this.datePickerMonth = 0;
				this.datePickerYear++;
			}
			this.refreshDatePickerContent(panelEl);
		});

		const gridEl = panelEl.createDiv({ cls: "diary-date-picker-grid" });
		weekDays.forEach((d) => {
			gridEl.createSpan({ cls: "diary-date-picker-weekday", text: d });
		});

		this.renderDatePickerDays(gridEl);

		const footerEl = panelEl.createDiv({ cls: "diary-date-picker-footer" });
		const todayBtn = footerEl.createEl("button", {
			cls: "diary-date-picker-today",
			attr: { type: "button" },
		});
		const todayIconEl = todayBtn.createDiv({ cls: "diary-date-picker-today-icon" });
		setIcon(todayIconEl, "calendar-clock");
		todayBtn.createSpan({ text: "Today" });
		todayBtn.addEventListener("click", (evt) => {
			evt.stopPropagation();
			const today = new Date();
			today.setHours(0, 0, 0, 0);
			this.closeDatePicker();
			this.navigateToDate(today);
		});
	}

	private refreshDatePickerContent(panelEl: HTMLElement): void {
		const monthNames = [
			"January", "February", "March", "April", "May", "June",
			"July", "August", "September", "October", "November", "December",
		];
		const titleEl = panelEl.querySelector(".diary-date-picker-title");
		if (titleEl) {
			titleEl.textContent = `${monthNames[this.datePickerMonth]} ${this.datePickerYear}`;
		}

		const gridEl = panelEl.querySelector(".diary-date-picker-grid");
		if (gridEl) {
			const weekdays = gridEl.querySelectorAll(".diary-date-picker-weekday");
			const days = gridEl.querySelectorAll(".diary-date-picker-day, .diary-date-picker-empty");
			days.forEach((el) => el.remove());
			this.renderDatePickerDays(gridEl as HTMLElement);
		}
	}

	private renderDatePickerDays(gridEl: HTMLElement): void {
		const firstDay = new Date(this.datePickerYear, this.datePickerMonth, 1).getDay();
		const daysInMonth = new Date(this.datePickerYear, this.datePickerMonth + 1, 0).getDate();
		const activeDate = this.getDateById(this.activeDateId);
		const today = new Date();
		today.setHours(0, 0, 0, 0);

		for (let i = 0; i < firstDay; i++) {
			gridEl.createSpan({ cls: "diary-date-picker-empty" });
		}

		for (let day = 1; day <= daysInMonth; day++) {
			const cellDate = new Date(this.datePickerYear, this.datePickerMonth, day);
			cellDate.setHours(0, 0, 0, 0);
			const cellId = this.formatDateId(cellDate);

			const isToday = cellDate.getTime() === today.getTime();
			const isActive = cellDate.getTime() === activeDate.date.getTime();
			const path = this.getDailyNotePath(cellDate);
			const hasNote = this.app.vault.getAbstractFileByPath(path) instanceof TFile;

			const cls = [
				"diary-date-picker-day",
				isActive ? "is-active" : "",
				isToday ? "is-today" : "",
				hasNote ? "has-note" : "",
			].filter(Boolean).join(" ");

			const dayEl = gridEl.createSpan({ cls, text: String(day) });
			dayEl.addEventListener("click", (evt) => {
				evt.stopPropagation();
				this.closeDatePicker();
				this.navigateToDate(cellDate);
			});
		}
	}

	private navigateToDate(targetDate: Date): void {
		const target = new Date(targetDate);
		target.setHours(0, 0, 0, 0);
		const targetId = this.formatDateId(target);

		if (this.dates.some((date) => date.id === targetId)) {
			this.handleDateChange(targetId);
			return;
		}

		this.dates = this.buildDateItems(target);
		this.activeDateId = targetId;
		void this.render();
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

	private renderMobileSpineRing(parentEl: HTMLElement, offset: number): void {
		const ringEl = parentEl.createDiv({ cls: "diary-mobile-spine-ring" });
		ringEl.style.setProperty("--diary-mobile-ring-offset", `${offset}px`);
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
		if (nextDateId === this.activeDateId) {
			return;
		}

		if (this.shouldUsePageFlip()) {
			this.turnToDate(nextDateId);
			return;
		}

		this.activeDateId = nextDateId;
		void this.render();
	}

	private shouldUsePageFlip(): boolean {
		return window.matchMedia(DESKTOP_BREAKPOINT_QUERY).matches && this.isTurnPluginAvailable();
	}

	private getTurnBook(): TurnBook | null {
		if (!this.turnBookEl) {
			return null;
		}

		const turnBook = $(this.turnBookEl) as Partial<TurnBook>;
		return typeof turnBook.turn === "function" ? turnBook as TurnBook : null;
	}

	private isTurnPluginAvailable(): boolean {
		const turnProbe = $(document.createElement("div")) as Partial<TurnBook>;
		return typeof turnProbe.turn === "function";
	}

	private getDailyQuoteFrontmatterKey(): string {
		return this.plugin.settings.dailyQuoteFrontmatterKey?.trim() || DEFAULT_DAILY_QUOTE_FRONTMATTER_KEY;
	}

	private getDailyWeatherFrontmatterKey(): string {
		return this.plugin.settings.dailyWeatherFrontmatterKey?.trim() || DEFAULT_DAILY_WEATHER_FRONTMATTER_KEY;
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
		const body = splitFrontmatter(rawContent).body;
		const sections = readAllBodyUnderHeadings(body, this.plugin.settings.dailyNoteHeading);
		const markdown = sections.map((s) => s.content).join("\n");
		const wordCount = this.countWords(markdown);
		const frontmatter = this.app.metadataCache.getFileCache(file)?.frontmatter;
		const quoteFrontmatterKey = this.getDailyQuoteFrontmatterKey();
		const weatherFrontmatterKey = this.getDailyWeatherFrontmatterKey();
		const dailyQuote = readDailyQuote(frontmatter, quoteFrontmatterKey) ?? await this.fetchAndCacheDailyQuote(file);
		const imageFrontmatterKey = this.plugin.settings.dailyImageFrontmatterKey || DEFAULT_DAILY_IMAGE_FRONTMATTER_KEY;
		let artworkImage = readArtworkImage(frontmatter, imageFrontmatterKey);
		if (!artworkImage && this.plugin.settings.useFirstImageAsArtwork) {
			artworkImage = extractFirstImage(body);
		}
		const rawWeather = readWeatherIcon(frontmatter, weatherFrontmatterKey);
		const moodFrontmatterKey = this.plugin.settings.moodFrontmatterKey?.trim() || "daily-mood";
		const rawMood = readFrontmatterString(frontmatter, moodFrontmatterKey);
		const moodMatch = rawMood ? this.resolveMoodIcon(rawMood) : null;
		return {
			imageCaption: file.basename,
			artworkImage,
			promptTitle: "Daily quote",
			promptText: dailyQuote ?? "",
			promptPlaceholder: "Write a sentence for today...",
			time: this.formatTime(new Date(file.stat.mtime)),
			filePath: file.path,
			sections,
			markdown,
			wordCount,
			exists: true,
			weatherIcon: this.resolveWeatherIcon(rawWeather),
			weatherValue: rawWeather,
			moodIconName: moodMatch?.name ?? rawMood,
			moodDescription: moodMatch?.description ?? null,
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
			filePath: date.path,
			sections: [],
			markdown: "",
			wordCount: 0,
			exists: false,
			weatherIcon: "sun",
			weatherValue: null,
			moodIconName: null,
			moodDescription: null,
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
						frontmatter[this.getDailyQuoteFrontmatterKey()] = quote;
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

	private static readonly ZH_TO_ICON: Record<string, string> = (() => {
		const map: Record<string, string> = {};
		for (const opt of DiaryView.WEATHER_OPTIONS) {
			map[opt.labelZh] = opt.icon;
		}
		return map;
	})();

	private static readonly LEGACY_ALIAS_TO_ICON: Record<string, string> = {
		clear: "sun",
		sunny: "sun",
		overcast: "cloud",
		foggy: "cloud-fog",
		rainy: "cloud-rain",
		storm: "cloud-lightning",
		thunder: "cloud-lightning",
		snowy: "cloud-snow",
		windy: "wind",
	};

	private resolveWeatherIcon(value: string | null): string {
		if (!value) {
			return "sun";
		}

		const trimmed = value.trim();
		const lower = trimmed.toLowerCase();

		const zhMatch = DiaryView.ZH_TO_ICON[trimmed];
		if (zhMatch) {
			return zhMatch;
		}

		const legacyMatch = DiaryView.LEGACY_ALIAS_TO_ICON[lower];
		if (legacyMatch) {
			return legacyMatch;
		}

		return trimmed;
	}

	private buildDateItems(centerDate = new Date()): DiaryDateItem[] {
		const center = new Date(centerDate);
		center.setHours(0, 0, 0, 0);
		return Array.from({ length: 7 }, (_, index) => {
			const date = new Date(center);
			date.setDate(center.getDate() + index - 3);
			const path = this.getDailyNotePath(date);
			return {
				id: this.formatDateId(date),
				label: this.getRelativeDateLabel(date),
				date,
				path,
				hasNote: this.app.vault.getAbstractFileByPath(path) instanceof TFile,
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
		const fileName = this.formatDateByPattern(date, this.plugin.getDailyNotesDateFormat());
		const expectedPath = normalizePath(folder ? `${folder}/${fileName}.md` : `${fileName}.md`);
		return this.findExistingDailyNotePath(date, expectedPath) ?? expectedPath;
	}

	private formatDateByPattern(date: Date, pattern: string): string {
		return moment(date).format(pattern);
	}

	private findExistingDailyNotePath(date: Date, expectedPath: string): string | null {
		if (this.app.vault.getAbstractFileByPath(expectedPath) instanceof TFile) {
			return expectedPath;
		}

		const folderPath = this.plugin.getDailyNotesFolder();
		const folder = folderPath
			? this.app.vault.getAbstractFileByPath(folderPath)
			: null;
		const files = folder instanceof TFolder
			? folder.children.filter((child): child is TFile => child instanceof TFile && child.extension === "md")
			: this.app.vault.getMarkdownFiles().filter((file) => !file.path.includes("/"));
		const datePrefix = moment(date).format("YYYY-MM-DD");
		const matchingFile = files.find((file) => file.basename === datePrefix || file.basename.startsWith(`${datePrefix} `));

		return matchingFile?.path ?? null;
	}

	private formatDateId(date: Date): string {
		const day = new Date(date);
		day.setHours(0, 0, 0, 0);
		return String(day.getTime());
	}

	private getRelativeDateLabel(date: Date): string {
		const target = new Date(date);
		target.setHours(0, 0, 0, 0);
		const today = new Date();
		today.setHours(0, 0, 0, 0);
		const dayOffset = Math.round((target.getTime() - today.getTime()) / 86_400_000);
		if (dayOffset === 0) {
			return "Today";
		}
		if (dayOffset === -1) {
			return "Yesterday";
		}
		if (dayOffset === 1) {
			return "Tomorrow";
		}
		return this.formatDatePart(date, "shortWeekday");
	}

	private getDateFromId(id: string): Date {
		const dateFromItems = this.dates.find((date) => date.id === id)?.date;
		if (dateFromItems) {
			return dateFromItems;
		}

		const timestamp = Number(id);
		if (Number.isFinite(timestamp)) {
			return new Date(timestamp);
		}

		return new Date();
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
		}, AUTOSAVE_DELAY_MS);
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
		}, AUTOSAVE_DELAY_MS);
		this.promptSaveTimers.set(path, timerId);
	}

	private async saveDailyPrompt(path: string, promptText: string): Promise<void> {
		let file = this.app.vault.getAbstractFileByPath(path);
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
				frontmatter[this.getDailyQuoteFrontmatterKey()] = normalizedPromptText;
			});
			this.promptDrafts.set(path, normalizedPromptText);
		} catch (error) {
			console.warn("Failed to save daily prompt in frontmatter", error);
		}
	}

	private async saveDailyNote(path: string, markdown: string): Promise<void> {
		const normalizedMarkdown = markdown.replace(/\r\n/g, "\n").trimEnd();
		const sections = this.parseSectionsFromMarkdown(normalizedMarkdown);
		const file = this.app.vault.getAbstractFileByPath(path);
		if (file instanceof TFile) {
			const rawContent = (await this.app.vault.cachedRead(file)).replace(/\r\n/g, "\n");
			const { frontmatter, body } = splitFrontmatter(rawContent);
			const nextBody = writeAllBodyUnderHeadings(body, this.plugin.settings.dailyNoteHeading, sections);
			const nextContent = frontmatter
				? nextBody
					? `${frontmatter}\n\n${nextBody}`
					: frontmatter
				: nextBody;
			this.plugin.suppressVaultRefresh(path);
			await this.app.vault.modify(file, nextContent);
		} else {
			await this.ensureParentFolder(path);
			const nextBody = writeAllBodyUnderHeadings("", this.plugin.settings.dailyNoteHeading, sections);
			this.plugin.suppressVaultRefresh(path);
			await this.app.vault.create(path, nextBody);
		}
		this.drafts.set(path, normalizedMarkdown);
	}

	private parseSectionsFromMarkdown(markdown: string): DiarySection[] {
		const headings = this.plugin.settings.dailyNoteHeading
			.split(/[\n,;]+/)
			.map((h) => h.trim())
			.filter(Boolean);
		if (headings.length === 0) {
			return [{ heading: "", content: markdown }];
		}

		const headingPattern = /^(#{1,6})\s+(.+?)\s*#*\s*$/gm;
		const matches: Array<{ line: string; index: number; title: string }> = [];
		let m: RegExpExecArray | null;
		while ((m = headingPattern.exec(markdown)) !== null) {
			const title = (m[2] ?? "").trim().toLowerCase();
			matches.push({ line: m[0], index: m.index, title });
		}

		const normalizedHeadings = headings.map((h) =>
			h.replace(/^#{1,6}\s+/, "").trim().toLowerCase(),
		);

		const result: DiarySection[] = [];
		for (let i = 0; i < headings.length; i++) {
			const matchIdx = matches.findIndex((match) =>
				normalizedHeadings[i] && match.title === normalizedHeadings[i],
			);
			if (matchIdx === -1) {
				result.push({ heading: headings[i]!, content: "" });
				continue;
			}

			const startMatch = matches[matchIdx];
			const contentStart = startMatch!.index + startMatch!.line.length;
			const nextMatch = matches[matchIdx + 1];
			const contentEnd = nextMatch ? nextMatch.index : markdown.length;
			const content = markdown.slice(contentStart, contentEnd).trim();

			matches.splice(matchIdx, 1);
			result.push({ heading: startMatch!.line, content });
		}

		return result;
	}

	private async flushPendingSaves(): Promise<void> {
		const notePaths = Array.from(this.saveTimers.keys());
		const promptPaths = Array.from(this.promptSaveTimers.keys());
		await Promise.all([
			...notePaths.map((path) => this.flushPendingNoteSave(path)),
			...promptPaths.map((path) => this.flushPendingPromptSave(path)),
		]);
	}

	private async flushPendingNoteSave(path: string): Promise<void> {
		const timerId = this.saveTimers.get(path);
		if (timerId !== undefined) {
			window.clearTimeout(timerId);
			this.saveTimers.delete(path);
		}

		const draft = this.drafts.get(path);
		if (draft !== undefined) {
			await this.saveDailyNote(path, draft);
		}
	}

	private async flushPendingPromptSave(path: string): Promise<void> {
		const timerId = this.promptSaveTimers.get(path);
		if (timerId !== undefined) {
			window.clearTimeout(timerId);
			this.promptSaveTimers.delete(path);
		}

		const draft = this.promptDrafts.get(path);
		if (draft !== undefined) {
			await this.saveDailyPrompt(path, draft);
		}
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

		parentEl.addEventListener("mouseover", (event) => {
			const target = event.target as HTMLElement | null;
			const linkEl = target?.closest("a.internal-link");
			if (!(linkEl instanceof HTMLAnchorElement)) {
				return;
			}

			this.app.workspace.trigger("hover-link", {
				event,
				source: "diary-preview",
				hoverParent: parentEl,
				targetEl: linkEl,
				linktext: linkEl.getAttribute("data-href") ?? linkEl.getAttribute("href") ?? "",
				sourcePath,
			});
		});
	}

	private bindTextareaWikilinkSuggest(
		textareaEl: HTMLTextAreaElement,
		panelEl: HTMLElement,
		sourcePath: string,
		onChange: (value: string) => void,
	): void {
		let suggestions: WikilinkSuggestion[] = [];
		let selectedIndex = 0;
		let activeContext: WikilinkContext | null = null;
		let lockedAnchorTargetPath: string | null = null;
		let syncRequestId = 0;
		let isComposing = false;

		const hidePanel = (): void => {
			suggestions = [];
			selectedIndex = 0;
			activeContext = null;
			lockedAnchorTargetPath = null;
			panelEl.empty();
			panelEl.setAttr("hidden", "hidden");
		};

		const applySuggestion = async (item: WikilinkSuggestion): Promise<void> => {
			const contextAtSelection = activeContext;
			if (!contextAtSelection) {
				hidePanel();
				return;
			}

			if (item.type === "paragraph") {
				const blockId = await this.ensureParagraphBlockId(item);
				if (!blockId) {
					hidePanel();
					return;
				}

				const result = applyWikilinkSuggestion(
					textareaEl.value,
					contextAtSelection.matchEnd,
					contextAtSelection,
					{
						type: "block",
						file: item.file,
						blockId,
						displayText: `^${blockId}`,
						path: item.path,
					},
				);
				textareaEl.value = result.newText;
				onChange(result.newText);
				hidePanel();
				textareaEl.focus();
				textareaEl.setSelectionRange(result.newCursor, result.newCursor);
				textareaEl.dispatchEvent(new Event("input", { bubbles: true }));
				return;
			}

			const result = applyWikilinkSuggestion(
				textareaEl.value,
				contextAtSelection.matchEnd,
				contextAtSelection,
				item,
			);
			textareaEl.value = result.newText;
			onChange(result.newText);
			hidePanel();
			textareaEl.focus();
			textareaEl.setSelectionRange(result.newCursor, result.newCursor);
			textareaEl.dispatchEvent(new Event("input", { bubbles: true }));
		};

		const applyAnchorTransition = (): void => {
			if (!activeContext || !suggestions.length) {
				return;
			}

			const selectedItem = suggestions[selectedIndex];
			const targetFile = selectedItem?.file ?? null;
			const baseName = targetFile?.basename ?? (activeContext.filePart.trim() || "");
			if (!baseName) {
				return;
			}

			lockedAnchorTargetPath = targetFile?.path ?? lockedAnchorTargetPath;

			const before = textareaEl.value.slice(0, activeContext.matchStart);
			const after = textareaEl.value.slice(activeContext.matchEnd);
			const replacement = `[[${baseName}#`;
			const nextValue = `${before}${replacement}${after}`;
			const nextCursor = before.length + replacement.length;

			textareaEl.value = nextValue;
			onChange(nextValue);
			textareaEl.focus();
			textareaEl.setSelectionRange(nextCursor, nextCursor);
			textareaEl.dispatchEvent(new Event("input", { bubbles: true }));
		};

		const renderPanel = (): void => {
			panelEl.empty();
			if (!suggestions.length) {
				panelEl.setAttr("hidden", "hidden");
				panelEl.style.removeProperty("left");
				panelEl.style.removeProperty("top");
				return;
			}

			panelEl.removeAttribute("hidden");
			this.positionWikilinkSuggestPanel(textareaEl, panelEl);
			suggestions.forEach((item, index) => {
				const itemEl = panelEl.createEl("button", {
					cls: `diary-wikilink-suggest-item${index === selectedIndex ? " is-selected" : ""}`,
					attr: {
						type: "button",
						"aria-label": item.path,
					},
				});
				itemEl.addEventListener("mousedown", (event) => {
					event.preventDefault();
					void applySuggestion(item);
				});

				const typeEl = itemEl.createSpan({ cls: "diary-wikilink-suggest-type" });
				typeEl.setText(
					item.type === "file"
						? "File"
						: item.type === "heading"
							? "Heading"
							: item.type === "paragraph"
								? "Paragraph"
								: "Block",
				);

				const contentEl = itemEl.createSpan({ cls: "diary-wikilink-suggest-content" });
				contentEl.createSpan({
					cls: "diary-wikilink-suggest-title",
					text: item.displayText,
				});
				contentEl.createSpan({
					cls: "diary-wikilink-suggest-path",
					text: item.path,
				});
			});

			const selectedItemEl = panelEl.querySelector(".diary-wikilink-suggest-item.is-selected");
			if (selectedItemEl instanceof HTMLElement) {
				selectedItemEl.scrollIntoView({
					block: "nearest",
				});
			}
		};

		const syncPanel = async (): Promise<void> => {
			const requestId = ++syncRequestId;
			const cursor = textareaEl.selectionStart ?? textareaEl.value.length;
			const context = parseWikilinkContext(textareaEl.value, cursor);
			if (!context) {
				hidePanel();
				return;
			}

			if (!context.separator) {
				lockedAnchorTargetPath = null;
			} else if (lockedAnchorTargetPath) {
				const lockedTargetFile = this.app.vault.getAbstractFileByPath(lockedAnchorTargetPath);
				if (
					!(lockedTargetFile instanceof TFile) ||
					(context.filePart.trim() &&
						context.filePart.trim() !== lockedTargetFile.basename &&
						context.filePart.trim() !== lockedTargetFile.path)
				) {
					lockedAnchorTargetPath = null;
				}
			}

			const normalizedContext = expandEmptyAnchorToCurrentFile(this.app, context, sourcePath);
			const nextSuggestions = await getWikilinkSuggestions(
				this.app,
				normalizedContext,
				sourcePath,
				lockedAnchorTargetPath,
			);
			if (requestId !== syncRequestId) {
				return;
			}
			if (!nextSuggestions.length) {
				hidePanel();
				return;
			}

			activeContext = context;
			suggestions = nextSuggestions;
			selectedIndex = Math.min(selectedIndex, suggestions.length - 1);
			renderPanel();
		};

		textareaEl.addEventListener("compositionstart", () => {
			isComposing = true;
		});
		textareaEl.addEventListener("compositionend", () => {
			isComposing = false;
			this.normalizeTextareaWikilinkInput(textareaEl, onChange);
			void syncPanel();
		});
		textareaEl.addEventListener("input", () => {
			if (!isComposing) {
				this.normalizeTextareaWikilinkInput(textareaEl, onChange);
			}
			void syncPanel();
		});
		textareaEl.addEventListener("click", () => {
			void syncPanel();
		});
		textareaEl.addEventListener("keyup", (event) => {
			if (event.key === "ArrowUp" || event.key === "ArrowDown" || event.key === "Enter" || event.key === "Tab") {
				return;
			}
			void syncPanel();
		});
		textareaEl.addEventListener("blur", () => {
			window.setTimeout(() => {
				if (document.activeElement === textareaEl) {
					return;
				}
				hidePanel();
			}, 80);
		});
		textareaEl.addEventListener("keydown", (event) => {
			if (event.key === "Escape") {
				event.preventDefault();
				event.stopPropagation();
				hidePanel();
				return;
			}

			if (!suggestions.length) {
				return;
			}

			if (event.key === "ArrowDown") {
				event.preventDefault();
				selectedIndex = (selectedIndex + 1) % suggestions.length;
				renderPanel();
				return;
			}

			if (event.key === "ArrowUp") {
				event.preventDefault();
				selectedIndex = (selectedIndex - 1 + suggestions.length) % suggestions.length;
				renderPanel();
				return;
			}

			if (this.isWikilinkAnchorShortcut(event) && activeContext?.separator === "") {
				event.preventDefault();
				applyAnchorTransition();
				return;
			}

			if (event.key === "Enter" || event.key === "Tab") {
				event.preventDefault();
				const selectedSuggestion = suggestions[selectedIndex];
				if (!selectedSuggestion) {
					hidePanel();
					return;
				}
				void applySuggestion(selectedSuggestion);
				return;
			}
		});
	}

	private async ensureParagraphBlockId(
		item: Extract<WikilinkSuggestion, { type: "paragraph" }>,
	): Promise<string | null> {
		const file = this.app.vault.getAbstractFileByPath(item.path);
		if (!(file instanceof TFile)) {
			new Notice("Source file no longer exists.");
			return null;
		}

		const rawContent = (await this.app.vault.cachedRead(file)).replace(/\r\n/g, "\n");
		if (item.appendOffset < 0 || item.appendOffset > rawContent.length) {
			new Notice("Could not locate the selected paragraph.");
			return null;
		}

		const existingIds = Object.keys(this.app.metadataCache.getFileCache(file)?.blocks ?? {});
		const blockId = createBlockId(existingIds);
		const nextContent = `${rawContent.slice(0, item.appendOffset)} ^${blockId}${rawContent.slice(item.appendOffset)}`;
		this.plugin.suppressVaultRefresh(file.path);
		await this.app.vault.modify(file, nextContent);
		return blockId;
	}

	private isWikilinkAnchorShortcut(event: KeyboardEvent): boolean {
		if (event.key === "#") {
			return true;
		}

		if (event.shiftKey && event.code === "Digit3") {
			return true;
		}

		return false;
	}

	private normalizeTextareaWikilinkInput(
		textareaEl: HTMLTextAreaElement,
		onChange: (value: string) => void,
	): boolean {
		const cursor = textareaEl.selectionStart ?? textareaEl.value.length;
		let value = textareaEl.value;
		let nextCursor = cursor;
		let changed = false;

		if (cursor >= 2 && value.slice(cursor - 2, cursor) === "【【") {
			value = `${value.slice(0, cursor - 2)}[[${value.slice(cursor)}`;
			changed = true;
		}

		if (cursor >= 3 && value.slice(cursor - 3, cursor) === "#……") {
			value = `${value.slice(0, cursor - 3)}#^${value.slice(cursor)}`;
			nextCursor -= 1;
			changed = true;
		}

		if (!changed) {
			return false;
		}

		textareaEl.value = value;
		onChange(value);
		textareaEl.setSelectionRange(nextCursor, nextCursor);
		return true;
	}

	private positionWikilinkSuggestPanel(
		textareaEl: HTMLTextAreaElement,
		panelEl: HTMLElement,
	): void {
		const caretOffset = this.measureTextareaCaretOffset(textareaEl);
		const horizontalPadding = 12;
		const verticalGap = 8;
		const maxPanelWidth = Math.min(420, Math.max(260, textareaEl.clientWidth - horizontalPadding * 2));
		const panelWidth = Math.min(maxPanelWidth, textareaEl.clientWidth);
		const maxLeft = Math.max(horizontalPadding, textareaEl.clientWidth - panelWidth);
		const nextLeft = Math.min(Math.max(caretOffset.left, horizontalPadding), maxLeft);
		const nextTop = Math.min(
			Math.max(caretOffset.top + caretOffset.lineHeight + verticalGap, verticalGap),
			Math.max(verticalGap, textareaEl.clientHeight - 16),
		);

		panelEl.style.width = `${panelWidth}px`;
		panelEl.style.left = `${nextLeft}px`;
		panelEl.style.top = `${nextTop}px`;
	}

	private measureTextareaCaretOffset(
		textareaEl: HTMLTextAreaElement,
	): { left: number; top: number; lineHeight: number } {
		const mirrorEl = document.createElement("div");
		const style = window.getComputedStyle(textareaEl);
		const textareaRect = textareaEl.getBoundingClientRect();
		const cursor = textareaEl.selectionStart ?? textareaEl.value.length;
		const contentBeforeCursor = textareaEl.value.slice(0, cursor);
		const contentAfterCursor = textareaEl.value.slice(cursor) || ".";

		mirrorEl.style.position = "absolute";
		mirrorEl.style.visibility = "hidden";
		mirrorEl.style.pointerEvents = "none";
		mirrorEl.style.whiteSpace = "pre-wrap";
		mirrorEl.style.wordBreak = "break-word";
		mirrorEl.style.overflowWrap = "anywhere";
		mirrorEl.style.boxSizing = "border-box";
		mirrorEl.style.left = "-9999px";
		mirrorEl.style.top = "0";
		mirrorEl.style.width = `${textareaRect.width}px`;
		mirrorEl.style.font = style.font;
		mirrorEl.style.fontFamily = style.fontFamily;
		mirrorEl.style.fontFeatureSettings = style.fontFeatureSettings;
		mirrorEl.style.fontKerning = style.fontKerning;
		mirrorEl.style.fontSize = style.fontSize;
		mirrorEl.style.fontStretch = style.fontStretch;
		mirrorEl.style.fontStyle = style.fontStyle;
		mirrorEl.style.fontVariant = style.fontVariant;
		mirrorEl.style.fontWeight = style.fontWeight;
		mirrorEl.style.letterSpacing = style.letterSpacing;
		mirrorEl.style.lineHeight = style.lineHeight;
		mirrorEl.style.padding = style.padding;
		mirrorEl.style.border = style.border;

		const beforeEl = document.createElement("span");
		beforeEl.textContent = contentBeforeCursor;
		mirrorEl.appendChild(beforeEl);

		const caretEl = document.createElement("span");
		caretEl.textContent = "\u200b";
		mirrorEl.appendChild(caretEl);

		const afterEl = document.createElement("span");
		afterEl.textContent = contentAfterCursor;
		mirrorEl.appendChild(afterEl);

		document.body.appendChild(mirrorEl);

		const lineHeight = Number.parseFloat(style.lineHeight) || Number.parseFloat(style.fontSize) * 1.6 || 22;
		const left = caretEl.offsetLeft - textareaEl.scrollLeft;
		const top = caretEl.offsetTop - textareaEl.scrollTop;

		mirrorEl.remove();

		return {
			left,
			top,
			lineHeight,
		};
	}
}
