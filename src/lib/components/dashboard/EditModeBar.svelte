<script lang="ts">
    import CheckIcon from "@lucide/svelte/icons/check";
    import ChevronUpIcon from "@lucide/svelte/icons/chevron-up";
    import CircleIcon from "@lucide/svelte/icons/circle";
    import HexagonIcon from "@lucide/svelte/icons/hexagon";
    import MinusIcon from "@lucide/svelte/icons/minus";
    import PencilIcon from "@lucide/svelte/icons/pencil";
    import Trash2Icon from "@lucide/svelte/icons/trash-2";
    import {
        DRAW_GEOM_MODES,
        SNAP_MODES,
        type DrawGeomMode,
        type SnapMode,
    } from "$lib/stores/editBuffer.svelte";

    type Props = {
        layer: string;
        mode?: DrawGeomMode;
        canFinish?: boolean;
        canAddPart?: boolean;
        canDelete?: boolean;
        useHeight?: boolean;
        snap?: SnapMode;
        vertexEditing?: boolean;
        showHeight?: boolean;
        showSnap?: boolean;
        onMode?: (mode: DrawGeomMode) => void;
        onUseHeight?: (on: boolean) => void;
        onSnap?: (mode: SnapMode) => void;
        onFinish?: () => void;
        onAddPart?: () => void;
        onDelete?: () => void;
    };

    let {
        layer,
        mode = $bindable<DrawGeomMode>("Polygon"),
        canFinish = false,
        canAddPart = false,
        canDelete = false,
        useHeight = true,
        snap = "mesh",
        vertexEditing = false,
        showHeight = true,
        showSnap = true,
        onMode,
        onUseHeight,
        onSnap,
        onFinish,
        onAddPart,
        onDelete,
    }: Props = $props();

    let geomOpen = $state(false);
    let snapOpen = $state(false);
    let geomWrap = $state<HTMLDivElement>();
    let snapWrap = $state<HTMLDivElement>();

    const geomIcons: Record<DrawGeomMode, typeof CircleIcon> = {
        Point: CircleIcon,
        MultiPoint: CircleIcon,
        LineString: MinusIcon,
        MultiLineString: MinusIcon,
        Polygon: HexagonIcon,
        MultiPolygon: HexagonIcon,
    };

    const activeGeom = $derived(
        DRAW_GEOM_MODES.find((m) => m.id === mode) ?? DRAW_GEOM_MODES[2]!,
    );
    const ActiveIcon = $derived(geomIcons[activeGeom.id]);

    const activeSnap = $derived(
        SNAP_MODES.find((m) => m.id === snap) ?? SNAP_MODES[0]!,
    );

    function setMode(id: DrawGeomMode) {
        mode = id;
        geomOpen = false;
        onMode?.(id);
    }

    function setSnap(id: SnapMode) {
        snapOpen = false;
        onSnap?.(id);
    }

    $effect(() => {
        if (!geomOpen && !snapOpen) return;
        function onPtr(e: PointerEvent) {
            if (geomWrap?.contains(e.target as Node)) return;
            if (snapWrap?.contains(e.target as Node)) return;
            geomOpen = false;
            snapOpen = false;
        }
        document.addEventListener("pointerdown", onPtr);
        return () => document.removeEventListener("pointerdown", onPtr);
    });

    const menuItem =
        "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs text-foreground hover:bg-secondary";
</script>

<div
    class="pointer-events-auto relative flex max-w-[min(36rem,calc(100vw-10rem))] flex-col gap-1 rounded-lg border border-border bg-background/95 px-2 py-1.5 text-xs shadow-lg backdrop-blur-sm"
