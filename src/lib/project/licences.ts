/** Shared licence + location precision options (Settings + Digitize). */

export type LicenceOption = {
    key: string;
    label: string;
    desc: string;
    url: string;
};

export type LocationPrecisionOption = {
    key: string;
    label: string;
    desc: string;
};

export const LICENCES: LicenceOption[] = [
    {
        key: "CC0",
        label: "CC0",
        desc: "Public Domain",
        url: "https://creativecommons.org/publicdomain/zero/1.0/",
    },
    {
        key: "CC_BY_4",
        label: "CC BY 4.0",
        desc: "Attribution",
        url: "https://creativecommons.org/licenses/by/4.0/",
    },
    {
        key: "CC_BY_SA_4",
        label: "CC BY-SA 4.0",
        desc: "Attribution-ShareAlike",
        url: "https://creativecommons.org/licenses/by-sa/4.0/",
    },
    {
        key: "CC_BY_NC_4",
        label: "CC BY-NC 4.0",
        desc: "Attribution-NonCommercial",
        url: "https://creativecommons.org/licenses/by-nc/4.0/",
    },
    {
        key: "CC_BY_NC_SA_4",
        label: "CC BY-NC-SA 4.0",
        desc: "Attribution-NonCommercial-ShareAlike",
        url: "https://creativecommons.org/licenses/by-nc-sa/4.0/",
    },
    {
        key: "ODbL",
        label: "ODbL",
        desc: "Open Database Licence",
        url: "https://opendatacommons.org/licenses/odbl/",
    },
    { key: "ALL_RIGHTS", label: "All Rights Reserved", desc: "", url: "" },
];

export const LOCATION_PRECISIONS: LocationPrecisionOption[] = [
    { key: "exact", label: "Exact", desc: "Full coordinates" },
    {
        key: "approx_100m",
        label: "~100 m",
        desc: "Snap to ~100 m grid",
    },
    {
        key: "approx_1km",
        label: "~1 km",
        desc: "Snap to ~1 km grid",
    },
    {
        key: "bbox_only",
        label: "Bbox only",
        desc: "Project extent only",
    },
    {
        key: "hidden",
        label: "Hidden",
        desc: "No public locations",
    },
];

/** Strip common FK suffixes/prefixes for fuzzy matching across table conventions. */
export function normalizeFkToken(raw: string): string {
    let s = raw.toLowerCase().replace(/[^a-z0-9]+/g, "_");
    s = s.replace(/_+/g, "_").replace(/^_|_$/g, "");
    const suffixes = [
        "_source_id",
        "_entity_id",
        "_id",
        "_ref",
        "_fk",
        "_key",
        "_uuid",
        "id",
        "ref",
        "fk",
    ];
    for (const suf of suffixes) {
        if (s.length > suf.length + 2 && s.endsWith(suf)) {
            s = s.slice(0, -suf.length);
            break;
        }
    }
    // crude singular
    if (s.endsWith("ies") && s.length > 4) s = s.slice(0, -3) + "y";
    else if (s.endsWith("ses") && s.length > 4) s = s.slice(0, -2);
    else if (s.endsWith("s") && !s.endsWith("ss") && s.length > 3) s = s.slice(0, -1);
    return s;
}

export type FkSuggestion = {
    sourceTable: string;
    sourceColumn: string;
    targetTable: string;
    targetColumn: string;
    reason: string;
    conventionalName: string;
};

export function suggestForeignKeys(
    tables: {
        name: string;
        columns: { name: string; pk?: boolean }[];
    }[],
    existing?: { source: string; source_column: string }[],
): FkSuggestion[] {
    const covered = new Set(
        (existing ?? []).map((e) => `${e.source}.${e.source_column}`),
    );
    const out: FkSuggestion[] = [];
    const tableNorm = tables.map((t) => ({
        name: t.name,
        norm: normalizeFkToken(t.name),
    }));

    for (const src of tables) {
        for (const col of src.columns) {
            if (
                col.name === "source_id" ||
                col.name === "entity_type" ||
                col.pk ||
                /^geom/i.test(col.name)
            ) {
                continue;
            }
            const key = `${src.name}.${col.name}`;
            if (covered.has(key)) continue;
            const cn = normalizeFkToken(col.name);
            if (cn.length < 2) continue;

            for (const tgt of tableNorm) {
                if (tgt.name === src.name) continue;
                const match =
                    cn === tgt.norm ||
                    tgt.norm.startsWith(cn) ||
                    cn.startsWith(tgt.norm) ||
                    tgt.norm.includes(cn) ||
                    cn.includes(tgt.norm);
                if (!match) continue;
                out.push({
                    sourceTable: src.name,
                    sourceColumn: col.name,
                    targetTable: tgt.name,
                    targetColumn: "source_id",
                    reason:
                        cn === tgt.norm
                            ? "column name matches table"
                            : `“${col.name}” ≈ “${tgt.name}”`,
                    conventionalName: `${tgt.norm}_id`,
                });
            }
        }
    }
    return out.slice(0, 24);
}
