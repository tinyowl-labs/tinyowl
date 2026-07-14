<script lang="ts">
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
    import MousePointerSquareDashedIcon from "@lucide/svelte/icons/mouse-pointer-square-dashed";
    import SearchIcon from "@lucide/svelte/icons/search";
    import {
        layerSelection,
        toSelectionKey,
    } from "$lib/stores/layerSelection.svelte";
    import { featureEntityId } from "./mapEntityPopup";
    import type { ProjectTileset } from "./tilesetTypes";

    type LayerData = {
        name: string;
        geojson: GeoJSON.FeatureCollection;
        visible: boolean;
    };

    type Props = {
        layers?: LayerData[];
        models?: ProjectTileset[];
        rows?: Record<string, Record<string, unknown>[]>;
        modelVisible?: (hash: string) => boolean;
        onToggleModel?: (hash: string) => void;
        onToggleLayer?: (idx: number) => void;
        onApplyHidden?: () => void;
        onFlyTo?: () => void;
        /** Fly camera to a whole layer's extent without requiring selection. */
        onFlyToLayer?: (layerName: string) => void;
        pendingModels?: number;
        palette?: string[];
        inViewEntityKeys?: string[];
        inViewModelHashes?: string[];
        filterToView?: boolean;
    };

    let {
        layers = [],
        models = [],
        rows = {},
        modelVisible = () => true,
        onToggleModel,
        onToggleLayer,
        onApplyHidden,
        onFlyTo,
        onFlyToLayer,
        pendingModels = 0,
        palette = [],
        inViewEntityKeys = [],
        inViewModelHashes = [],
        filterToView = $bindable(false),
    }: Props = $props();

    let query = $state("");
    let modelsOpen = $state(false);
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

    const selectionSig = $derived(
        `${layerSelection.primaryKey ?? ""}|${[...layerSelection.selected].sort().join(",")}`,
    );
    const hiddenSig = $derived(
        `${[...layerSelection.hidden].sort().join(",")}|${layerSelection.isIsolating}`,
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
        const table = rows[layerName] ?? [];
        const row = table.find((r) => {
            const id = String(r.source_id ?? r.SOURCE_ID ?? "");
            return id.trim() === entityId.trim();
        });
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

    function entitiesForLayer(layer: LayerData): EntityRow[] {
        const out: EntityRow[] = [];
        for (const f of layer.geojson.features ?? []) {
            const id = featureEntityId(f);
            if (!id) continue;
            out.push({
                layerName: layer.name,
                entityId: id,
                label: entityLabel(layer.name, id),
                key: toSelectionKey(layer.name, id),
            });
        }
        return out;
    }

    function isLayerExpanded(name: string): boolean {
        return layerOpen[name] === true;
    }

    function toggleLayerExpanded(name: string) {
        layerOpen = { ...layerOpen, [name]: !isLayerExpanded(name) };
    }

    function expandAll() {
        modelsOpen = true;
        const next: Record<string, boolean> = {};
        for (const l of layers) next[l.name] = true;
        layerOpen = next;
    }

    function collapseAll() {
        modelsOpen = false;
        const next: Record<string, boolean> = {};
        for (const l of layers) next[l.name] = false;
        layerOpen = next;
    }

    function matchesQuery(text: string): boolean {
        const q = query.trim().toLowerCase();
        if (!q) return true;
        return text.toLowerCase().includes(q);
    }

    function byDisplayName(a: string, b: string): number {
        return a.localeCompare(b, undefined, {
            sensitivity: "base",
            numeric: true,
        });
    }

    function layerDisplayName(name: string): string {
        return name.replace(/_/g, " ");
    }

    function entitiesForLayerSorted(layer: LayerData): EntityRow[] {
        return entitiesForLayer(layer).sort((a, b) =>
            byDisplayName(a.label, b.label),
        );
    }

    function filterEntities(layer: LayerData, ents: EntityRow[]): EntityRow[] {
        return ents.filter((e) => {
            if (
                !(
                    matchesQuery(e.label) ||
                    matchesQuery(e.entityId) ||
                    matchesQuery(layer.name)
                )
            ) {
                return false;
            }
            if (filterToView) return inViewEntitySet.has(e.key);
            return true;
        });
    }

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
    }

    function onEntityDblClick(layerName: string, entityId: string) {
        if (!layerSelection.isSelected(layerName, entityId)) {
            layerSelection.selectSingle(layerName, entityId);
        }
        onFlyTo?.();
    }

    function toggleEntityHidden(layerName: string, entityId: string) {
        if (layerSelection.isSessionHidden(layerName, entityId)) {
            layerSelection.showEntity(layerName, entityId);
        } else if (layerSelection.isHidden(layerName, entityId)) {
            // Outside isolate set — exit isolate for this key by exiting isolate.
            layerSelection.exitIsolate();
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
        layerMenu = { name: layerName, idx, x: ev.clientX, y: ev.clientY, keys };
    }

    function closeLayerMenu() {
        layerMenu = null;
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

    const filteredModels = $derived(
        models
            .filter((m) => {
                if (!matchesQuery(m.label || m.hash)) return false;
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
        if (!layerMenu) return;
        const onDoc = (ev: MouseEvent) => {
            if (layerMenuEl && !layerMenuEl.contains(ev.target as Node)) {
                closeLayerMenu();
            }
        };
        const onKey = (ev: KeyboardEvent) => {
            if (ev.key === "Escape") closeLayerMenu();
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

    const childIndent = "ml-[1.375rem] border-l border-border/60 pl-2.5";
    const menuItem =
        "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs text-foreground hover:bg-secondary";
</script>

<div
    class="flex max-h-[min(70vh,28rem)] w-60 flex-col overflow-hidden rounded-lg border border-border bg-background/95 text-xs shadow-lg backdrop-blur-sm"
>
    <div class="border-b border-border px-2 py-1.5">
        <div class="mb-1.5 flex items-center justify-between gap-2 px-0.5">
            <span
                class="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground"
                >Scene</span
            >
            <div class="flex items-center gap-0.5">
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
        <label
            class="flex items-center gap-1.5 rounded-md border border-border bg-background px-1.5 py-1"
        >
            <SearchIcon class="size-3 shrink-0 text-muted-foreground" />
            <input
                class="min-w-0 flex-1 bg-transparent text-xs outline-none placeholder:text-muted-foreground"
                type="search"
                placeholder="Search…"
                bind:value={query}
            />
        </label>
    </div>

    <div class="min-h-0 flex-1 overflow-y-auto p-1">
        {#if models.length > 0}
            <button
                type="button"
                class="flex w-full items-center gap-1 rounded-md px-1.5 py-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground hover:bg-secondary"
                onclick={() => (modelsOpen = !modelsOpen)}
            >
                <ChevronDownIcon
                    class="size-3.5 shrink-0 transition-transform {modelsOpen
                        ? ''
                        : '-rotate-90'}"
                />
                <BoxIcon class="size-3.5 shrink-0" />
                <span class="truncate">3D models</span>
                <span class="ml-auto tabular-nums opacity-60"
                    >{filteredModels.length}</span
                >
            </button>
            {#if modelsOpen}
                <div class="mb-1 space-y-0.5 {childIndent}">
                    {#each filteredModels as m, idx}
                        {@const visible = modelVisible(m.hash)}
                        <div
                            class="flex w-full items-center gap-1 rounded-md px-1 py-0.5 hover:bg-secondary"
                        >
                            <button
                                type="button"
                                class="flex min-w-0 flex-1 items-center gap-2 px-0.5 py-0.5 text-left"
                                onclick={() => onToggleModel?.(m.hash)}
                                title={m.label || m.hash}
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

        {#each sortedLayers as { layer, idx }}
            {@const allEnts = entitiesForLayerSorted(layer)}
            {@const ents = filterEntities(layer, allEnts)}
            {@const orderedKeys = ents.map((e) => e.key)}
            {#if ents.length > 0 || (!filterToView && !query.trim()) || matchesQuery(layer.name)}
                <div
                    class="flex w-full items-center gap-1 rounded-md px-1.5 py-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground"
                    oncontextmenu={(e) =>
                        openLayerMenu(
                            e,
                            layer.name,
                            idx,
                            allEnts.map((en) => en.key),
                        )}
                >
                    <button
                        type="button"
                        class="flex min-w-0 flex-1 items-center gap-1 rounded-md px-0.5 py-0.5 text-left hover:bg-secondary"
                        onclick={() => toggleLayerExpanded(layer.name)}
                    >
                        <ChevronDownIcon
                            class="size-3.5 shrink-0 transition-transform {isLayerExpanded(
                                layer.name,
                            )
                                ? ''
                                : '-rotate-90'}"
                        />
                        <LayersIcon class="size-3.5 shrink-0" />
                        <span class="truncate"
                            >{layerDisplayName(layer.name)}</span
                        >
                        <span class="ml-auto tabular-nums opacity-60"
                            >{ents.length}</span
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
                {#if isLayerExpanded(layer.name)}
                    <div class="mb-1 space-y-0.5 {childIndent}">
                        {#each ents as ent}
                            {@const selected = layerSelection.isSelected(
                                ent.layerName,
                                ent.entityId,
                            )}
                            {@const primary = layerSelection.isPrimary(
                                ent.layerName,
                                ent.entityId,
                            )}
                            {@const hidden = layerSelection.isHidden(
                                ent.layerName,
                                ent.entityId,
                            )}
                            <div
                                class="flex items-center gap-0.5 rounded-md {selected
                                    ? primary
                                        ? 'bg-primary/20 ring-1 ring-inset ring-primary/30'
                                        : 'bg-accent/50'
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
                        {:else}
                            <p
                                class="px-1 py-1 text-[10px] text-muted-foreground"
                            >
                                {filterToView
                                    ? "None in view"
                                    : "No entities"}
                            </p>
                        {/each}
                    </div>
                {/if}
            {/if}
        {/each}

        {#if layers.length === 0 && models.length === 0}
            <p class="px-2 py-3 text-center text-muted-foreground">
                Nothing in the scene yet
            </p>
        {/if}
    </div>
</div>

{#if layerMenu}
    <div
        bind:this={layerMenuEl}
        class="fixed z-10000 w-48 overflow-hidden rounded-lg border border-border bg-background/98 p-1 shadow-lg backdrop-blur-sm"
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
