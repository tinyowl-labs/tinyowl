<script lang="ts">
    import CheckIcon from "@lucide/svelte/icons/check";
    import ChevronDownIcon from "@lucide/svelte/icons/chevron-down";
    import BoxIcon from "@lucide/svelte/icons/box";
    import MapIcon from "@lucide/svelte/icons/map";
    import Layers2Icon from "@lucide/svelte/icons/layers-2";
    import MaximizeIcon from "@lucide/svelte/icons/maximize-2";
    import MinimizeIcon from "@lucide/svelte/icons/minimize-2";
    import NetworkIcon from "@lucide/svelte/icons/network";
    import * as Menubar from "$lib/components/ui/menubar/index.js";
    import {
        IMAGERY_OPTIONS,
        TERRAIN_OPTIONS,
        type ImageryId,
        type TerrainId,
    } from "$lib/components/cesiumProviders";
    import type { DrawGeomMode } from "$lib/stores/editBuffer.svelte";
    import type { SelectionToolMode } from "$lib/stores/layerSelection.svelte";
    import {
        CAMERA_SCHEMES,
        currentChord,
        formatChord,
        keyboardPrefs,
        pushKeyboardToSupabase,
        setCameraScheme,
        type CameraScheme,
        type ShortcutId,
    } from "$lib/shortcuts";
    import { viewportMenu } from "./viewportMenu.svelte";

    export type SceneToolMode = "select" | "measure" | "draw" | "comments";
    export type ViewingRef = "main" | "develop";

    type Props = {
        toolMode?: SceneToolMode;
        onSetToolMode?: (mode: SceneToolMode) => void;
        showDraw?: boolean;
        showComments?: boolean;
        canEnterDraw?: boolean;
        selectionTool?: SelectionToolMode;
        onSetSelectionTool?: (tool: SelectionToolMode) => void;
        selectionCount?: number;
        isolating?: boolean;
        onFlyHome?: () => void;
        onFlyToSelection?: () => void;
        onFlyTopDown?: () => void;
        onLockNorth?: () => void;
        onZoomIn?: () => void;
        onZoomOut?: () => void;
        onClearSelection?: () => void;
        onHideSelected?: () => void;
        onShowSelected?: () => void;
        onIsolateSelected?: () => void;
        onExitIsolate?: () => void;
        showGraph?: boolean;
        onToggleGraph?: () => void;
        flyEnabled?: boolean;
        onToggleFly?: () => void;
        dim?: "2d" | "3d";
        onSetDim?: (dim: "2d" | "3d") => void;
        fullscreen?: boolean;
        onToggleFullscreen?: () => void;
        imageryId?: ImageryId;
        terrainId?: TerrainId;
        ionAvailable?: boolean;
        imageryBusy?: boolean;
        terrainBusy?: boolean;
        providerError?: string;
        onSetImagery?: (id: ImageryId) => void;
        onSetTerrain?: (id: TerrainId) => void;
        showRefToggle?: boolean;
        viewingRef?: ViewingRef;
        onSetViewingRef?: (ref: ViewingRef) => void;
        canAdd?: boolean;
        addTable?: string;
        onAddGeom?: (mode: DrawGeomMode) => void;
        onAddAttrRow?: (table: string) => void;
    };

    let {
        toolMode = "select",
        onSetToolMode,
        showDraw = false,
        showComments = false,
        canEnterDraw = false,
        selectionTool = "click",
        onSetSelectionTool,
        selectionCount = 0,
        isolating = false,
        onFlyHome,
        onFlyToSelection,
        onFlyTopDown,
        onLockNorth,
        onZoomIn,
        onZoomOut,
        onClearSelection,
        onHideSelected,
        onShowSelected,
        onIsolateSelected,
        onExitIsolate,
        showGraph = false,
        onToggleGraph,
        flyEnabled = false,
        onToggleFly,
        dim = "3d",
        onSetDim,
        fullscreen = false,
        onToggleFullscreen,
        imageryId = "osm",
        terrainId = "ellipsoid",
        ionAvailable = false,
        imageryBusy = false,
        terrainBusy = false,
        providerError = "",
        onSetImagery,
        onSetTerrain,
        showRefToggle = false,
        viewingRef = "develop",
        onSetViewingRef,
        canAdd = false,
        addTable = "",
        onAddGeom,
        onAddAttrRow,
    }: Props = $props();

    const chordLabel = $derived.by(() => {
        void keyboardPrefs.chords;
        return (id: ShortcutId) => formatChord(currentChord(id));
    });

    const modes = $derived([
        { id: "select" as const, label: "Select", shortcut: chordLabel("map-select-click") },
        { id: "measure" as const, label: "Measure", shortcut: chordLabel("map-measure-toggle") },
        { id: "draw" as const, label: "Edit", shortcut: chordLabel("map-edit-toggle") },
        { id: "comments" as const, label: "Comments", shortcut: chordLabel("map-comments-toggle") },
    ]);

    const visibleModes = $derived(
        modes.filter((m) => {
            if (m.id === "draw") return showDraw;
            if (m.id === "comments") return showComments;
            return true;
        }),
    );

    const modeLabel = $derived(
        visibleModes.find((m) => m.id === toolMode)?.label ?? "Select",
    );

    const selectTools = $derived([
        { id: "click" as const, label: "Click", shortcut: chordLabel("map-select-click") },
        { id: "box" as const, label: "Box", shortcut: chordLabel("map-select-box") },
        { id: "lasso" as const, label: "Lasso", shortcut: chordLabel("map-select-lasso") },
    ]);

    const addGeoms: { id: DrawGeomMode; label: string }[] = [
        { id: "Point", label: "Point" },
        { id: "LineString", label: "Line" },
        { id: "Polygon", label: "Polygon" },
    ];

    const hasSelection = $derived(selectionCount > 0);
    const showPicker = $derived(Boolean(onSetImagery || onSetTerrain));
    const cameraScheme = $derived(keyboardPrefs.cameraScheme);

    const menuBtn =
        "inline-flex h-7 items-center gap-0.5 rounded-md px-2 text-xs text-foreground";
    const iconBtn =
        "inline-flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-40";
    const kbd = "ml-auto pl-6 text-[10px] tabular-nums text-muted-foreground";

    function onMenuChange(v: string) {
        if (v) viewportMenu.claim(`scene:${v}`);
        else viewportMenu.releasePrefix("scene:");
    }

    function preventBarSelect(e: Event) {
        e.preventDefault();
        window.getSelection()?.removeAllRanges();
    }

    function preventRepeatMouse(e: MouseEvent) {
        if (e.detail > 1) preventBarSelect(e);
    }

    function modeDisabled(id: SceneToolMode): boolean {
        if (id === "draw") return !canEnterDraw && toolMode !== "draw";
        return false;
    }

    function setImagery(id: ImageryId) {
        if (imageryBusy) return;
        onSetImagery?.(id);
    }

    function setTerrain(id: TerrainId) {
        if (terrainBusy) return;
        onSetTerrain?.(id);
    }

    function chooseScheme(id: CameraScheme) {
        if (dim !== "3d") return;
        setCameraScheme(id);
        void pushKeyboardToSupabase();
    }
