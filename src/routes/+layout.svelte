<script lang="ts">
    import "../app.css";
    import { onMount } from "svelte";
    import { invalidateAll, onNavigate } from "$app/navigation";
    import {
        applyTheme,
        themePrefs,
        applyRemoteTheme,
    } from "$lib/stores/theme.svelte";
    import { pullKeyboardFromSupabase } from "$lib/shortcuts";
    import { createClient } from "$lib/supabase/client";
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

    // Account changes during client navigation should sync once, not on every data reload.
    let appearanceUser = $page.data.user?.id;
    $effect(() => {
        const user = $page.data.user;
        if (user?.id && user.id !== appearanceUser) {
            appearanceUser = user.id;
            const remote = user.user_metadata?.theme_preferences;
            if (remote && typeof remote === "object") applyRemoteTheme(remote);
            void pullKeyboardFromSupabase(user);
        } else if (!user) appearanceUser = undefined;
    });

    onMount(() => {
        const user = $page.data.user;
        void pullKeyboardFromSupabase(user ?? null);
        // A verified SSR session is already current. Only recover a browser
        // session when SSR could not authenticate it (e.g. a rotated dev key).
        if (user) return;
        const auth = createClient().auth;
        void auth.getSession().then(async ({ data }) => {
            if (!data.session) return;
            const recovered = await auth.refreshSession();
            if (recovered.error || !recovered.data.session) return;
            const remote = recovered.data.user?.user_metadata?.theme_preferences;
            if (remote && typeof remote === "object") applyRemoteTheme(remote);
            void pullKeyboardFromSupabase(recovered.data.user);
            await invalidateAll();
        }).catch(() => { /* Keep the unauthenticated page usable when recovery fails. */ });
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
