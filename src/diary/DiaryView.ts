import { App, ItemView, MarkdownRenderer, moment as obsidianMoment, normalizePath, Notice, requestUrl, setIcon, TFile, TFolder, WorkspaceLeaf ,Platform, FuzzySuggestModal} from "obsidian";
import $ from "jquery";
import "turn.js";
import type * as Moment from "moment";
import type DiaryViewPlugin from "../main";
import {
	DEFAULT_DAILY_IMAGE_FRONTMATTER_KEY,
	DEFAULT_DAILY_IMAGE_DESC_FRONTMATTER_KEY,
	DEFAULT_DAILY_QUOTE_FRONTMATTER_KEY,
	type DiarySection,
	extractFirstImage,
	readAllBodyUnderHeadings,
	readArtworkImage,
	readDailyQuote,
	readFrontmatterString,
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
import { t, tCount, getMonthName, getShortWeekday, type Language } from "../i18n";
import type { CustomFrontmatterPicker, CustomFrontmatterPickerType } from "../settings";

const AUTOSAVE_DELAY_MS = 1500;
const DESKTOP_BREAKPOINT_QUERY = "(min-width: 960px)";
const SWIPE_MIN_DISTANCE_PX = 90;
const TURN_NATIVE_CORNER_SIZE_PX = 120;
const moment = obsidianMoment as unknown as (input?: Moment.MomentInput) => Moment.Moment;

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
	customFrontmatterValues: Record<string, string | null>;
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
	private imageCaptionSaveTimers = new Map<string, number>();
	private drafts = new Map<string, string>();
	private promptDrafts = new Map<string, string>();
	private imageCaptionDrafts = new Map<string, string>();
	private renderVersion = 0;
	private pendingQuoteRequests = new Map<string, Promise<string | null>>();
	private renderedContentByPath = new Map<string, DiaryPageContent>();
	private datePickerOpen = false;
	private datePickerMonth = new Date().getMonth();
	private datePickerYear = new Date().getFullYear();
	private datePickerCleanup: (() => void) | null = null;
	private customPickerOpen = false;
	private customPickerCleanup: (() => void) | null = null;
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
		return t("app.name", this.lang());
	}

	getIcon(): string {
		return "book-open-text";
	}

	private lang(): Language {
		return this.plugin.settings.language;
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
		this.closeCustomPicker();
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
		this.closeCustomPicker();
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
		if (!cloneEl.instanceOf(HTMLElement)) {
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
		const dayInfoEl = headerEl.createDiv({ cls: "diary-day-info" });
		const dayTextEl = dayInfoEl.createDiv({ cls: "diary-day-text" });
		dayTextEl.createSpan({ cls: "diary-day-name", text: dateInfo.fullDay });
		const dateLocale = this.lang() === "zh" ? "zh-CN" : undefined;
		const formattedDate = dateInfo.date.toLocaleDateString(dateLocale, { year: "numeric", month: "long", day: "numeric" });
		dayTextEl.createSpan({ cls: "diary-day-date", text: formattedDate });

		const datePickerButtonEl = headerEl.createEl("button", {
			cls: "diary-header-button",
			attr: {
				type: "button",
				"aria-label": t("calendar.pick-date", this.lang()),
				title: t("calendar.pick-date", this.lang()),
			},
		});
		setIcon(datePickerButtonEl, "calendar");
		datePickerButtonEl.addEventListener("click", (evt) => {
			this.toggleDatePicker(datePickerButtonEl, dateInfo);
			evt.stopPropagation();
		});

		const artworkWrapEl = pageEl.createDiv({ cls: "diary-artwork-wrap" });
		const artworkCardEl = artworkWrapEl.createDiv({ cls: "diary-artwork-card" });
		artworkCardEl.addEventListener("dblclick", () => {
			this.openImagePicker(content.filePath);
		});
		const artworkEl = artworkCardEl.createDiv({ cls: "diary-artwork" });
		const artworkImageSource = this.resolveArtworkImageSource(content.artworkImage, content.filePath);
		if (artworkImageSource) {
			artworkEl.addClass("has-custom-image");
			const imgEl = artworkEl.createEl("img", {
				cls: "diary-artwork-image",
				attr: {
					src: artworkImageSource,
					alt: content.imageCaption,
					loading: "lazy",
					referrerpolicy: "no-referrer",
				},
			});
			imgEl.addEventListener("error", () => {
				this.renderDefaultArtwork(artworkEl);
			});
		} else {
			this.renderDefaultArtwork(artworkEl);
		}
		const captionInputEl = artworkWrapEl.createEl("input", {
			cls: "diary-artwork-caption",
			attr: {
				type: "text",
				placeholder: t("caption.placeholder", this.lang()),
				value: content.imageCaption,
			},
		});
		captionInputEl.addEventListener("input", () => {
			const nextCaption = captionInputEl.value;
			content.imageCaption = nextCaption;
			this.imageCaptionDrafts.set(content.filePath, nextCaption);
			if (artworkEl.hasClass("has-custom-image")) {
				const imgEl = artworkEl.querySelector<HTMLImageElement>(".diary-artwork-image");
				if (imgEl) {
					imgEl.alt = nextCaption;
				}
			}
			this.scheduleImageCaptionSave(content.filePath, nextCaption);
		});

		const moodWrapEl = artworkWrapEl.createDiv({ cls: "diary-mood-wrap" });
		const moodScrollEl = moodWrapEl.createDiv({ cls: "diary-mood-scroll" });
		for (const picker of this.plugin.settings.customFrontmatterPickers) {
			const key = picker.key.trim();
			if (!key) continue;
			const triggerEl = moodScrollEl.createDiv({ cls: "diary-frontmatter-trigger" });
			triggerEl.dataset.filePath = content.filePath;
			triggerEl.dataset.pickerKey = key;
			const currentValue = content.customFrontmatterValues[key] ?? null;
			const pickerType = this.getCustomPickerType(picker);
			const matchedOption = currentValue
				? picker.options.find((opt) => opt.name === currentValue || opt.icon === currentValue)
				: null;
			if (pickerType === "text" && currentValue) {
				triggerEl.addClass("has-value");
				triggerEl.createSpan({ cls: "diary-frontmatter-text", text: `${picker.label || key}: ${currentValue}` });
			} else if (matchedOption) {
				triggerEl.addClass("has-value");
				const iconEl = triggerEl.createDiv({ cls: "diary-frontmatter-icon" });
				if (matchedOption.color) {
					iconEl.style.color = matchedOption.color;
				}
				setIcon(iconEl, matchedOption.icon || "tag");
				const label = picker.label || key;
				const textEl = triggerEl.createSpan({ cls: "diary-frontmatter-text", text: matchedOption.name || label });
				if (matchedOption.color) {
					textEl.style.color = matchedOption.color;
				}
			} else {
				triggerEl.createSpan({ cls: "diary-frontmatter-placeholder", text: picker.label || key });
			}
			triggerEl.addEventListener("click", (evt) => {
				this.toggleCustomPicker(triggerEl, content, picker);
				evt.stopPropagation();
			});
		}

		const calendarEl = pageEl.createDiv({ cls: "diary-calendar" });
		const weekendDays = this.plugin.settings.weekendDays;
		calendarDates.forEach((date) => {
			const dow = date.date.getDay();
			const isWeekend = weekendDays.includes(dow);
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
		const lang = this.lang();
		this.renderedContentByPath.set(content.filePath, content);
		const pageEl = parentEl.createDiv({
			cls: `diary-page diary-page-right${isBackFace ? " is-backface" : ""}`,
		});
		pageEl.dataset.filePath = content.filePath;
		this.renderPageBindingMarks(pageEl, "left");
		const draft = this.drafts.get(content.filePath);
		const hasBodyContent = (draft && draft.replace(/^#{1,6}\s+.*$/gm, "").trim().length > 0)
			|| content.sections.some((s) => s.content.trim().length > 0);
		const isPreview = this.isMarkdownPreview && !isBackFace && hasBodyContent;

		const promptCardEl = pageEl.createDiv({ cls: "diary-prompt-card" });
		const promptMetaEl = promptCardEl.createDiv({ cls: "diary-prompt-meta" });
		const promptLabelEl = promptMetaEl.createDiv({ cls: "diary-prompt-label" });
		const headphoneEl = promptLabelEl.createDiv({ cls: "diary-prompt-label-icon" });
		setIcon(headphoneEl, "quote");
		promptLabelEl.createSpan({ text: content.promptTitle });

		const promptEditorWrapEl = promptCardEl.createDiv({ cls: "diary-prompt-editor-wrap" });
		const promptTextEl = promptEditorWrapEl.createEl("textarea", {
			cls: "diary-prompt-text",
			attr: {
				placeholder: content.promptPlaceholder,
				"aria-label": `${t("quote.title", lang)} - ${content.filePath}`,
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
		const isMobile = Platform.isMobileApp;
		if (isMobile) {
        	setIcon(quillEl, "notepad-text-dashed"); // 移动端
		} else {
			setIcon(quillEl, "book-open-text");      // 桌面端
		}
		intentionLabelEl.createDiv({
			cls: "diary-intention-title",
			text: content.exists ? t("content.heading", lang) : t("content.empty-title", lang),
		});
		const intentionActionsEl = intentionHeadEl.createDiv({ cls: "diary-intention-actions" });

		const previewButtonEl = this.renderPromptAction(
			intentionActionsEl,
			isPreview ? "pencil" : "eye",
			isPreview ? t("content.edit-btn", lang) : t("content.preview-btn", lang),
		);
		previewButtonEl.addClass("diary-preview-toggle", "is-toggle", "diary-preview-mode-button");
		previewButtonEl.toggleClass("is-active", isPreview);
		if (!isBackFace) {
			previewButtonEl.addEventListener("click", () => {
				void this.togglePreviewWithSave(content.filePath);
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
				const lang = this.lang();
				const label = isPreview ? t("content.edit-btn", lang) : t("content.preview-btn", lang);
				previewButtonEl.setAttribute("aria-label", label);
				previewButtonEl.setAttribute("title", label);
				previewButtonEl.toggleClass("is-active", isPreview);
				setIcon(previewButtonEl, isPreview ? "pencil" : "eye");
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
		const lang = this.lang();
		linedPaperEl.empty();
		const hasSections = content.sections.length > 0;
		const fullMarkdown = this.drafts.has(content.filePath)
			? this.drafts.get(content.filePath)!
			: hasSections
				? content.sections.map((s) => (s.heading ? `${s.heading}\n${s.content}` : s.content)).join("\n\n")
				: "";
		this.updateFooterWordCount(footerCountEl, fullMarkdown);

		const hasBodyContent = fullMarkdown.replace(/^#{1,6}\s+.*$/gm, "").trim().length > 0;
		if (this.isMarkdownPreview && !isBackFace && hasBodyContent) {
			const previewEl = linedPaperEl.createDiv({ cls: "diary-markdown-preview markdown-rendered" });
			previewEl.addEventListener("dblclick", () => {
				void this.updateMarkdownPreviewMode(false);
			});
			if (fullMarkdown.trim()) {
				await MarkdownRenderer.render(this.app, fullMarkdown, previewEl, content.filePath, this);
				this.bindMarkdownLinks(previewEl, content.filePath);
			} else {
				previewEl.createDiv({ cls: "diary-note-empty", text: t("content.empty-preview", lang) });
			}
			return;
		}

		const editorWrapEl = linedPaperEl.createDiv({ cls: "diary-intention-editor-wrap" });
		const textareaEl = editorWrapEl.createEl("textarea", {
			cls: "diary-intention-textarea",
			attr: {
				placeholder: t("content.textarea-placeholder", lang),
				"aria-label": `${t("content.heading", lang)} ${content.filePath}`,
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
		this.bindClipboardImagePaste(textareaEl, content.filePath, (value) => {
			this.drafts.set(content.filePath, value);
			this.scheduleDailyNoteSave(content.filePath, value);
			this.updateFooterWordCount(footerCountEl, value);
		});
		this.bindTextareaWikilinkSuggest(textareaEl, wikilinkSuggestEl, content.filePath, (value) => {
			this.drafts.set(content.filePath, value);
			this.scheduleDailyNoteSave(content.filePath, value);
			this.updateFooterWordCount(footerCountEl, value);
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

	private renderDefaultArtwork(artworkEl: HTMLElement): void {
		artworkEl.removeClass("has-custom-image");
		artworkEl.empty();
		const skyEl = artworkEl.createDiv({ cls: "diary-artwork-sky" });
		this.renderCloud(skyEl, "is-main");
		this.renderCloud(skyEl, "is-small");
		const seaEl = artworkEl.createDiv({ cls: "diary-artwork-sea" });
		const boatEl = seaEl.createDiv({ cls: "diary-artwork-boat" });
		boatEl.createDiv({ cls: "diary-artwork-boat-person" });
		boatEl.createDiv({ cls: "diary-artwork-boat-base" });
		artworkEl.createDiv({ cls: "diary-artwork-sand" });
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

		const panelEl = activeDocument.body.createDiv({ cls: "diary-date-picker" });
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

		activeDocument.addEventListener("click", onClickOutside, true);
		activeDocument.addEventListener("keydown", onKeyDown);
		this.datePickerCleanup = () => {
			activeDocument.removeEventListener("click", onClickOutside, true);
			activeDocument.removeEventListener("keydown", onKeyDown);
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

	private toggleCustomPicker(anchorEl: HTMLElement, content: DiaryPageContent, picker: CustomFrontmatterPicker): void {
		if (this.customPickerOpen) {
			this.closeCustomPicker();
			return;
		}

		this.customPickerOpen = true;

		const panelEl = activeDocument.body.createDiv({ cls: "diary-mood-picker diary-custom-picker" });
		this.renderCustomPickerContent(panelEl, content, picker);

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
				this.closeCustomPicker();
			}
		};

		const onKeyDown = (evt: KeyboardEvent): void => {
			if (evt.key === "Escape") {
				this.closeCustomPicker();
			}
		};

		activeDocument.addEventListener("click", onClickOutside, true);
		activeDocument.addEventListener("keydown", onKeyDown);
		this.customPickerCleanup = () => {
			activeDocument.removeEventListener("click", onClickOutside, true);
			activeDocument.removeEventListener("keydown", onKeyDown);
			panelEl.remove();
		};
	}

	private closeCustomPicker(): void {
		if (this.customPickerCleanup) {
			this.customPickerCleanup();
			this.customPickerCleanup = null;
		}
		this.customPickerOpen = false;
	}

	private renderCustomPickerContent(panelEl: HTMLElement, content: DiaryPageContent, picker: CustomFrontmatterPicker): void {
		const lang = this.lang();
		const key = picker.key.trim();
		const currentValue = content.customFrontmatterValues[key] ?? null;
		const pickerType = this.getCustomPickerType(picker);

		const headerEl = panelEl.createDiv({ cls: "diary-mood-picker-header" });
		headerEl.createDiv({ cls: "diary-mood-picker-title", text: picker.label || key });
		if (currentValue) {
			const clearBtn = headerEl.createEl("button", {
				cls: "diary-mood-picker-clear",
				attr: {
					type: "button",
					"aria-label": t("custom-picker.clear", lang),
					title: t("custom-picker.clear", lang),
				},
			});
			setIcon(clearBtn, "x");
			clearBtn.addEventListener("click", (evt) => {
				evt.stopPropagation();
				this.closeCustomPicker();
				void this.applyCustomFrontmatterChange(content.filePath, key, null);
			});
		}

		if (pickerType === "text") {
			this.renderCustomTextPickerContent(panelEl, content, key, currentValue);
			return;
		}

		const gridEl = panelEl.createDiv({ cls: "diary-mood-picker-grid" });
		for (const opt of picker.options) {
			const isActive = currentValue === opt.name || currentValue === opt.icon;
			const itemEl = gridEl.createEl("button", {
				cls: `diary-mood-picker-item${isActive ? " is-active" : ""}`,
				attr: {
					type: "button",
					"aria-label": opt.name || opt.icon,
					title: opt.name || opt.icon,
				},
			});
			const iconEl = itemEl.createDiv({ cls: "diary-mood-picker-icon" });
			if (opt.color) {
				iconEl.style.color = opt.color;
			}
			setIcon(iconEl, opt.icon || "tag");
			const labelEl = itemEl.createSpan({ cls: "diary-mood-picker-label", text: opt.name || opt.icon });
			if (opt.color) {
				labelEl.style.color = opt.color;
			}
			itemEl.addEventListener("click", (evt) => {
				evt.stopPropagation();
				this.closeCustomPicker();
				void this.applyCustomFrontmatterChange(content.filePath, key, opt.name);
			});
		}
	}

	private renderCustomTextPickerContent(panelEl: HTMLElement, content: DiaryPageContent, key: string, currentValue: string | null): void {
		const lang = this.lang();
		const formEl = panelEl.createDiv({ cls: "diary-custom-text-picker-form" });
		const inputEl = formEl.createEl("input", {
			cls: "diary-custom-text-picker-input",
			attr: {
				type: "text",
				placeholder: t("custom-picker.text-placeholder", lang),
				value: currentValue ?? "",
			},
		});
		const saveBtn = formEl.createEl("button", {
			cls: "diary-custom-text-picker-save",
			attr: { type: "button" },
			text: t("custom-picker.save", lang),
		});
		const saveValue = (): void => {
			const nextValue = inputEl.value.trim();
			this.closeCustomPicker();
			void this.applyCustomFrontmatterChange(content.filePath, key, nextValue || null);
		};
		inputEl.addEventListener("keydown", (evt) => {
			if (evt.key === "Enter") {
				evt.preventDefault();
				saveValue();
			}
		});
		saveBtn.addEventListener("click", (evt) => {
			evt.stopPropagation();
			saveValue();
		});
		inputEl.focus();
		inputEl.select();
	}

	private async applyCustomFrontmatterChange(filePath: string, key: string, value: string | null): Promise<void> {
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
				if (value === null) {
					delete frontmatter[key];
				} else {
					frontmatter[key] = value;
				}
			});
		} catch (error) {
			console.warn("Failed to save custom frontmatter", error);
		}

		const cached = this.renderedContentByPath.get(filePath);
		if (cached) {
			cached.customFrontmatterValues[key] = value;
		}

		this.markFileCreated(filePath);
		this.updateCustomPickerDisplay(filePath);
	}

	private updateCustomPickerDisplay(filePath: string): void {
		const pickers = this.plugin.settings.customFrontmatterPickers;
		const cached = this.renderedContentByPath.get(filePath);
		const triggers = Array.from(this.contentEl.querySelectorAll<HTMLElement>(`.diary-frontmatter-trigger[data-file-path="${CSS.escape(filePath)}"]`));
		for (const triggerEl of triggers) {
			const key = triggerEl.dataset.pickerKey;
			if (!key) continue;
			const picker = pickers.find((p) => p.key.trim() === key);
			if (!picker) continue;
			const currentValue = cached?.customFrontmatterValues[key] ?? null;
			const pickerType = this.getCustomPickerType(picker);
			const matchedOption = currentValue
				? picker.options.find((opt) => opt.name === currentValue || opt.icon === currentValue)
				: null;
			triggerEl.empty();
			triggerEl.classList.toggle("has-value", pickerType === "text" ? !!currentValue : !!matchedOption);
			if (pickerType === "text" && currentValue) {
				triggerEl.createSpan({ cls: "diary-frontmatter-text", text: `${picker.label || key}: ${currentValue}` });
			} else if (matchedOption) {
				const iconEl = triggerEl.createDiv({ cls: "diary-frontmatter-icon" });
				if (matchedOption.color) {
					iconEl.style.color = matchedOption.color;
				}
				setIcon(iconEl, matchedOption.icon || "tag");
				const textEl = triggerEl.createSpan({ cls: "diary-frontmatter-text", text: matchedOption.name || picker.label || key });
				if (matchedOption.color) {
					textEl.style.color = matchedOption.color;
				}
			} else {
				triggerEl.createSpan({ cls: "diary-frontmatter-placeholder", text: picker.label || key });
			}
		}
	}

	private getCustomPickerType(picker: CustomFrontmatterPicker): CustomFrontmatterPickerType {
		return picker.type ?? "options";
	}

	private renderDatePickerContent(panelEl: HTMLElement): void {
		const lang = this.lang();
		const startOfWeek = this.plugin.settings.startOfWeek;
		const weekDays = Array.from({ length: 7 }, (_, i) => getShortWeekday((startOfWeek + i) % 7, lang));

		const headerEl = panelEl.createDiv({ cls: "diary-date-picker-header" });
		const prevBtn = headerEl.createEl("button", {
			cls: "diary-date-picker-nav",
			attr: { type: "button", "aria-label": t("calendar.prev-month", lang) },
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

		headerEl.createSpan({
			cls: "diary-date-picker-title",
			text: `${getMonthName(this.datePickerMonth, lang)} ${this.datePickerYear}`,
		});

		const nextBtn = headerEl.createEl("button", {
			cls: "diary-date-picker-nav",
			attr: { type: "button", "aria-label": t("calendar.next-month", lang) },
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
		todayBtn.createSpan({ text: t("calendar.today", lang) });
		todayBtn.addEventListener("click", (evt) => {
			evt.stopPropagation();
			const today = new Date();
			today.setHours(0, 0, 0, 0);
			this.closeDatePicker();
			this.navigateToDate(today);
		});
	}

	private refreshDatePickerContent(panelEl: HTMLElement): void {
		const lang = this.lang();
		const titleEl = panelEl.querySelector(".diary-date-picker-title");
		if (titleEl) {
			titleEl.textContent = `${getMonthName(this.datePickerMonth, lang)} ${this.datePickerYear}`;
		}

		const gridEl = panelEl.querySelector(".diary-date-picker-grid");
		if (gridEl) {
			const days = gridEl.querySelectorAll(".diary-date-picker-day, .diary-date-picker-empty");
			days.forEach((el) => el.remove());
			this.renderDatePickerDays(gridEl as HTMLElement);
		}
	}

	private renderDatePickerDays(gridEl: HTMLElement): void {
		const firstDay = new Date(this.datePickerYear, this.datePickerMonth, 1).getDay();
		const startOfWeek = this.plugin.settings.startOfWeek;
		const leadingEmpty = (firstDay - startOfWeek + 7) % 7;
		const daysInMonth = new Date(this.datePickerYear, this.datePickerMonth + 1, 0).getDate();
		const activeDate = this.getDateById(this.activeDateId);
		const today = new Date();
		today.setHours(0, 0, 0, 0);

		for (let i = 0; i < leadingEmpty; i++) {
			gridEl.createSpan({ cls: "diary-date-picker-empty" });
		}

		for (let day = 1; day <= daysInMonth; day++) {
			const cellDate = new Date(this.datePickerYear, this.datePickerMonth, day);
			cellDate.setHours(0, 0, 0, 0);

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

		const ns = "http://www.w3.org/2000/svg";
		const svg = activeDocument.createElementNS(ns, "svg") as SVGSVGElement;
		svg.setAttribute("width", "40");
		svg.setAttribute("height", "16");
		svg.setAttribute("viewBox", "0 0 40 16");
		svg.setAttribute("fill", "none");
		svg.setAttribute("aria-hidden", "true");
		ringEl.appendChild(svg);

		const addCircle = (cx: string, cy: string, r: string, cls: string) => {
			const el = activeDocument.createElementNS(ns, "circle");
			el.setAttribute("cx", cx);
			el.setAttribute("cy", cy);
			el.setAttribute("r", r);
			el.setAttribute("class", cls);
			svg.appendChild(el);
		};
		const addPath = (d: string, cls: string) => {
			const el = activeDocument.createElementNS(ns, "path");
			el.setAttribute("d", d);
			el.setAttribute("class", cls);
			svg.appendChild(el);
		};

		addCircle("8", "8", "3.5", "diary-ring-hole");
		addCircle("8", "8", "2.5", "diary-ring-core");
		addCircle("32", "8", "3.5", "diary-ring-hole");
		addCircle("32", "8", "2.5", "diary-ring-core");
		addPath("M 6 8.5 C 14 1, 26 1, 34 8.5", "diary-ring-metal diary-ring-metal-main");
		addPath("M 6 8 C 14 1, 26 1, 34 8", "diary-ring-metal diary-ring-metal-highlight");
		addPath("M 6 9 C 14 2, 26 2, 34 9", "diary-ring-metal diary-ring-metal-shadow");
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
		const turnProbe = $(activeDocument.createElement("div")) as Partial<TurnBook>;
		return typeof turnProbe.turn === "function";
	}

	private getDailyQuoteFrontmatterKey(): string {
		return this.plugin.settings.dailyQuoteFrontmatterKey?.trim() || DEFAULT_DAILY_QUOTE_FRONTMATTER_KEY;
	}

	private getDailyImageDescFrontmatterKey(): string {
		return this.plugin.settings.dailyImageDescFrontmatterKey?.trim() || DEFAULT_DAILY_IMAGE_DESC_FRONTMATTER_KEY;
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
		const lang = this.lang();
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
		const dailyQuote = readDailyQuote(frontmatter, quoteFrontmatterKey) ?? await this.fetchAndCacheDailyQuote(file);
		const imageFrontmatterKey = this.plugin.settings.dailyImageFrontmatterKey || DEFAULT_DAILY_IMAGE_FRONTMATTER_KEY;
		let artworkImage = readArtworkImage(frontmatter, imageFrontmatterKey);
		if (!artworkImage && this.plugin.settings.useFirstImageAsArtwork) {
			artworkImage = extractFirstImage(body);
		}
		const imageCaption = readFrontmatterString(frontmatter, this.getDailyImageDescFrontmatterKey(), true) ?? "";
		const customFrontmatterValues: Record<string, string | null> = {};
		for (const picker of this.plugin.settings.customFrontmatterPickers) {
			const key = picker.key.trim();
			if (key) {
				customFrontmatterValues[key] = readFrontmatterString(frontmatter, key);
			}
		}

		return {
			imageCaption,
			artworkImage,
			promptTitle: t("quote.title", lang),
			promptText: dailyQuote ?? "",
			promptPlaceholder: t("quote.placeholder-existing", lang),
			time: this.formatTime(new Date(file.stat.mtime)),
			filePath: file.path,
			sections,
			markdown,
			wordCount,
			exists: true,
			customFrontmatterValues,
		};
	}

	private createMissingContent(date: DiaryDateItem): DiaryPageContent {
		const lang = this.lang();
		const configuredHeading = this.plugin.settings.dailyNoteHeading.trim();
		const sections = configuredHeading
			? configuredHeading
				.split(/[\n,;]+/)
				.map((h) => h.trim())
				.filter(Boolean)
				.map((h) => ({
					heading: /^#{1,6}\s+/.test(h) ? h : `## ${h}`,
					content: "",
				}))
			: [];
		const markdown = sections.map((s) => s.heading).join("\n\n");
		return {
			imageCaption: "",
			artworkImage: null,
			promptTitle: t("quote.title", lang),
			promptText: "",
			promptPlaceholder: t("quote.placeholder-new", lang),
			time: date.path,
			filePath: date.path,
			sections,
			markdown,
			wordCount: 0,
			exists: false,
			customFrontmatterValues: {},
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

	private buildDateItems(centerDate = new Date()): DiaryDateItem[] {
		const center = new Date(centerDate);
		center.setHours(0, 0, 0, 0);
		const startOfWeek = this.plugin.settings.startOfWeek;
		const currentDow = center.getDay();
		const diffToStart = (currentDow - startOfWeek + 7) % 7;
		const weekStart = new Date(center);
		weekStart.setDate(center.getDate() - diffToStart);
		return Array.from({ length: 7 }, (_, index) => {
			const date = new Date(weekStart);
			date.setDate(weekStart.getDate() + index);
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
		const lang = this.lang();
		const target = new Date(date);
		target.setHours(0, 0, 0, 0);
		const today = new Date();
		today.setHours(0, 0, 0, 0);
		const dayOffset = Math.round((target.getTime() - today.getTime()) / 86_400_000);
		if (dayOffset === 0) {
			return t("calendar.today", lang);
		}
		if (dayOffset === -1) {
			return t("calendar.yesterday", lang);
		}
		if (dayOffset === 1) {
			return t("calendar.tomorrow", lang);
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
		const lang = this.lang();
		if (part === "day") {
			return String(date.getDate()).padStart(2, "0");
		}
		if (part === "year") {
			return String(date.getFullYear());
		}
		if (part === "shortMonth") {
			// Use abbreviated month name
			return date.toLocaleDateString(lang === "zh" ? "zh-CN" : undefined, { month: "short" });
		}
		return date.toLocaleDateString(lang === "zh" ? "zh-CN" : undefined, { weekday: part === "shortWeekday" ? "short" : "long" });
	}

	private formatTime(date: Date): string {
		return date.toLocaleTimeString(this.lang() === "zh" ? "zh-CN" : undefined, { hour: "2-digit", minute: "2-digit" });
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
		return tCount("wordcount.chars", this.lang(), count);
	}

	private createPreviewText(markdown: string): string {
		const lang = this.lang();
		const firstLine = markdown
			.split("\n")
			.map((line) => line.replace(/^#+\s*/, "").trim())
			.find(Boolean);
		return firstLine ?? t("content.empty-summary", lang);
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

	private scheduleImageCaptionSave(path: string, imageCaption: string): void {
		const existingTimer = this.imageCaptionSaveTimers.get(path);
		if (existingTimer !== undefined) {
			window.clearTimeout(existingTimer);
		}

		const timerId = window.setTimeout(() => {
			this.imageCaptionSaveTimers.delete(path);
			void this.saveImageCaption(path, imageCaption);
		}, AUTOSAVE_DELAY_MS);
		this.imageCaptionSaveTimers.set(path, timerId);
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

	private async saveImageCaption(path: string, imageCaption: string): Promise<void> {
		let file = this.app.vault.getAbstractFileByPath(path);
		if (!(file instanceof TFile)) {
			await this.ensureParentFolder(path);
			this.plugin.suppressVaultRefresh(path, 1000);
			file = await this.app.vault.create(path, "");
		}

		if (!(file instanceof TFile)) {
			return;
		}

		const normalizedCaption = imageCaption.trim();
		try {
			this.plugin.suppressVaultRefresh(path, 1000);
			await this.app.fileManager.processFrontMatter(file, (frontmatter: Record<string, unknown>) => {
				const key = this.getDailyImageDescFrontmatterKey();
				if (normalizedCaption) {
					frontmatter[key] = normalizedCaption;
				} else {
					delete frontmatter[key];
				}
			});
			this.imageCaptionDrafts.set(path, imageCaption);
			const cached = this.renderedContentByPath.get(path);
			if (cached) {
				cached.imageCaption = imageCaption;
			}
		} catch (error) {
			console.warn("Failed to save image caption in frontmatter", error);
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

			// Auto-update first image to frontmatter if enabled
			if (this.plugin.settings.autoUpdateFirstImageToFrontmatter) {
				await this.autoUpdateFirstImageToFrontmatter(file, nextBody);
			}
		} else {
			await this.ensureParentFolder(path);
			const nextBody = writeAllBodyUnderHeadings("", this.plugin.settings.dailyNoteHeading, sections);
			this.plugin.suppressVaultRefresh(path);
			const newFile = await this.app.vault.create(path, nextBody);

			// Auto-update first image to frontmatter if enabled
			if (this.plugin.settings.autoUpdateFirstImageToFrontmatter && newFile instanceof TFile) {
				await this.autoUpdateFirstImageToFrontmatter(newFile, nextBody);
			}
		}
		this.drafts.set(path, normalizedMarkdown);
	}

	private async autoUpdateFirstImageToFrontmatter(file: TFile, body: string): Promise<void> {
		const firstImage = extractFirstImage(body);
		if (!firstImage) {
			return;
		}

		const imageKey = this.plugin.settings.dailyImageFrontmatterKey || DEFAULT_DAILY_IMAGE_FRONTMATTER_KEY;
		try {
			this.plugin.suppressVaultRefresh(file.path, 1000);
			await this.app.fileManager.processFrontMatter(file, (frontmatter: Record<string, unknown>) => {
				frontmatter[imageKey] = firstImage;
			});

			const cached = this.renderedContentByPath.get(file.path);
			if (cached) {
				cached.artworkImage = firstImage;
			}
		} catch (error) {
			console.warn("Failed to auto-update first image to frontmatter", error);
		}
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

	private async forceSavePage(filePath: string): Promise<void> {
		await this.flushPendingNoteSave(filePath);
		await this.flushPendingPromptSave(filePath);
		this.markFileCreated(filePath);
		// new Notice(t("content.save-notice", this.lang()));
	}

	private markFileCreated(filePath: string): void {
		const cached = this.renderedContentByPath.get(filePath);
		const wasMissing = !cached?.exists;
		if (cached && !cached.exists) {
			cached.exists = this.app.vault.getAbstractFileByPath(filePath) instanceof TFile;
		}
		if (!cached?.exists || !wasMissing) {
			return;
		}

		const dateItem = this.dates.find((d) => d.path === filePath);
		if (dateItem) {
			dateItem.hasNote = true;
		}

		void this.render();
	}

	private async togglePreviewWithSave(filePath: string): Promise<void> {
		await this.forceSavePage(filePath);
		await this.updateMarkdownPreviewMode(!this.isMarkdownPreview);
	}

	private async flushPendingSaves(): Promise<void> {
		const notePaths = Array.from(this.saveTimers.keys());
		const promptPaths = Array.from(this.promptSaveTimers.keys());
		const imageCaptionPaths = Array.from(this.imageCaptionSaveTimers.keys());
		await Promise.all([
			...notePaths.map((path) => this.flushPendingNoteSave(path)),
			...promptPaths.map((path) => this.flushPendingPromptSave(path)),
			...imageCaptionPaths.map((path) => this.flushPendingImageCaptionSave(path)),
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

	private async flushPendingImageCaptionSave(path: string): Promise<void> {
		const timerId = this.imageCaptionSaveTimers.get(path);
		if (timerId !== undefined) {
			window.clearTimeout(timerId);
			this.imageCaptionSaveTimers.delete(path);
		}

		const draft = this.imageCaptionDrafts.get(path);
		if (draft !== undefined) {
			await this.saveImageCaption(path, draft);
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

	private bindClipboardImagePaste(
		textareaEl: HTMLTextAreaElement,
		sourcePath: string,
		onChange: (value: string) => void,
	): void {
		textareaEl.addEventListener("paste", (event) => {
			const imageFiles = this.getClipboardImageFiles(event);
			if (imageFiles.length === 0) {
				return;
			}

			event.preventDefault();
			void this.insertClipboardImages(textareaEl, sourcePath, imageFiles, onChange);
		});
	}

	private getClipboardImageFiles(event: ClipboardEvent): File[] {
		const clipboardData = event.clipboardData;
		if (!clipboardData) {
			return [];
		}

		return Array.from(clipboardData.files).filter((file) => file.type.startsWith("image/"));
	}

	private async insertClipboardImages(
		textareaEl: HTMLTextAreaElement,
		sourcePath: string,
		imageFiles: File[],
		onChange: (value: string) => void,
	): Promise<void> {
		try {
			const links: string[] = [];
			for (const imageFile of imageFiles) {
				const attachmentFile = await this.saveClipboardImageAttachment(imageFile, sourcePath);
				links.push(`!${this.app.fileManager.generateMarkdownLink(attachmentFile, sourcePath)}`);
			}

			this.insertTextAtTextareaSelection(textareaEl, links.join("\n"));
			onChange(textareaEl.value);
		} catch (error) {
			console.warn("Failed to paste clipboard image", error);
			new Notice("Failed to paste image.");
		}
	}

	private async saveClipboardImageAttachment(imageFile: File, sourcePath: string): Promise<TFile> {
		const filename = this.createClipboardImageFilename(imageFile);
		const attachmentPath = await this.app.fileManager.getAvailablePathForAttachment(filename, sourcePath);
		this.plugin.suppressVaultRefresh(attachmentPath, 1000);
		return this.app.vault.createBinary(attachmentPath, await imageFile.arrayBuffer());
	}

	private createClipboardImageFilename(imageFile: File): string {
		const extension = this.getImageFileExtension(imageFile);
		const rawName = imageFile.name && imageFile.name !== "image.png"
			? imageFile.name
			: `Pasted image ${moment(new Date()).format("YYYYMMDDHHmmss")}.${extension}`;
		return rawName.replace(/[\\/:*?"<>|]/g, "-");
	}

	private getImageFileExtension(imageFile: File): string {
		const extensionFromName = imageFile.name.split(".").pop();
		if (extensionFromName && extensionFromName !== imageFile.name) {
			return extensionFromName.toLowerCase();
		}

		const extensionFromType = imageFile.type.replace(/^image\//, "").toLowerCase();
		return extensionFromType === "jpeg" ? "jpg" : extensionFromType || "png";
	}

	private insertTextAtTextareaSelection(textareaEl: HTMLTextAreaElement, text: string): void {
		const selectionStart = textareaEl.selectionStart ?? textareaEl.value.length;
		const selectionEnd = textareaEl.selectionEnd ?? selectionStart;
		const before = textareaEl.value.slice(0, selectionStart);
		const after = textareaEl.value.slice(selectionEnd);
		const prefix = before && !before.endsWith("\n") ? "\n" : "";
		const suffix = after && !after.startsWith("\n") ? "\n" : "";
		const insertedText = `${prefix}${text}${suffix}`;
		const nextCursor = before.length + insertedText.length;

		textareaEl.value = `${before}${insertedText}${after}`;
		textareaEl.focus();
		textareaEl.setSelectionRange(nextCursor, nextCursor);
		textareaEl.dispatchEvent(new Event("input", { bubbles: true }));
	}

	private updateFooterWordCount(parentEl: HTMLElement, markdown: string): void {
		parentEl.setText(this.formatWordCount(this.countWords(markdown)));
	}

	private resizePromptTextarea(textareaEl: HTMLTextAreaElement): void {
		textareaEl.setCssProps({ height: "auto" });
		textareaEl.setCssProps({ height: `${textareaEl.scrollHeight}px` });
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
		const lang = this.lang();
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
				const typeKey = item.type === "file"
					? "wikilink.type-file"
					: item.type === "heading"
						? "wikilink.type-heading"
						: item.type === "paragraph"
							? "wikilink.type-paragraph"
							: "wikilink.type-block";

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
				typeEl.setText(t(typeKey, lang));

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
				if (activeDocument.activeElement === textareaEl) {
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
			new Notice(t("app.file-not-found", this.lang()));
			return null;
		}

		const rawContent = (await this.app.vault.cachedRead(file)).replace(/\r\n/g, "\n");
		if (item.appendOffset < 0 || item.appendOffset > rawContent.length) {
			new Notice(t("app.cannot-locate-paragraph", this.lang()));
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
		const mirrorEl = activeDocument.createElement("div");
		const style = window.getComputedStyle(textareaEl);
		const textareaRect = textareaEl.getBoundingClientRect();
		const cursor = textareaEl.selectionStart ?? textareaEl.value.length;
		const contentBeforeCursor = textareaEl.value.slice(0, cursor);
		const contentAfterCursor = textareaEl.value.slice(cursor) || ".";

		Object.assign(mirrorEl.style, {
			position: "absolute",
			visibility: "hidden",
			pointerEvents: "none",
			whiteSpace: "pre-wrap",
			wordBreak: "break-word",
			overflowWrap: "anywhere",
			boxSizing: "border-box",
			left: "-9999px",
			top: "0",
			width: `${textareaRect.width}px`,
			font: style.font,
			fontFamily: style.fontFamily,
			fontFeatureSettings: style.fontFeatureSettings,
			fontKerning: style.fontKerning,
			fontSize: style.fontSize,
			fontStretch: style.fontStretch,
			fontStyle: style.fontStyle,
			fontVariant: style.fontVariant,
			fontWeight: style.fontWeight,
			letterSpacing: style.letterSpacing,
			lineHeight: style.lineHeight,
			padding: style.padding,
			border: style.border,
		});

		const beforeEl = activeDocument.createElement("span");
		beforeEl.textContent = contentBeforeCursor;
		mirrorEl.appendChild(beforeEl);

		const caretEl = activeDocument.createElement("span");
		caretEl.textContent = "\u200b";
		mirrorEl.appendChild(caretEl);

		const afterEl = activeDocument.createElement("span");
		afterEl.textContent = contentAfterCursor;
		mirrorEl.appendChild(afterEl);

		activeDocument.body.appendChild(mirrorEl);

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

	private openImagePicker(filePath: string): void {
		const imageFiles = this.app.vault.getFiles().filter((file) =>
			file.extension.match(/^png|jpe?g|gif|bmp|webp|svg|ico$/i)
		);

		if (imageFiles.length === 0) {
			new Notice(t("image-picker.no-images", this.lang()));
			return;
		}

		const modal = new ImagePickerModal(this.app, imageFiles, (selectedFile) => {
			void this.updateArtworkImage(filePath, selectedFile);
		});
		modal.open();
	}

	private async updateArtworkImage(filePath: string, imageFile: TFile): Promise<void> {
		let file = this.app.vault.getAbstractFileByPath(filePath);
		if (!(file instanceof TFile)) {
			await this.ensureParentFolder(filePath);
			this.plugin.suppressVaultRefresh(filePath, 1500);
			file = await this.app.vault.create(filePath, "");
		}

		if (!(file instanceof TFile)) {
			return;
		}

		const imageKey = this.plugin.settings.dailyImageFrontmatterKey || DEFAULT_DAILY_IMAGE_FRONTMATTER_KEY;
		const wikilink = `[[${imageFile.path}]]`;

		try {
			this.plugin.suppressVaultRefresh(filePath, 1500);
			await this.app.fileManager.processFrontMatter(file, (frontmatter: Record<string, unknown>) => {
				frontmatter[imageKey] = wikilink;
			});

			const cached = this.renderedContentByPath.get(filePath);
			if (cached) {
				cached.artworkImage = wikilink;
			}

			this.markFileCreated(filePath);
			void this.render();
		} catch (error) {
			console.warn("Failed to update artwork image", error);
			new Notice(t("image-picker.update-failed", this.lang()));
		}
	}
}

class ImagePickerModal extends FuzzySuggestModal<TFile> {
	private imageFiles: TFile[];
	private onChoose: (file: TFile) => void;

	constructor(app: App, imageFiles: TFile[], onChoose: (file: TFile) => void) {
		super(app);
		this.imageFiles = imageFiles;
		this.onChoose = onChoose;
		this.setPlaceholder("选择图片文件...");
	}

	getItems(): TFile[] {
		return this.imageFiles;
	}

	getItemText(file: TFile): string {
		return file.path;
	}

	onChooseItem(file: TFile, evt: MouseEvent | KeyboardEvent): void {
		this.onChoose(file);
	}
}
