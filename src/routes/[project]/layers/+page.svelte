<script lang="ts">
    import LayersIcon from "@lucide/svelte/icons/layers";
    import TableIcon from "@lucide/svelte/icons/table";
    import PanelRightIcon from "@lucide/svelte/icons/panel-right";
    import { Tabs } from "$lib/components/ui/tabs/index.js";
    import { goto } from "$app/navigation";
    import { page } from "$app/stores";
    import { untrack } from "svelte";
    import type { ProjectTileset } from "$lib/components/dashboard/tilesetTypes";
    import type { ProjectCoverage } from "$lib/components/dashboard/coverageTypes";
    import type { LayerData } from "$lib/components/dashboard/layerTypes";
    import {
        entityIdsFromPackets,
        parseNdjsonCzml,
    } from "$lib/components/dashboard/czmlLoad";
    import type {
        SchemaTable,
        SchemaEdge,
    } from "$lib/components/dashboard/SchemaGraph.svelte";
    import { browser } from "$app/environment";
    import { onMount } from "svelte";
    import {
        layerSelection,
        toSelectionKey,
    } from "$lib/stores/layerSelection.svelte";
    import CesiumLoading from "$lib/components/CesiumLoading.svelte";

    let { data } = $props();

    const project = $derived(data?.project as Record<string, unknown> | null);
    const canWrite = $derived(
        ["owner", "admin", "collaborator"].includes(
            String((data as any)?.role ?? ($page.data as any)?.role ?? "viewer"),
        ),
    );
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

    const SCHEMA_TAB = "__schema";

    const tabs = $derived(
        tableNames.map((name) => ({
            value: name,
            label: name,
            count: rows[name]?.length,
        })),
    );

    const dataTabs = $derived([
        {
            value: SCHEMA_TAB,
            label: "Schema",
            separatorAfter: true,
        },
        ...tabs,
    ]);

    let activeTab = $state(
        untrack(() =>
            layerParam && tableNames.includes(layerParam)
                ? layerParam
                : (tableNames[0] ?? ""),
        ),
    );

    const dataTabValue = $derived(
        viewMode === "schema" ? SCHEMA_TAB : activeTab,
    );

    type LayersColumns = Record<
        string,
        ReturnType<typeof import("./tableColumns").buildColumns>
    >;
    let tableColumnBuilder = $state<
        typeof import("./tableColumns").buildColumns | null
    >(null);

    const columnsByTable = $derived.by(() => {
        const build = tableColumnBuilder;
        const out: LayersColumns = {};
        if (!build) return out;
        for (const name of tableNames) {
            out[name] = build(name, tables, mediaByEntity);
        }
        return out;
    });

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
        if (value === SCHEMA_TAB) {
            setViewMode("schema");
            return;
        }
        if (
            viewMode === "table" &&
            value === activeTab &&
            value === resolvedLayer
        ) {
            return;
        }
        activeTab = value;
        setViewMode("table");
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

    let schemaToolsOpen = $state(false);

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

    let mapEverShown = $state(
        untrack(() => {
            const v = viewParam;
            return v === "" || v === "map" || v === "3d";
        }),
    );

    $effect(() => {
        if (viewMode === "map") mapEverShown = true;
    });

    type LazyCmp = any;
    let LayerSceneCmp = $state<LazyCmp>(null);
    let SchemaGraphCmp = $state<LazyCmp | null>(null);
    let DataTableCmp = $state<LazyCmp | null>(null);
    let EntityRelationsPanelCmp = $state<LazyCmp | null>(null);
    let FkLinkerCmp = $state<LazyCmp | null>(null);

    $effect(() => {
        if (!browser) return;
        if (mapEverShown && !LayerSceneCmp) {
            void import("$lib/components/dashboard/LayerScene.svelte").then(
                (m) => {
                    LayerSceneCmp = m.default;
                },
            );
        }
    });

    $effect(() => {
        if (!browser) return;
        if (viewMode === "schema" && !SchemaGraphCmp) {
            void import("$lib/components/dashboard/SchemaGraph.svelte").then(
                (m) => {
                    SchemaGraphCmp = m.default;
                },
            );
        }
        if (viewMode === "schema" && schemaToolsOpen && !EntityRelationsPanelCmp) {
            void import(
                "$lib/components/dashboard/EntityRelationsPanel.svelte"
            ).then((m) => {
                EntityRelationsPanelCmp = m.default;
            });
        }
        if (
            viewMode === "schema" &&
            schemaToolsOpen &&
            canWrite &&
            accessToken &&
            !FkLinkerCmp
        ) {
            void import("$lib/components/digitize/FkLinker.svelte").then(
                (m) => {
                    FkLinkerCmp = m.default;
                },
            );
        }
    });

    $effect(() => {
        if (!browser) return;
        if (viewMode !== "table") return;
        if (!DataTableCmp) {
            void import("$lib/components/ui/data-table/index.js").then((m) => {
                DataTableCmp = m.DataTable;
            });
        }
        if (!tableColumnBuilder) {
            void import("./tableColumns").then((m) => {
                tableColumnBuilder = m.buildColumns;
            });
        }
    });

    // Deep links (media / search) set view + highlight — honour them on nav.
    // Always apply: a missing view used to leave table mode stuck when returning
    // from /layers?view=table to a bare /layers URL.
    $effect(() => {
        if (viewParam === "table" || viewParam === "schema") {
            viewMode = viewParam;
        } else {
            viewMode = "map";
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

    const inTables = $derived(viewMode === "table" || viewMode === "schema");

    // Default 3D — matches the working terrain-sampled load path.
    let mapDim = $state<MapDim>(
        untrack(() => (dimParam === "2d" ? "2d" : "3d")),
    );
    let selectedTilesetHash = $state("");
    let tilesets = $state<ProjectTileset[]>([]);
    let tilesetsLoading = $state(false);
    let coverages = $state<ProjectCoverage[]>([]);
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
    /** Last completed CZML fetch identity — skip duplicate $effect runs. */
    let czmlFetchedKey = "";
    let czmlInFlightKey = "";

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
        const slug = $page.params.project;
        const names = untrack(() => tableNames);
        const colsByTable = untrack(() => tables);
        const spatial = names.filter((name) =>
            (colsByTable[name] ?? []).some((c) => /^_?geom/i.test(c)),
        );
        const fetchKey = `${slug}\0${spatial.join("\0")}`;
        if (fetchKey === czmlFetchedKey || fetchKey === czmlInFlightKey) return;

        const gen = ++czmlLoadGen;
        czmlInFlightKey = fetchKey;
        // Only show the loading gate on the first fetch — flipping mapLoading
        // later would destroy/recreate LayerScene (full Cesium remount).
        const initial = mapLayers.length === 0;
        if (initial) mapLoading = true;
        const results: LayerData[] = [];

        for (const name of spatial) {
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

        if (gen !== czmlLoadGen) {
            if (czmlInFlightKey === fetchKey) czmlInFlightKey = "";
            return;
        }
        const key = layersContentKey(results);
        if (key !== czmlContentKey) {
            czmlContentKey = key;
            mapLayers = results;
        }
        czmlFetchedKey = fetchKey;
        czmlInFlightKey = "";
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

    async function loadCoverages() {
        try {
            const slug = $page.params.project;
            const res = await fetch(`/api/v1/projects/${slug}/coverages`, {
                headers: authHeaders(),
            });
            if (!res.ok) {
                coverages = [];
                return;
            }
            const body = await res.json();
            const list = Array.isArray(body)
                ? body
                : Array.isArray(body?.coverages)
                  ? body.coverages
                  : [];
            coverages = list as ProjectCoverage[];
        } catch (_) {
            coverages = [];
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

    $effect(() => {
        if (viewMode === "map") {
            void loadCoverages();
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
    <title>Layers — echidna</title>
</svelte:head>

<div class="flex h-full min-h-0 flex-col">
    <!-- Stable content shell: Cesium stays mounted (lamina-style). Table/schema
         overlay it — never {#if}-destroy the Viewer on tab or CZML load. -->
    <div class="relative min-h-0 flex-1">
        <div
            bind:this={mapChrome}
            class="absolute inset-0 overflow-hidden bg-background {mapFullscreen
                ? 'z-50'
                : ''} {viewMode === 'map'
                ? 'z-10'
                : 'invisible pointer-events-none z-0'}"
        >
            {#if browser && mapEverShown}
                {#if LayerSceneCmp}
                    <LayerSceneCmp
                        projectSlug={$page.params.project ?? ""}
                        {accessToken}
                        {tilesets}
                        {coverages}
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
                {:else}
                    <CesiumLoading />
                {/if}
            {/if}
        </div>

        {#if inTables}
            <div class="absolute inset-0 z-10 flex bg-background">
                <div class="min-h-0 flex-1 overflow-hidden p-5">
                    {#if tableNames.length > 0}
                        <Tabs
                            value={dataTabValue}
                            onValueChange={handleTabChange}
                            tabs={dataTabs}
                            class="flex h-full min-h-0 flex-col"
                            listClass="p-1.5"
                            contentClass="mt-5 flex flex-1 min-h-0 flex-col overflow-hidden"
                            lazy
                        >
                            {#snippet trailing()}
                                {#if viewMode === "schema"}
                                    <button
                                        type="button"
                                        onclick={() =>
                                            (schemaToolsOpen = !schemaToolsOpen)}
                                        class="rounded-md p-1.5 transition-colors {schemaToolsOpen
                                            ? 'bg-secondary text-foreground'
                                            : 'text-muted-foreground hover:text-foreground'}"
                                        title="Entity relations and foreign keys"
                                        aria-pressed={schemaToolsOpen}
                                    >
                                        <PanelRightIcon class="size-4" />
                                    </button>
                                {/if}
                            {/snippet}
                            {#snippet children(tabValue: string)}
                                {#if tabValue === SCHEMA_TAB}
                                    <div class="h-full min-h-0">
                                        {#if SchemaGraphCmp}
                                            <SchemaGraphCmp
                                                tables={schemaTables}
                                                edges={schemaEdges}
                                                loading={schemaLoading}
                                            />
                                        {/if}
                                    </div>
                                {:else}
                                    {@const tableRows = rows[tabValue] ?? []}
                                    {@const tableCols =
                                        columnsByTable[tabValue] ?? []}
                                    {#if tableRows.length > 0}
                                        <div
                                            bind:this={tableContainer}
                                            class="h-full min-h-0"
                                        >
                                        {#if DataTableCmp}
                                            <DataTableCmp
                                                columns={tableCols}
                                                data={tableRows}
                                                {rowClassName}
                                                pageIndex={currentPage}
                                                onRowClick={(
                                                    row: Record<
                                                        string,
                                                        unknown
                                                    >,
                                                    ev: MouseEvent,
                                                ) => {
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
                                                    if (
                                                        ev.ctrlKey ||
                                                        ev.metaKey
                                                    ) {
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
                                                onRowDblClick={(
                                                    row: Record<
                                                        string,
                                                        unknown
                                                    >,
                                                ) => {
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
                                        {/if}
                                        </div>
                                    {:else}
                                        <div
                                            class="flex h-full min-h-0 flex-col items-center justify-center rounded-lg border border-dashed border-border py-20"
                                        >
                                            <TableIcon
                                                class="size-10 text-muted-foreground/30 mb-3"
                                            />
                                            <p
                                                class="text-sm text-muted-foreground"
                                            >
                                                No rows in this table yet.
                                            </p>
                                        </div>
                                    {/if}
                                {/if}
                            {/snippet}
                        </Tabs>
                    {:else}
                        <div
                            class="flex h-full min-h-0 flex-col items-center justify-center rounded-lg border border-dashed border-border py-20"
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
                {#if viewMode === "schema" && schemaToolsOpen}
                    <aside
                        class="w-[22rem] shrink-0 overflow-y-auto border-l border-border bg-card/60 px-4 py-4 space-y-6"
                    >
                        {#if EntityRelationsPanelCmp}
                            <EntityRelationsPanelCmp
                                slug={$page.params.project ?? ""}
                                {accessToken}
                                {canWrite}
                            />
                        {/if}
                        {#if canWrite && accessToken && FkLinkerCmp}
                            <FkLinkerCmp
                                {accessToken}
                                slug={$page.params.project ?? ""}
                                tables={schemaTables}
                                edges={schemaEdges}
                                onSaved={() => {
                                    schemaLoaded = false;
                                    void loadSchema();
                                }}
                            />
                        {/if}
                    </aside>
                {/if}
            </div>
        {/if}
    </div>
</div>

