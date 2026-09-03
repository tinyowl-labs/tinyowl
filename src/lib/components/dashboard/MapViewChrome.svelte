<script lang="ts">
    import MaximizeIcon from "@lucide/svelte/icons/maximize-2";
    import MinimizeIcon from "@lucide/svelte/icons/minimize-2";
    import BoxIcon from "@lucide/svelte/icons/box";
    import MapIcon from "@lucide/svelte/icons/map";

    type Props = {
        dim?: "2d" | "3d";
        fullscreen?: boolean;
        onSetDim?: (dim: "2d" | "3d") => void;
        onToggleFullscreen?: () => void;
    };

    let {
        dim = "3d",
        fullscreen = false,
        onSetDim,
        onToggleFullscreen,
    }: Props = $props();

    const railBtn =
        "flex size-8 items-center justify-center text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground disabled:opacity-40";
</script>

{#if onSetDim || onToggleFullscreen}
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
{/if}
