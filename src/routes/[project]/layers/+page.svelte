<script lang="ts">
    import LayersIcon from "@lucide/svelte/icons/layers";
    import TableIcon from "@lucide/svelte/icons/table";
    import PanelRightIcon from "@lucide/svelte/icons/panel-right";
    import PencilIcon from "@lucide/svelte/icons/pencil";
    import PlusIcon from "@lucide/svelte/icons/plus";
    import Columns3Icon from "@lucide/svelte/icons/columns-3";
    import { Tabs } from "$lib/components/ui/tabs/index.js";
    import { goto, invalidateAll } from "$app/navigation";
    import { page } from "$app/stores";
    import { untrack } from "svelte";
    import type { ProjectTileset } from "$lib/components/dashboard/tilesetTypes";
    import type { ProjectCoverage } from "$lib/components/dashboard/coverageTypes";
    import type { LayerData } from "$lib/components/dashboard/layerTypes";
    import {
        defaultOpacityForPackets,
        ensureExplicitViews,
        type LayerView,
    } from "$lib/components/dashboard/layerViews";
    import {
        entityIdsFromPackets,
        parseNdjsonCzmlAsync,
        rowsFromPackets,
    } from "$lib/components/dashboard/czmlLoad";
    import type {
        SchemaTable,
        SchemaEdge,
    } from "$lib/components/dashboard/SchemaGraph.svelte";
    import { browser } from "$app/environment";
    import { onMount, onDestroy } from "svelte";
    import {
        layerSelection,
        parseSelectionKey,
        toSelectionKey,
    } from "$lib/stores/layerSelection.svelte";
    import {
        joinHint,
    } from "$lib/project/schemaJoin";
    import { editBuffer, attrFieldsForTable } from "$lib/stores/editBuffer.svelte";
    import {
        loadProjectFkLookups,
        type LookupOpt,
    } from "$lib/project/schemaFields";
    import { fromEditBuffer } from "$lib/geoDiff";
    import { isTypingTarget, matchPrefShortcut } from "$lib/shortcuts";
    import { browserMediaUrl } from "$lib/project/mediaUrl";
    import CesiumLoading from "$lib/components/CesiumLoading.svelte";
    import {
        DEFAULT_SEARCH_RADIUS,
        parseBBox,
    } from "$lib/search/params";

    type ViewingRef = "main" | "develop";

    let { data } = $props();

    const project = $derived(data?.project as Record<string, unknown> | null);
    const isMember = $derived(
        Boolean((data as any)?.isMember ?? ($page.data as any)?.isMember),
    );
    const canWrite = $derived(
        ["owner", "admin", "collaborator"].includes(
            String((data as any)?.role ?? ($page.data as any)?.role ?? "viewer"),
        ),
    );
    const viewingRef = $derived<ViewingRef>(
        !isMember
            ? "main"
            : $page.url.searchParams.get("ref") === "main"
              ? "main"
              : "develop",
    );
    const canMutate = $derived(canWrite && viewingRef !== "main");

    $effect(() => {
        if (!browser) return;
        editBuffer.bindProject($page.params.project ?? "");
    });

    const tables = $derived(
        (data?.tables as Record<string, string[]> | null) ?? {},
    );
    let mapLayers = $state<LayerData[]>([]);
    const serverRows = $derived(
        (data?.rows as Record<string, Record<string, unknown>[]> | null) ?? {},
    );
    const rows = $derived.by(() => {
        const out: Record<string, Record<string, unknown>[]> = {
            ...serverRows,
        };
        for (const layer of mapLayers) {
            if (!layer.packets?.length) continue;
            if ((out[layer.name]?.length ?? 0) > 0) continue;
            const fromCzml = rowsFromPackets(layer.packets, layer.name);
            if (fromCzml.length) out[layer.name] = fromCzml;
        }
        return out;
    });
    const accessToken = $derived((data?.accessToken as string) ?? "");
    const mediaByEntity = $derived.by(() => {
        const raw =
            (data?.mediaByEntity as Record<
                string,
                { url: string; media_type: string }[]
            >) ?? {};
        const token = accessToken;
        const out: Record<string, { url: string; media_type: string }[]> = {};
        for (const [key, items] of Object.entries(raw)) {
            out[key] = items.map((m) => ({
                url: browserMediaUrl(m.url, { accessToken: token }),
                media_type: m.media_type,
            }));
        }
        return out;
    });
    const layerParam = $derived((data?.layer as string) ?? "");
    const highlightId = $derived((data?.highlight as string) ?? "");
    const highlightPage = $derived((data?.highlightPage as number) ?? 0);
    const viewParam = $derived((data?.view as string) ?? "");
    const dimParam = $derived((data?.dim as string) ?? "");
    const tableNames = $derived(Object.keys(tables));
    const diffFeatures = $derived(fromEditBuffer(editBuffer.entries));
    const bufferSummary = $derived(
        Object.entries(editBuffer.pendingByTable)
            .map(([t, n]) => `${t} ${n}`)
            .join(" · "),
    );

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
            pending: editBuffer.pendingByTable[name] || undefined,
        })),
    );

    const dataTabs = $derived([
        {
            value: SCHEMA_TAB,
            label: "Schema",
            separatorAfter: true,
            keepAlive: true,
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

    type ViewMode = "schema" | "table" | "map";
    type MapDim = "2d" | "3d";

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
    let tableLookups = $state<Record<string, Record<string, LookupOpt[]>>>(
        {},
    );

    const columnsByTable = $derived.by(() => {
        const build = tableColumnBuilder;
        const out: LayersColumns = {};
        if (!build) return out;
        void editBuffer.schemaAdds;
        for (const name of tableNames) {
            const cols = [
                ...(tables[name] ?? []),
                ...editBuffer.addedColumnsFor(name),
            ];
            out[name] = build(
                name,
                { ...tables, [name]: cols },
                mediaByEntity,
                tableLookups[name],
            );
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

    /** Compact layers URL — interactive selection stays in client state. */
    function layersSearch(opts: {
        mode: ViewMode;
        dim?: MapDim;
        layer?: string;
        highlight?: string;
        q?: string | null;
        rows?: string[] | null;
        ref?: ViewingRef | null;
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
        const q =
            opts.q !== undefined
                ? opts.q
                : $page.url.searchParams.get("q");
        if (q) params.set("q", q);
        const nextRows =
            opts.rows !== undefined
                ? (opts.rows ?? [])
                : $page.url.searchParams.getAll("row");
        for (const row of nextRows) {
            if (row.trim()) params.append("row", row);
        }
        for (const key of ["bbox", "lat", "lng", "radius", "place"] as const) {
            const v = $page.url.searchParams.get(key);
            if (v) params.set(key, v);
        }
        const nextRef =
            opts.ref === null
                ? "develop"
                : opts.ref !== undefined
                  ? opts.ref
                  : $page.url.searchParams.get("ref") === "main"
                    ? "main"
                    : "develop";
        if (nextRef === "main") params.set("ref", "main");
        const qs = params.toString();
        return qs ? `?${qs}` : "";
    }

    function withViewingRef(path: string): string {
        if (viewingRef !== "main") return path;
        return path.includes("?") ? `${path}&ref=main` : `${path}?ref=main`;
    }

    function setViewingRef(ref: ViewingRef) {
        if (!isMember) return;
        const slug = $page.params.project;
        if (!slug) return;
        void goto(
            `/${encodeURIComponent(slug)}/layers${layersSearch({
                mode: viewMode,
                dim: mapDim,
                layer: activeTab,
                ref,
            })}`,
            { replaceState: true, noScroll: true },
        );
    }

    function clearSearchQ() {
        const slug = $page.params.project;
        if (!slug) return;
        void goto(
            `/${encodeURIComponent(slug)}/layers${layersSearch({
                mode: viewMode,
                dim: mapDim,
                q: "",
                rows: [],
            })}`,
            { replaceState: true, noScroll: true },
        );
    }

    function handleTabChange(value: string) {
        if (tableAttrEdit && value !== tableAttrEdit.table) {
            tableAttrEdit = null;
        }
        if (value === SCHEMA_TAB) {
            setViewMode("schema");
            return;
        }
        if (canWrite) editBuffer.setTargetLayer(value);
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

    const searchQ = $derived(String((data as { searchQ?: string })?.searchQ ?? ""));
    const searchRows = $derived(
        ((data as { searchRows?: string[] })?.searchRows ?? []) as string[],
    );
    const placeBBox = $derived(parseBBox($page.url.searchParams.get("bbox")));
    const placeLat = $derived.by(() => {
        const n = Number($page.url.searchParams.get("lat"));
        return Number.isFinite(n) ? n : null;
    });
    const placeLng = $derived.by(() => {
        const n = Number($page.url.searchParams.get("lng"));
        return Number.isFinite(n) ? n : null;
    });
    const placeRadius = $derived.by(() => {
        const raw = $page.url.searchParams.get("radius");
        if (raw == null || raw === "") return DEFAULT_SEARCH_RADIUS;
        const n = Number(raw);
        return Number.isFinite(n) ? n : DEFAULT_SEARCH_RADIUS;
    });
    const searchHits = $derived(
        ((data as { searchHits?: Array<{
            entity_type: string;
            entity_id: string;
        }> })?.searchHits ?? []) as Array<{
            entity_type: string;
            entity_id: string;
        }>,
    );

    $effect(() => {
        const id = highlightId;
        if ((searchQ || searchRows.length > 0) && searchHits.length > 0) return;
        if (id && id !== lastUrlHighlight) {
            lastUrlHighlight = id;
            const layer = resolvedLayer || layerParam || activeTab;
            if (layer) {
                layerSelection.selectSingle(layer, id);
                activeTab = layer;
            }
        }
    });

    $effect(() => {
        const q = searchQ;
        const rowSig = searchRows.join("\0");
        const hits = searchHits;
        const isolating = Boolean(q) || searchRows.length > 0;
        const sig = isolating
            ? `${q}\0${rowSig}\0${hits.map((h) => `${h.entity_type}:${h.entity_id}`).join(",")}`
            : "";
        untrack(() => {
            if (!isolating) {
                layerSelection.exitIsolate();
                return;
            }
            if (hits.length === 0) return;
            const keys = [
                ...new Set(
                    hits.map((h) =>
                        toSelectionKey(h.entity_type, h.entity_id),
                    ),
                ),
            ];
            layerSelection.setSelection(keys);
            layerSelection.isolateSelected();
            const layer = hits[0]?.entity_type;
            if (layer && activeTab !== layer) activeTab = layer;
        });
        void sig;
    });

    let schemaHeldClosed = $state(false);
    const schemaFocusTable = $derived(
        activeTab && activeTab !== SCHEMA_TAB
            ? activeTab
            : (tableNames[0] ?? ""),
    );
    const schemaToolsOpen = $derived(
        (viewMode === "table" || viewMode === "schema") &&
            !schemaHeldClosed &&
            Boolean(activeTab && activeTab !== SCHEMA_TAB),
    );

    function selectSchemaTable(name: string) {
        if (!name || name === SCHEMA_TAB) return;
        if (activeTab !== name) activeTab = name;
    }

    function toggleSchemaTools(e?: Event) {
        e?.preventDefault();
        e?.stopPropagation();
        schemaHeldClosed = !schemaHeldClosed;
    }
    let schemaTool = $state<"lists" | "links" | "many" | "media" | "edges">(
        "lists",
    );
    const schemaToolTabs: { id: typeof schemaTool; label: string }[] = [
        { id: "lists", label: "Lists" },
        { id: "links", label: "Links" },
        { id: "many", label: "Many-to-many" },
        { id: "media", label: "Media" },
        { id: "edges", label: "Ad-hoc" },
    ];
    let tableEditEnabled = $state(false);
    let tableAttrEdit = $state<{ table: string; entityId: string } | null>(
        null,
    );
    let addRowTable = $state<string | null>(null);
    let addColOpen = $state(false);
    let addColName = $state("");
    let addColError = $state("");

    type LazyCmp = any;
    let LayerSceneCmp = $state<LazyCmp>(null);
    let SchemaGraphCmp = $state<LazyCmp | null>(null);
    let DataTableCmp = $state<LazyCmp | null>(null);
    let EntityRelationsPanelCmp = $state<LazyCmp | null>(null);
    let FkLinkerCmp = $state<LazyCmp | null>(null);
    let PromoteLookupCmp = $state<LazyCmp | null>(null);
    let PromoteJunctionCmp = $state<LazyCmp | null>(null);
    let MediaLinkerCmp = $state<LazyCmp | null>(null);
    let FeatureCreateFormCmp = $state<LazyCmp | null>(null);

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
            canMutate &&
            accessToken &&
            !FkLinkerCmp
        ) {
            void import("$lib/components/digitize/FkLinker.svelte").then(
                (m) => {
                    FkLinkerCmp = m.default;
                },
            );
        }
        if (
            viewMode === "schema" &&
            schemaToolsOpen &&
            canMutate &&
            accessToken &&
            !PromoteLookupCmp
        ) {
            void import("$lib/components/digitize/PromoteLookup.svelte").then(
                (m) => {
                    PromoteLookupCmp = m.default;
                },
            );
        }
        if (
            viewMode === "schema" &&
            schemaToolsOpen &&
            canMutate &&
            accessToken &&
            !PromoteJunctionCmp
        ) {
            void import("$lib/components/digitize/PromoteJunction.svelte").then(
                (m) => {
                    PromoteJunctionCmp = m.default;
                },
            );
        }
        if (
            viewMode === "schema" &&
            schemaToolsOpen &&
            canMutate &&
            accessToken &&
            !MediaLinkerCmp
        ) {
            void import("$lib/components/digitize/MediaLinker.svelte").then(
                (m) => {
                    MediaLinkerCmp = m.default;
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
        if (canMutate && !FeatureCreateFormCmp) {
            void import("$lib/components/dashboard/FeatureCreateForm.svelte").then(
                (m) => {
                    FeatureCreateFormCmp = m.default;
                },
            );
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
        if (mode !== "table") tableAttrEdit = null;
        if (mode === "map") tableEditEnabled = false;
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
    let tablesEverShown = $state(
        untrack(() => {
            const v = viewParam;
            return v === "table" || v === "schema";
        }),
    );
    $effect(() => {
        if (inTables) tablesEverShown = true;
    });

    $effect(() => {
        if (viewingRef !== "main") return;
        tableEditEnabled = false;
        tableAttrEdit = null;
        addRowTable = null;
    });

    function toggleTableEdit() {
        if (!canMutate) return;
        if (tableEditEnabled) {
            tableEditEnabled = false;
            tableAttrEdit = null;
            return;
        }
        tableEditEnabled = true;
        if (viewMode === "schema") {
            const layer = activeTab || tableNames[0] || "";
            if (layer) {
                activeTab = layer;
                setViewMode("table");
            }
        }
    }

    function openTableAttrEdit(table: string, entityId: string) {
        if (!canMutate || !tableEditEnabled || !entityId) return;
        if (
            tableAttrEdit?.table === table &&
            tableAttrEdit.entityId === entityId
        ) {
            return;
        }
        tableAttrEdit = { table, entityId };
    }

    function tableRowsWithBuffer(
        table: string,
        tableRows: Record<string, unknown>[],
    ): Record<string, unknown>[] {
        const deleted = new Set(
            editBuffer.entries
                .filter((e) => e.table === table && e.op === "delete")
                .map((e) => e.entityId),
        );
        const bufs = editBuffer.entries.filter(
            (e) => e.table === table && e.op !== "delete" && e.attributes,
        );
        const visible = deleted.size
            ? tableRows.filter((row) => {
                  const id = String(row.source_id ?? row.SOURCE_ID ?? "");
                  return id && !deleted.has(id);
              })
            : tableRows;
        if (bufs.length === 0) return visible;
        const byId = new Map(
            bufs.map((e) => [e.entityId, e.attributes] as const),
        );
        const merged = visible.map((row) => {
            const id = String(row.source_id ?? row.SOURCE_ID ?? "");
            const attrs = id ? byId.get(id) : undefined;
            return attrs ? { ...row, ...attrs } : row;
        });
        const seen = new Set(
            merged.map((row) =>
                String(row.source_id ?? row.SOURCE_ID ?? ""),
            ),
        );
        for (const e of editBuffer.entries) {
            if (e.table !== table || e.op !== "insert") continue;
            if (seen.has(e.entityId)) continue;
            merged.push({
                source_id: e.entityId,
                ...(e.attributes ?? {}),
            });
        }
        return merged;
    }

    function deleteSelectedTableRows() {
        if (!canMutate || !tableEditEnabled) return;
        const table = activeTab;
        if (!table) return;
        const ids: string[] = [];
        for (const key of layerSelection.keys()) {
            const { layer, id } = parseSelectionKey(key);
            if (layer === table && id) ids.push(id);
        }
        if (
            ids.length === 0 &&
            tableAttrEdit?.table === table &&
            tableAttrEdit.entityId
        ) {
            ids.push(tableAttrEdit.entityId);
        }
        for (const id of ids) {
            editBuffer.markDelete(table, id);
            layerSelection.removeSelection(table, id);
        }
        if (ids.length > 0) tableAttrEdit = null;
    }

    function openAddTableRow(name: string) {
        if (!canMutate || !name) return;
        handleTabChange(name);
        addRowTable = name;
    }

    function columnsForTable(name: string): string[] {
        void editBuffer.schemaAdds;
        return [...(tables[name] ?? []), ...editBuffer.addedColumnsFor(name)];
    }

    function confirmAddColumn() {
        const table = activeTab;
        if (!canMutate || !table || table === SCHEMA_TAB) return;
        const name = addColName.trim();
        const existing = columnsForTable(table).map((c) => c.toLowerCase());
        if (existing.includes(name.toLowerCase())) {
            addColError = "That column already exists.";
            return;
        }
        const err = editBuffer.addColumn(table, name);
        if (err) {
            addColError = err;
            return;
        }
        addColName = "";
        addColError = "";
        addColOpen = false;
        tableEditEnabled = true;
    }

    function confirmAddTableRow(attrs: Record<string, string>) {
        const table = addRowTable;
        if (!table) return;
        editBuffer.push({
            op: "insert",
            table,
            entityId: editBuffer.nextEntityId(),
            attributes: attrs,
        });
        addRowTable = null;
    }

    $effect(() => {
        if (!browser) return;
        const tablesMode = inTables;
        const slug = $page.params.project;
        const token = accessToken;
        const tbls = tables;
        if (!tablesMode || !slug || Object.keys(tbls).length === 0) return;
        let cancelled = false;
        void loadProjectFkLookups({
            slug,
            accessToken: token,
            tables: tbls,
        }).then((next) => {
            if (!cancelled) tableLookups = next;
        });
        return () => {
            cancelled = true;
        };
    });

    function isTableEditableColumn(table: string, columnId: string): boolean {
        if (!columnId || columnId.startsWith("_")) return false;
        const nk = columnId.toLowerCase();
        if (nk === "source_id" || nk === "entity_type") return false;
        return attrFieldsForTable(columnsForTable(table)).includes(columnId);
    }

    function commitTableCell(
        table: string,
        row: Record<string, unknown>,
        columnId: string,
        value: string,
    ) {
        const id = String(row.source_id ?? row.SOURCE_ID ?? "");
        if (!id || !canMutate) return;
        editBuffer.upsertAttributes(table, id, { [columnId]: value });
    }

    $effect(() => {
        if (!browser || !canMutate) return;
        const onKey = (ev: KeyboardEvent) => {
            if (!inTables) return;
            if (isTypingTarget(ev.target)) return;
            const id = matchPrefShortcut(ev, ["tables"]);
            if (id === "tables-edit-toggle") {
                if (tableAttrEdit) return;
                ev.preventDefault();
                toggleTableEdit();
                return;
            }
            if (ev.key === "Escape") {
                if (tableAttrEdit) {
                    ev.preventDefault();
                    tableAttrEdit = null;
                    return;
                }
                if (tableEditEnabled) {
                    ev.preventDefault();
                    tableEditEnabled = false;
                }
                return;
            }
            if (tableEditEnabled && id === "tables-delete") {
                ev.preventDefault();
                deleteSelectedTableRows();
            }
        };
        window.addEventListener("keydown", onKey, true);
        return () => window.removeEventListener("keydown", onKey, true);
    });

    // Default 3D — matches the working terrain-sampled load path.
    let mapDim = $state<MapDim>(
        untrack(() => (dimParam === "2d" ? "2d" : "3d")),
    );
    const tilesetParam = $derived(
        String((data as { tileset?: string })?.tileset ?? "").trim(),
    );
    let selectedTilesetHash = $state("");
    const activeTilesetHash = $derived(
        selectedTilesetHash || tilesetParam,
    );
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

    onDestroy(() => {
        layerSelection.exitIsolate();
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

    /** Member-only tileset height-offset save with optimistic re-apply. */
    async function updateTilesetOffset(
        hash: string,
        offset: number | null,
    ): Promise<boolean> {
        if (!canWrite) return false;
        const slug = $page.params.project;
        if (!slug || !hash) return false;
        const prev = tilesets;
        tilesets = tilesets.map((t) =>
            t.hash === hash ? { ...t, height_offset_m: offset } : t,
        );
        try {
            const res = await fetch(
                `/api/v1/projects/${encodeURIComponent(slug)}/tilesets/${hash}`,
                {
                    method: "PATCH",
                    headers: {
                        ...authHeaders(),
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify({ height_offset_m: offset }),
                },
            );
            if (!res.ok) {
                tilesets = prev;
                return false;
            }
            const body = (await res.json()) as {
                height_offset_m?: number | null;
            };
            const saved = body.height_offset_m ?? null;
            tilesets = tilesets.map((t) =>
                t.hash === hash ? { ...t, height_offset_m: saved } : t,
            );
            return true;
        } catch {
            tilesets = prev;
            return false;
        }
    }

    /** Keep table tab on the primary selected layer. */
    $effect(() => {
        const layer = layerSelection.primaryLayer;
        if (layer && tableNames.includes(layer) && activeTab !== layer) {
            activeTab = layer;
        }
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

    let mapLoading = $state(false);
    let czmlLoadGen = 0;
    let czmlContentKey = "";
    /** Last completed CZML fetch identity — skip duplicate $effect runs. */
    let czmlFetchedKey = "";
    let czmlInFlightKey = "";
    let dataEpoch = $state(0);

    let schemaTables = $state<SchemaTable[]>([]);
    let schemaEdges = $state<SchemaEdge[]>([]);
    let schemaLoading = $state(false);
    let schemaLoaded = $state(false);

    /** Auto-highlight of related FK rows/entities is off — selection is explicit only. */
    const joinedKeys: string[] = [];
    const tableJoinHint = $derived(joinHint(activeTab, schemaEdges, tables));

    function rowClassName(row: Record<string, unknown>): string {
        // Depend on selectionSig so row styles update when membership changes at same size.
        void selectionSig;
        void editBuffer.entries;
        const id = String(row.source_id ?? row.SOURCE_ID ?? "");
        if (!id) return "";
        const key = toSelectionKey(activeTab, id);
        const buffered = Boolean(editBuffer.entryFor(activeTab, id));
        if (
            tableAttrEdit &&
            tableAttrEdit.table === activeTab &&
            tableAttrEdit.entityId === id
        ) {
            return "selected";
        }
        if (layerSelection.selected.has(key)) {
            if (layerSelection.primaryKey === key) {
                return "selected";
            }
            return "bg-selected/40 text-foreground";
        }
        if (buffered) return "bg-selected/15";
        return "";
    }

    function authHeaders(): HeadersInit {
        return accessToken ? { Authorization: `Bearer ${accessToken}` } : {};
    }

    function layersContentKey(layers: LayerData[]): string {
        return layers
            .map((l) => `${l.name}:${l.packets?.length ?? 0}`)
            .join("|");
    }

    async function loadAllCzml(force = false) {
        const slug = $page.params.project;
        const names = untrack(() => tableNames);
        const colsByTable = untrack(() => tables);
        const spatial = names.filter((name) =>
            (colsByTable[name] ?? []).some((c) => /^_?geom/i.test(c)),
        );
        const fetchKey = `${slug}\0${viewingRef}\0${spatial.join("\0")}`;
        if (
            !force &&
            (fetchKey === czmlFetchedKey || fetchKey === czmlInFlightKey)
        )
            return;

        const gen = ++czmlLoadGen;
        czmlInFlightKey = fetchKey;
        // Only show the loading gate on the first fetch — flipping mapLoading
        // later would destroy/recreate LayerScene (full Cesium remount).
        const initial = mapLayers.length === 0;
        if (initial) mapLoading = true;
        const prevByName = new Map(mapLayers.map((l) => [l.name, l]));
        const results: LayerData[] = [];
        const persistQueue: { name: string; views: LayerView[] }[] = [];

        const viewsPromise = (async () => {
            try {
                const vr = await fetch(
                    withViewingRef(`/api/v1/projects/${encodeURIComponent(slug)}/layer-views`),
                    { headers: authHeaders() },
                );
                if (!vr.ok) return {} as Record<string, LayerView[]>;
                const doc = (await vr.json()) as {
                    layers?: Record<string, LayerView[]>;
                };
                return doc.layers ?? {};
            } catch {
                return {} as Record<string, LayerView[]>;
            }
        })();

        // Start every request together, but parse/publish in stable layer
        // order. This removes an RTT per table without making result ordering
        // or default colours nondeterministic.
        const downloads = new Map(
            spatial.map((name) => [
                name,
                fetch(
                    withViewingRef(
                        `/api/v1/projects/${encodeURIComponent(slug)}/layers/${encodeURIComponent(name)}/czml`,
                    ),
                    { headers: authHeaders() },
                ).catch(() => null),
            ]),
        );
        const viewsByLayer = await viewsPromise;
        let publishedFirstLayer = false;

        for (const name of spatial) {
            if (gen !== czmlLoadGen) return;
            try {
                const res = await downloads.get(name);
                if (res?.ok) {
                    const packets = await parseNdjsonCzmlAsync(await res.text());
                    const entityIds = entityIdsFromPackets(packets, name);
                    if (entityIds.length > 0) {
                        const prev = prevByName.get(name);
                        const stored = viewsByLayer[name] ?? prev?.views;
                        const { views, persist } = ensureExplicitViews(
                            name,
                            stored,
                        );
                        if (persist) persistQueue.push({ name, views });
                        const loadedLayer: LayerData = {
                            name,
                            packets,
                            entityIds,
                            visible: prev?.visible ?? true,
                            opacity:
                                prev?.opacity ??
                                defaultOpacityForPackets(packets),
                            views,
                            activeViewId:
                                prev?.activeViewId &&
                                views.some((v) => v.id === prev.activeViewId)
                                    ? prev.activeViewId
                                    : (views[0]?.id ?? ""),
                        };
                        results.push(loadedLayer);
                        if (initial && !publishedFirstLayer) {
                            publishedFirstLayer = true;
                            mapLayers = [loadedLayer];
                            mapLoading = false;
                        }
                    }
                }
            } catch (_) {}
        }

        if (gen !== czmlLoadGen) {
            if (czmlInFlightKey === fetchKey) czmlInFlightKey = "";
            return;
        }
        const key = layersContentKey(results);
        if (force || key !== czmlContentKey || persistQueue.length > 0) {
            czmlContentKey = key;
            mapLayers = results;
        }
        czmlFetchedKey = fetchKey;
        czmlInFlightKey = "";
        if (initial) mapLoading = false;
        if (canMutate) {
            for (const item of persistQueue) {
                persistLayerViews(item.name, item.views);
            }
        }
    }

    let persistTimers = new Map<string, ReturnType<typeof setTimeout>>();

    function persistLayerViews(layerName: string, views: LayerView[]) {
        const prev = persistTimers.get(layerName);
        if (prev) clearTimeout(prev);
        persistTimers.set(
            layerName,
            setTimeout(() => {
                persistTimers.delete(layerName);
                void persistLayerViewsNow(layerName, views);
            }, 400),
        );
    }

    async function persistLayerViewsNow(layerName: string, views: LayerView[]) {
        if (!canMutate) return;
        const slug = $page.params.project;
        try {
            const res = await fetch(
                `/api/v1/projects/${encodeURIComponent(slug)}/layers/${encodeURIComponent(layerName)}/views`,
                {
                    method: "PUT",
                    headers: {
                        ...authHeaders(),
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify({ views }),
                },
            );
            if (!res.ok) return;
            const body = (await res.json()) as { views?: LayerView[] };
            const saved = body.views ?? [];
            const idx = mapLayers.findIndex((l) => l.name === layerName);
            if (idx < 0) return;
            const layer = mapLayers[idx]!;
            const oldIdx = Math.max(
                0,
                (layer.views ?? []).findIndex((v) => v.id === layer.activeViewId),
            );
            // Keep the submitted style (seriesField, ramps, …). The server
            // only needs to mint IDs — older binaries drop unknown style keys.
            const merged = views.map((local, i) => {
                const remote = saved[i];
                if (!remote) return local;
                return {
                    ...local,
                    id: remote.id || local.id,
                    source: remote.source ?? local.source,
                };
            });
            layer.views = merged;
            layer.activeViewId =
                merged[oldIdx]?.id ?? merged[0]?.id ?? "";
            mapLayers = [...mapLayers];
        } catch {
            /* keep session views */
        }
    }

    /** Ensure selected layers are visible — no refetch. */
    $effect(() => {
        void selectionSig;
        if (mapLayers.length === 0) return;
        let changed = false;
        for (const key of layerSelection.selected) {
            const { layer } = parseSelectionKey(key);
            if (!layer) continue;
            const idx = mapLayers.findIndex((l) => l.name === layer);
            if (idx >= 0 && !mapLayers[idx]!.visible) {
                mapLayers[idx]!.visible = true;
                changed = true;
            }
        }
        if (changed) mapLayers = [...mapLayers];
    });

    async function loadSchema() {
        if (schemaLoaded || schemaLoading) return;
        const showSpinner = schemaTables.length === 0;
        if (showSpinner) schemaLoading = true;
        try {
            const slug = $page.params.project;
            const res = await fetch(`/api/v1/projects/${encodeURIComponent(slug)}/schema`, {
                headers: authHeaders(),
            });
            if (res.ok) {
                const json = await res.json();
                schemaTables = json.tables ?? [];
                schemaEdges = json.edges ?? [];
                schemaLoaded = true;
            }
        } catch (_) {
            if (schemaTables.length === 0) {
                schemaTables = [];
                schemaEdges = [];
            }
        } finally {
            schemaLoading = false;
        }
    }

    async function loadTilesets() {
        tilesetsLoading = true;
        try {
            const slug = $page.params.project;
            const res = await fetch(
                withViewingRef(`/api/v1/projects/${encodeURIComponent(slug)}/tilesets`),
                {
                    headers: authHeaders(),
                },
            );
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
                    !activeTilesetHash &&
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
            const res = await fetch(
                withViewingRef(`/api/v1/projects/${encodeURIComponent(slug)}/coverages`),
                {
                    headers: authHeaders(),
                },
            );
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
        const ref = viewingRef;
        // Do NOT depend on mapDim — refetching CZML on 2D/3D toggle remounts
        // datasources and looks like a full reload.
        if (namesKey) {
            void loadSchema();
        }
        if (mode === "map" && namesKey) {
            void loadAllCzml();
        }
        void ref;
    });

    $effect(() => {
        if (viewMode === "map" && mapDim === "3d") {
            void viewingRef;
            void loadTilesets();
        }
    });

    $effect(() => {
        if (viewMode === "map") {
            void viewingRef;
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
                        selectedHash={activeTilesetHash}
                        loading={mapLoading}
                        layers={mapLayers}
                        {rows}
                        dim={mapDim}
                        active={viewMode === "map"}
                        fullscreen={mapFullscreen}
                        onSelectTileset={selectTileset}
                        onUpdateModelOffset={updateTilesetOffset}
                        canEditModelOffset={canWrite}
                        onToggleFullscreen={toggleMapFullscreen}
                        onDimChange={setMapDim}
                        canEditViews={canMutate}
                        canWrite={canMutate}
                        tables={tables}
                        onPersistViews={persistLayerViews}
                        {diffFeatures}
                        {joinedKeys}
                        searchQ={searchQ || searchRows.join(" ")}
                        onClearSearchQ={clearSearchQ}
                        placeBBox={placeBBox}
                        placeLat={placeLat}
                        placeLng={placeLng}
                        placeRadius={placeRadius}
                        focusLayer={
                            viewMode === "map" &&
                            !searchQ &&
                            searchRows.length === 0 &&
                            !highlightId
                                ? resolvedLayer
                                : ""
                        }
                        {dataEpoch}
                        onCommitted={() => {
                            dataEpoch += 1;
                            czmlFetchedKey = "";
                            void loadAllCzml(true);
                            void invalidateAll();
                        }}
                        schemaTables={schemaTables}
                        schemaEdges={schemaEdges}
                        {mediaByEntity}
                        onOpenTable={(name: string) => handleTabChange(name)}
                        onAddTableRow={canMutate
                            ? (name: string) => openAddTableRow(name)
                            : undefined}
                        {viewingRef}
                        onSetViewingRef={setViewingRef}
                        showRefToggle={isMember}
                    />
                {:else}
                    <CesiumLoading />
                {/if}
            {/if}
        </div>

        {#if tablesEverShown}
            <div
                class="absolute inset-0 z-10 flex bg-background {inTables
                    ? ''
                    : 'invisible pointer-events-none z-0'}"
            >
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
                                {#if canMutate && viewMode === "table"}
                                    <div class="relative flex shrink-0 items-center gap-0.5">
                                        <button
                                            type="button"
                                            onclick={(e) => {
                                                e.preventDefault();
                                                e.stopPropagation();
                                                if (activeTab && activeTab !== SCHEMA_TAB)
                                                    openAddTableRow(activeTab);
                                            }}
                                            class="inline-flex items-center justify-center rounded-md p-1.5 text-muted-foreground transition-colors hover:text-foreground"
                                            title="Add row"
                                            aria-label="Add row"
                                        >
                                            <PlusIcon class="size-4" />
                                        </button>
                                        <button
                                            type="button"
                                            onclick={(e) => {
                                                e.preventDefault();
                                                e.stopPropagation();
                                                addColOpen = !addColOpen;
                                                addColError = "";
                                            }}
                                            class="inline-flex items-center justify-center rounded-md p-1.5 transition-colors {addColOpen
                                                ? 'bg-background text-foreground shadow-sm'
                                                : 'text-muted-foreground hover:text-foreground'}"
                                            title="Add column"
                                            aria-label="Add column"
                                            aria-expanded={addColOpen}
                                        >
                                            <Columns3Icon class="size-4" />
                                        </button>
                                        <button
                                            type="button"
                                            onclick={(e) => {
                                                e.preventDefault();
                                                e.stopPropagation();
                                                toggleTableEdit();
                                            }}
                                            class="inline-flex items-center justify-center rounded-md p-1.5 transition-colors {tableEditEnabled
                                                ? 'bg-background text-foreground shadow-sm'
                                                : 'text-muted-foreground hover:text-foreground'}"
                                            title={tableEditEnabled
                                                ? "Stop editing (Tab)"
                                                : "Edit attributes (Tab)"}
                                            aria-label="Edit attributes"
                                            aria-pressed={tableEditEnabled}
                                        >
                                            <PencilIcon class="size-4" />
                                        </button>
                                        {#if addColOpen}
                                            <form
                                                class="surface absolute right-0 top-[calc(100%+0.35rem)] z-30 w-56 rounded-lg border border-border p-2 shadow-lg"
                                                onsubmit={(e) => {
                                                    e.preventDefault();
                                                    confirmAddColumn();
                                                }}
                                            >
                                                <label
                                                    class="block text-[11px] text-muted-foreground"
                                                    for="add-col-name"
                                                    >Column name</label
                                                >
                                                <input
                                                    id="add-col-name"
                                                    class="mt-1 w-full rounded-md border border-border bg-background px-2 py-1 text-xs"
                                                    bind:value={addColName}
                                                    placeholder="notes"
                                                    autocomplete="off"
                                                />
                                                {#if addColError}
                                                    <p
                                                        class="mt-1 text-[11px] text-destructive"
                                                    >
                                                        {addColError}
                                                    </p>
                                                {/if}
                                                <div
                                                    class="mt-2 flex justify-end gap-1"
                                                >
                                                    <button
                                                        type="button"
                                                        class="rounded-md px-2 py-1 text-[11px] text-muted-foreground hover:text-foreground"
                                                        onclick={() =>
                                                            (addColOpen = false)}
                                                        >Cancel</button
                                                    >
                                                    <button
                                                        type="submit"
                                                        class="rounded-md bg-primary/15 px-2 py-1 text-[11px] font-medium"
                                                        >Add</button
                                                    >
                                                </div>
                                            </form>
                                        {/if}
                                    </div>
                                {/if}
                                {#if inTables}
                                    <button
                                        type="button"
                                        onclick={(e) => toggleSchemaTools(e)}
                                        class="rounded-md p-1.5 transition-colors {schemaToolsOpen
                                            ? 'bg-secondary text-foreground'
                                            : 'text-muted-foreground hover:text-foreground'}"
                                        title={schemaToolsOpen
                                            ? "Hide schema tools"
                                            : "Show schema tools"}
                                        aria-pressed={schemaToolsOpen}
                                        aria-label={schemaToolsOpen
                                            ? "Hide schema tools"
                                            : "Show schema tools"}
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
                                                selectedTable={schemaFocusTable}
                                                onSelectTable={selectSchemaTable}
                                            />
                                        {/if}
                                    </div>
                                {:else}
                                    {@const tableRows = tableRowsWithBuffer(
                                        tabValue,
                                        rows[tabValue] ?? [],
                                    )}
                                    {@const tableCols =
                                        columnsByTable[tabValue] ?? []}
                                    <div
                                        class="flex h-full min-h-0 flex-col"
                                    >
                                    {#if tableJoinHint}
                                        <p
                                            class="shrink-0 pb-2 text-[11px] text-muted-foreground"
                                        >
                                            {tableJoinHint}
                                        </p>
                                    {/if}
                                    {#if canMutate && tableEditEnabled && viewMode === "table"}
                                        <p
                                            class="shrink-0 pb-2 text-[11px] text-muted-foreground"
                                        >
                                            Edit mode · click a row to edit ·
                                            Delete to remove
                                        </p>
                                    {/if}
                                    {#if canWrite && editBuffer.size > 0}
                                        <p
                                            class="shrink-0 pb-2 text-[11px] text-muted-foreground"
                                        >
                                            Session · {bufferSummary}
                                            {#if (editBuffer.pendingByTable[tabValue] ?? 0) > 0}
                                                · {editBuffer.pendingByTable[tabValue]}
                                                on this table
                                            {/if}
                                            {#if canMutate}
                                                ·
                                                <button
                                                    type="button"
                                                    class="font-medium text-foreground underline-offset-2 hover:underline"
                                                    onclick={() => setViewMode("map")}
                                                >
                                                    Commit from the map
                                                </button>
                                            {:else}
                                                · viewing published main
                                                (read-only)
                                            {/if}
                                        </p>
                                    {/if}
                                    {#if tableRows.length > 0}
                                        <div
                                            bind:this={tableContainer}
                                            class="h-full min-h-0 flex-1"
                                        >
                                        {#if DataTableCmp}
                                            <DataTableCmp
                                                columns={tableCols}
                                                data={tableRows}
                                                {rowClassName}
                                                pageIndex={currentPage}
                                                editRowId={tableAttrEdit?.table ===
                                                    tabValue
                                                    ? tableAttrEdit.entityId
                                                    : null}
                                                getRowId={(
                                                    row: Record<
                                                        string,
                                                        unknown
                                                    >,
                                                ) =>
                                                    String(
                                                        row.source_id ??
                                                            row.SOURCE_ID ??
                                                            "",
                                                    )}
                                                isEditableColumn={(colId: string) =>
                                                    isTableEditableColumn(
                                                        tabValue,
                                                        colId,
                                                    )}
                                                columnLookups={tableLookups[
                                                    tabValue
                                                ]}
                                                onCommitCell={(
                                                    row: Record<
                                                        string,
                                                        unknown
                                                    >,
                                                    colId: string,
                                                    value: string,
                                                ) =>
                                                    commitTableCell(
                                                        tabValue,
                                                        row,
                                                        colId,
                                                        value,
                                                    )}
                                                onCancelEdit={() =>
                                                    (tableAttrEdit = null)}
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
                                                    if (tableEditEnabled) {
                                                        openTableAttrEdit(
                                                            tabValue,
                                                            id,
                                                        );
                                                    }
                                                }}
                                                onRowDblClick={tableEditEnabled
                                                    ? undefined
                                                    : (
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
                                            {#if canMutate}
                                                <button
                                                    type="button"
                                                    class="mt-3 text-sm font-medium text-foreground underline-offset-2 hover:underline"
                                                    onclick={() =>
                                                        openAddTableRow(
                                                            tabValue,
                                                        )}
                                                >
                                                    Add a row
                                                </button>
                                            {/if}
                                        </div>
                                    {/if}
                                    </div>
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
                {#if addRowTable && FeatureCreateFormCmp && canMutate}
                    <div
                        class="pointer-events-none absolute right-4 bottom-4 z-20"
                    >
                        <FeatureCreateFormCmp
                            layer={addRowTable}
                            geomType="none"
                            mode="create"
                            fields={attrFieldsForTable(
                                columnsForTable(addRowTable),
                            ).filter(
                                (c) =>
                                    c !== "source_id" && c !== "entity_type",
                            )}
                            slug={$page.params.project ?? ""}
                            {accessToken}
                            schemaTables={schemaTables}
                            {rows}
                            onConfirm={confirmAddTableRow}
                            onCancel={() => (addRowTable = null)}
                        />
                    </div>
                {/if}
                {#if inTables && schemaToolsOpen}
                    <aside
                        class="w-[22rem] shrink-0 overflow-y-auto border-l border-border surface px-4 py-4 space-y-4"
                    >
                        {#if schemaFocusTable}
                            <p class="text-xs font-medium text-foreground">
                                {schemaFocusTable}
                            </p>
                        {/if}
                        {#if canMutate && accessToken}
                            <div
                                class="grid grid-cols-2 gap-1 rounded-md bg-muted p-1"
                                role="tablist"
                                aria-label="Schema tool"
                            >
                                {#each schemaToolTabs as tab (tab.id)}
                                    <button
                                        type="button"
                                        role="tab"
                                        aria-selected={schemaTool === tab.id}
                                        class="rounded px-2 py-1.5 text-[11px] font-medium transition-colors {schemaTool ===
                                        tab.id
                                            ? 'bg-background text-foreground shadow-sm'
                                            : 'text-muted-foreground hover:text-foreground'}"
                                        onclick={() => (schemaTool = tab.id)}
                                    >
                                        {tab.label}
                                    </button>
                                {/each}
                            </div>
                            {#key schemaFocusTable}
                            {#if schemaTool === "lists" && PromoteLookupCmp}
                                <PromoteLookupCmp
                                    {accessToken}
                                    slug={$page.params.project ?? ""}
                                    tables={schemaTables}
                                    edges={schemaEdges}
                                    focusTable={schemaFocusTable}
                                    onSaved={() => {
                                        schemaLoaded = false;
                                        void loadSchema();
                                        dataEpoch += 1;
                                        void invalidateAll();
                                    }}
                                />
                            {:else if schemaTool === "links" && FkLinkerCmp}
                                <FkLinkerCmp
                                    {accessToken}
                                    slug={$page.params.project ?? ""}
                                    tables={schemaTables}
                                    edges={schemaEdges}
                                    focusTable={schemaFocusTable}
                                    onSaved={() => {
                                        schemaLoaded = false;
                                        void loadSchema();
                                    }}
                                />
                            {:else if schemaTool === "many" && PromoteJunctionCmp}
                                <PromoteJunctionCmp
                                    {accessToken}
                                    slug={$page.params.project ?? ""}
                                    tables={schemaTables}
                                    focusTable={schemaFocusTable}
                                    onSaved={() => {
                                        schemaLoaded = false;
                                        void loadSchema();
                                        dataEpoch += 1;
                                        void invalidateAll();
                                    }}
                                />
                            {:else if schemaTool === "media" && MediaLinkerCmp}
                                <MediaLinkerCmp
                                    {accessToken}
                                    slug={$page.params.project ?? ""}
                                    tables={schemaTables}
                                    focusTable={schemaFocusTable}
                                    onSaved={() => {
                                        schemaLoaded = false;
                                        void loadSchema();
                                        dataEpoch += 1;
                                        void invalidateAll();
                                    }}
                                />
                            {:else if schemaTool === "edges" && EntityRelationsPanelCmp}
                                <EntityRelationsPanelCmp
                                    slug={$page.params.project ?? ""}
                                    {accessToken}
                                    canWrite={canMutate}
                                    sourceType={schemaFocusTable}
                                />
                            {/if}
                            {/key}
                        {:else if EntityRelationsPanelCmp}
                            <EntityRelationsPanelCmp
                                slug={$page.params.project ?? ""}
                                {accessToken}
                                canWrite={canMutate}
                                sourceType={schemaFocusTable}
                            />
                        {/if}
                    </aside>
                {/if}
            </div>
        {/if}
    </div>
</div>
