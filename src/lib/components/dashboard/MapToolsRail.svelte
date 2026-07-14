<script lang="ts">
    import PlusIcon from "@lucide/svelte/icons/plus";
    import MinusIcon from "@lucide/svelte/icons/minus";
    import RulerIcon from "@lucide/svelte/icons/ruler";
    import MaximizeIcon from "@lucide/svelte/icons/maximize-2";
    import MinimizeIcon from "@lucide/svelte/icons/minimize-2";
    import CheckIcon from "@lucide/svelte/icons/check";
    import XIcon from "@lucide/svelte/icons/x";
    import CrosshairIcon from "@lucide/svelte/icons/crosshair";
    import HomeIcon from "@lucide/svelte/icons/home";
    import ArrowDownToLineIcon from "@lucide/svelte/icons/arrow-down-to-line";
    import CompassIcon from "@lucide/svelte/icons/compass";
    import VideoIcon from "@lucide/svelte/icons/video";
    import MousePointer2Icon from "@lucide/svelte/icons/mouse-pointer-2";
    import SquareDashedIcon from "@lucide/svelte/icons/square-dashed";
    import LassoIcon from "@lucide/svelte/icons/lasso";
    import EyeOffIcon from "@lucide/svelte/icons/eye-off";
    import type { MeasureMode, MeasureRecord } from "$lib/measure";
    import { measureHint } from "$lib/measure";
    import type { SelectionToolMode } from "$lib/stores/layerSelection.svelte";

    type Props = {
        enabled?: boolean;
        mode?: MeasureMode;
        status?: string;
        records?: MeasureRecord[];
        canFinish?: boolean;
        dim?: "2d" | "3d";
        fullscreen?: boolean;
        selectionCount?: number;
        selectionTool?: SelectionToolMode;
        onZoomIn?: () => void;
        onZoomOut?: () => void;
        onToggleFullscreen?: () => void;
        onFlyToSelection?: () => void;
        onFlyHome?: () => void;
        onFlyTopDown?: () => void;
        onLockNorth?: () => void;
        onClearSelection?: () => void;
        onHideSelected?: () => void;
        onClear?: () => void;
        onFinish?: () => void;
        onRemove?: (id: string) => void;
    };

    let {
        enabled = $bindable(false),
        mode = $bindable<MeasureMode>("length"),
        status = "",
        records = [],
        canFinish = false,
        dim = "2d",
        fullscreen = false,
        selectionCount = 0,
        selectionTool = $bindable<SelectionToolMode>("click"),
        onZoomIn,
        onZoomOut,
        onToggleFullscreen,
        onFlyToSelection,
        onFlyHome,
        onFlyTopDown,
        onLockNorth,
        onClearSelection,
        onHideSelected,
        onClear,
        onFinish,
        onRemove,
    }: Props = $props();

    let cameraOpen = $state(false);
    let selectionOpen = $state(false);

    const measureModes: { id: MeasureMode; label: string }[] = [
        { id: "point", label: "Point" },
        { id: "length", label: "Length" },
        { id: "area", label: "Area" },
    ];

    const modeLabel: Record<MeasureMode, string> = {
        point: "Point",
        length: "Length",
        area: "Area",
    };

    const selectTools: {
        id: SelectionToolMode;
        label: string;
        hint: string;
        icon: typeof MousePointer2Icon;
    }[] = [
        {
            id: "click",
            label: "Click",
            hint: "Click · Shift add · Ctrl remove",
            icon: MousePointer2Icon,
        },
        {
            id: "box",
            label: "Box",
            hint: "Shift+drag add · Ctrl+drag remove",
            icon: SquareDashedIcon,
        },
        {
            id: "lasso",
            label: "Lasso",
            hint: "Shift+drag add · Ctrl+drag remove",
            icon: LassoIcon,
        },
    ];

    const hasCamera = Boolean(
        onFlyHome || onFlyTopDown || onLockNorth || onFlyToSelection,
    );
    const hasSelection = $derived(selectionCount > 0);

    const activeSelect = $derived(
        selectTools.find((t) => t.id === selectionTool) ?? selectTools[0]!,
    );

    function closePanels() {
        cameraOpen = false;
        selectionOpen = false;
        enabled = false;
    }

    function toggleMeasure() {
        const next = !enabled;
        closePanels();
        enabled = next;
    }

    function toggleCamera() {
        const next = !cameraOpen;
        closePanels();
        cameraOpen = next;
    }

    function toggleSelection() {
        const next = !selectionOpen;
        closePanels();
        selectionOpen = next;
    }

    function setMeasureMode(next: MeasureMode) {
        mode = next;
        cameraOpen = false;
        selectionOpen = false;
        if (!enabled) enabled = true;
    }

    function setSelectTool(id: SelectionToolMode) {
        selectionTool = id;
    }

    const railBtn =
        "flex size-8 items-center justify-center text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground disabled:opacity-40";

    const menuItem =
        "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs text-foreground hover:bg-secondary disabled:pointer-events-none disabled:opacity-40";
