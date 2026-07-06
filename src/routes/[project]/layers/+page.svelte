<script lang="ts">
    import LayersIcon from "@lucide/svelte/icons/layers";
    import TableIcon from "@lucide/svelte/icons/table";
    import DownloadIcon from "@lucide/svelte/icons/download";
    import { Tabs } from "$lib/components/ui/tabs/index.js";
    import { DataTable } from "$lib/components/ui/data-table/index.js";
    import { type ColumnDef, createColumnHelper } from "@tanstack/table-core";
    import { goto } from "$app/navigation";
    import { page } from "$app/stores";
    import { onMount, tick } from "svelte";

    let { data } = $props();

    const project = $derived(data?.project as Record<string, unknown> | null);
    const gpkgUri = $derived(project?.gpkg_uri as string | null);
    const entityCount = $derived(project?.entity_count as number | null);
    const tables = $derived(
        (data?.tables as Record<string, string[]> | null) ?? {},
    );
    const rows = $derived(
        (data?.rows as Record<string, Record<string, unknown>[]> | null) ?? {},
    );
    const layerParam = $derived((data?.layer as string) ?? "");
    const highlightId = $derived((data?.highlight as string) ?? "");
    const highlightPage = $derived((data?.highlightPage as number) ?? 0);
    const tableNames = $derived(Object.keys(tables));

    const columnHelper = createColumnHelper<Record<string, unknown>>();

    function buildColumns(
        tableName: string,
    ): ColumnDef<Record<string, unknown>>[] {
        const cols = tables[tableName] ?? [];
        return cols
            .filter((col) => !/^_?geom/i.test(col))
            .map((col) =>
                columnHelper.accessor(col, {
                    header: col,
                    cell: (info) => {
                        const val = info.getValue();
                        if (val === null || val === undefined) return "—";
                        if (typeof val === "object") return JSON.stringify(val);
                        return String(val);
                    },
                }),
            );
    }

    const tabs = $derived(
        tableNames.map((name) => ({
            value: name,
            label: name,
            count: rows[name]?.length,
        })),
    );

    let activeTab = $state(
        layerParam && tableNames.includes(layerParam)
            ? layerParam
            : (tableNames[0] ?? ""),
    );
    $effect(() => {
        if (!activeTab && tableNames.length > 0) {
            activeTab = tableNames[0];
        }
    });

    function handleTabChange(value: string) {
        activeTab = value;
        const params = new URLSearchParams();
        params.set("layer", value);
        if (highlightId) params.set("highlight", highlightId);
        goto(`/${$page.params.project}/layers?${params.toString()}`, {
            replaceState: true,
            noScroll: true,
        });
    }

    function rowClassName(row: Record<string, unknown>): string {
        if (!highlightId) return "";
        const id = (row.source_id ?? row.SOURCE_ID ?? "") as string;
        return id === highlightId
            ? "bg-accent ring-1 ring-inset ring-primary/20"
            : "";
    }

    let tableContainer = $state<HTMLDivElement>();
    let currentPage = $state(highlightPage);

    // Reset to page 0 when switching to a tab that isn't the highlighted one
    $effect(() => {
        if (activeTab && activeTab !== layerParam) {
            currentPage = 0;
        }
    });

    onMount(() => {
        if (highlightId) {
            // Wait for table to render, then scroll to highlighted row
            setTimeout(() => {
                const el = tableContainer?.querySelector(".bg-accent");
                el?.scrollIntoView({ behavior: "smooth", block: "center" });
            }, 200);
        }
    });
</script>

<svelte:head>
    <title>Layers — TinyOwl</title>
</svelte:head>

<div class="flex flex-col h-full px-6 py-4">
    <div class="shrink-0 mb-4">
        <div class="flex items-center gap-2.5">
            <LayersIcon class="size-5 text-muted-foreground" />
            <h1 class="text-xl font-bold tracking-tight text-foreground">
                Layers
            </h1>
        </div>
        <p class="mt-0.5 text-sm text-muted-foreground">
            {tableNames.length}
            {tableNames.length === 1 ? " table" : " tables"}
            {#if entityCount != null}
                · {entityCount} entities{/if}
        </p>
    </div>

    {#if gpkgUri}
        <div class="shrink-0 mb-4">
            <a
                href={gpkgUri}
                class="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-4 py-2 text-sm font-medium text-foreground hover:bg-secondary transition-colors no-underline"
            >
                <DownloadIcon class="size-4" />
                Download GeoPackage
            </a>
        </div>
    {/if}

    {#if tableNames.length > 0}
        <div class="flex-1 min-h-0">
            <Tabs value={activeTab} onValueChange={handleTabChange} {tabs}>
                {#snippet children(tabValue: string)}
                    {@const tableRows = rows[tabValue] ?? []}
                    {@const tableCols = buildColumns(tabValue)}
                    {#if tableRows.length > 0}
                        <div bind:this={tableContainer}>
                            <DataTable
                                columns={tableCols}
                                data={tableRows}
                                {rowClassName}
                                pageIndex={currentPage}
                            />
                        </div>
                    {:else}
                        <div
                            class="flex flex-col items-center justify-center rounded-lg border border-dashed border-border py-20"
                        >
                            <TableIcon
                                class="size-10 text-muted-foreground/30 mb-3"
                            />
                            <p class="text-sm text-muted-foreground">
                                No rows in this table yet.
                            </p>
                        </div>
                    {/if}
                {/snippet}
            </Tabs>
        </div>
    {:else}
        <div
            class="flex flex-col items-center justify-center rounded-lg border border-dashed border-border py-20"
        >
            <LayersIcon class="size-10 text-muted-foreground/30 mb-3" />
            <p class="text-sm text-muted-foreground">
                No GeoPackage data yet. Run
                <code
                    class="font-mono text-xs rounded px-1.5 py-0.5 bg-secondary"
                    >tinyowl push</code
                >
                to upload.
            </p>
        </div>
    {/if}
</div>
