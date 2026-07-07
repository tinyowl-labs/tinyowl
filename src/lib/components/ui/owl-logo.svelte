<script lang="ts">
    import redthreadSvg from "$lib/assets/redthread.svg?raw";
    import { isDark } from "$lib/stores/theme.svelte";

    const dark = $derived(isDark());
    const cleanSvg = redthreadSvg.replace(/<style>[\s\S]*?<\/style>/, "");
    const owlSvg = $derived(
        dark
            ? cleanSvg
                  .replace(/fill:#000000/gi, "fill:currentColor")
                  .replace(/stroke:#000000/gi, "stroke:currentColor")
                  .replace(/fill:#ffffff/gi, "fill:#000000")
                  .replace(/stroke:#ffffff/gi, "stroke:#000000")
            : cleanSvg,
    );
</script>

{#key dark}
    {@html owlSvg}
{/key}
