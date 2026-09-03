<script lang="ts">
    import MaximizeIcon from "@lucide/svelte/icons/maximize-2";
    import MinimizeIcon from "@lucide/svelte/icons/minimize-2";
    import BoxIcon from "@lucide/svelte/icons/box";
    import MapIcon from "@lucide/svelte/icons/map";
    import Layers2Icon from "@lucide/svelte/icons/layers-2";
    import CheckIcon from "@lucide/svelte/icons/check";
    import {
        IMAGERY_OPTIONS,
        TERRAIN_OPTIONS,
        type ImageryId,
        type TerrainId,
    } from "$lib/components/cesiumProviders";

    type Props = {
        dim?: "2d" | "3d";
        fullscreen?: boolean;
        onSetDim?: (dim: "2d" | "3d") => void;
        onToggleFullscreen?: () => void;
        imageryId?: ImageryId;
        terrainId?: TerrainId;
        ionAvailable?: boolean;
        imageryBusy?: boolean;
        terrainBusy?: boolean;
        providerError?: string;
        onSetImagery?: (id: ImageryId) => void;
        onSetTerrain?: (id: TerrainId) => void;
    };

    let {
        dim = "3d",
        fullscreen = false,
        onSetDim,
        onToggleFullscreen,
        imageryId = "osm",
        terrainId = "ellipsoid",
        ionAvailable = false,
        imageryBusy = false,
        terrainBusy = false,
        providerError = "",
        onSetImagery,
        onSetTerrain,
    }: Props = $props();

    let pickerOpen = $state(false);

    const showPicker = $derived(Boolean(onSetImagery || onSetTerrain));
    const showRail = $derived(
        Boolean(onSetDim || onToggleFullscreen || showPicker),
    );

    const railBtn =
        "flex size-8 items-center justify-center text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground disabled:opacity-40";

    const menuItem =
        "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs text-foreground hover:bg-secondary disabled:pointer-events-none disabled:opacity-40";

    function setImagery(id: ImageryId) {
        if (imageryBusy) return;
        onSetImagery?.(id);
    }

    function setTerrain(id: TerrainId) {
        if (terrainBusy) return;
        onSetTerrain?.(id);
    }
</script>

{#if showRail}
    <div class="relative">
        {#if pickerOpen && showPicker}
            <div
                class="absolute top-0 left-full z-30 ml-2 flex w-52 flex-col gap-0.5 rounded-lg border border-border bg-background/95 p-1 text-xs shadow-lg backdrop-blur-sm"
            >
                {#if onSetImagery}
                    <div
                        class="px-2 py-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground"
                    >
                        Imagery
                    </div>
                    {#each IMAGERY_OPTIONS as opt}
                        {@const locked = Boolean(opt.ion) && !ionAvailable}
                        <button
                            type="button"
                            class="{menuItem} {imageryId === opt.id
                                ? 'bg-secondary font-medium'
                                : ''}"
                            disabled={locked || imageryBusy}
                            title={locked
                                ? "Requires a Cesium ion token"
                                : opt.label}
                            onclick={() => setImagery(opt.id)}
                        >
                            <span class="flex-1">{opt.label}</span>
                            {#if imageryId === opt.id}
                                <CheckIcon
                                    class="size-3 shrink-0 text-foreground"
                                />
                            {/if}
                        </button>
                    {/each}
                {/if}
                {#if onSetTerrain}
                    <div
                        class="mx-1 {onSetImagery
                            ? 'mt-1 border-t border-border pt-1'
                            : ''}"
                    >
                        <div
                            class="px-2 py-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground"
                        >
                            Terrain
                        </div>
                        {#each TERRAIN_OPTIONS as opt}
                            {@const locked =
                                Boolean(opt.ion) && !ionAvailable}
                            <button
                                type="button"
                                class="{menuItem} {terrainId === opt.id
                                    ? 'bg-secondary font-medium'
                                    : ''}"
                                disabled={locked || terrainBusy}
                                title={locked
                                    ? "Requires a Cesium ion token"
                                    : opt.label}
                                onclick={() => setTerrain(opt.id)}
                            >
                                <span class="flex-1">{opt.label}</span>
                                {#if terrainId === opt.id}
                                    <CheckIcon
                                        class="size-3 shrink-0 text-foreground"
                                    />
                                {/if}
                            </button>
                        {/each}
                    </div>
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
            </div>
        {/if}

        <div
            class="flex flex-col divide-y divide-border overflow-hidden rounded-lg border border-border bg-background/95 shadow-lg backdrop-blur-sm"
        >
            {#if onSetDim}
                <button
                    type="button"
                    class={railBtn}
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
                <button
                    type="button"
                    class="{railBtn} {pickerOpen
                        ? 'bg-primary/15 text-foreground'
                        : ''}"
                    title="Basemap and terrain"
                    aria-label="Basemap and terrain"
                    aria-pressed={pickerOpen}
                    onclick={() => (pickerOpen = !pickerOpen)}
                >
                    <Layers2Icon class="size-3.5" />
                </button>
            {/if}
            {#if onToggleFullscreen}
                <button
                    type="button"
                    class={railBtn}
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
        </div>
    </div>
{/if}