>
    <div class="flex items-center gap-2">
        <PencilIcon class="size-3.5 shrink-0 text-foreground" />
        <span class="max-w-[10rem] shrink-0 truncate font-medium text-foreground"
            >{layer}</span
        >

        <div class="relative shrink-0" bind:this={geomWrap}>
            <button
                type="button"
                class="inline-flex items-center gap-1.5 rounded-md border border-border px-2 py-1 {geomOpen
                    ? 'bg-secondary font-medium text-foreground'
                    : 'text-foreground hover:bg-secondary'}"
                title="Geometry type"
                aria-haspopup="listbox"
                aria-expanded={geomOpen}
                onclick={() => (geomOpen = !geomOpen)}
            >
                <ActiveIcon class="size-3.5 shrink-0 text-muted-foreground" />
                {activeGeom.label}
                <ChevronUpIcon class="size-3 text-muted-foreground" />
            </button>
            {#if geomOpen}
                <div
                    class="absolute bottom-[calc(100%+0.35rem)] left-0 z-30 flex w-44 flex-col gap-0.5 rounded-lg border border-border bg-background/95 p-1 shadow-lg backdrop-blur-sm"
                    role="listbox"
                >
                    <div
                        class="px-2 py-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground"
                    >
                        Geometry
                    </div>
                    {#each DRAW_GEOM_MODES as m}
                        {@const Icon = geomIcons[m.id]}
                        <button
                            type="button"
                            class="{menuItem} {mode === m.id
                                ? 'bg-secondary font-medium'
                                : ''}"
                            role="option"
                            aria-selected={mode === m.id}
                            onclick={() => setMode(m.id)}
                        >
                            <Icon
                                class="size-3.5 shrink-0 text-muted-foreground"
                            />
                            <span class="flex-1">{m.label}</span>
                            {#if mode === m.id}
                                <CheckIcon
                                    class="size-3 shrink-0 text-foreground"
                                />
                            {/if}
                        </button>
                    {/each}
                </div>
            {/if}
        </div>

        {#if showHeight}
        <button
            type="button"
            class="shrink-0 rounded-md border px-2 py-1 {useHeight
                ? 'border-border bg-secondary font-medium text-foreground'
                : 'border-border text-muted-foreground hover:bg-secondary hover:text-foreground'}"
            title={useHeight
                ? "Height on — vertices keep pick Z"
                : "Height off — drape on ground (2D)"}
            aria-pressed={useHeight}
            onclick={() => onUseHeight?.(!useHeight)}
        >
            Height
        </button>
        {/if}

        {#if showSnap}
        <div class="relative shrink-0" bind:this={snapWrap}>
            <button
                type="button"
                class="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 {snapOpen
                    ? 'bg-secondary font-medium text-foreground'
                    : 'text-foreground hover:bg-secondary'}"
                title="Snap target for picks and vertex drags"
                aria-haspopup="listbox"
                aria-expanded={snapOpen}
                onclick={() => (snapOpen = !snapOpen)}
            >
                Snap · {activeSnap.label}
            </button>
            {#if snapOpen}
                <div
                    class="absolute bottom-[calc(100%+0.35rem)] left-0 z-30 flex w-40 flex-col gap-0.5 rounded-lg border border-border bg-background/95 p-1 shadow-lg backdrop-blur-sm"
                    role="listbox"
                >
                    <div
                        class="px-2 py-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground"
                    >
                        Snap
                    </div>
                    {#each SNAP_MODES as m}
                        <button
                            type="button"
                            class="{menuItem} {snap === m.id
                                ? 'bg-secondary font-medium'
                                : ''}"
                            role="option"
                            aria-selected={snap === m.id}
                            onclick={() => setSnap(m.id)}
                        >
                            <span class="flex-1">{m.label}</span>
                            {#if snap === m.id}
                                <CheckIcon class="size-3 shrink-0 text-foreground" />
                            {/if}
                        </button>
                    {/each}
                </div>
            {/if}
        </div>
        {/if}

        {#if canAddPart}
            <button
                type="button"
                class="shrink-0 rounded-md border border-border px-2 py-1 hover:bg-secondary"
                title="Close this part and start another (Enter)"
                onclick={() => onAddPart?.()}
            >
                Add part
            </button>
        {/if}
        {#if canDelete && onDelete}
            <button
                type="button"
                class="inline-flex shrink-0 items-center gap-1 rounded-md border border-border px-2 py-1 text-foreground hover:bg-secondary"
                title="Delete selected (Del)"
                onclick={() => onDelete()}
            >
                <Trash2Icon class="size-3.5" />
                Delete
            </button>
        {/if}
        {#if canFinish}
            <button
                type="button"
                class="inline-flex shrink-0 items-center gap-1 rounded-md bg-primary/15 px-2 py-1 font-medium text-foreground hover:bg-primary/20"
                title={vertexEditing
                    ? "Save geometry to session buffer"
                    : "Finish geometry (double-click)"}
                onclick={() => onFinish?.()}
            >
                <CheckIcon class="size-3.5" />
                {vertexEditing ? "Save" : "Finish"}
            </button>
        {/if}
    </div>
</div>
