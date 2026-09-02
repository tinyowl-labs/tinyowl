<script lang="ts">
    type Props = {
        class?: string;
    };

    let { class: klass = "" }: Props = $props();
</script>

<div
    class="leaflet-map-chrome pointer-events-auto absolute bottom-2 right-2 z-10 flex items-center gap-1.5 rounded bg-background/90 px-1.5 py-0.5 text-[10px] text-muted-foreground shadow-sm ring-1 ring-border/60 backdrop-blur-sm {klass}"
>
    <a
        class="hover:text-foreground hover:underline"
        href="https://www.openstreetmap.org/copyright"
        target="_blank"
        rel="noopener noreferrer">© OpenStreetMap</a
    >
</div>