</script>

<Menubar.Root
    value={viewportMenu.sceneValue()}
    onValueChange={onMenuChange}
    class="scene-menubar surface relative z-40 flex h-8 w-full shrink-0 select-none items-center gap-0.5 border-b border-border px-1.5 text-xs"
    ondblclick={preventBarSelect}
    onmousedown={preventRepeatMouse}
    onselectstart={preventBarSelect}
>
    <Menubar.Menu value="mode">
        <Menubar.Trigger class="{menuBtn} font-medium" aria-label="Mode">
            {modeLabel}
            <ChevronDownIcon class="size-3 opacity-60" />
        </Menubar.Trigger>
        <Menubar.Content align="start" class="min-w-44">
            {#each visibleModes as m (m.id)}
                <Menubar.Item
                    disabled={modeDisabled(m.id)}
                    class="justify-between {toolMode === m.id ? 'selected' : ''}"
                    onSelect={() => onSetToolMode?.(m.id)}
                >
                    <span class="inline-flex items-center gap-2">
                        {#if toolMode === m.id}
                            <CheckIcon class="size-3.5" />
                        {:else}
                            <span class="size-3.5"></span>
                        {/if}
                        {m.label}
                    </span>
                    <span class={kbd}>{m.shortcut}</span>
                </Menubar.Item>
            {/each}
        </Menubar.Content>
    </Menubar.Menu>

    <Menubar.Menu value="view">
        <Menubar.Trigger class={menuBtn}>View</Menubar.Trigger>
        <Menubar.Content align="start" class="min-w-52">
            <Menubar.Item
                class="justify-between"
                onSelect={() => onFlyHome?.()}
            >
                Home
                <span class={kbd}>{chordLabel("map-home")}</span>
            </Menubar.Item>
            <Menubar.Item
                class="justify-between"
                disabled={!hasSelection}
                onSelect={() => onFlyToSelection?.()}
            >
                Fly to selection
                <span class={kbd}>{chordLabel("map-fly-to")}</span>
            </Menubar.Item>
            <Menubar.Item onSelect={() => onFlyTopDown?.()}
                >Top-down</Menubar.Item
            >
            <Menubar.Item onSelect={() => onLockNorth?.()}
                >North up</Menubar.Item
            >
            <Menubar.Separator />
            <Menubar.Item onSelect={() => onZoomIn?.()}>Zoom in</Menubar.Item>
            <Menubar.Item onSelect={() => onZoomOut?.()}
                >Zoom out</Menubar.Item
            >
            <Menubar.Separator />
            <Menubar.Item
                class="justify-between"
                disabled={!hasSelection}
                onSelect={() => onIsolateSelected?.()}
            >
                Isolate selected
                <span class={kbd}>{chordLabel("map-isolate")}</span>
            </Menubar.Item>
            <Menubar.Item
                class="justify-between"
                disabled={!isolating}
                onSelect={() => onExitIsolate?.()}
            >
                Clear isolate
                <span class={kbd}>{chordLabel("map-exit-isolate")}</span>
            </Menubar.Item>
            <Menubar.Separator />
            <p
                class="px-2 py-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground"
            >
                Camera
            </p>
            {#each CAMERA_SCHEMES as scheme (scheme.id)}
                <Menubar.Item
                    disabled={dim !== "3d"}
                    title={scheme.legend}
                    class="justify-between {cameraScheme === scheme.id
                        ? 'selected'
                        : ''}"
                    onSelect={() => chooseScheme(scheme.id)}
                >
                    <span class="inline-flex items-center gap-2">
                        {#if cameraScheme === scheme.id}
                            <CheckIcon class="size-3.5" />
                        {:else}
                            <span class="size-3.5"></span>
                        {/if}
                        {scheme.label}
                    </span>
                </Menubar.Item>
            {/each}
            <Menubar.Item
                class="justify-between {flyEnabled ? 'selected' : ''}"
                disabled={dim !== "3d"}
                onSelect={() => onToggleFly?.()}
            >
                <span class="inline-flex items-center gap-2">
                    {#if flyEnabled}
                        <CheckIcon class="size-3.5" />
                    {:else}
                        <span class="size-3.5"></span>
                    {/if}
                    {flyEnabled ? "Stop flying" : "Fly"}
                </span>
                <span class={kbd}>{chordLabel("map-fly-toggle")}</span>
            </Menubar.Item>
            <Menubar.Separator />
            <Menubar.Item
                class="justify-between {showGraph ? 'selected' : ''}"
                onSelect={() => onToggleGraph?.()}
            >
                <span class="inline-flex items-center gap-2">
                    <NetworkIcon class="size-3.5 text-muted-foreground" />
                    {showGraph ? "Hide graph" : "Show graph"}
                </span>
                <span class={kbd}>{chordLabel("map-graph-toggle")}</span>
            </Menubar.Item>
            {#if onSetDim}
                <Menubar.Item
                    onSelect={() => onSetDim(dim === "3d" ? "2d" : "3d")}
                >
                    {dim === "3d" ? "Switch to 2D" : "Switch to 3D"}
                </Menubar.Item>
            {/if}
        </Menubar.Content>
    </Menubar.Menu>

    <Menubar.Menu value="select">
        <Menubar.Trigger class={menuBtn}>Select</Menubar.Trigger>
        <Menubar.Content align="start" class="min-w-52">
            {#each selectTools as tool (tool.id)}
                <Menubar.Item
                    class="justify-between {selectionTool === tool.id
                        ? 'selected'
                        : ''}"
                    onSelect={() => {
                        onSetSelectionTool?.(tool.id);
                        if (toolMode !== "select") onSetToolMode?.("select");
                    }}
                >
                    <span class="inline-flex items-center gap-2">
                        {#if selectionTool === tool.id}
                            <CheckIcon class="size-3.5" />
                        {:else}
                            <span class="size-3.5"></span>
                        {/if}
                        {tool.label}
                    </span>
                    <span class={kbd}>{tool.shortcut}</span>
                </Menubar.Item>
            {/each}
            <Menubar.Separator />
            <Menubar.Item
                disabled={!hasSelection}
                onSelect={() => onClearSelection?.()}
            >
                Clear
            </Menubar.Item>
            <Menubar.Item
                disabled={!hasSelection}
                onSelect={() => onHideSelected?.()}
            >
                Hide selected
            </Menubar.Item>
            <Menubar.Item
                disabled={!hasSelection}
                onSelect={() => onShowSelected?.()}
            >
                Show selected
            </Menubar.Item>
            <Menubar.Item
                class="justify-between"
                disabled={!hasSelection}
                onSelect={() => onIsolateSelected?.()}
            >
                Isolate selected
                <span class={kbd}>{chordLabel("map-isolate")}</span>
            </Menubar.Item>
        </Menubar.Content>
    </Menubar.Menu>

    {#if canAdd}
        <Menubar.Menu value="add">
            <Menubar.Trigger class={menuBtn}>Add</Menubar.Trigger>
            <Menubar.Content align="start" class="min-w-44">
                {#each addGeoms as g (g.id)}
                    <Menubar.Item
                        disabled={!canEnterDraw && toolMode !== "draw"}
                        onSelect={() => onAddGeom?.(g.id)}
                    >
                        {g.label}
                    </Menubar.Item>
                {/each}
                {#if onAddAttrRow && addTable}
                    <Menubar.Separator />
                    <Menubar.Item onSelect={() => onAddAttrRow(addTable)}>
                        Attribute row
                    </Menubar.Item>
                {/if}
            </Menubar.Content>
        </Menubar.Menu>
    {/if}

    <div class="ml-auto flex items-center gap-0.5">
        {#if onSetDim}
            <button
                type="button"
                class={iconBtn}
                title={dim === "3d" ? "Switch to 2D" : "Switch to 3D"}
                aria-label={dim === "3d"
                    ? "3D view, switch to 2D"
                    : "2D map, switch to 3D"}
                onclick={() => onSetDim(dim === "3d" ? "2d" : "3d")}
            >
                {#if dim === "3d"}
                    <BoxIcon class="size-3.5" />
                {:else}
                    <MapIcon class="size-3.5" />
                {/if}
            </button>
        {/if}

        {#if showPicker}
            <Menubar.Menu value="basemap">
                <Menubar.Trigger
                    class={iconBtn}
                    title="Basemap and terrain"
                    aria-label="Basemap and terrain"
                >
                    <Layers2Icon class="size-3.5" />
                </Menubar.Trigger>
                <Menubar.Content align="end" class="min-w-52">
                    {#if onSetImagery}
                        <p
                            class="px-2 py-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground"
                        >
                            Imagery
                        </p>
                        {#each IMAGERY_OPTIONS as opt (opt.id)}
                            {@const locked = Boolean(opt.ion) && !ionAvailable}
                            <Menubar.Item
                                disabled={locked || imageryBusy}
                                class="justify-between {imageryId === opt.id
                                    ? 'selected'
                                    : ''}"
                                onSelect={() => setImagery(opt.id)}
                            >
                                {opt.label}
                                {#if imageryId === opt.id}
                                    <CheckIcon class="size-3.5" />
                                {/if}
                            </Menubar.Item>
                        {/each}
                    {/if}
                    {#if onSetTerrain}
                        <Menubar.Separator />
                        <p
                            class="px-2 py-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground"
                        >
                            Terrain
                        </p>
                        {#each TERRAIN_OPTIONS as opt (opt.id)}
                            {@const locked = Boolean(opt.ion) && !ionAvailable}
                            <Menubar.Item
                                disabled={locked || terrainBusy}
                                class="justify-between {terrainId === opt.id
                                    ? 'selected'
                                    : ''}"
                                onSelect={() => setTerrain(opt.id)}
                            >
                                {opt.label}
                                {#if terrainId === opt.id}
                                    <CheckIcon class="size-3.5" />
                                {/if}
                            </Menubar.Item>
                        {/each}
                    {/if}
                    {#if !ionAvailable}
                        <p
                            class="px-2 py-1 text-[11px] leading-snug text-muted-foreground"
                        >
                            Ion layers need a Cesium ion token
                        </p>
                    {/if}
                    {#if providerError}
                        <p
                            class="px-2 py-1 text-[11px] leading-snug text-destructive"
                        >
                            {providerError}
                        </p>
                    {/if}
                </Menubar.Content>
            </Menubar.Menu>
        {/if}

        {#if onToggleFullscreen}
            <button
                type="button"
                class={iconBtn}
                title={fullscreen ? "Exit fullscreen" : "Fullscreen"}
                aria-label={fullscreen ? "Exit fullscreen" : "Fullscreen"}
                onclick={() => onToggleFullscreen()}
            >
                {#if fullscreen}
                    <MinimizeIcon class="size-3.5" />
                {:else}
                    <MaximizeIcon class="size-3.5" />
                {/if}
            </button>
        {/if}

        {#if showRefToggle}
            <div
                class="ml-1 flex overflow-hidden rounded-md border border-border"
                role="group"
                aria-label="Viewing ref"
            >
                <button
                    type="button"
                    class="select-none px-2 py-0.5 text-[11px] {viewingRef ===
                    'develop'
                        ? 'selected'
                        : 'text-muted-foreground hover:bg-muted hover:text-foreground'}"
                    onclick={() => onSetViewingRef?.("develop")}
                >
                    develop
                </button>
                <button
                    type="button"
                    class="select-none border-l border-border px-2 py-0.5 text-[11px] {viewingRef ===
                    'main'
                        ? 'selected'
                        : 'text-muted-foreground hover:bg-muted hover:text-foreground'}"
                    title="Published main (read-only)"
                    onclick={() => onSetViewingRef?.("main")}
                >
                    main
                </button>
            </div>
        {/if}
    </div>
</Menubar.Root>

<style>
    :global(.scene-menubar),
    :global(.scene-menubar *) {
        user-select: none;
        -webkit-user-select: none;
    }
</style>
