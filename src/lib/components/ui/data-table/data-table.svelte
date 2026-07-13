<script lang="ts">
    import {
        createSvelteTable,
        FlexRender,
    } from "$lib/components/ui/data-table/index.js";
    import * as Table from "$lib/components/ui/table/index.js";
    import { Button } from "$lib/components/ui/button/index.js";
    import {
        getCoreRowModel,
        getPaginationRowModel,
        getSortedRowModel,
        type ColumnDef,
        type SortingState,
    } from "@tanstack/table-core";
    import { untrack } from "svelte";
    import ArrowUpDown from "@lucide/svelte/icons/arrow-up-down";
    import ChevronLeft from "@lucide/svelte/icons/chevron-left";
    import ChevronRight from "@lucide/svelte/icons/chevron-right";

    type Props<TData> = {
        columns: ColumnDef<TData>[];
        data: TData[];
        pageSize?: number;
        rowClassName?: (row: TData) => string;
        pageIndex?: number;
        onPageChange?: (index: number) => void;
        onRowClick?: (row: TData) => void;
    };

    type TData = Record<string, unknown>;
    let {
        columns,
        data,
        pageSize = 25,
        rowClassName,
        pageIndex = 0,
        onPageChange,
        onRowClick,
    }: Props<TData> = $props();

    let sorting = $state<SortingState>([]);
    let _pageIndex = $state(untrack(() => pageIndex));
    let _pageSize = $state(untrack(() => pageSize));

    // Sync pageIndex prop → internal state
    $effect(() => {
        _pageIndex = pageIndex;
    });

    const table = createSvelteTable({
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
            get pagination() {
                return { pageIndex: _pageIndex, pageSize: _pageSize };
            },
        },
        onSortingChange: (updater) => {
            if (typeof updater === "function") sorting = updater(sorting);
            else sorting = updater;
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
        getSortedRowModel: getSortedRowModel(),
        getPaginationRowModel: getPaginationRowModel(),
    });
</script>

<div class="flex flex-col h-full min-h-0">
    <div
        class="flex-1 min-h-0 overflow-auto rounded-md border border-border bg-card"
    >
        <Table.Root>
            <Table.Header class="sticky top-0 z-10 bg-card/95 backdrop-blur-sm">
                {#each table.getHeaderGroups() as headerGroup}
                    <Table.Row class="hover:bg-transparent border-border">
                        {#each headerGroup.headers as header}
                            <Table.Head class="max-w-75 bg-muted/40">
                                {#if header.isPlaceholder}
                                    <!-- empty -->
                                {:else if header.column.getCanSort()}
                                    <Button
                                        variant="ghost"
                                        class="-ml-3 h-8 truncate data-[state=active]:bg-muted data-[state=active]:text-foreground"
                                        onclick={header.column.getToggleSortingHandler()}
                                    >
                                        <FlexRender
                                            content={header.column.columnDef
                                                .header}
                                            context={header.getContext()}
                                        />
                                        <ArrowUpDown
                                            class="ml-1 size-3.5 shrink-0"
                                        />
                                    </Button>
                                {:else}
                                    <span class="truncate block">
                                        <FlexRender
                                            content={header.column.columnDef
                                                .header}
                                            context={header.getContext()}
                                        />
                                    </span>
                                {/if}
                            </Table.Head>
                        {/each}
                    </Table.Row>
                {/each}
            </Table.Header>
            <Table.Body>
                {#each table.getRowModel().rows as row}
                    <Table.Row
                        class="border-border {onRowClick
                            ? 'cursor-pointer'
                            : ''} {rowClassName?.(row.original) ?? ''}"
                        onclick={() => onRowClick?.(row.original)}
                    >
                        {#each row.getVisibleCells() as cell}
                            <Table.Cell class="max-w-75">
                                <span
                                    class="block truncate"
                                    title={String(cell.getValue() ?? "")}
                                >
                                    <FlexRender
                                        content={cell.column.columnDef.cell}
                                        context={cell.getContext()}
                                    />
                                </span>
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

    <div class="flex shrink-0 items-center justify-between pt-3">
        <div class="text-sm text-muted-foreground">
            {table.getFilteredRowModel().rows.length} row(s)
        </div>
        <div class="flex items-center gap-2">
            <Button
                variant="outline"
                size="sm"
                disabled={!table.getCanPreviousPage()}
                onclick={() => table.previousPage()}
            >
                <ChevronLeft class="size-4" />
                Previous
            </Button>
            <span class="text-sm text-muted-foreground">
                Page {table.getState().pagination.pageIndex + 1} of{" "}
                {table.getPageCount()}
            </span>
            <Button
                variant="outline"
                size="sm"
                disabled={!table.getCanNextPage()}
                onclick={() => table.nextPage()}
            >
                Next
                <ChevronRight class="size-4" />
            </Button>
        </div>
    </div>
</div>
