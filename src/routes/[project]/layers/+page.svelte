<script lang="ts">
    import LayersIcon from "@lucide/svelte/icons/layers";
    import TableIcon from "@lucide/svelte/icons/table";
    import MapIcon from "@lucide/svelte/icons/map";
    import WaypointsIcon from "@lucide/svelte/icons/waypoints";
    import DownloadIcon from "@lucide/svelte/icons/download";
    import { Tabs } from "$lib/components/ui/tabs/index.js";
    import { DataTable } from "$lib/components/ui/data-table/index.js";
    import { renderComponent } from "$lib/components/ui/data-table/render-helpers.js";
    import MediaCell from "$lib/components/ui/media-cell.svelte";
    import { type ColumnDef, createColumnHelper } from "@tanstack/table-core";
    import { goto } from "$app/navigation";
    import { page } from "$app/stores";
    import { untrack } from "svelte";
    import type { ProjectTileset } from "$lib/components/dashboard/tilesetTypes";
    import type { LayerData } from "$lib/components/dashboard/layerTypes";
    import {
        entityIdsFromPackets,
        parseNdjsonCzml,
    } from "$lib/components/dashboard/czmlLoad";
    import SchemaGraph, {
        type SchemaTable,
        type SchemaEdge,
    } from "$lib/components/dashboard/SchemaGraph.svelte";
    import FkLinker from "$lib/components/digitize/FkLinker.svelte";
    import RowNum from "$lib/components/ui/row-num.svelte";
    import { browser } from "$app/environment";
    import { onMount } from "svelte";
    import {
        layerSelection,
        toSelectionKey,
    } from "$lib/stores/layerSelection.svelte";
    import LayerScene from "$lib/components/dashboard/LayerScene.svelte";

    let { data } = $props();

    const project = $derived(data?.project as Record<string, unknown> | null);
    const canWrite = $derived(
        ["owner", "admin", "collaborator"].includes(
            String((data as any)?.role ?? ($page.data as any)?.role ?? "viewer"),
        ),
    );
    const gpkgUri = $derived(project?.gpkg_uri as string | null);
    const entityCount = $derived(project?.entity_count as number | null);
    const tables = $derived(
        (data?.tables as Record<string, string[]> | null) ?? {},
    );
    const rows = $derived(
        (data?.rows as Record<string, Record<string, unknown>[]> | null) ?? {},
    );
    const mediaByEntity = $derived(
        (data?.mediaByEntity as Record<
            string,
            { url: string; media_type: string }[]
        >) ?? {},
    );
    const layerParam = $derived((data?.layer as string) ?? "");
    const highlightId = $derived((data?.highlight as string) ?? "");
    const highlightPage = $derived((data?.highlightPage as number) ?? 0);
    const viewParam = $derived((data?.view as string) ?? "");
    const dimParam = $derived((data?.dim as string) ?? "");
    const accessToken = $derived((data?.accessToken as string) ?? "");
    const tableNames = $derived(Object.keys(tables));

    /** Resolve ?layer= to an actual table name (case-insensitive). */
    const resolvedLayer = $derived.by(() => {
        if (!layerParam) return "";
        if (tableNames.includes(layerParam)) return layerParam;
        const lower = layerParam.toLowerCase();
        return tableNames.find((t) => t.toLowerCase() === lower) ?? layerParam;
    });

    const columnHelper = createColumnHelper<Record<string, unknown>>();

    /** Format arch_date JSON (or leave plain strings) for table display. */
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

    function buildColumns(
        tableName: string,
    ): ColumnDef<Record<string, unknown>>[] {
        const cols = tables[tableName] ?? [];

        const mediaCol: ColumnDef<Record<string, unknown>> =
            columnHelper.display({
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

    const tabs = $derived(
        tableNames.map((name) => ({
            value: name,
            label: name,
            count: rows[name]?.length,
        })),
    );

    let activeTab = $state(
        untrack(() =>
            layerParam && tableNames.includes(layerParam)
                ? layerParam
                : (tableNames[0] ?? ""),
        ),
    );

    // Keep tab in sync with ?layer= from media/search deep links.
    $effect(() => {
        if (resolvedLayer && tableNames.includes(resolvedLayer)) {
            activeTab = resolvedLayer;
        } else if (!activeTab && tableNames.length > 0) {
            activeTab = tableNames[0];
        }
    });

    type ViewMode = "schema" | "table" | "map";
    type MapDim = "2d" | "3d";

    /** Compact layers URL — interactive selection stays in client state. */
    function layersSearch(opts: {
        mode: ViewMode;
        dim?: MapDim;
        layer?: string;
        highlight?: string;
    }): string {
        const params = new URLSearchParams();
        if (opts.mode === "map" && opts.dim === "3d") {
            params.set("view", "3d");
        } else if (opts.mode === "map" && opts.dim === "2d") {
            params.set("view", "map");
            params.set("dim", "2d");
        } else if (opts.mode === "map") {
            params.set("view", "map");
        } else {
            params.set("view", opts.mode);
        }
        // highlight only when explicitly passed (media/search deep links keep it in the URL)
        if (opts.highlight) {
            params.set("highlight", opts.highlight);
            if (opts.layer) params.set("layer", opts.layer);
        } else if (opts.mode !== "map" && opts.layer) {
            params.set("layer", opts.layer);
        }
        const q = params.toString();
        return q ? `?${q}` : "";
    }

    function handleTabChange(value: string) {
        if (value === activeTab && value === resolvedLayer) return;
        activeTab = value;
        goto(
            `/${$page.params.project}/layers${layersSearch({
                mode: viewMode === "schema" ? "table" : viewMode,
                dim: mapDim,
                layer: value,
            })}`,
            { replaceState: true, noScroll: true },
        );
    }

    /** Interactive selection — shared store (URL highlight seeds once). */
    let lastUrlHighlight = $state("");
    const selectedId = $derived(layerSelection.primaryId);
    const selectedLayer = $derived(layerSelection.primaryLayer);
    const selectionSize = $derived(layerSelection.size);
    const selectionSig = $derived(
        `${layerSelection.primaryKey ?? ""}|${[...layerSelection.selected].sort().join(",")}`,
    );

    $effect(() => {
        const id = highlightId;
        if (id && id !== lastUrlHighlight) {
            lastUrlHighlight = id;
            const layer = resolvedLayer || layerParam || activeTab;
            if (layer) {
                layerSelection.selectSingle(layer, id);
                activeTab = layer;
            }
        }
    });

    function rowClassName(row: Record<string, unknown>): string {
        // Depend on selectionSig so row styles update when membership changes at same size.
        void selectionSig;
        if (selectionSize === 0) return "";
        const id = String(row.source_id ?? row.SOURCE_ID ?? "");
        if (!id) return "";
        const key = toSelectionKey(activeTab, id);
        if (!layerSelection.selected.has(key)) return "";
        if (layerSelection.primaryKey === key) {
            return "bg-accent ring-1 ring-inset ring-primary/20";
        }
        return "bg-accent/40";
    }

    let viewMode = $state<ViewMode>(
        untrack(() => {
            if (
                viewParam === "map" ||
                viewParam === "3d" ||
                viewParam === "table" ||
                viewParam === "schema"
            ) {
                return viewParam === "3d" ? "map" : viewParam;
            }
            return "map";
        }),
    );

    // Deep links (media / search) set view + highlight — honour them on nav.
    $effect(() => {
        if (
            viewParam === "map" ||
            viewParam === "3d" ||
            viewParam === "table" ||
            viewParam === "schema"
        ) {
            viewMode = viewParam === "3d" ? "map" : viewParam;
        }
    });

    function setViewMode(mode: ViewMode) {
        viewMode = mode;
        goto(
            `/${$page.params.project}/layers${layersSearch({
                mode,
                dim: mapDim,
                layer: activeTab,
            })}`,
            { replaceState: true, noScroll: true },
        );
    }

    // Default 3D — matches the working terrain-sampled load path.
    let mapDim = $state<MapDim>(
        untrack(() => (dimParam === "2d" ? "2d" : "3d")),
    );
    let selectedTilesetHash = $state("");
    let tilesets = $state<ProjectTileset[]>([]);
    let tilesetsLoading = $state(false);
    let mapChrome = $state<HTMLDivElement>();
    let mapFullscreen = $state(false);

    onMount(() => {
        if (!browser) return;
        try {
            const focus = sessionStorage.getItem("tinyowl:layers:focusTileset");
            if (focus) {
                selectedTilesetHash = focus;
                sessionStorage.removeItem("tinyowl:layers:focusTileset");
            }
        } catch {
            /* ignore */
        }
    });

    $effect(() => {
        if (dimParam === "2d" || dimParam === "3d") {
            mapDim = dimParam;
        }
    });

    function setMapDim(dim: MapDim) {
        mapDim = dim;
        viewMode = "map";
        goto(
            `/${$page.params.project}/layers${layersSearch({
                mode: "map",
                dim,
            })}`,
            { replaceState: true, noScroll: true },
        );
    }

    function selectTileset(hash: string) {
        selectedTilesetHash = hash;
    }

    /** Keep table tab on the primary selected layer. */
    $effect(() => {
        const layer = layerSelection.primaryLayer;
        if (layer && tableNames.includes(layer)) activeTab = layer;
    });

    async function toggleMapFullscreen() {
        const el = mapChrome;
        if (!el) return;
        try {
            if (!document.fullscreenElement) {
                await el.requestFullscreen();
                mapFullscreen = true;
            } else {
                await document.exitFullscreen();
                mapFullscreen = false;
            }
        } catch {
            /* ignore */
        }
    }

    $effect(() => {
        const onFs = () => {
            mapFullscreen = Boolean(document.fullscreenElement);
        };
        document.addEventListener("fullscreenchange", onFs);
        return () => document.removeEventListener("fullscreenchange", onFs);
    });

    let mapLayers = $state<LayerData[]>([]);
    let mapLoading = $state(false);
    let czmlLoadGen = 0;
    let czmlContentKey = "";

    let schemaTables = $state<SchemaTable[]>([]);
    let schemaEdges = $state<SchemaEdge[]>([]);
    let schemaLoading = $state(false);
    let schemaLoaded = $state(false);

    function authHeaders(): HeadersInit {
        return accessToken ? { Authorization: `Bearer ${accessToken}` } : {};
    }

    function layersContentKey(layers: LayerData[]): string {
        return layers
            .map((l) => `${l.name}:${l.packets?.length ?? 0}`)
            .join("|");
    }

    async function loadAllCzml() {
        const gen = ++czmlLoadGen;
        // Only show the loading gate on the first fetch — flipping mapLoading
        // later would destroy/recreate LayerScene (full Cesium remount).
        const initial = mapLayers.length === 0;
        if (initial) mapLoading = true;
        const slug = $page.params.project;
        const names = untrack(() => tableNames);
        const results: LayerData[] = [];

        for (const name of names) {
            if (gen !== czmlLoadGen) return;
            try {
                const res = await fetch(
                    `/api/v1/projects/${slug}/layers/${name}/czml`,
                    { headers: authHeaders() },
                );
                if (res.ok) {
                    const packets = parseNdjsonCzml(await res.text());
                    const entityIds = entityIdsFromPackets(packets, name);
                    if (entityIds.length > 0) {
                        results.push({
                            name,
                            packets,
                            entityIds,
                            visible: true,
                        });
                    }
                }
            } catch (_) {}
        }

        if (gen !== czmlLoadGen) return;
        const key = layersContentKey(results);
        if (key !== czmlContentKey) {
            czmlContentKey = key;
            mapLayers = results;
        }
        if (initial) mapLoading = false;
    }

    /** Ensure selected layer is visible — no refetch. */
    $effect(() => {
        const id = selectedId;
        const layer = selectedLayer;
        if (!id || !layer || mapLayers.length === 0) return;
        const idx = mapLayers.findIndex((l) => l.name === layer);
        if (idx >= 0 && !mapLayers[idx]!.visible) {
            mapLayers[idx]!.visible = true;
            mapLayers = [...mapLayers];
        }
    });

    async function loadSchema() {
        if (schemaLoaded || schemaLoading) return;
        schemaLoading = true;
        try {
            const slug = $page.params.project;
            const res = await fetch(`/api/v1/projects/${slug}/schema`, {
                headers: authHeaders(),
            });
            if (res.ok) {
                const json = await res.json();
                schemaTables = json.tables ?? [];
                schemaEdges = json.edges ?? [];
                schemaLoaded = true;
            }
        } catch (_) {
            schemaTables = [];
            schemaEdges = [];
        } finally {
            schemaLoading = false;
        }
    }

    async function loadTilesets() {
        tilesetsLoading = true;
        try {
            const slug = $page.params.project;
            const res = await fetch(`/api/v1/projects/${slug}/tilesets`, {
                headers: authHeaders(),
            });
            if (res.ok) {
                const body = await res.json();
                tilesets = Array.isArray(body) ? body : [];
                if (
                    selectedTilesetHash &&
                    !tilesets.some((t) => t.hash === selectedTilesetHash)
                ) {
                    selectedTilesetHash = "";
                }
                if (
                    !selectedTilesetHash &&
                    tilesets.some((t) => t.ingest_status === "ready")
                ) {
                    selectedTilesetHash =
                        tilesets.find((t) => t.ingest_status === "ready")
                            ?.hash ?? "";
                }
            } else {
                tilesets = [];
            }
        } catch (_) {
            tilesets = [];
        } finally {
            tilesetsLoading = false;
        }
    }

    // Stable key so ?highlight= URL updates (which re-run page load) don't refetch.
    const tableNamesKey = $derived(tableNames.join("\0"));

    $effect(() => {
        const mode = viewMode;
        const namesKey = tableNamesKey;
        // Do NOT depend on mapDim — refetching CZML on 2D/3D toggle remounts
        // datasources and looks like a full reload.
        if (mode === "map" && namesKey) {
            void loadAllCzml();
        }
        if (mode === "schema" && namesKey) {
            void loadSchema();
        }
    });

    $effect(() => {
        if (viewMode === "map" && mapDim === "3d") {
            void loadTilesets();
        }
    });

    let tableContainer = $state<HTMLDivElement>();
    let currentPage = $state(untrack(() => highlightPage));

    $effect(() => {
        currentPage = highlightPage;
    });

    $effect(() => {
        if (activeTab && activeTab !== layerParam && !selectedId) {
            currentPage = 0;
        }
    });

    $effect(() => {
        if (!selectedId || viewMode !== "table") return;
        // Scroll highlighted row into view after table paints.
        const t = setTimeout(() => {
            const el = tableContainer?.querySelector(".bg-accent");
            el?.scrollIntoView({ behavior: "smooth", block: "center" });
        }, 200);
        return () => clearTimeout(t);
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
            <div class="flex items-center gap-1 -mb-1">
                {#if gpkgUri}
                    <a
                        href={gpkgUri}
                        class="text-muted-foreground hover:text-foreground transition-colors"
                        title="Download GeoPackage"
                    >
                        <DownloadIcon class="size-5" />
                    </a>
                {/if}
                <div
                    class="ml-2 flex items-center rounded-md border border-border overflow-hidden"
                >
                    <button
                        onclick={() => setViewMode("map")}
                        class="px-2.5 py-1 text-xs {viewMode === 'map'
                            ? 'bg-secondary text-foreground font-medium'
                            : 'text-muted-foreground hover:text-foreground'} transition-colors"
                        title="Map view"
                    >
                        <MapIcon class="size-3.5" />
                    </button>
                    <button
                        onclick={() => setViewMode("table")}
                        class="px-2.5 py-1 text-xs border-l border-border {viewMode ===
                        'table'
                            ? 'bg-secondary text-foreground font-medium'
                            : 'text-muted-foreground hover:text-foreground'} transition-colors"
                        title="Table view"
                    >
                        <TableIcon class="size-3.5" />
                    </button>
                    <button
                        onclick={() => setViewMode("schema")}
                        class="px-2.5 py-1 text-xs border-l border-border {viewMode ===
                        'schema'
                            ? 'bg-secondary text-foreground font-medium'
                            : 'text-muted-foreground hover:text-foreground'} transition-colors"
                        title="Schema graph"
                    >
                        <WaypointsIcon class="size-3.5" />
                    </button>
                </div>
            </div>
        </div>
        <p class="mt-0.5 text-sm text-muted-foreground">
            {tableNames.length}
            {tableNames.length === 1 ? " table" : " tables"}
            {#if entityCount != null}
                · {entityCount} entities{/if}
            {#if viewMode === "schema" && schemaEdges.length > 0}
                · {schemaEdges.length} relations{/if}
            {#if viewMode === "map" && mapDim === "3d" && tilesets.length > 0}
                · {tilesets.filter((t) => t.ingest_status === "ready").length}
                3D model{tilesets.filter((t) => t.ingest_status === "ready")
                    .length === 1
                    ? ""
                    : "s"}{/if}
        </p>
    </div>

    <!-- Stable content shell: Cesium stays mounted (lamina-style). Table/schema
         overlay it — never {#if}-destroy the Viewer on tab or CZML load. -->
    <div class="flex-1 min-h-0 relative">
        <div
            bind:this={mapChrome}
            class="absolute inset-0 rounded-lg overflow-hidden border border-border bg-background {mapFullscreen
                ? 'rounded-none border-0 z-50'
                : ''} {viewMode === 'map'
                ? 'z-10'
                : 'invisible pointer-events-none z-0'}"
        >
            {#if browser}
                <LayerScene
                    projectSlug={$page.params.project ?? ""}
                    {accessToken}
                    {tilesets}
                    selectedHash={selectedTilesetHash}
                    loading={mapLoading}
                    layers={mapLayers}
                    {rows}
                    dim={mapDim}
                    active={viewMode === "map"}
                    fullscreen={mapFullscreen}
                    onSelectTileset={selectTileset}
                    onToggleFullscreen={toggleMapFullscreen}
                    onDimChange={setMapDim}
                />
            {/if}
        </div>

        {#if viewMode === "table"}
            <div class="absolute inset-0 z-20 bg-background">
                {#if tableNames.length > 0}
                    <div class="h-full min-h-0">
                        <Tabs
                            value={activeTab}
                            onValueChange={handleTabChange}
                            {tabs}
                        >
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
                                            onRowClick={(row, ev) => {
                                                const id = String(
                                                    row.source_id ??
                                                        row.SOURCE_ID ??
                                                        "",
                                                );
                                                if (!id) return;
                                                if (ev.shiftKey) {
                                                    layerSelection.addSelection(
                                                        tabValue,
                                                        id,
                                                    );
                                                    return;
                                                }
                                                if (ev.ctrlKey || ev.metaKey) {
                                                    layerSelection.toggleSelection(
                                                        tabValue,
                                                        id,
                                                    );
                                                    return;
                                                }
                                                layerSelection.selectSingle(
                                                    tabValue,
                                                    id,
                                                );
                                            }}
                                            onRowDblClick={(row) => {
                                                const id = String(
                                                    row.source_id ??
                                                        row.SOURCE_ID ??
                                                        "",
                                                );
                                                if (!id) return;
                                                layerSelection.selectSingle(
                                                    tabValue,
                                                    id,
                                                );
                                                setViewMode("map");
                                            }}
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
                        <LayersIcon
                            class="size-10 text-muted-foreground/30 mb-3"
                        />
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
        {:else if viewMode === "schema"}
            <div class="absolute inset-0 z-20 bg-background flex flex-col">
                {#if tableNames.length > 0}
                    <div class="flex-1 min-h-0">
                        <SchemaGraph
                            tables={schemaTables}
                            edges={schemaEdges}
                            loading={schemaLoading}
                        />
                    </div>
                    {#if canWrite && accessToken}
                        <div
                            class="shrink-0 border-t border-border bg-card/80 px-4 py-4 max-h-[40%] overflow-y-auto"
                        >
                            <FkLinker
                                {accessToken}
                                slug={$page.params.project ?? ""}
                                tables={schemaTables}
                                edges={schemaEdges}
                                onSaved={() => {
                                    schemaLoaded = false;
                                    void loadSchema();
                                }}
                            />
                        </div>
                    {/if}
                {:else}
                    <div
                        class="flex flex-col items-center justify-center rounded-lg border border-dashed border-border py-20"
                    >
                        <LayersIcon
                            class="size-10 text-muted-foreground/30 mb-3"
                        />
                        <p class="text-sm text-muted-foreground mb-3">
                            No tables yet.
                        </p>
                        {#if canWrite}
                            <a
                                href={`/${$page.params.project}/import`}
                                class="text-sm text-primary hover:underline"
                                >Import CSV or GeoJSON</a
                            >
                        {/if}
                    </div>
                {/if}
            </div>
        {/if}
    </div>
</div>