</script>

<div class="pointer-events-auto flex items-start gap-2">
    <div
        class="flex flex-col overflow-hidden rounded-lg border border-border bg-background/95 shadow-lg backdrop-blur-sm"
    >
        <!-- 1. Selection -->
        <button
            type="button"
            class="{railBtn} border-b border-border {selectionOpen
                ? 'bg-primary/15 text-foreground'
                : ''}"
            title="Selection ({activeSelect.label})"
            aria-label="Selection"
            aria-pressed={selectionOpen}
            onclick={toggleSelection}
        >
            <activeSelect.icon class="size-3.5" />
        </button>

        <!-- 2. Camera -->
        {#if hasCamera}
            <button
                type="button"
                class="{railBtn} border-b border-border {cameraOpen
                    ? 'bg-primary/15 text-foreground'
                    : ''}"
                title="Camera"
                aria-label="Camera"
                aria-pressed={cameraOpen}
                onclick={toggleCamera}
            >
                <VideoIcon class="size-3.5" />
            </button>
        {/if}

        <!-- 3. Measure -->
        <button
            type="button"
            class="{railBtn} border-b border-border {enabled
                ? 'bg-primary/15 text-foreground'
                : ''}"
            title={enabled ? "Stop measuring" : "Measure"}
            aria-label="Measure"
            aria-pressed={enabled}
            onclick={toggleMeasure}
        >
            <RulerIcon class="size-3.5" />
        </button>

        <!-- 4–5. Zoom -->
        <button
            type="button"
            class="{railBtn} border-b border-border"
            title="Zoom in"
            aria-label="Zoom in"
            disabled={!onZoomIn}
            onclick={() => onZoomIn?.()}
        >
            <PlusIcon class="size-3.5" />
        </button>
        <button
            type="button"
            class="{railBtn} border-b border-border"
            title="Zoom out"
            aria-label="Zoom out"
            disabled={!onZoomOut}
            onclick={() => onZoomOut?.()}
        >
            <MinusIcon class="size-3.5" />
        </button>

        <!-- 6. Fullscreen -->
        <button
            type="button"
            class={railBtn}
            title={fullscreen ? "Exit fullscreen" : "Fullscreen"}
            aria-label={fullscreen ? "Exit fullscreen" : "Fullscreen"}
            disabled={!onToggleFullscreen}
            onclick={() => onToggleFullscreen?.()}
        >
            {#if fullscreen}
                <MinimizeIcon class="size-3.5" />
            {:else}
                <MaximizeIcon class="size-3.5" />
            {/if}
        </button>
    </div>

    <!-- Selection panel (Blender-style tool list, like Camera) -->
    {#if selectionOpen}
        <div
            class="flex w-48 flex-col gap-0.5 rounded-lg border border-border bg-background/95 p-1 text-xs shadow-lg backdrop-blur-sm"
        >
            <div
                class="px-2 py-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground"
            >
                Select
            </div>
            {#each selectTools as tool}
                <button
                    type="button"
                    class="{menuItem} {selectionTool === tool.id
                        ? 'bg-secondary font-medium'
                        : ''}"
                    onclick={() => setSelectTool(tool.id)}
                >
                    <tool.icon class="size-3.5 shrink-0 text-muted-foreground" />
                    <span class="flex-1">{tool.label}</span>
                    {#if selectionTool === tool.id}
                        <CheckIcon class="size-3 shrink-0 text-foreground" />
                    {/if}
                </button>
            {/each}
            <p class="px-2 py-1 text-[11px] leading-snug text-muted-foreground">
                {activeSelect.hint}
            </p>
            {#if hasSelection}
                <div class="mx-1 border-t border-border pt-1">
                    <div
                        class="mb-0.5 px-2 py-0.5 text-[11px] tabular-nums text-muted-foreground"
                    >
                        {selectionCount} selected
                    </div>
                    <button
                        type="button"
                        class={menuItem}
                        onclick={() => onClearSelection?.()}
                    >
                        <XIcon class="size-3.5 shrink-0 text-muted-foreground" />
                        Clear
                    </button>
                    {#if onHideSelected}
                        <button
                            type="button"
                            class={menuItem}
                            onclick={() => onHideSelected()}
                        >
                            <EyeOffIcon
                                class="size-3.5 shrink-0 text-muted-foreground"
                            />
                            Hide selected
                        </button>
                    {/if}
                </div>
            {/if}
        </div>
    {:else if selectionCount > 1}
        <button
            type="button"
            class="rounded-md border border-border bg-background/95 px-2 py-1 text-[11px] text-muted-foreground shadow-sm backdrop-blur-sm hover:text-foreground"
            title="Show selection"
            onclick={() => {
                closePanels();
                selectionOpen = true;
            }}
        >
            {selectionCount} selected
        </button>
    {/if}

    <!-- Camera panel -->
    {#if cameraOpen && hasCamera}
        <div
            class="flex w-44 flex-col gap-0.5 rounded-lg border border-border bg-background/95 p-1 text-xs shadow-lg backdrop-blur-sm"
        >
            <div
                class="px-2 py-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground"
            >
                Camera
            </div>
            {#if onFlyToSelection}
                <button
                    type="button"
                    class={menuItem}
                    disabled={!hasSelection}
                    onclick={() => onFlyToSelection()}
                >
                    <CrosshairIcon
                        class="size-3.5 shrink-0 text-muted-foreground"
                    />
                    Fly to selection
                </button>
            {/if}
            {#if onFlyHome}
                <button
                    type="button"
                    class={menuItem}
                    onclick={() => onFlyHome()}
                >
                    <HomeIcon class="size-3.5 shrink-0 text-muted-foreground" />
                    Home
                </button>
            {/if}
            {#if onFlyTopDown}
                <button
                    type="button"
                    class={menuItem}
                    onclick={() => onFlyTopDown()}
                >
                    <ArrowDownToLineIcon
                        class="size-3.5 shrink-0 text-muted-foreground"
                    />
                    Top-down
                </button>
            {/if}
            {#if onLockNorth}
                <button
                    type="button"
                    class={menuItem}
                    onclick={() => onLockNorth()}
                >
                    <CompassIcon
                        class="size-3.5 shrink-0 text-muted-foreground"
                    />
                    North up
                </button>
            {/if}
        </div>
    {/if}

    <!-- Measure panel -->
    {#if enabled}
        <div
            class="flex w-56 flex-col gap-1.5 rounded-lg border border-border bg-background/95 p-2 text-xs shadow-lg backdrop-blur-sm"
        >
            <div
                class="flex items-center overflow-hidden rounded-md border border-border"
            >
                {#each measureModes as m, i}
                    <button
                        type="button"
                        class="flex-1 px-1.5 py-1 transition-colors {i > 0
                            ? 'border-l border-border'
                            : ''} {mode === m.id
                            ? 'bg-secondary text-foreground font-medium'
                            : 'text-muted-foreground hover:text-foreground'}"
                        onclick={() => setMeasureMode(m.id)}
                    >
                        {m.label}
                    </button>
                {/each}
            </div>

            {#if canFinish}
                <button
                    type="button"
                    class="inline-flex items-center justify-center gap-1 rounded-md bg-primary/15 px-2 py-1.5 font-medium text-foreground hover:bg-primary/20"
                    title="Finish measurement (Enter)"
                    onclick={() => onFinish?.()}
                >
                    <CheckIcon class="size-3.5" />
                    Finish
                </button>
            {/if}

            <p class="px-0.5 text-[11px] leading-snug text-muted-foreground">
                {status || measureHint(mode, dim)}
            </p>

            {#if records.length > 0}
                <div class="border-t border-border pt-1.5">
                    <div
                        class="mb-1 flex items-center justify-between gap-2 px-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground"
                    >
                        <span>Results · {records.length}</span>
                        <button
                            type="button"
                            class="inline-flex items-center gap-0.5 normal-case tracking-normal hover:text-foreground"
                            title="Clear all measurements"
                            onclick={() => onClear?.()}
                        >
                            <XIcon class="size-3" />
                            Clear
                        </button>
                    </div>
                    <ul class="max-h-40 space-y-0.5 overflow-y-auto">
                        {#each records as rec, i (rec.id)}
                            <li
                                class="flex items-center gap-1.5 rounded-md px-1 py-1 hover:bg-secondary/80"
                            >
                                <span
                                    class="w-3.5 shrink-0 tabular-nums text-[10px] text-muted-foreground"
                                    >{i + 1}</span
                                >
                                <span class="min-w-0 flex-1 truncate">
                                    <span class="text-muted-foreground"
                                        >{modeLabel[rec.mode]} ·</span
                                    >
                                    <span
                                        class="font-medium tabular-nums text-foreground"
                                        >{rec.label}</span
                                    >
                                </span>
                                <button
                                    type="button"
                                    class="shrink-0 rounded p-0.5 text-muted-foreground hover:bg-background hover:text-foreground"
                                    title="Remove"
                                    onclick={() => onRemove?.(rec.id)}
                                >
                                    <XIcon class="size-3" />
                                </button>
                            </li>
                        {/each}
                    </ul>
                </div>
            {/if}
        </div>
    {:else if records.length > 0 && !cameraOpen && !selectionOpen}
        <button
            type="button"
            class="rounded-md border border-border bg-background/95 px-2 py-1 text-[11px] text-muted-foreground shadow-sm backdrop-blur-sm hover:text-foreground"
            title="Show measurements"
            onclick={() => {
                closePanels();
                enabled = true;
            }}
        >
            {records.length} measure{records.length === 1 ? "" : "s"}
        </button>
    {/if}
</div>
