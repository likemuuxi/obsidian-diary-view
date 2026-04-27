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

export const DEFAULT_DAILY_QUOTE_FRONTMATTER_KEY = "daily-quote";
export const DEFAULT_DAILY_WEATHER_FRONTMATTER_KEY = "daily-weather";
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

export function readDailyQuote(frontmatter: unknown, key: string = DEFAULT_DAILY_QUOTE_FRONTMATTER_KEY): string | null {
	return readFrontmatterString(frontmatter, key, true);
}

export function readWeatherIcon(frontmatter: unknown, key: string = DEFAULT_DAILY_WEATHER_FRONTMATTER_KEY): string | null {
	return readFrontmatterString(frontmatter, key);
}

export function readArtworkImage(frontmatter: unknown, key: string = DEFAULT_DAILY_IMAGE_FRONTMATTER_KEY): string | null {
	return readFrontmatterString(frontmatter, key);
}

export interface DiarySection {
	heading: string;
	content: string;
}

export function readAllBodyUnderHeadings(body: string, configuredHeading: string): DiarySection[] {
	const headings = parseConfiguredHeadings(configuredHeading);
	if (headings.length === 0) {
		return [{ heading: "", content: body.trimEnd() }];
	}

	const allMatches = getHeadingMatches(body);
	const result: DiarySection[] = [];

	for (const configuredHeading of headings) {
		const normalizedTitle = normalizeHeadingTitle(configuredHeading);
		const match = allMatches.find((h) => normalizeHeadingTitle(h.title) === normalizedTitle);
		if (match) {
			result.push({
				heading: match.headingLine,
				content: body.slice(match.contentStart, match.end).trim(),
			});
		} else {
			result.push({
				heading: createHeadingLine(configuredHeading),
				content: "",
			});
		}
	}

	return result;
}

export function writeAllBodyUnderHeadings(body: string, configuredHeading: string, sections: DiarySection[]): string {
	const headings = parseConfiguredHeadings(configuredHeading);
	if (headings.length === 0) {
		return sections.map((s) => s.content).join("\n\n").trimEnd();
	}

	const allMatches = getHeadingMatches(body);
	let nextBody = body;
	const processedHeadings = new Set<string>();

	for (let i = sections.length - 1; i >= 0; i--) {
		const section = sections[i];
		if (!section) continue;
		const configuredTitle = headings[i];
		if (!configuredTitle) continue;
		const normalizedTitle = normalizeHeadingTitle(configuredTitle);
		const match = allMatches.find((h) => normalizeHeadingTitle(h.title) === normalizedTitle);

		if (match && !processedHeadings.has(normalizedTitle)) {
			processedHeadings.add(normalizedTitle);
			nextBody = joinHeadingSection(
				nextBody.slice(0, match.start),
				match.headingLine,
				section.content.trimEnd(),
				nextBody.slice(match.end),
			);
		}
	}

	if (processedHeadings.size === 0) {
		let appended = nextBody.trim();
		for (const section of sections) {
			if (!section) continue;
			const headingLine = section.heading;
			const sectionContent = section.content.trimEnd();
			const entry = sectionContent ? `${headingLine}\n${sectionContent}` : headingLine;
			appended = appended ? `${appended}\n\n${entry}` : entry;
		}
		return appended;
	}

	return nextBody;
}

export function readBodyUnderHeading(body: string, configuredHeading: string): string {
	const headings = parseConfiguredHeadings(configuredHeading);
	if (headings.length === 0) {
		return body.trimEnd();
	}

	const heading = findFirstHeadingSection(body, headings);
	return heading ? body.slice(heading.contentStart, heading.end).trim() : "";
}

export function writeBodyUnderHeading(body: string, configuredHeading: string, nextSectionBody: string): string {
	const headings = parseConfiguredHeadings(configuredHeading);
	const trimmedSectionBody = nextSectionBody.trimEnd();
	if (headings.length === 0) {
		return trimmedSectionBody;
	}

	const heading = findFirstHeadingSection(body, headings);
	if (!heading) {
		return appendHeadingSection(body, headings[0]!, trimmedSectionBody);
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

function findFirstHeadingSection(body: string, configuredHeadings: string[]): MarkdownHeadingMatch | null {
	const headings = getHeadingMatches(body);
	if (headings.length === 0) {
		return null;
	}

	for (const configuredHeading of configuredHeadings) {
		const normalizedConfiguredTitle = normalizeHeadingTitle(configuredHeading);
		const heading = headings.find((item) => normalizeHeadingTitle(item.title) === normalizedConfiguredTitle);
		if (heading) {
			return heading;
		}
	}

	return null;
}

function parseConfiguredHeadings(configuredHeading: string): string[] {
	return configuredHeading
		.split(/[\n,;]+/)
		.map((heading) => heading.trim())
		.filter(Boolean);
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
