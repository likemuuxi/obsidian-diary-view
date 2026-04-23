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

export const DAILY_QUOTE_FRONTMATTER_KEY = "daily-quote";

const DAILY_WEATHER_FRONTMATTER_KEY = "daily-weather";
const DAILY_IMAGE_FRONTMATTER_KEY = "daily-image";

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

export function readArtworkImage(frontmatter: unknown): string | null {
	return readFrontmatterString(frontmatter, DAILY_IMAGE_FRONTMATTER_KEY);
}
