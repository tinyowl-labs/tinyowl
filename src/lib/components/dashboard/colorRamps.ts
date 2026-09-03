/** Named color ramps for continuous layer styles (RGB 0–255 stops). */

export type ColorRampId =
    | "viridis"
    | "magma"
    | "inferno"
    | "plasma"
    | "cividis"
    | "turbo"
    | "rdylbu"
    | "ylorbr";

export type ColorRamp = {
    id: ColorRampId;
    label: string;
    stops: number[][];
};

export const COLOR_RAMPS: ColorRamp[] = [
    {
        id: "viridis",
        label: "Viridis",
        stops: [
            [68, 1, 84],
            [59, 82, 139],
            [33, 145, 140],
            [94, 201, 98],
            [253, 231, 37],
        ],
    },
    {
        id: "magma",
        label: "Magma",
        stops: [
            [0, 0, 4],
            [81, 18, 124],
            [183, 55, 121],
            [252, 137, 97],
            [252, 253, 191],
        ],
    },
    {
        id: "inferno",
        label: "Inferno",
        stops: [
            [0, 0, 4],
            [87, 16, 110],
            [188, 55, 84],
            [249, 142, 9],
            [252, 255, 164],
        ],
    },
    {
        id: "plasma",
        label: "Plasma",
        stops: [
            [13, 8, 135],
            [126, 3, 168],
            [204, 71, 120],
            [248, 149, 64],
            [240, 249, 33],
        ],
    },
    {
        id: "cividis",
        label: "Cividis",
        stops: [
            [0, 32, 77],
            [40, 83, 116],
            [95, 127, 109],
            [174, 176, 90],
            [253, 231, 37],
        ],
    },
    {
        id: "turbo",
        label: "Turbo",
        stops: [
            [48, 18, 59],
            [70, 107, 227],
            [40, 188, 99],
            [232, 229, 37],
            [204, 47, 12],
        ],
    },
    {
        id: "rdylbu",
        label: "Red–Blue",
        stops: [
            [178, 24, 43],
            [253, 174, 97],
            [247, 247, 247],
            [116, 173, 209],
            [33, 102, 172],
        ],
    },
    {
        id: "ylorbr",
        label: "Yellow–Brown",
        stops: [
            [255, 255, 229],
            [254, 217, 142],
            [254, 153, 41],
            [217, 95, 14],
            [153, 52, 4],
        ],
    },
];

export const DEFAULT_COLOR_RAMP: ColorRampId = "viridis";

export function colorRampById(id: string | undefined): ColorRamp {
    return COLOR_RAMPS.find((r) => r.id === id) ?? COLOR_RAMPS[0]!;
}

export function rampCss(id: string | undefined, reverse = false): string {
    const stops = [...colorRampById(id).stops];
    if (reverse) stops.reverse();
    return `linear-gradient(to right, ${stops.map((c) => `rgb(${c[0]},${c[1]},${c[2]})`).join(",")})`;
}

function lerp(a: number, b: number, t: number): number {
    return Math.round(a + (b - a) * t);
}

/** `t` in 0–1 → RGBA (alpha 255). */
export function sampleRamp(
    id: string | undefined,
    t: number,
    reverse = false,
    alpha = 255,
): number[] {
    const stops = [...colorRampById(id).stops];
    if (reverse) stops.reverse();
    const x = Number.isFinite(t) ? Math.max(0, Math.min(1, t)) : 0.5;
    if (stops.length === 1) {
        const c = stops[0]!;
        return [c[0]!, c[1]!, c[2]!, alpha];
    }
    const pos = x * (stops.length - 1);
    const i = Math.min(Math.floor(pos), stops.length - 2);
    const f = pos - i;
    const a = stops[i]!;
    const b = stops[i + 1]!;
    return [lerp(a[0]!, b[0]!, f), lerp(a[1]!, b[1]!, f), lerp(a[2]!, b[2]!, f), alpha];
}
