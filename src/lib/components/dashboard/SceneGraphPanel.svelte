<script lang="ts">
    import { indexMapRows, indexedMapRow, type LayerRowIndexes } from "./mapRowIndexes";
    import SceneEntityList from "./SceneEntityList.svelte";
    import BoxIcon from "@lucide/svelte/icons/box";
    import ChevronDownIcon from "@lucide/svelte/icons/chevron-down";
    import ChevronsDownUpIcon from "@lucide/svelte/icons/chevrons-down-up";
    import ChevronsUpDownIcon from "@lucide/svelte/icons/chevrons-up-down";
    import CrosshairIcon from "@lucide/svelte/icons/crosshair";
    import EyeIcon from "@lucide/svelte/icons/eye";
    import EyeOffIcon from "@lucide/svelte/icons/eye-off";
    import FilterIcon from "@lucide/svelte/icons/filter";
    import HexagonIcon from "@lucide/svelte/icons/hexagon";
    import LayersIcon from "@lucide/svelte/icons/layers";
    import LinkIcon from "@lucide/svelte/icons/link";
    import ListIcon from "@lucide/svelte/icons/list";
    import MousePointerSquareDashedIcon from "@lucide/svelte/icons/mouse-pointer-square-dashed";
    import MoveVerticalIcon from "@lucide/svelte/icons/move-vertical";
    import PaletteIcon from "@lucide/svelte/icons/palette";
    import TableIcon from "@lucide/svelte/icons/table";
    import {
        layerSelection,
        toSelectionKey,
    } from "$lib/stores/layerSelection.svelte";
    import { editBuffer } from "$lib/stores/editBuffer.svelte";
    import type { LayerData } from "./layerTypes";
    import type { ProjectTileset } from "./tilesetTypes";
    import { isLocalTileset } from "./tilesetTypes";
    import type { ProjectCoverage } from "./coverageTypes";
    import {
        activeView,
        contrastColor,
        layerLegend,
        layerLegendColor,
        LEGEND_SWATCH_CAP,
        rgbaToHex,
        rowMatchesFilter,
        rowMatchesSeries,
        resolveSeriesKind,
        SERIES_ALL,
    } from "./layerViews";
    import {
        groupNonGeomTables,
        type SchemaTableKind,
    } from "$lib/project/schemaFields";

    type Props = {
        rowIndexes?: LayerRowIndexes;
        layers?: LayerData[];
        models?: ProjectTileset[];
        coverages?: ProjectCoverage[];
        rows?: Record<string, Record<string, unknown>[]>;
        modelVisible?: (hash: string) => boolean;
        coverageVisible?: (hash: string) => boolean;
        onToggleModel?: (hash: string) => void;
        onSetModelsVisible?: (visible: boolean) => void;
        /** Open the height-offset side panel for a tileset. */
        onOpenModelStyle?: (hash: string) => void;
        onToggleCoverage?: (hash: string) => void;
        onToggleLayer?: (idx: number) => void;
        onOpenStyle?: (idx: number) => void;
        /** Layer row clicked in the scene graph (table focus). */
        onSelectLayer?: (name: string) => void;
        styleLayerName?: string;
        /** Series / legend focus (same as the map scrubber). */
        focusLayerName?: string;
        /** Style panel is open — names + legend only, no entity lists. */
        compact?: boolean;
        onApplyHidden?: () => void;
        onFlyTo?: () => void;
        /** Fly camera to a whole layer's extent without requiring selection. */
        onFlyToLayer?: (layerName: string) => void;
        onFlyToCoverage?: (hash: string) => void;
        onFlyToModel?: (hash: string) => void;
        pendingModels?: number;
        palette?: string[];
        inViewEntityKeys?: string[];
        inViewModelHashes?: string[];
        filterToView?: boolean;
        /** FK-joined keys (not in layerSelection) — secondary highlight. */
        joinedKeys?: string[];
        /** Session time-series step per layer (`SERIES_ALL` / omitted = show all). */
        seriesStepByLayer?: Record<string, string>;
        /** Writers see layer-select + Tab hint for Cesium edit mode. */
        canWrite?: boolean;
        /**
         * Map a raw categorized value to a legend display label
         * (e.g. FK id → lookup label). Keys and matching stay raw.
         */
        resolveLegendLabel?: (
            layerName: string,
            field: string,
            value: string,
        ) => string | undefined;
        /** Open the floating full legend for a geometry layer. */
        onOpenLegend?: (layerName: string) => void;
        /** Role-based member flag for the tileset height-offset editor (not ref-gated). */
        canEditModelOffset?: boolean;
        /** Non-geometry schema tables (lookup / junction / attribute). */
        schemaTables?: SchemaTableKind[];
        onOpenTable?: (name: string) => void;
        class?: string;
    };

    let {
        rowIndexes,
        layers = [],
        models = [],
        coverages = [],
        rows = {},
        modelVisible = () => true,
        coverageVisible = () => true,
        onToggleModel,
        onSetModelsVisible,
        onOpenModelStyle,
        onToggleCoverage,
        onToggleLayer,
        onOpenStyle,
        onSelectLayer,
        styleLayerName = "",
        focusLayerName = "",
        compact = false,
        onApplyHidden,
        onFlyTo,
        onFlyToLayer,
        onFlyToCoverage,
        onFlyToModel,
        pendingModels = 0,
        palette = [],
        inViewEntityKeys = [],
        inViewModelHashes = [],
        filterToView = $bindable(false),
        joinedKeys = [],
        seriesStepByLayer = {},
        canWrite = false,
        resolveLegendLabel,
        onOpenLegend,
        canEditModelOffset = false,
        schemaTables = [],
        onOpenTable,
        class: klass = "",
    }: Props = $props();

    let modelsOpen = $state(false);
    let coveragesOpen = $state(true);
    let attrTablesOpen = $state(false);
    let layerOpen = $state<Record<string, boolean>>({});
    let rangeAnchorKey = $state<string | null>(null);
    let layerMenu = $state<{
        name: string;
        idx: number;
        x: number;
        y: number;
        keys: string[];
    } | null>(null);
    let layerMenuEl = $state<HTMLDivElement>();
    let tilesetMenu = $state<{
        hash: string;
        label: string;
        x: number;
        y: number;
        visible: boolean;
    } | null>(null);
    let tilesetMenuEl = $state<HTMLDivElement>();

    const indexes = $derived(rowIndexes ?? indexMapRows(rows));
    const geomNames = $derived(new Set(layers.map((l) => l.name)));
    /** Flat list: raw tables, then links, then lookups — icons distinguish kind. */
    const attrTablesFlat = $derived.by(() => {
        const groups = groupNonGeomTables(schemaTables, geomNames);
        const order = ["attribute", "junction", "lookup"] as const;
        const out: { kind: (typeof order)[number]; table: SchemaTableKind }[] =
            [];
        for (const key of order) {
            const g = groups.find((x) => x.key === key);
            if (!g) continue;
            for (const table of g.tables) out.push({ kind: key, table });
        }
        return out;
    });
    const attrTableCount = $derived(attrTablesFlat.length);
    const joinedSet = $derived(new Set(joinedKeys));
    const pendingByLayer = $derived(editBuffer.pendingByTable);
    const pendingKeys = $derived.by(() => {
        const s = new Set<string>();
        for (const e of editBuffer.entries) {
            if (!e.table || !e.entityId || e.table.startsWith("_")) continue;
            s.add(toSelectionKey(e.table, e.entityId));
        }
        return s;
    });
    const selectionSig = $derived(
        `${layerSelection.primaryKey ?? ""}|${[...layerSelection.selected].sort().join(",")}|${[...joinedKeys].sort().join(",")}`,
    );
    const hiddenSig = $derived(
        [...layerSelection.hidden].sort().join(","),
    );

    const inViewEntitySet = $derived(new Set(inViewEntityKeys));
    const inViewModelSet = $derived(new Set(inViewModelHashes));

    type EntityRow = {
        layerName: string;
        entityId: string;
        label: string;
        key: string;
    };

    function entityLabel(layerName: string, entityId: string): string {
        const row = indexedMapRow(indexes, layerName, entityId);
        if (!row) return entityId;
        const name =
            row.name ??
            row.NAME ??
            row.label ??
            row.LABEL ??
            row.title ??
            row.TITLE;
        return name != null && String(name).trim() ? String(name) : entityId;
    }

    function isLayerExpanded(name: string): boolean {
        return layerOpen[name] === true;
    }

    function toggleLayerExpanded(name: string) {
        layerOpen = { ...layerOpen, [name]: !isLayerExpanded(name) };
    }

    function expandAll() {
        modelsOpen = true;
        coveragesOpen = true;
        attrTablesOpen = true;
        const next: Record<string, boolean> = {};
        for (const l of layers) {
            next[l.name] = true;
        }
        layerOpen = next;
    }

    function collapseAll() {
        modelsOpen = false;
        coveragesOpen = false;
        attrTablesOpen = false;
        const next: Record<string, boolean> = {};
        for (const l of layers) {
            next[l.name] = false;
        }
        layerOpen = next;
    }

    const nameCollator = new Intl.Collator(undefined, { sensitivity: "base", numeric: true });
    function byDisplayName(a: string, b: string): number {
        return nameCollator.compare(a, b);
    }

    function layerDisplayName(name: string): string {
        return name.replace(/_/g, " ");
    }

    const filteredIds = $derived.by(() => {
        const result = new Map<string, string[]>();
        for (const layer of layers) {
            const view = activeView(layer.views, layer.activeViewId ?? "");
            const seriesField = view?.style.seriesField;
            const kind = seriesField ? resolveSeriesKind(view?.style, rows[layer.name]) : "category";
            const step = seriesStepByLayer[layer.name] ?? SERIES_ALL;
            result.set(layer.name, layer.entityIds.filter(id => {
                if (filterToView && !inViewEntitySet.has(toSelectionKey(layer.name, id))) return false;
                if (!view?.filter?.field && !seriesField) return true;
                const row = indexedMapRow(indexes, layer.name, id);
                if (view?.filter?.field && !rowMatchesFilter(row, view.filter)) return false;
                return !seriesField || rowMatchesSeries(row, seriesField, kind, step);
            }));
        }
        return result;
    });
    // Selection/hover changes do not rebuild labels or sort the complete list.
    const expandedRows = $derived.by(() => {
        const result = new Map<string, EntityRow[]>();
        if (compact) return result;
        for (const layer of layers) {
            if (!isLayerExpanded(layer.name)) continue;
            const entries = (filteredIds.get(layer.name) ?? []).map(id => ({
                layerName: layer.name, entityId: id,
                label: entityLabel(layer.name, id), key: toSelectionKey(layer.name, id),
            }));
            entries.sort((a, b) => byDisplayName(a.label, b.label));
            result.set(layer.name, entries);
        }
        return result;
    });

    function onEntityClick(
        ev: MouseEvent,
        layerName: string,
        entityId: string,
        orderedKeys: string[],
    ) {
        const key = toSelectionKey(layerName, entityId);
        if (ev.shiftKey && rangeAnchorKey && orderedKeys.includes(rangeAnchorKey)) {
            layerSelection.selectRange(orderedKeys, rangeAnchorKey, key);
            return;
        }
        if (ev.shiftKey) {
            layerSelection.addSelection(layerName, entityId);
            rangeAnchorKey = key;
            return;
        }
        if (ev.ctrlKey || ev.metaKey) {
            layerSelection.toggleSelection(layerName, entityId);
            rangeAnchorKey = key;
            return;
        }
        layerSelection.selectSingle(layerName, entityId);
        rangeAnchorKey = key;
        onSelectLayer?.(layerName);
        if (canWrite) editBuffer.setTargetLayer(layerName);
    }

    function onEntityDblClick(layerName: string, entityId: string) {
        if (!layerSelection.isSelected(layerName, entityId)) {
            layerSelection.selectSingle(layerName, entityId);
        }
        onSelectLayer?.(layerName);
        if (canWrite) editBuffer.setTargetLayer(layerName);
        onFlyTo?.();
    }

    function selectEditLayer(name: string) {
        onSelectLayer?.(name);
        if (!canWrite) return;
        editBuffer.setTargetLayer(name);
    }

    function toggleEntityHidden(layerName: string, entityId: string) {
        if (layerSelection.isSessionHidden(layerName, entityId)) {
            layerSelection.showEntity(layerName, entityId);
        } else {
            layerSelection.hideEntity(layerName, entityId);
        }
        onApplyHidden?.();
    }

    function openLayerMenu(
        ev: MouseEvent,
        layerName: string,
        idx: number,
        keys: string[],
    ) {
        ev.preventDefault();
        closeTilesetMenu();
        layerMenu = { name: layerName, idx, x: ev.clientX, y: ev.clientY, keys };
    }

    function closeLayerMenu() {
        layerMenu = null;
    }

    function openTilesetMenu(
        ev: MouseEvent,
        hash: string,
        label: string,
        visible: boolean,
    ) {
        ev.preventDefault();
        closeLayerMenu();
        tilesetMenu = { hash, label, x: ev.clientX, y: ev.clientY, visible };
    }

    function formatOffsetM(v: number | null | undefined): string {
        if (v == null || !Number.isFinite(v)) return "";
        const r = Math.round(v * 100) / 100;
        if (r === 0) return "0 m";
        return `${r > 0 ? "+" : ""}${r} m`;
    }

    function closeTilesetMenu() {
        tilesetMenu = null;
    }

    function selectAllInLayer(keys: string[]) {
        layerSelection.setSelection(keys);
        closeLayerMenu();
    }

    function hideAllInLayer(keys: string[]) {
        layerSelection.hideKeys(keys);
        onApplyHidden?.();
        closeLayerMenu();
    }

    function flyToLayer(name: string) {
        onFlyToLayer?.(name);
        closeLayerMenu();
    }

    function openStyleFromMenu() {
        if (!layerMenu) return;
        onOpenStyle?.(layerMenu.idx);
        closeLayerMenu();
    }

    function openLegendFromMenu() {
        if (!layerMenu) return;
        onOpenLegend?.(layerMenu.name);
        closeLayerMenu();
    }

    function legendForLayer(layer: LayerData) {
        const view =
            activeView(layer.views, layer.activeViewId ?? "") ?? undefined;
        if (!view) return null;
        const field = view.style.categoryField ?? view.style.colorField ?? "";
        return layerLegend(view, rows[layer.name], LEGEND_SWATCH_CAP, (v) =>
            field ? resolveLegendLabel?.(layer.name, field, v) : undefined,
        );
    }

    const filteredModels = $derived(
        models
            .filter((m) => {
                if (filterToView && inViewModelHashes.length > 0) {
                    return inViewModelSet.has(m.hash);
                }
                if (
                    filterToView &&
                    inViewModelHashes.length === 0 &&
                    models.length > 0
                ) {
                    return false;
                }
                return true;
            })
            .slice()
            .sort((a, b) =>
                byDisplayName(a.label || a.hash, b.label || b.hash),
            ),
    );

    const filteredCoverages = $derived(
        coverages
            .slice()
            .sort((a, b) =>
                byDisplayName(
                    a.label || a.entity_id || a.hash,
                    b.label || b.entity_id || b.hash,
                ),
            ),
    );

    const sortedLayers = $derived(
        layers
            .map((layer, idx) => ({ layer, idx }))
            .slice()
            .sort((a, b) =>
                byDisplayName(
                    layerDisplayName(a.layer.name),
                    layerDisplayName(b.layer.name),
                ),
            ),
    );

    $effect(() => {
        void selectionSig;
        void hiddenSig;
    });

    $effect(() => {
        if (!layerMenu && !tilesetMenu) return;
        const onDoc = (ev: MouseEvent) => {
            const t = ev.target as Node;
            if (layerMenuEl && !layerMenuEl.contains(t) && layerMenu) {
                closeLayerMenu();
            }
            if (tilesetMenuEl && !tilesetMenuEl.contains(t) && tilesetMenu) {
                closeTilesetMenu();
            }
        };
        const onKey = (ev: KeyboardEvent) => {
            if (ev.key === "Escape") {
                closeLayerMenu();
                closeTilesetMenu();
            }
        };
        const t = setTimeout(() => {
            document.addEventListener("mousedown", onDoc);
            document.addEventListener("keydown", onKey);
        }, 0);
        return () => {
            clearTimeout(t);
            document.removeEventListener("mousedown", onDoc);
            document.removeEventListener("keydown", onKey);
        };
    });

    /** Indent for nested rows. Margin lives here — do not put `w-full` on the same node. */
    const childIndent = "ml-[1.375rem] min-w-0 border-l border-border/60 pl-2.5";
    const menuItem =
        "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs text-foreground hover:bg-secondary";
