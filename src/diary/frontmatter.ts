export function splitFrontmatter(content: string): { frontmatter: string; body: string } {
	if (!content.startsWith("---")) {
		return { frontmatter: "", body: content };
	}

	const frontmatterEnd = content.indexOf("\n---", 3);
	if (frontmatterEnd === -1) {
		return { frontmatter: "", body: content };
	}

	const bodyStart = frontmatterEnd + 4;
	return {
		frontmatter: content.slice(0, bodyStart).trimEnd(),
		body: content.slice(bodyStart).trimStart(),
	};
}

interface MarkdownHeadingMatch {
	headingLine: string;
	level: number;
	title: string;
	start: number;
	contentStart: number;
	end: number;
}

export const DAILY_QUOTE_FRONTMATTER_KEY = "daily-quote";

const DAILY_WEATHER_FRONTMATTER_KEY = "daily-weather";
export const DEFAULT_DAILY_IMAGE_FRONTMATTER_KEY = "daily-image";

export function readFrontmatterString(frontmatter: unknown, key: string, includeEmpty = false): string | null {
	if (!frontmatter || typeof frontmatter !== "object") {
		return null;
	}

	const value = (frontmatter as Record<string, unknown>)[key];
	if (Array.isArray(value)) {
		for (const item of value) {
			const itemValue = readFrontmatterValueString(item, includeEmpty);
			if (itemValue !== null) {
				return itemValue;
			}
		}
		return null;
	}

	return readFrontmatterValueString(value, includeEmpty);
}

function readFrontmatterValueString(value: unknown, includeEmpty: boolean): string | null {
	if (typeof value === "string") {
		const trimmed = value.trim();
		return trimmed || (includeEmpty ? "" : null);
	}

	if (typeof value === "number" || typeof value === "boolean") {
		return String(value);
	}

	return null;
}

export function readDailyQuote(frontmatter: unknown): string | null {
	return readFrontmatterString(frontmatter, DAILY_QUOTE_FRONTMATTER_KEY, true);
}

export function readWeatherIcon(frontmatter: unknown): string | null {
	return readFrontmatterString(frontmatter, DAILY_WEATHER_FRONTMATTER_KEY);
}

export function readArtworkImage(frontmatter: unknown, key: string = DEFAULT_DAILY_IMAGE_FRONTMATTER_KEY): string | null {
	return readFrontmatterString(frontmatter, key);
}

export function readBodyUnderHeading(body: string, configuredHeading: string): string {
	const trimmedHeading = configuredHeading.trim();
	if (!trimmedHeading) {
		return body.trimEnd();
	}

	const heading = findHeadingSection(body, trimmedHeading);
	return heading ? body.slice(heading.contentStart, heading.end).trim() : "";
}

export function writeBodyUnderHeading(body: string, configuredHeading: string, nextSectionBody: string): string {
	const trimmedHeading = configuredHeading.trim();
	const trimmedSectionBody = nextSectionBody.trimEnd();
	if (!trimmedHeading) {
		return trimmedSectionBody;
	}

	const heading = findHeadingSection(body, trimmedHeading);
	if (!heading) {
		return appendHeadingSection(body, trimmedHeading, trimmedSectionBody);
	}

	return joinHeadingSection(
		body.slice(0, heading.start),
		heading.headingLine,
		trimmedSectionBody,
		body.slice(heading.end),
	);
}

function appendHeadingSection(body: string, configuredHeading: string, sectionBody: string): string {
	const trimmedBody = body.trim();
	const headingLine = createHeadingLine(configuredHeading);
	let nextBody = trimmedBody ? `${trimmedBody}\n\n${headingLine}` : headingLine;
	if (sectionBody) {
		nextBody += `\n${sectionBody}`;
	}
	return nextBody;
}

function joinHeadingSection(before: string, headingLine: string, sectionBody: string, after: string): string {
	const trimmedBefore = before.trimEnd();
	const trimmedAfter = after.trimStart();

	let nextBody = trimmedBefore ? `${trimmedBefore}\n\n${headingLine}` : headingLine;
	if (sectionBody) {
		nextBody += `\n${sectionBody}`;
	}
	if (trimmedAfter) {
		nextBody += `\n\n${trimmedAfter}`;
	}

	return nextBody;
}

function createHeadingLine(configuredHeading: string): string {
	const trimmedHeading = configuredHeading.trim();
	if (/^#{1,6}\s+/.test(trimmedHeading)) {
		return trimmedHeading;
	}
	return `## ${trimmedHeading}`;
}

function findHeadingSection(body: string, configuredHeading: string): MarkdownHeadingMatch | null {
	const headings = getHeadingMatches(body);
	if (headings.length === 0) {
		return null;
	}

	const normalizedConfiguredTitle = normalizeHeadingTitle(configuredHeading);
	return headings.find((heading) => normalizeHeadingTitle(heading.title) === normalizedConfiguredTitle) ?? null;
}

function getHeadingMatches(body: string): MarkdownHeadingMatch[] {
	const headingLineRegex = /^(#{1,6})[ \t]+(.+?)\s*#*\s*$/gm;
	const headings: Array<Omit<MarkdownHeadingMatch, "end">> = [];
	let match: RegExpExecArray | null;

	while ((match = headingLineRegex.exec(body)) !== null) {
		const fullMatch = match[0];
		const hashes = match[1] ?? "";
		const title = match[2] ?? "";
		const start = match.index;
		const contentStart = start + fullMatch.length + (body.slice(start + fullMatch.length, start + fullMatch.length + 2) === "\r\n" ? 2 : body[start + fullMatch.length] === "\n" ? 1 : 0);

		headings.push({
			headingLine: fullMatch,
			level: hashes.length,
			title,
			start,
			contentStart,
		});
	}

	return headings.map((heading, index) => {
		let end = body.length;
		for (let nextIndex = index + 1; nextIndex < headings.length; nextIndex += 1) {
			const nextHeading = headings[nextIndex];
			if (!nextHeading) {
				continue;
			}
			if (nextHeading.level <= heading.level) {
				end = nextHeading.start;
				break;
			}
		}

		return {
			...heading,
			end,
		};
	});
}

function normalizeHeadingTitle(value: string): string {
	return value
		.trim()
		.replace(/^#{1,6}\s+/, "")
		.replace(/\s*#*\s*$/, "")
		.trim()
		.toLocaleLowerCase();
}
