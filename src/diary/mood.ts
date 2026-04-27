export interface MoodIconItem {
	name: string;
	description: string;
	descriptionZh?: string;
	color?: string;
}

export const BUILT_IN_MOOD_ICONS: MoodIconItem[] = [
	{ name: "smile", description: "Happy", descriptionZh: "开心", color: "var(--color-green)" },
	{ name: "laugh", description: "Joyful", descriptionZh: "喜悦", color: "var(--color-yellow)" },
	{ name: "meh", description: "Neutral", descriptionZh: "平静", color: "var(--text-muted)" },
	{ name: "frown", description: "Sad", descriptionZh: "伤心", color: "var(--color-blue)" },
	{ name: "angry", description: "Angry", descriptionZh: "生气", color: "var(--color-red)" },
	{ name: "annoyed", description: "Annoyed", descriptionZh: "烦恼", color: "var(--color-orange)" },
	{ name: "heart", description: "Love", descriptionZh: "爱心", color: "var(--color-pink)" },
	{ name: "heart-crack", description: "Heartbroken", descriptionZh: "心碎", color: "var(--color-purple)" },
	{ name: "thumbs-up", description: "Great", descriptionZh: "很棒", color: "var(--color-cyan)" },
	{ name: "thumbs-down", description: "Bad", descriptionZh: "很糟", color: "var(--color-red)" },
	{ name: "star", description: "Wonderful", descriptionZh: "棒极了", color: "var(--color-yellow)" },
	{ name: "party-popper", description: "Celebrating", descriptionZh: "庆祝", color: "var(--color-pink)" },
	{ name: "leafy-green", description: "Peaceful", descriptionZh: "宁静", color: "var(--color-green)" },
	{ name: "hand-metal", description: "Cheerful", descriptionZh: "振奋", color: "var(--color-orange)" },
];

export function getAllMoodIcons(custom: MoodIconItem[], language: "en" | "zh" = "en"): MoodIconItem[] {
	const all = [...BUILT_IN_MOOD_ICONS, ...custom];
	if (language === "zh") {
		return all.map(icon => ({
			...icon,
			description: icon.descriptionZh || icon.description
		}));
	}
	return all;
}
