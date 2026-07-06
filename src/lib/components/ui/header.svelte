<script lang="ts">
    import redthreadSvg from "$lib/assets/redthread.svg?raw";
    import { onMount } from "svelte";
    import { isDark } from "$lib/stores/theme.svelte";
    import SunIcon from "@lucide/svelte/icons/sun";
    import MoonIcon from "@lucide/svelte/icons/moon";

    let {
        subtitle = "",
        hasSession = false,
        fixed = false,
    }: { subtitle?: string; hasSession?: boolean; fixed?: boolean } = $props();

    const dark = $derived(isDark());
    const owlSvg = $derived(
        dark
            ? redthreadSvg
                  .replace(/fill:#000000/g, "fill:currentColor")
                  .replace(/stroke:#000000/g, "stroke:currentColor")
                  .replace(/fill:#ffffff/g, "fill:#000000")
                  .replace(/stroke:#ffffff/g, "stroke:#000000")
            : redthreadSvg,
    );

    let isMounted = $state(false);
    onMount(() => (isMounted = true));

    async function toggleTheme() {
        const { setPreference } = await import("$lib/stores/theme.svelte");
        setPreference("bgBase", dark ? "paper" : "dark");
    }
</script>

<header
    class="tw-header flex h-11 shrink-0 items-center justify-between px-4"
    class:fixed
    class:top-0={fixed}
    class:inset-x-0={fixed}
    class:z-50={fixed}
>
    <div class="flex items-center gap-2.5">
        <a
            href="/"
            aria-label="tinyowl"
            class="tw-logo-text text-sm font-semibold"
        >
            <span
                class="size-5 shrink-0 inline-block [&>svg]:w-full [&>svg]:h-full mr-1.5 align-middle"
            >
                {#if isMounted}{@html owlSvg}{/if}
            </span>
            tinyowl
        </a>
        {#if subtitle}
            <span class="w-px h-4 shrink-0 tw-separator"></span>
            <span class="text-sm font-medium truncate">{subtitle}</span>
        {/if}
    </div>

    <nav class="flex items-center gap-1">
        <button
            type="button"
            onclick={toggleTheme}
            class="tw-nav-link rounded-md p-1.5"
            aria-label="Toggle theme"
        >
            <SunIcon
                class="size-4 scale-100 rotate-0 transition-all dark:scale-0 dark:-rotate-90"
            />
            <MoonIcon
                class="absolute size-4 scale-0 rotate-90 transition-all dark:scale-100 dark:rotate-0"
            />
        </button>
        <a
            href="/docs"
            class="tw-nav-link rounded-md px-3 py-1.5 text-xs font-medium transition-colors"
            >Docs</a
        >
        {#if hasSession}
            <a
                href="/profile"
                class="tw-nav-link rounded-md px-3 py-1.5 text-xs font-medium transition-colors"
                >Profile</a
            >
        {:else}
            <a
                href="/auth/login"
                class="tw-nav-signin cursor-pointer rounded-full px-3.5 py-1.5 text-xs font-semibold transition-colors no-underline inline-block"
                >Sign in</a
            >
        {/if}
    </nav>
</header>

<style>
    .tw-header {
        background: #fbf7f5;
        border-bottom: 1px solid #eadfdb;
        color: #15110f;
    }
    :global(.dark) .tw-header {
        background: #050505;
        border-bottom-color: #1f1b19;
        color: #f7f2ee;
    }
    .tw-logo-text {
        color: inherit;
    }
    .tw-separator {
        background: #eadfdb;
    }
    :global(.dark) .tw-separator {
        background: #1f1b19;
    }
    .tw-nav-link {
        position: relative;
        color: #8b817c;
        background: transparent;
    }
    .tw-nav-link:hover {
        color: #15110f;
        background: #f1e8e3;
    }
    :global(.dark) .tw-nav-link {
        color: #9b918b;
    }
    :global(.dark) .tw-nav-link:hover {
        color: #f7f2ee;
        background: #181412;
    }
    .tw-nav-signin {
        background: #15110f;
        color: #fffaf7;
    }
    .tw-nav-signin:hover {
        background: #ad0000;
    }
    :global(.dark) .tw-nav-signin {
        background: #f3eee8;
        color: #090807;
    }
    :global(.dark) .tw-nav-signin:hover {
        background: #ff6b5f;
    }
    .tw-nav-link :global(svg) {
        position: absolute;
        top: 50%;
        left: 50%;
        translate: -50% -50%;
    }
</style>
