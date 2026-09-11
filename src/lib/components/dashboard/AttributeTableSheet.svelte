<script lang="ts">
	/**
	 * Map-companion attribute sheet. Uses already-loaded rows — no fetch.
	 * Sort/filter via shared DataTable (same as Tables tab).
	 */
	import TableIcon from "@lucide/svelte/icons/table";
	import PanelBottomIcon from "@lucide/svelte/icons/panel-bottom";
	import XIcon from "@lucide/svelte/icons/x";
	import { createColumnHelper, type ColumnDef } from "@tanstack/table-core";
	import { DataTable } from "$lib/components/ui/data-table/index.js";
	import { excelFilterFn } from "$lib/components/ui/data-table/excel-filter";
	import { toSelectionKey } from "$lib/stores/layerSelection.svelte";

	/** Keep in sync with sheet max-height + LayerScene lift offset. */
	export const IDENTIFY_TABLE_SHEET_H = "min(40vh, 22rem)";

	type Props = {
		table: string;
		rows?: Record<string, unknown>[];
		columns?: string[];
		selectedKeys?: string[];
		primaryKey?: string | null;
		onRowClick?: (entityId: string, ev: MouseEvent) => void;
		onRowDblClick?: (entityId: string) => void;
		onShowAsInfobox?: () => void;
		onClose?: () => void;
		class?: string;
	};

	let {
		table,
		rows = [],
		columns = [],
		selectedKeys = [],
		primaryKey = null,
		onRowClick,
		onRowDblClick,
		onShowAsInfobox,
		onClose,
		class: klass = "",
	}: Props = $props();

	const selectedSet = $derived(new Set(selectedKeys));
	const helper = createColumnHelper<Record<string, unknown>>();

	const cols = $derived.by(() => {
		if (columns.length > 0) {
			return columns.filter((c) => !/^_?geom/i.test(c));
		}
		const first = rows[0];
		if (!first) return [] as string[];
		return Object.keys(first).filter((c) => !/^_?geom/i.test(c));
	});

	const columnDefs = $derived.by((): ColumnDef<Record<string, unknown>>[] =>
		cols.map((col) =>
			helper.accessor(col, {
				header: col.replace(/_/g, " "),
				filterFn: excelFilterFn,
				cell: (info) => {
					const v = info.getValue();
					if (v == null) return "—";
					if (typeof v === "object") return JSON.stringify(v);
					return String(v);
				},
			}),
		),
	);

	const title = $derived(table.replace(/_/g, " "));

	function rowId(row: Record<string, unknown>): string {
		return String(row.source_id ?? row.SOURCE_ID ?? "").trim();
	}

	function rowClassName(row: Record<string, unknown>): string {
		const id = rowId(row);
		if (!id) return "";
		const key = toSelectionKey(table, id);
		if (key === primaryKey) return "selected";
		if (selectedSet.has(key)) return "bg-selected/40";
		return "";
	}
</script>

<div
	class="surface pointer-events-auto flex max-h-[min(40vh,22rem)] min-h-0 flex-col overflow-hidden rounded-lg border border-border text-xs shadow-lg {klass}"
	role="dialog"
	aria-label="Attribute table"
>
	<div
		class="flex shrink-0 items-center gap-1 border-b border-border px-2.5 py-1.5"
	>
		<TableIcon class="size-3.5 shrink-0 text-muted-foreground" />
		<div class="min-w-0 flex-1">
			<p
				class="truncate text-[11px] font-medium text-foreground"
				title={title}
			>
				{title}
			</p>
			<p class="tabular-nums text-[10px] text-muted-foreground">
				{rows.length} row{rows.length === 1 ? "" : "s"}
				{#if selectedKeys.length > 0}
					· {selectedKeys.length} selected
				{/if}
			</p>
		</div>
		<button
			type="button"
			class="inline-flex shrink-0 items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] text-muted-foreground hover:bg-secondary hover:text-foreground"
			title="Show selection as infobox"
			onclick={() => onShowAsInfobox?.()}
		>
			<PanelBottomIcon class="size-3" />
			Infobox
		</button>
		<button
			type="button"
			class="shrink-0 rounded p-0.5 text-muted-foreground hover:bg-secondary hover:text-foreground"
			title="Close"
			onclick={() => onClose?.()}
		>
			<XIcon class="size-3.5" />
		</button>
	</div>

	<div class="min-h-0 flex-1 px-2 pb-2 pt-1">
		{#if rows.length === 0 || columnDefs.length === 0}
			<p class="px-1 py-3 text-[11px] text-muted-foreground">
				{rows.length === 0
					? "No rows loaded for this table"
					: "No columns"}
			</p>
		{:else}
			<DataTable
				columns={columnDefs}
				data={rows}
				pageSize={15}
				compact
				{rowClassName}
				getRowId={rowId}
				onRowClick={(row, ev) => {
					const id = rowId(row);
					if (!id) return;
					onRowClick?.(id, ev);
				}}
				onRowDblClick={(row) => {
					const id = rowId(row);
					if (!id) return;
					onRowDblClick?.(id);
				}}
			/>
		{/if}
	</div>
</div>
