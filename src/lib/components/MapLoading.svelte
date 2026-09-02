<script lang="ts">
    type Props = {
        class?: string;
    };

    let { class: klass = "" }: Props = $props();
</script>

<div
    class="pointer-events-none absolute inset-0 z-30 flex items-center justify-center bg-background/60 backdrop-blur-[1.5px] {klass}"
    role="status"
    aria-label="Preparing map"
>
    <span
        class="size-8 rounded-full border-2 border-muted-foreground/25 border-t-primary animate-spin"
    ></span>
</div>
