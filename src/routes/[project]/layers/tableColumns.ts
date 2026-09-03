import { type ColumnDef, createColumnHelper } from "@tanstack/table-core";
import { renderComponent } from "$lib/components/ui/data-table/render-helpers.js";
import MediaCell from "$lib/components/ui/media-cell.svelte";
import RowNum from "$lib/components/ui/row-num.svelte";

const columnHelper = createColumnHelper<Record<string, unknown>>();

/** Format span / arch_date JSON (or leave plain strings) for table display. */
function formatArchDateCell(raw: string): string | null {
    const s = raw.trim();
    if (!s.startsWith("{")) return null;
    try {
        const ad = JSON.parse(s) as {
            start?: number;
            end?: number;
            label?: string;
        };
        if (
            ad == null ||
            (ad.label == null && ad.start == null && ad.end == null)
        ) {
            return null;
        }
        const fmtYear = (y: number) =>
            y < 0 ? `${Math.abs(y)} BCE` : `${y} CE`;
        let span = "";
        if (ad.start != null && ad.end != null && ad.start !== ad.end) {
            span = `${fmtYear(ad.start)}–${fmtYear(ad.end)}`;
        } else if (ad.start != null) {
            span = fmtYear(ad.start);
        } else if (ad.end != null) {
            span = fmtYear(ad.end);
        }
        if (ad.label && span) return `${ad.label} (${span})`;
        if (ad.label) return ad.label;
        return span || s;
    } catch {
        return null;
    }
}

function formatCellValue(val: unknown): string {
    if (val === null || val === undefined) return "—";
    if (typeof val === "object") return JSON.stringify(val);
    const s = String(val);
    return formatArchDateCell(s) ?? s;
}

export function buildColumns(
    tableName: string,
    tables: Record<string, string[]>,
    mediaByEntity: Record<string, { url: string; media_type: string }[]>,
): ColumnDef<Record<string, unknown>>[] {
    const cols = tables[tableName] ?? [];

    const mediaCol: ColumnDef<Record<string, unknown>> = columnHelper.display({
        id: "_media",
        header: "",
        cell: (info) => {
            const sourceId = (info.row.original.source_id ??
                info.row.original.SOURCE_ID ??
                "") as string;
            const key = `${tableName}:${sourceId}`;
            const entityMedia = mediaByEntity[key];
            if (!entityMedia || entityMedia.length === 0) return "";
            return renderComponent(MediaCell, {
                url: entityMedia[0].url,
                type: entityMedia[0].media_type,
                count: entityMedia.length,
            });
        },
        size: 50,
    });

    const dataCols = cols
        .filter((col) => !/^_?geom/i.test(col))
        .map((col) =>
            columnHelper.accessor(col, {
                header: col,
                cell: (info) => {
                    const val = info.getValue();
                    return formatCellValue(val);
                },
            }),
        );

    const rowNumCol = columnHelper.display({
        id: "__row_number",
        header: "#",
        cell: (info) => renderComponent(RowNum, { n: info.row.index + 1 }),
        size: 36,
    });

    return [rowNumCol, mediaCol, ...dataCols];
}
