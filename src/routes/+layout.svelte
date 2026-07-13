<script lang="ts">
    import "../app.css";
    import { onMount } from "svelte";
    import { onNavigate } from "$app/navigation";
    import {
        applyTheme,
        themePrefs,
        pullThemeFromSupabase,
    } from "$lib/stores/theme.svelte";
    import favicon from "$lib/assets/redthread.svg";

    let { children } = $props();

    $effect(() => {
        applyTheme({
            accentHue: themePrefs.accentHue,
            bgBase: themePrefs.bgBase,
            radius: themePrefs.radius,
            blur: themePrefs.blur,
        });
    });

    onMount(() => {
        void pullThemeFromSupabase();
    });

    // Shared-element style morph for home ↔ search (search bar).
    onNavigate((navigation) => {
        if (typeof document === "undefined" || !document.startViewTransition) {
            return;
        }
        const from = navigation.from?.url.pathname ?? "";
        const to = navigation.to?.url.pathname ?? "";
        const homeSearch =
            (from === "/" && to.startsWith("/search")) ||
            (from.startsWith("/search") && to === "/");
        if (!homeSearch) return;

        document.documentElement.dataset.vt = "home-search";

        return new Promise<void>((resolve) => {
            const transition = document.startViewTransition(async () => {
                resolve();
                await navigation.complete;
            });
            transition.finished.finally(() => {
                delete document.documentElement.dataset.vt;
            });
        });
    });
</script>

<svelte:head><link rel="icon" href={favicon} /></svelte:head>

{@render children()}
