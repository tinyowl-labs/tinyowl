<script lang="ts">
    import {
        createSvelteTable,
        FlexRender,
    } from "$lib/components/ui/data-table/index.js";
    import * as Table from "$lib/components/ui/table/index.js";
    import { Button } from "$lib/components/ui/button/index.js";
    import {
        getCoreRowModel,
        getFilteredRowModel,
        getPaginationRowModel,
        getSortedRowModel,
        type ColumnDef,
        type ColumnFiltersState,
        type SortingState,
    } from "@tanstack/table-core";
    import { untrack } from "svelte";
    import ArrowUpDown from "@lucide/svelte/icons/arrow-up-down";
    import ChevronLeft from "@lucide/svelte/icons/chevron-left";
    import ChevronRight from "@lucide/svelte/icons/chevron-right";
    import FilterIcon from "@lucide/svelte/icons/filter";
    import * as Popover from "$lib/components/ui/popover/index.js";
    import ColumnFilterPanel from "$lib/components/ui/data-table/column-filter-panel.svelte";
    import {
        excelFilterSummary,
        isExcelFilterActive,
        type ExcelColumnFilter,
    } from "$lib/components/ui/data-table/excel-filter";
    import EditableCell from "$lib/components/ui/data-table/editable-cell.svelte";
    import type { LookupOpt } from "$lib/project/schemaFields";

    type Props<TData> = {
        columns: ColumnDef<TData>[];
        data: TData[];
        pageSize?: number;
        totalRows?: number;
        loading?: boolean;
        onSortChange?: (sorting: SortingState) => void;
        onFiltersChange?: (filters: ColumnFiltersState) => void;
        loadColumnValues?: (column: string) => Promise<{ rows: Record<string, unknown>[]; total: number }>;

        rowClassName?: (row: TData) => string;
        pageIndex?: number;
        onPageChange?: (index: number) => void;
        onRowClick?: (row: TData, event: MouseEvent) => void;
        onRowDblClick?: (row: TData, event: MouseEvent) => void;
        editRowId?: string | null;
        getRowId?: (row: TData) => string;
        isEditableColumn?: (columnId: string) => boolean;
        columnLookups?: Record<string, LookupOpt[]>;
        onCommitCell?: (row: TData, columnId: string, value: string) => void;
        onCancelEdit?: () => void;
        /** Tighter chrome for map companion sheet. */
        compact?: boolean;
        /** Display-text fallback for raw cell values (e.g. arch-date spans). */
        formatValue?: (raw: unknown) => string;
    };

    type TData = Record<string, unknown>;
    let {
        columns,
        data,
        pageSize = 25,
        totalRows,
        loading = false,
        onSortChange,
        onFiltersChange,
        loadColumnValues,

        rowClassName,
        pageIndex = 0,
        onPageChange,
        onRowClick,
        onRowDblClick,
        editRowId = null,
        getRowId,
        isEditableColumn,
        columnLookups,
        onCommitCell,
        onCancelEdit,
        compact = false,
        formatValue,
    }: Props<TData> = $props();

    let sorting = $state<SortingState>([]);
    let columnFilters = $state<ColumnFiltersState>([]);
    let _pageIndex = $state(untrack(() => pageIndex));
    let _pageSize = $state(untrack(() => pageSize));

    // Sync pageIndex prop → internal state
    $effect(() => {
        _pageIndex = pageIndex;
    });

    let valueChoices = $state<Record<string, {rows: Record<string, unknown>[]; total: number}>>({});
    let valueErrors = $state<Record<string, string>>({});
    async function loadValues(column: string) {
        if (!loadColumnValues) return;
        valueChoices = {...valueChoices, [column]: undefined} as typeof valueChoices;
        valueErrors = {...valueErrors, [column]: ""};
        try { const result = await loadColumnValues(column); valueChoices = {...valueChoices, [column]: result}; }
        catch { valueErrors = {...valueErrors, [column]: "Could not load values."}; }
    }
    const table = createSvelteTable({
        get enableMultiSort() { return totalRows === undefined; },
        get manualPagination() { return totalRows !== undefined; },
        get manualSorting() { return totalRows !== undefined; },
        get manualFiltering() { return totalRows !== undefined; },
        get rowCount() { return totalRows; },

        get data() {
            return data;
        },
        get columns() {
            return columns;
        },
        state: {
            get sorting() {
                return sorting;
            },
            get columnFilters() {
                return columnFilters;
            },
            get pagination() {
                return { pageIndex: _pageIndex, pageSize: _pageSize };
            },
        },
        onSortingChange: (updater) => {
            if (typeof updater === "function") sorting = updater(sorting);
            else sorting = updater;
            onSortChange?.(sorting);
        },
        onColumnFiltersChange: (updater) => {
            if (typeof updater === "function")
                columnFilters = updater(columnFilters);
            else columnFilters = updater;
            _pageIndex = 0;
            onFiltersChange?.(columnFilters);
            onPageChange?.(0);
        },
        onPaginationChange: (updater) => {
            const next =
                typeof updater === "function"
                    ? updater({ pageIndex: _pageIndex, pageSize: _pageSize })
                    : updater;
            _pageIndex = next.pageIndex;
            _pageSize = next.pageSize;
            onPageChange?.(_pageIndex);
        },
        getCoreRowModel: getCoreRowModel(),
        getFilteredRowModel: getFilteredRowModel(),
        getSortedRowModel: getSortedRowModel(),
        getPaginationRowModel: getPaginationRowModel(),
    });
