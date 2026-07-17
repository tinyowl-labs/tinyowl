<script lang="ts">
    type Props = {
        class?: string;
        /** When World Terrain / Ion is in use. */
        ion?: boolean;
    };

    let { class: klass = "", ion = false }: Props = $props();
</script>

<div
    class="pointer-events-auto absolute bottom-2 right-2 z-20 flex items-center gap-1.5 rounded bg-background/90 px-1.5 py-0.5 text-[10px] text-muted-foreground shadow-sm ring-1 ring-border/60 backdrop-blur-sm {klass}"
>
    <a
        class="hover:text-foreground hover:underline"
        href="https://www.openstreetmap.org/copyright"
        target="_blank"
        rel="noopener noreferrer">© OpenStreetMap</a
    >
    <span class="opacity-40">·</span>
    <a
        class="hover:text-foreground hover:underline"
        href="https://carto.com/attributions"
        target="_blank"
        rel="noopener noreferrer">CARTO</a
    >
    {#if ion}
        <span class="opacity-40">·</span>
        <a
            class="hover:text-foreground hover:underline"
            href="https://cesium.com/ion/"
            target="_blank"
            rel="noopener noreferrer">Ion</a
        >
    {/if}
    <span class="opacity-40">·</span>
    <a
        class="inline-flex items-center hover:opacity-90"
        href="https://cesium.com/"
        target="_blank"
        rel="noopener noreferrer"
        title="Cesium"
        aria-label="Cesium"
    >
        <img
            src="/brand/cesium-icon.svg"
            alt=""
            width="14"
            height="14"
            class="size-3.5"
            draggable="false"
        />
    </a>
</div>
