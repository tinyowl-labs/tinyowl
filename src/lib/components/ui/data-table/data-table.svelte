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
    };

    type TData = Record<string, unknown>;
    let {
        columns,
        data,
        pageSize = 25,
        rowClassName,
        pageIndex = 0,
        onPageChange,
    }: Props<TData> = $props();

    let sorting = $state<SortingState>([]);

    // Sync table page when prop changes (from parent)
    let internalPage = $state(pageIndex);
    $effect(() => {
        if (pageIndex !== internalPage && table) {
            internalPage = pageIndex;
            table.setPageIndex(pageIndex);
        }
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
        },
        onSortingChange: (updater) => {
            if (typeof updater === "function") sorting = updater(sorting);
            else sorting = updater;
        },
        getCoreRowModel: getCoreRowModel(),
        getSortedRowModel: getSortedRowModel(),
        getPaginationRowModel: getPaginationRowModel(),
        initialState: {
            pagination: { pageSize, pageIndex },
        },
    });
</script>

<div class="flex flex-col h-full min-h-0">
    <div class="flex-1 min-h-0 overflow-auto rounded-md border">
        <Table.Root>
            <Table.Header>
                {#each table.getHeaderGroups() as headerGroup}
                    <Table.Row>
                        {#each headerGroup.headers as header}
                            <Table.Head class="max-w-[300px]">
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
                    <Table.Row class={rowClassName?.(row.original) ?? ""}>
                        {#each row.getVisibleCells() as cell}
                            <Table.Cell class="max-w-[300px]">
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
                        <Table.Cell class="h-24 text-center">
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