</script>

<div class="flex h-full min-h-0 flex-col">
    <div
        class="min-h-0 flex-1 overflow-auto rounded-md border border-border bg-card"
    >
        <Table.Root>
            <Table.Header class="sticky top-0 z-10 bg-card">
                {#each table.getHeaderGroups() as headerGroup}
                    <Table.Row class="hover:bg-transparent border-border">
                        {#each headerGroup.headers as header}
                            <Table.Head
                                class="max-w-56 bg-muted/40 px-3 {compact
                                    ? 'h-auto py-1'
                                    : 'h-9 py-0'}"
                            >
                                {#if header.isPlaceholder}
                                    <!-- empty -->
                                {:else}
                                    <div
                                        class="flex min-w-0 items-center gap-1 {compact
                                            ? 'py-0.5'
                                            : 'py-1'}"
                                    >
                                        <div class="min-w-0 flex-1">
                                            {#if header.column.getCanSort()}
                                                <Button
                                                    variant="ghost"
                                                    class="-ml-3 h-7 min-w-0 max-w-full justify-start truncate px-3 data-[state=active]:bg-muted data-[state=active]:text-foreground"
                                                    onclick={header.column.getToggleSortingHandler()}
                                                >
                                                    <FlexRender
                                                        content={header.column
                                                            .columnDef.header}
                                                        context={header.getContext()}
                                                    />
                                                    <ArrowUpDown
                                                        class="ml-1 size-3.5 shrink-0"
                                                    />
                                                </Button>
                                            {:else}
                                                <span
                                                    class="block truncate text-xs font-medium"
                                                >
                                                    <FlexRender
                                                        content={header.column
                                                            .columnDef.header}
                                                        context={header.getContext()}
                                                    />
                                                </span>
                                            {/if}
                                        </div>
                                        {#if header.column.getCanFilter()}
                                            {@const filterValue =
                                                header.column.getFilterValue()}
                                            {@const filterActive =
                                                isExcelFilterActive(filterValue)}
                                            {@const filterSummary =
                                                excelFilterSummary(filterValue)}
                                            <Popover.Root onOpenChange={(open) => { if (open) void loadValues(header.column.id); }}>
                                                <Popover.Trigger
                                                    class="flex size-6 shrink-0 items-center justify-center rounded-md transition-colors {filterActive
                                                        ? 'bg-secondary text-foreground'
                                                        : 'text-muted-foreground hover:bg-secondary hover:text-foreground'}"
                                                    title={filterSummary
                                                        ? `Filter ${header.column.id}: ${filterSummary}`
                                                        : `Filter ${header.column.id}`}
                                                    aria-label="Filter {header
                                                        .column.id}"
                                                    onclick={(e) =>
                                                        e.stopPropagation()}
                                                >
                                                    <FilterIcon
                                                        class="size-3.5"
                                                    />
                                                </Popover.Trigger>
                                                <Popover.Content
                                                    class="w-auto p-0"
                                                    align="end"
                                                    sideOffset={6}
                                                >
                                                    {#if loadColumnValues && !valueChoices[header.column.id]}
                                                        <p role="status" class="p-3 text-xs">{valueErrors[header.column.id] || "Loading values…"}</p>
                                                        {#if valueErrors[header.column.id]}<button class="p-3 underline" onclick={() => loadValues(header.column.id)}>Retry</button>{/if}
                                                    {:else}
                                                    <ColumnFilterPanel
                                                        columnId={header.column
                                                            .id}
                                                        data={valueChoices[header.column.id]?.rows ?? data}
                                                        valuesPartial={(valueChoices[header.column.id]?.total ?? 0) > (valueChoices[header.column.id]?.rows.length ?? 0)}
                                                        {filterValue}
                                                        lookups={columnLookups?.[
                                                            header.column.id
                                                        ]}
                                                        {formatValue}
                                                        onApply={(
                                                            f:
                                                                | ExcelColumnFilter
                                                                | undefined,
                                                        ) =>
                                                            header.column.setFilterValue(
                                                                f,
                                                            )}
                                                        onClear={() =>
                                                            header.column.setFilterValue(
                                                                undefined,
                                                            )}
                                                    />
                                                    {/if}
                                                </Popover.Content>
                                            </Popover.Root>
                                        {/if}
                                    </div>
                                {/if}
                            </Table.Head>
                        {/each}
                    </Table.Row>
                {/each}
            </Table.Header>
            <Table.Body>
                {#each table.getRowModel().rows as row}
                    <Table.Row
                        class="border-border {onRowClick || onRowDblClick
                            ? 'cursor-pointer'
                            : ''} {rowClassName?.(row.original) ?? ''}"
                        onclick={(e) => onRowClick?.(row.original, e)}
                        ondblclick={(e) => onRowDblClick?.(row.original, e)}
                    >
                        {#each row.getVisibleCells() as cell}
                            {@const editing =
                                Boolean(editRowId) &&
                                Boolean(getRowId) &&
                                getRowId?.(row.original) === editRowId &&
                                Boolean(isEditableColumn?.(cell.column.id))}
                            <Table.Cell
                                class="max-w-56 px-3 {editing
                                    ? 'py-1'
                                    : compact
                                      ? 'py-1'
                                      : 'py-2'}"
                            >
                                {#if editing}
                                    <EditableCell
                                        value={cell.getValue() == null
                                            ? ""
                                            : String(cell.getValue())}
                                        options={columnLookups?.[cell.column.id]}
                                        onCommit={(v) =>
                                            onCommitCell?.(
                                                row.original,
                                                cell.column.id,
                                                v,
                                            )}
                                        onCancel={onCancelEdit}
                                    />
                                {:else}
                                    <span
                                        class="block truncate"
                                        title={String(cell.getValue() ?? "")}
                                    >
                                        <FlexRender
                                            content={cell.column.columnDef.cell}
                                            context={cell.getContext()}
                                        />
                                    </span>
                                {/if}
                            </Table.Cell>
                        {/each}
                    </Table.Row>
                {:else}
                    <Table.Row>
                        <Table.Cell
                            class="h-24 text-center text-muted-foreground"
                        >
                            No results.
                        </Table.Cell>
                    </Table.Row>
                {/each}
            </Table.Body>
        </Table.Root>
    </div>

    <div
        class="flex shrink-0 items-center justify-between {compact
            ? 'pt-1.5 pb-0'
            : 'pt-3 pb-0.5'}"
    >
        <div
            class="text-muted-foreground {compact ? 'text-[10px]' : 'text-sm'}"
        >
            {totalRows ?? table.getFilteredRowModel().rows.length} row(s)
        </div>
        <div class="flex items-center gap-2">
            <Button
                variant="outline"
                size="sm"
                class={compact ? "h-7 px-2 text-[10px]" : ""}
                disabled={loading || !table.getCanPreviousPage()}
                onclick={() => table.previousPage()}
            >
                <ChevronLeft class="size-4" />
                Previous
            </Button>
            <span
                class="text-muted-foreground {compact
                    ? 'text-[10px]'
                    : 'text-sm'}"
            >
                Page {table.getState().pagination.pageIndex + 1} of{" "}
                {table.getPageCount() || 1}
            </span>
            <Button
                variant="outline"
                size="sm"
                class={compact ? "h-7 px-2 text-[10px]" : ""}
                disabled={loading || !table.getCanNextPage()}
                onclick={() => table.nextPage()}
            >
                Next
                <ChevronRight class="size-4" />
            </Button>
        </div>
    </div>
</div>