</script>

<div class="flex min-h-0 w-full flex-col rounded-lg shadow-lg {klass}">
    <div
        class="surface flex min-h-0 w-full max-h-full flex-1 flex-col overflow-hidden rounded-lg border border-border text-xs"
    >
    <div class="border-b border-border px-2 py-1.5">
        <div class="flex items-center justify-between gap-2 px-0.5">
            <span
                class="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground"
                >Scene</span
            >
            <div class="flex items-center gap-0.5">
                {#if !compact}
                    <button
                        type="button"
                        class="rounded p-0.5 text-muted-foreground hover:bg-secondary hover:text-foreground"
                        title="Expand all"
                        onclick={expandAll}
                    >
                        <ChevronsUpDownIcon class="size-3" />
                    </button>
                    <button
                        type="button"
                        class="rounded p-0.5 text-muted-foreground hover:bg-secondary hover:text-foreground"
                        title="Collapse all"
                        onclick={collapseAll}
                    >
                        <ChevronsDownUpIcon class="size-3" />
                    </button>
                {/if}
                <button
                    type="button"
                    class="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] transition-colors {filterToView
                        ? 'bg-secondary text-foreground'
                        : 'text-muted-foreground hover:bg-secondary hover:text-foreground'}"
                    title="Show only items in the current view"
                    aria-pressed={filterToView}
                    onclick={() => (filterToView = !filterToView)}
                >
                    <FilterIcon class="size-3" />
                    In view
                </button>
            </div>
        </div>
    </div>

    <div class="min-h-0 flex-1 overflow-y-auto p-1">
        {#if models.length > 0}
            {@const anyModelVisible = models.some((m) => modelVisible(m.hash))}
            <div
                class="flex w-full items-center gap-1 rounded-md px-1.5 py-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground"
            >
                <button
                    type="button"
                    class="shrink-0 rounded p-0.5 hover:bg-secondary hover:text-foreground"
                    title={modelsOpen ? "Collapse" : "Expand"}
                    onclick={() => (modelsOpen = !modelsOpen)}
                >
                    <ChevronDownIcon
                        class="size-3.5 shrink-0 transition-transform {modelsOpen
                            ? ''
                            : '-rotate-90'}"
                    />
                </button>
                <div
                    class="flex min-w-0 flex-1 items-center gap-1 px-0.5 py-0.5"
                >
                    <BoxIcon class="size-3.5 shrink-0" />
                    <span class="truncate">3D models</span>
                    <span class="ml-auto tabular-nums opacity-60"
                        >{filteredModels.length}</span
                    >
                </div>
                <button
                    type="button"
                    class="shrink-0 rounded p-0.5 hover:bg-secondary hover:text-foreground"
                    title={anyModelVisible ? "Hide all models" : "Show all models"}
                    onclick={() => onSetModelsVisible?.(!anyModelVisible)}
                >
                    {#if anyModelVisible}
                        <EyeIcon class="size-3" />
                    {:else}
                        <EyeOffIcon class="size-3 opacity-50" />
                    {/if}
                </button>
            </div>
            {#if modelsOpen && !compact}
                <div class="mb-1 space-y-0.5 {childIndent}">
                    {#each filteredModels as m, idx}
                        {@const visible = modelVisible(m.hash)}
                        {@const local = isLocalTileset(m)}
                        <div
                            class="flex w-full items-center gap-1 rounded-md px-1 py-0.5 hover:bg-secondary"
                            oncontextmenu={(e) =>
                                openTilesetMenu(
                                    e,
                                    m.hash,
                                    m.label || m.hash.slice(0, 12),
                                    visible,
                                )}
                        >
                            <button
                                type="button"
                                class="flex min-w-0 flex-1 items-center gap-2 px-0.5 py-0.5 text-left"
                                onclick={() => onFlyToModel?.(m.hash)}
                                title={local
                                    ? `${m.label || m.hash} (not georeferenced)`
                                    : m.label || m.hash}
                            >
                                <span
                                    class="size-2 shrink-0 rounded-full"
                                    style="background: {palette[
                                        idx % Math.max(palette.length, 1)
                                    ] ?? '#888'}; opacity: {visible
                                        ? '1'
                                        : '0.25'}"
                                ></span>
                                <span
                                    class="truncate {visible
                                        ? ''
                                        : 'opacity-40'}"
                                >
                                    {m.label || m.hash.slice(0, 12)}
                                </span>
                                {#if m.height_offset_m != null}
                                    <span
                                        class="shrink-0 rounded bg-secondary px-1 text-[9px] font-normal normal-case tracking-normal tabular-nums text-muted-foreground"
                                        title="Height offset applied along the ellipsoid normal"
                                        >{formatOffsetM(m.height_offset_m)}</span
                                    >
                                {/if}
                                {#if local}
                                    <span
                                        class="shrink-0 text-[9px] font-normal normal-case tracking-normal text-muted-foreground"
                                        >unplaced</span
                                    >
                                {/if}
                            </button>
                            <button
                                type="button"
                                class="shrink-0 rounded p-0.5 text-muted-foreground hover:text-foreground"
                                title={visible ? "Hide model" : "Show model"}
                                onclick={() => onToggleModel?.(m.hash)}
                            >
                                {#if visible}
                                    <EyeIcon class="size-3" />
                                {:else}
                                    <EyeOffIcon class="size-3" />
                                {/if}
                            </button>
                        </div>
                    {:else}
                        <p class="px-1 py-1 text-[10px] text-muted-foreground">
                            {filterToView ? "None in view" : "No models"}
                        </p>
                    {/each}
                    {#if pendingModels > 0}
                        <p class="px-1.5 py-0.5 text-[10px] text-muted-foreground">
                            {pendingModels} processing…
                        </p>
                    {/if}
                </div>
            {/if}
        {/if}

        {#if coverages.length > 0}
            <div
                class="flex w-full items-center gap-1 rounded-md px-1.5 py-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground"
            >
                <button
                    type="button"
                    class="shrink-0 rounded p-0.5 hover:bg-secondary hover:text-foreground"
                    title={coveragesOpen ? "Collapse" : "Expand"}
                    onclick={() => (coveragesOpen = !coveragesOpen)}
                >
                    <ChevronDownIcon
                        class="size-3.5 shrink-0 transition-transform {coveragesOpen
                            ? ''
                            : '-rotate-90'}"
                    />
                </button>
                <div
                    class="flex min-w-0 flex-1 items-center gap-1 px-0.5 py-0.5"
                >
                    <LayersIcon class="size-3.5 shrink-0" />
                    <span class="truncate">Coverage</span>
                    <span class="ml-auto tabular-nums opacity-60"
                        >{filteredCoverages.length}</span
                    >
                </div>
            </div>
            {#if coveragesOpen && !compact}
                <div class="mb-1 space-y-0.5 {childIndent}">
                    {#each filteredCoverages as c, idx}
                        {@const visible = coverageVisible(c.hash)}
                        {@const status = (c.ingest_status || "").toLowerCase()}
                        {@const canFly =
                            Array.isArray(c.bbox_wgs84) &&
                            c.bbox_wgs84.length === 4}
                        {@const statusHint =
                            status === "pending" || status === "processing"
                                ? "processing…"
                                : status === "failed"
                                  ? "failed"
                                  : ""}
                        <div
                            class="flex w-full items-center gap-1 rounded-md px-1 py-0.5 hover:bg-secondary"
                        >
                            <button
                                type="button"
                                class="flex min-w-0 flex-1 items-center gap-2 px-0.5 py-0.5 text-left"
                                onclick={() => onToggleCoverage?.(c.hash)}
                                title={c.label || c.entity_id || c.hash}
                            >
                                <span
                                    class="size-2 shrink-0 rounded-sm"
                                    style="background: {palette[
                                        (idx + 3) % Math.max(palette.length, 1)
                                    ] ?? '#6a8'}; opacity: {visible
                                        ? '1'
                                        : '0.25'}"
                                ></span>
                                <span
                                    class="min-w-0 truncate {visible
                                        ? ''
                                        : 'opacity-40'}"
                                >
                                    {c.label ||
                                        c.entity_id ||
                                        c.hash.slice(0, 12)}
                                </span>
                                {#if statusHint}
                                    <span
                                        class="shrink-0 text-[9px] font-normal normal-case tracking-normal text-muted-foreground"
                                    >
                                        {statusHint}
                                    </span>
                                {/if}
                            </button>
                            {#if canFly}
                                <button
                                    type="button"
                                    class="shrink-0 rounded p-0.5 text-muted-foreground hover:text-foreground"
                                    title="Fly to coverage"
                                    onclick={() => onFlyToCoverage?.(c.hash)}
                                >
                                    <CrosshairIcon class="size-3" />
                                </button>
                            {/if}
                            <button
                                type="button"
                                class="shrink-0 rounded p-0.5 text-muted-foreground hover:text-foreground"
                                title={visible
                                    ? "Hide coverage"
                                    : "Show coverage"}
                                onclick={() => onToggleCoverage?.(c.hash)}
                            >
                                {#if visible}
                                    <EyeIcon class="size-3" />
                                {:else}
                                    <EyeOffIcon class="size-3" />
                                {/if}
                            </button>
                        </div>
                    {:else}
                        <p class="px-1 py-1 text-[10px] text-muted-foreground">
                            No coverage
                        </p>
                    {/each}
                </div>
            {/if}
        {/if}

        {#each sortedLayers as { layer, idx }}
            {@const visibleIds = filteredIds.get(layer.name) ?? []}
            {@const unmappedCount = Math.max(0, (schemaTables.find(t => t.name === layer.name)?.count ?? 0) - layer.entityIds.length)}
            {@const ents = expandedRows.get(layer.name) ?? []}
            {@const orderedKeys = ents.map((e) => e.key)}

            {@const showStrip =
                isLayerExpanded(layer.name) ||
                layer.name === focusLayerName ||
                layer.name === styleLayerName}
            {@const stripLegend = showStrip ? legendForLayer(layer) : null}
            {#if unmappedCount > 0 && isLayerExpanded(layer.name)}
                <button class="px-2 py-1 text-left text-[10px] text-muted-foreground underline" onclick={() => onOpenTable?.(layer.name)}>{unmappedCount} record(s) not shown on the map · Open table</button>
            {/if}
            {#if visibleIds.length > 0 || !filterToView}
                <div
                    class="flex w-full items-center gap-1 px-1.5 py-1 text-[11px] font-semibold uppercase tracking-wider {editBuffer.targetLayer ===
                    layer.name
                        ? 'text-foreground'
                        : styleLayerName === layer.name ||
                            focusLayerName === layer.name
                          ? 'text-foreground'
                          : 'text-muted-foreground'}"
                    oncontextmenu={(e) =>
                        openLayerMenu(
                            e,
                            layer.name,
                            idx,
                            layer.entityIds.map(id => toSelectionKey(layer.name, id)),
                        )}
                >
                    {#if !compact}
                        <button
                            type="button"
                            class="shrink-0 rounded p-0.5 hover:bg-secondary hover:text-foreground"
                            title={isLayerExpanded(layer.name)
                                ? "Collapse"
                                : "Expand"}
                            onclick={() => toggleLayerExpanded(layer.name)}
                        >
                            <ChevronDownIcon
                                class="size-3.5 shrink-0 transition-transform {isLayerExpanded(
                                    layer.name,
                                )
                                    ? ''
                                    : '-rotate-90'}"
                            />
                        </button>
                    {/if}
                    <button
                        type="button"
                        class="flex min-w-0 flex-1 items-center gap-1 px-0.5 py-0.5 text-left hover:text-foreground"
                        title={layerDisplayName(layer.name)}
                        onclick={() => selectEditLayer(layer.name)}
                    >
                        <LayersIcon
                            class="size-3.5 shrink-0 text-muted-foreground"
                        />
                        <span class="truncate"
                            >{layerDisplayName(layer.name)}</span
                        >
                        {#if pendingByLayer[layer.name]}
                            <span
                                class="shrink-0 rounded bg-primary/15 px-1 text-[9px] font-medium normal-case tracking-normal tabular-nums text-foreground"
                                title="{pendingByLayer[layer.name]} in session"
                                >{pendingByLayer[layer.name]}</span
                            >
                        {/if}
                        <span class="ml-auto tabular-nums opacity-60"
                            >{visibleIds.length}</span
                        >
                    </button>
                    <button
                        type="button"
                        class="shrink-0 rounded p-0.5 hover:bg-secondary hover:text-foreground"
                        title={layer.visible ? "Hide layer" : "Show layer"}
                        onclick={() => onToggleLayer?.(idx)}
                    >
                        {#if layer.visible}
                            <EyeIcon class="size-3" />
                        {:else}
                            <EyeOffIcon class="size-3 opacity-50" />
                        {/if}
                    </button>
                </div>
                {#if showStrip}
                    <div class="mb-1 {childIndent}">
                        <button
                            type="button"
                            class="flex w-full min-w-0 items-center gap-1 rounded-md px-0.5 py-0.5 text-left hover:bg-secondary/80"
                            title="Open legend"
                            onclick={() => onOpenLegend?.(layer.name)}
                        >
                            {#if stripLegend?.ramp}
                                <span
                                    class="h-1.5 min-w-0 flex-1 rounded-full border border-border/50"
                                    style="background: {stripLegend.ramp.css}"
                                ></span>
                                <span
                                    class="shrink-0 text-[9px] font-normal normal-case tracking-normal text-muted-foreground"
                                    >Legend</span
                                >
                            {:else if stripLegend && stripLegend.classes.length > 0}
                                <span class="flex min-w-0 items-center gap-0.5">
                                    {#each stripLegend.classes as cls}
                                        <span
                                            class="size-2 shrink-0 rounded-sm border"
                                            style="background: {rgbaToHex(
                                                cls.color,
                                            )}; border-color: {rgbaToHex(
                                                contrastColor(cls.color),
                                            )}"
                                        ></span>
                                    {/each}
                                </span>
                                {#if stripLegend.more > 0}
                                    <span
                                        class="shrink-0 text-[9px] font-normal normal-case tracking-normal text-muted-foreground"
                                        >+{stripLegend.more}</span
                                    >
                                {/if}
                                <span
                                    class="shrink-0 text-[9px] font-normal normal-case tracking-normal text-muted-foreground"
                                    >Legend</span
                                >
                            {:else}
                                {@const fill = layerLegendColor(
                                    layer.views,
                                    layer.activeViewId ?? "",
                                )}
                                <span
                                    class="size-2 shrink-0 rounded-sm border"
                                    style="background: {rgbaToHex(
                                        fill,
                                    )}; border-color: {rgbaToHex(
                                        contrastColor(fill),
                                    )}"
                                ></span>
                                <span
                                    class="shrink-0 text-[9px] font-normal normal-case tracking-normal text-muted-foreground"
                                    >Legend</span
                                >
                            {/if}
                        </button>
                    </div>
                {/if}
                {#if !compact && isLayerExpanded(layer.name)}
                    {#if ents.length > 0}
                    <SceneEntityList items={ents} class="mb-1 {childIndent}">
                        {#snippet children(ent)}
                            {@const selected =
                                layerSelection.isSelected(
                                    ent.layerName,
                                    ent.entityId,
                                ) ||
                                joinedSet.has(
                                    toSelectionKey(
                                        ent.layerName,
                                        ent.entityId,
                                    ),
                                )}
                            {@const primary = layerSelection.isPrimary(
                                ent.layerName,
                                ent.entityId,
                            )}
                            {@const hidden = layerSelection.isSessionHidden(
                                ent.layerName,
                                ent.entityId,
                            )}
                            <div
                                class="flex h-7 items-center gap-0.5 rounded-md {selected
                                    ? primary
                                        ? 'selected'
                                        : 'bg-selected/40'
                                    : 'hover:bg-secondary'}"
                            >
                                <button
                                    type="button"
                                    class="flex min-w-0 flex-1 items-center gap-1.5 px-1.5 py-1 text-left"
                                    onclick={(e) =>
                                        onEntityClick(
                                            e,
                                            ent.layerName,
                                            ent.entityId,
                                            orderedKeys,
                                        )}
                                    ondblclick={() =>
                                        onEntityDblClick(
                                            ent.layerName,
                                            ent.entityId,
                                        )}
                                    title={ent.entityId}
                                >
                                    <HexagonIcon
                                        class="size-3 shrink-0 text-muted-foreground"
                                    />
                                    <span
                                        class="truncate {hidden
                                            ? 'opacity-40 line-through'
                                            : ''}"
                                    >
                                        {ent.label}
                                    </span>
                                    {#if pendingKeys.has(ent.key)}
                                        <span
                                            class="shrink-0 rounded bg-primary/15 px-1 text-[9px] font-normal normal-case tracking-normal text-foreground"
                                            title="In session"
                                            >buf</span
                                        >
                                    {/if}
                                </button>
                                <button
                                    type="button"
                                    class="mr-0.5 shrink-0 rounded p-0.5 text-muted-foreground hover:text-foreground"
                                    title={hidden ? "Show" : "Hide"}
                                    onclick={() =>
                                        toggleEntityHidden(
                                            ent.layerName,
                                            ent.entityId,
                                        )}
                                >
                                    {#if hidden}
                                        <EyeOffIcon class="size-3" />
                                    {:else}
                                        <EyeIcon class="size-3" />
                                    {/if}
                                </button>
                            </div>
                        {/snippet}
                    </SceneEntityList>
                    {:else}
                        <p class="px-1 py-1 text-[10px] text-muted-foreground">{filterToView ? "None in view" : "No entities"}</p>
                    {/if}
                {/if}
            {/if}
        {/each}

        {#if attrTableCount > 0}
            <div
                class="flex w-full items-center gap-1 rounded-md px-1.5 py-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground"
            >
                <button
                    type="button"
                    class="shrink-0 rounded p-0.5 hover:bg-secondary hover:text-foreground"
                    title={attrTablesOpen ? "Collapse" : "Expand"}
                    onclick={() => (attrTablesOpen = !attrTablesOpen)}
                >
                    <ChevronDownIcon
                        class="size-3.5 shrink-0 transition-transform {attrTablesOpen
                            ? ''
                            : '-rotate-90'}"
                    />
                </button>
                <div class="flex min-w-0 flex-1 items-center gap-1 px-0.5 py-0.5">
                    <TableIcon class="size-3.5 shrink-0" />
                    <span class="truncate">Tables</span>
                    <span class="ml-auto tabular-nums opacity-60"
                        >{attrTableCount}</span
                    >
                </div>
            </div>
            {#if attrTablesOpen}
                <div class="mb-1 space-y-0.5 {childIndent}">
                    {#each attrTablesFlat as row (row.table.name)}
                        <button
                            type="button"
                            class="flex w-full min-w-0 items-center gap-1.5 rounded-md px-1.5 py-1 text-left hover:bg-secondary hover:text-foreground"
                            title={row.table.name}
                            onclick={() => onOpenTable?.(row.table.name)}
                        >
                            {#if row.kind === "lookup"}
                                <ListIcon
                                    class="size-3 shrink-0 text-muted-foreground"
                                />
                            {:else if row.kind === "junction"}
                                <LinkIcon
                                    class="size-3 shrink-0 text-muted-foreground"
                                />
                            {:else}
                                <TableIcon
                                    class="size-3 shrink-0 text-muted-foreground"
                                />
                            {/if}
                            <span class="min-w-0 flex-1 truncate"
                                >{row.table.label ||
                                    row.table.name.replace(/_/g, " ")}</span
                            >
                            <span class="shrink-0 tabular-nums opacity-60"
                                >{row.table.count ?? 0}</span
                            >
                        </button>
                    {/each}
                </div>
            {/if}
        {/if}

        {#if layers.length === 0 && models.length === 0 && attrTableCount === 0}
            <p class="px-2 py-3 text-center text-muted-foreground">
                Nothing in the scene yet
            </p>
        {/if}
    </div>
    </div>
</div>

{#if layerMenu}
    <div
        bind:this={layerMenuEl}
        class="surface fixed z-[10000] w-48 overflow-hidden rounded-lg border border-border p-1 shadow-lg"
        style="left: {layerMenu.x}px; top: {layerMenu.y}px"
        role="menu"
    >
        <div
            class="truncate px-2 py-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground"
        >
            {layerDisplayName(layerMenu.name)}
        </div>
        <button
            type="button"
            class={menuItem}
            role="menuitem"
            onclick={() => selectAllInLayer(layerMenu!.keys)}
        >
            <MousePointerSquareDashedIcon
                class="size-3.5 shrink-0 text-muted-foreground"
            />
            Select all
        </button>
        <button
            type="button"
            class={menuItem}
            role="menuitem"
            onclick={() => flyToLayer(layerMenu!.name)}
        >
            <CrosshairIcon class="size-3.5 shrink-0 text-muted-foreground" />
            Fly to layer
        </button>
        <button
            type="button"
            class={menuItem}
            role="menuitem"
            onclick={openStyleFromMenu}
        >
            <PaletteIcon class="size-3.5 shrink-0 text-muted-foreground" />
            Style
        </button>
        <button
            type="button"
            class={menuItem}
            role="menuitem"
            onclick={openLegendFromMenu}
        >
            <ListIcon class="size-3.5 shrink-0 text-muted-foreground" />
            Legend
        </button>
        <button
            type="button"
            class={menuItem}
            role="menuitem"
            onclick={() => hideAllInLayer(layerMenu!.keys)}
        >
            <EyeOffIcon class="size-3.5 shrink-0 text-muted-foreground" />
            Hide contents
        </button>
        <button
            type="button"
            class={menuItem}
            role="menuitem"
            onclick={() => {
                onToggleLayer?.(layerMenu!.idx);
                closeLayerMenu();
            }}
        >
            {#if layers[layerMenu.idx]?.visible}
                <EyeOffIcon class="size-3.5 shrink-0 text-muted-foreground" />
                Hide layer
            {:else}
                <EyeIcon class="size-3.5 shrink-0 text-muted-foreground" />
                Show layer
            {/if}
        </button>
    </div>
{/if}

{#if tilesetMenu}
    <div
        bind:this={tilesetMenuEl}
        class="surface fixed z-[10000] w-48 overflow-hidden rounded-lg border border-border p-1 shadow-lg"
        style="left: {tilesetMenu.x}px; top: {tilesetMenu.y}px"
        role="menu"
    >
        <div
            class="truncate px-2 py-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground"
        >
            {tilesetMenu.label}
        </div>
        <button
            type="button"
            class={menuItem}
            role="menuitem"
            onclick={() => {
                onFlyToModel?.(tilesetMenu!.hash);
                closeTilesetMenu();
            }}
        >
            <CrosshairIcon class="size-3.5 shrink-0 text-muted-foreground" />
            Fly to
        </button>
        <button
            type="button"
            class={menuItem}
            role="menuitem"
            onclick={() => {
                onToggleModel?.(tilesetMenu!.hash);
                closeTilesetMenu();
            }}
        >
            {#if tilesetMenu.visible}
                <EyeOffIcon class="size-3.5 shrink-0 text-muted-foreground" />
                Hide
            {:else}
                <EyeIcon class="size-3.5 shrink-0 text-muted-foreground" />
                Show
            {/if}
        </button>
        {#if canEditModelOffset && onOpenModelStyle}
            <button
                type="button"
                class={menuItem}
                role="menuitem"
                onclick={() => {
                    onOpenModelStyle?.(tilesetMenu!.hash);
                    closeTilesetMenu();
                }}
            >
                <MoveVerticalIcon
                    class="size-3.5 shrink-0 text-muted-foreground"
                />
                Adjust height…
            </button>
        {/if}
    </div>
{/if}
