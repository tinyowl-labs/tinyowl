import type { FilterFn } from "@tanstack/table-core";

/**
 * Excel-style column filter value.
 *
 * - plain string (legacy): case-insensitive "contains".
 * - `{ kind: "values", values }`: keep rows whose raw value (String-ified,
 *   null/undefined → "") is in the set — the checklist mode.
 * - `{ kind: "condition", op, value }`: single operator comparison.
 */
export type ExcelConditionOp =
    | "contains"
    | "doesNotContain"
    | "equals"
    | "doesNotEqual"
    | "startsWith"
    | "endsWith"
    | "gt"
    | "gte"
    | "lt"
    | "lte"
    | "isEmpty"
    | "isNotEmpty";

export type ExcelColumnFilter =
    | string
    | { kind: "values"; values: string[] }
    | { kind: "condition"; op: ExcelConditionOp; value: string };

export const EXCEL_OPS: { op: ExcelConditionOp; label: string }[] = [
    { op: "contains", label: "Contains" },
    { op: "doesNotContain", label: "Does not contain" },
    { op: "equals", label: "Equals" },
    { op: "doesNotEqual", label: "Does not equal" },
    { op: "startsWith", label: "Starts with" },
    { op: "endsWith", label: "Ends with" },
    { op: "gt", label: "Greater than" },
    { op: "gte", label: "Greater than or equal" },
    { op: "lt", label: "Less than" },
    { op: "lte", label: "Less than or equal" },
    { op: "isEmpty", label: "Is empty" },
    { op: "isNotEmpty", label: "Is not empty" },
];

/** Ops that need no comparison value. */
export function excelOpNeedsValue(op: ExcelConditionOp): boolean {
    return op !== "isEmpty" && op !== "isNotEmpty";
}

function rawText(raw: unknown): string {
    return raw == null ? "" : String(raw);
}

function applyCondition(
    cell: string,
    op: ExcelConditionOp,
    operand: string,
): boolean {
    const c = cell.toLowerCase();
    const v = operand.toLowerCase();
    switch (op) {
        case "contains":
            return c.includes(v);
        case "doesNotContain":
            return !c.includes(v);
        case "equals":
            return c === v;
        case "doesNotEqual":
            return c !== v;
        case "startsWith":
            return c.startsWith(v);
        case "endsWith":
            return c.endsWith(v);
        case "isEmpty":
            return cell === "";
        case "isNotEmpty":
            return cell !== "";
        case "gt":
        case "gte":
        case "lt":
        case "lte": {
            const nCell = Number(cell);
            const nOp = Number(operand);
            let cmp: number;
            if (
                cell !== "" &&
                operand !== "" &&
                Number.isFinite(nCell) &&
                Number.isFinite(nOp)
            ) {
                cmp = nCell < nOp ? -1 : nCell > nOp ? 1 : 0;
            } else {
                cmp = c < v ? -1 : c > v ? 1 : 0;
            }
            if (op === "gt") return cmp > 0;
            if (op === "gte") return cmp >= 0;
            if (op === "lt") return cmp < 0;
            return cmp <= 0;
        }
    }
}

export const excelFilterFn: FilterFn<Record<string, unknown>> = (
    row,
    columnId,
    filterValue,
) => {
    if (filterValue == null || filterValue === "") return true;
    const cell = rawText(row.getValue(columnId));
    if (typeof filterValue === "string") {
        return cell.toLowerCase().includes(filterValue.toLowerCase());
    }
    if (typeof filterValue === "object") {
        if (filterValue.kind === "values") {
            if (!Array.isArray(filterValue.values)) return true;
            return new Set(filterValue.values).has(cell);
        }
        if (filterValue.kind === "condition") {
            return applyCondition(cell, filterValue.op, filterValue.value ?? "");
        }
    }
    return true;
};

type ValuesFilter = Extract<ExcelColumnFilter, { kind: "values" }>;
type ConditionFilter = Extract<ExcelColumnFilter, { kind: "condition" }>;

/** Checked-values list when the filter is a checklist, else null. */
export function asValuesFilter(filterValue: unknown): string[] | null {
    if (
        typeof filterValue === "object" &&
        filterValue !== null &&
        (filterValue as { kind?: unknown }).kind === "values"
    ) {
        const values = (filterValue as ValuesFilter).values;
        return Array.isArray(values) ? values : null;
    }
    return null;
}

/**
 * Condition view of the filter: native conditions pass through, legacy
 * plain-string filters surface as `contains` so the panel can edit them.
 */
export function asConditionFilter(
    filterValue: unknown,
): { op: ExcelConditionOp; value: string } | null {
    if (typeof filterValue === "string") {
        return filterValue !== ""
            ? { op: "contains", value: filterValue }
            : null;
    }
    if (
        typeof filterValue === "object" &&
        filterValue !== null &&
        (filterValue as { kind?: unknown }).kind === "condition"
    ) {
        const c = filterValue as ConditionFilter;
        return { op: c.op, value: c.value ?? "" };
    }
    return null;
}

/** True when a filter actually narrows rows (drives trigger highlight). */
export function isExcelFilterActive(filterValue: unknown): boolean {
    if (filterValue == null || filterValue === "") return false;
    if (typeof filterValue === "string") return filterValue !== "";
    if (typeof filterValue === "object") {
        const f = filterValue as ExcelColumnFilter;
        if (typeof f === "object" && f !== null && "kind" in f) {
            if (f.kind === "values") return f.values.length > 0;
            if (f.kind === "condition") {
                return (
                    !excelOpNeedsValue(f.op) || (f.value ?? "").trim() !== ""
                );
            }
        }
    }
    return false;
}

/** Short human summary for tooltips, e.g. `contains "oven"` / `3 values`. */
export function excelFilterSummary(filterValue: unknown): string {
    if (typeof filterValue === "string" && filterValue !== "") {
        return `contains "${filterValue}"`;
    }
    if (typeof filterValue === "object" && filterValue !== null) {
        const f = filterValue as ExcelColumnFilter;
        if (typeof f === "object" && "kind" in f) {
            if (f.kind === "values") {
                const n = f.values.length;
                return n === 1 ? "1 value" : `${n} values`;
            }
            if (f.kind === "condition") {
                const label =
                    EXCEL_OPS.find((o) => o.op === f.op)?.label ?? f.op;
                return excelOpNeedsValue(f.op)
                    ? `${label} "${f.value}"`
                    : label;
            }
        }
    }
    return "";
}
