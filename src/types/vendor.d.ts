declare module "page-flip" {
	export interface Point {
		x: number;
		y: number;
	}

	export interface PageRect {
		left: number;
		top: number;
		width: number;
		height: number;
		pageWidth: number;
	}

	export type SizeType = "fixed" | "stretch";

	export interface FlipSetting {
		startPage: number;
		size: SizeType;
		width: number;
		height: number;
		minWidth: number;
		maxWidth: number;
		minHeight: number;
		maxHeight: number;
		drawShadow: boolean;
		flippingTime: number;
		usePortrait: boolean;
		startZIndex: number;
		autoSize: boolean;
		maxShadowOpacity: number;
		showCover: boolean;
		mobileScrollSupport: boolean;
		clickEventForward: boolean;
		useMouseEvents: boolean;
		swipeDistance: number;
		showPageCorners: boolean;
		disableFlipByClick: boolean;
	}

	export const enum FlipCorner {
		TOP = "top",
		BOTTOM = "bottom",
	}

	export const enum FlippingState {
		USER_FOLD = "user_fold",
		FOLD_CORNER = "fold_corner",
		FLIPPING = "flipping",
		READ = "read",
	}

	export const enum Orientation {
		PORTRAIT = "portrait",
		LANDSCAPE = "landscape",
	}

	export type WidgetEventData = number | string | boolean | object;

	export interface WidgetEvent {
		data: WidgetEventData;
		object: PageFlip;
	}

	type EventCallback = (e: WidgetEvent) => void;

	export abstract class EventObject {
		on(eventName: string, callback: EventCallback): EventObject;
		off(event: string): void;
	}

	export class PageFlip extends EventObject {
		constructor(inBlock: HTMLElement, setting: Partial<FlipSetting>);
		destroy(): void;
		update(): void;
		loadFromImages(imagesHref: string[]): void;
		loadFromHTML(items: NodeListOf<HTMLElement> | HTMLElement[]): void;
		updateFromImages(imagesHref: string[]): void;
		updateFromHtml(items: NodeListOf<HTMLElement> | HTMLElement[]): void;
		clear(): void;
		turnToPrevPage(): void;
		turnToNextPage(): void;
		turnToPage(page: number): void;
		flipNext(corner?: FlipCorner): void;
		flipPrev(corner?: FlipCorner): void;
		flip(page: number, corner?: FlipCorner): void;
		updateState(newState: FlippingState): void;
		updatePageIndex(newPage: number): void;
		updateOrientation(newOrientation: Orientation): void;
		getPageCount(): number;
		getCurrentPageIndex(): number;
		getOrientation(): Orientation;
		getBoundsRect(): PageRect;
		getSettings(): FlipSetting;
		getState(): FlippingState;
		startUserTouch(pos: Point): void;
		userMove(pos: Point, isTouch: boolean): void;
		userStop(pos: Point, isSwipe?: boolean): void;
	}
}
