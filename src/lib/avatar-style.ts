export type AvatarStyle = {
	top?: string;
	hairColor?: string;
	hatColor?: string;
	skinColor?: string;
	eyes?: string;
	eyebrows?: string;
	mouth?: string;
	facialHair?: string;
	facialHairColor?: string;
	clothing?: string;
	clothesColor?: string;
	clothingGraphic?: string;
	accessories?: string;
	accessoriesColor?: string;
	backgroundColor?: string;
};

export const AVATAR_TOPS = [
	"shortFlat",
	"shortRound",
	"shortWaved",
	"shortCurly",
	"theCaesar",
	"theCaesarAndSidePart",
	"sides",
	"shavedSides",
	"shaggy",
	"shaggyMullet",
	"bob",
	"bun",
	"curly",
	"curvy",
	"dreads",
	"dreads01",
	"dreads02",
	"fro",
	"froBand",
	"frizzle",
	"bigHair",
	"longButNotTooLong",
	"miaWallace",
	"straight01",
	"straight02",
	"straightAndStrand",
	"frida",
	"hat",
	"hijab",
	"turban",
	"winterHat1",
	"winterHat02",
	"winterHat03",
	"winterHat04",
] as const;

export const AVATAR_EYES = [
	"default",
	"happy",
	"squint",
	"wink",
	"winkWacky",
	"side",
	"surprised",
	"hearts",
	"closed",
	"cry",
	"eyeRoll",
	"xDizzy",
] as const;

export const AVATAR_EYEBROWS = [
	"default",
	"defaultNatural",
	"flatNatural",
	"raisedExcited",
	"raisedExcitedNatural",
	"upDown",
	"upDownNatural",
	"frownNatural",
	"sadConcerned",
	"sadConcernedNatural",
	"angry",
	"angryNatural",
	"unibrowNatural",
] as const;

export const AVATAR_MOUTHS = [
	"default",
	"smile",
	"twinkle",
	"serious",
	"eating",
	"grimace",
	"concerned",
	"sad",
	"disbelief",
	"screamOpen",
	"tongue",
	"vomit",
] as const;

export const AVATAR_FACIAL_HAIR = [
	"none",
	"beardLight",
	"beardMedium",
	"beardMajestic",
	"moustacheFancy",
	"moustacheMagnum",
] as const;

export const AVATAR_CLOTHING = [
	"hoodie",
	"blazerAndShirt",
	"blazerAndSweater",
	"collarAndSweater",
	"graphicShirt",
	"overall",
	"shirtCrewNeck",
	"shirtScoopNeck",
	"shirtVNeck",
] as const;

export const AVATAR_GRAPHICS = [
	"bat",
	"bear",
	"cumbia",
	"deer",
	"diamond",
	"hola",
	"pizza",
	"resist",
	"skull",
	"skullOutline",
] as const;

export const AVATAR_ACCESSORIES = [
	"none",
	"prescription01",
	"prescription02",
	"round",
	"kurt",
	"sunglasses",
	"wayfarers",
	"eyepatch",
] as const;

export const AVATAR_HAIR_COLORS = [
	"2c1b18",
	"4a312c",
	"724133",
	"a55728",
	"b58143",
	"d6b370",
	"ecdcbf",
	"e8e1e1",
	"c93305",
	"f59797",
] as const;

export const AVATAR_SKIN_COLORS = [
	"ffdbb4",
	"edb98a",
	"d08b5b",
	"fd9841",
	"ae5d29",
	"614335",
	"f8d25c",
] as const;

export const AVATAR_CLOTH_COLORS = [
	"262e33",
	"3c4f5c",
	"65c9ff",
	"5199e4",
	"25557c",
	"e6e6e6",
	"929598",
	"ffffff",
	"ff5c5c",
	"ff488e",
	"a7ffc4",
	"ffffb1",
] as const;

const HATS = new Set([
	"hat",
	"hijab",
	"turban",
	"winterHat1",
	"winterHat02",
	"winterHat03",
	"winterHat04",
]);

export function isHatTop(top: string | undefined): boolean {
	return Boolean(top && HATS.has(top));
}

export function labelAvatarOption(value: string): string {
	if (value === "none") return "None";
	return value
		.replace(/([a-z])([A-Z])/g, "$1 $2")
		.replace(/(\d+)/g, " $1")
		.replace(/^./, (c) => c.toUpperCase())
		.trim();
}

function pick<T>(items: readonly T[]): T {
	return items[Math.floor(Math.random() * items.length)]!;
}

export function randomAvatarStyle(): AvatarStyle {
	const clothing = pick(AVATAR_CLOTHING);
	const top = pick(AVATAR_TOPS);
	const style: AvatarStyle = {
		top,
		hairColor: pick(AVATAR_HAIR_COLORS),
		skinColor: pick(AVATAR_SKIN_COLORS),
		eyes: pick(AVATAR_EYES),
		eyebrows: pick(AVATAR_EYEBROWS),
		mouth: pick(AVATAR_MOUTHS),
		facialHair: Math.random() < 0.65 ? "none" : pick(AVATAR_FACIAL_HAIR.filter((v) => v !== "none")),
		facialHairColor: pick(AVATAR_HAIR_COLORS),
		clothing,
		clothesColor: pick(AVATAR_CLOTH_COLORS),
		accessories: Math.random() < 0.7 ? "none" : pick(AVATAR_ACCESSORIES.filter((v) => v !== "none")),
		accessoriesColor: pick(AVATAR_CLOTH_COLORS),
		backgroundColor: pick(AVATAR_CLOTH_COLORS),
	};
	if (isHatTop(top)) style.hatColor = pick(AVATAR_CLOTH_COLORS);
	if (clothing === "graphicShirt") style.clothingGraphic = pick(AVATAR_GRAPHICS);
	return style;
}

export function toDicebearOptions(
	seed: string,
	style?: AvatarStyle | null,
): Record<string, unknown> {
	const o: Record<string, unknown> = { seed };
	if (!style) return o;
	const pin = (key: string, val: string | undefined) => {
		if (val && val !== "none") o[key] = [val];
	};
	pin("top", style.top);
	pin("hairColor", style.hairColor);
	pin("hatColor", style.hatColor);
	pin("skinColor", style.skinColor);
	pin("eyes", style.eyes);
	pin("eyebrows", style.eyebrows);
	pin("mouth", style.mouth);
	pin("clothing", style.clothing);
	pin("clothesColor", style.clothesColor);
	pin("clothingGraphic", style.clothingGraphic);
	pin("accessoriesColor", style.accessoriesColor);
	pin("facialHairColor", style.facialHairColor);
	pin("backgroundColor", style.backgroundColor);
	if (style.facialHair === "none") {
		o.facialHairProbability = 0;
	} else {
		pin("facialHair", style.facialHair);
		if (style.facialHair) o.facialHairProbability = 100;
	}
	if (style.accessories === "none") {
		o.accessoriesProbability = 0;
	} else {
		pin("accessories", style.accessories);
		if (style.accessories) o.accessoriesProbability = 100;
	}
	return o;
}
