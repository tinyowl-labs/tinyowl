<script lang="ts">
    import "../app.css";
    import { onMount } from "svelte";
    import { onNavigate } from "$app/navigation";
    import {
        applyTheme,
        themePrefs,
        pullThemeFromSupabase,
    } from "$lib/stores/theme.svelte";
    import { pullKeyboardFromSupabase } from "$lib/shortcuts";
    import { page } from "$app/stores";
    import Header from "$lib/components/ui/header.svelte";
    import SearchOverlay from "$lib/components/SearchOverlay.svelte";
    import { isMapOverlayHeader } from "$lib/stores/headerChrome.svelte";
    let { children } = $props();

    const hideHeader = $derived($page.url.pathname.startsWith("/auth"));
    const overlayHeader = $derived(
        isMapOverlayHeader(
            $page.url,
            ($page.params as { project?: string }).project,
        ),
    );

    $effect(() => {
        applyTheme({
            accentHue: themePrefs.accentHue,
            bgBase: themePrefs.bgBase,
            radius: themePrefs.radius,
            surface: themePrefs.surface,
            colorScheme: themePrefs.colorScheme,
        });
    });

    onMount(() => {
        void pullThemeFromSupabase();
        void pullKeyboardFromSupabase();
    });

    // Shared-element morph for home ↔ /search only. Same-path query updates
    // (chips, facets) must not snapshot `.search-vt-bar` or the pill vanishes.
    onNavigate((navigation) => {
        if (typeof document === "undefined" || !document.startViewTransition) {
            return;
        }
        const from = navigation.from?.url.pathname ?? "";
        const to = navigation.to?.url.pathname ?? "";
        if (from === to) return;
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

<svelte:head>
    <!-- OS/browser chrome: dark tab → light mark; light tab → dark mark -->
    <link
        rel="icon"
        href="/favicon-light.svg"
        type="image/svg+xml"
        media="(prefers-color-scheme: dark)"
    />
    <link
        rel="icon"
        href="/favicon.svg"
        type="image/svg+xml"
        media="(prefers-color-scheme: light)"
    />
    <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
</svelte:head>

<div class="flex h-dvh flex-col overflow-hidden">
    {#if !hideHeader && !overlayHeader}
        <Header />
    {/if}
    <div class="relative min-h-0 flex-1 overflow-hidden">
        {#if !hideHeader && overlayHeader}
            <Header />
        {/if}
        {@render children()}
    </div>
</div>
<SearchOverlay />
