<script lang="ts">
    import "../app.css";
    import { applyTheme, themePrefs } from "$lib/stores/theme.svelte";
    import favicon from "$lib/assets/redthread.svg";

    let { children } = $props();

    $effect(() => {
        applyTheme(themePrefs);
    });
</script>

<svelte:head><link rel="icon" href={favicon} /></svelte:head>

{@render children()}
