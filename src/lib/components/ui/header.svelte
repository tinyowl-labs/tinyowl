<script lang="ts">
    import { onMount } from "svelte";
    import type { Snippet } from "svelte";
    import { page } from "$app/stores";
    import {
        isDark,
        setPreference,
        pushThemeToSupabase,
    } from "$lib/stores/theme.svelte";
    import SunIcon from "@lucide/svelte/icons/sun";
    import MoonIcon from "@lucide/svelte/icons/moon";
    import UserIcon from "@lucide/svelte/icons/user";
    import FolderKanbanIcon from "@lucide/svelte/icons/folder-kanban";
    import Building2Icon from "@lucide/svelte/icons/building-2";
    import SettingsIcon from "@lucide/svelte/icons/settings";
    import LogOutIcon from "@lucide/svelte/icons/log-out";
    import PanelLeftIcon from "@lucide/svelte/icons/panel-left";
    import PanelLeftCloseIcon from "@lucide/svelte/icons/panel-left-close";
    import SearchIcon from "@lucide/svelte/icons/search";
    import { cn } from "$lib/utils.js";
    import EchidnaLogo from "$lib/components/ui/echidna-logo.svelte";
    import UserAvatar from "$lib/components/ui/user-avatar.svelte";
    import { searchOverlay } from "$lib/stores/searchOverlay.svelte";

    let {
        subtitle = "",
        subtitleHref = "",
        hasSession = false,
        fixed = false,
        /** When set with onSidebarToggle, shows a panel control next to the brand. */
        sidebarCollapsed = false,
        onSidebarToggle,
        /** Visibility class for the toggle (match the sidebar breakpoint). */
        sidebarToggleClass = "hidden md:inline-flex",
        /** Extra content after the brand/subtitle (e.g. project nav dropdowns). */
        leading,
        /** Solid bar instead of glass — use on full-bleed canvases. */
        opaque = false,
    }: {
        subtitle?: string;
        /** When set, the subtitle (project title) links here — used as Overview. */
        subtitleHref?: string;
        hasSession?: boolean;
        fixed?: boolean;
        sidebarCollapsed?: boolean;
        onSidebarToggle?: () => void;
        sidebarToggleClass?: string;
        leading?: Snippet;
        opaque?: boolean;
    } = $props();

    const dark = $derived(isDark());
    const userId = $derived(
        ($page.data?.user as { id?: string } | undefined)?.id ?? "",
    );

    let isMounted = $state(false);
    let isMac = $state(false);
    onMount(() => {
        isMounted = true;
        isMac = /Mac|iPhone|iPad|iPod/i.test(
            navigator.platform || navigator.userAgent,
        );
    });

    function toggleTheme() {
        setPreference("bgBase", dark ? "paper" : "dark");
        void pushThemeToSupabase();
    }
</script>

<header
    class={cn(
        "isolate h-11 shrink-0 overflow-visible text-foreground",
        fixed ? "fixed top-0 inset-x-0 z-50" : "relative z-50",
    )}
>
    <div
        class={opaque
            ? "pointer-events-none absolute inset-0 border-b border-border bg-background"
            : "glass-dock pointer-events-none absolute inset-0 border-b border-border"}
        aria-hidden="true"
    ></div>
    <div
        class="relative flex h-11 items-center justify-between overflow-visible px-4"
    >
    <div class="flex min-w-0 flex-1 items-center gap-2 overflow-visible">
        <a
            href="/"
            aria-label="echidna"
            class="inline-flex shrink-0 items-center gap-2 text-[15px] font-semibold tracking-tight text-foreground"
        >
            <span
                class="size-6 shrink-0 inline-block [&>svg]:w-full [&>svg]:h-full"
            >
                {#if isMounted}<EchidnaLogo />{/if}
            </span>
            echidna
        </a>
        {#if onSidebarToggle}
            <button
                type="button"
                onclick={onSidebarToggle}
                class="{sidebarToggleClass} size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                title={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
                aria-label={sidebarCollapsed
                    ? "Expand sidebar"
                    : "Collapse sidebar"}
                aria-pressed={!sidebarCollapsed}
            >
                {#if sidebarCollapsed}
                    <PanelLeftIcon class="size-4" />
                {:else}
                    <PanelLeftCloseIcon class="size-4" />
                {/if}
            </button>
        {/if}
        {#if subtitle}
            <span class="h-4 w-px shrink-0 bg-border"></span>
            {#if subtitleHref}
                <a
                    href={subtitleHref}
                    class="min-w-0 max-w-[12rem] shrink truncate text-sm font-medium text-foreground no-underline transition-colors hover:text-foreground/70 md:max-w-[18rem] lg:max-w-[22rem]"
                    title={subtitle}
                    >{subtitle}</a
                >
            {:else}
                <span
                    class="min-w-0 max-w-[12rem] shrink truncate text-sm font-medium text-foreground md:max-w-[18rem] lg:max-w-[22rem]"
                    title={subtitle}>{subtitle}</span
                >
            {/if}
        {/if}
        {#if leading}
            <div class="flex shrink-0 items-center overflow-visible">
                {@render leading()}
            </div>
        {/if}
    </div>

    <nav class="flex shrink-0 items-center gap-1">
        <button
            type="button"
            onclick={() => searchOverlay.show()}
            class="inline-flex items-center gap-1.5 rounded-md px-1.5 py-1 text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
            aria-keyshortcuts={isMac ? "Meta+K" : "Control+K"}
            aria-label={searchOverlay.hasPageHost ? "Focus search" : "Open search"}
            title="Search"
        >
            <SearchIcon class="size-4" />
            {#if isMounted && !searchOverlay.hasPageHost}
                <span class="hidden items-center gap-0.5 sm:inline-flex" aria-hidden="true">
                    <kbd
                        class="rounded border border-border bg-background/80 px-1 py-0.5 font-sans text-[10px] leading-none"
                        >{isMac ? "⌘" : "Ctrl"}</kbd
                    >
                    <kbd
                        class="rounded border border-border bg-background/80 px-1 py-0.5 font-sans text-[10px] leading-none"
                        >K</kbd
                    >
                </span>
            {/if}
        </button>
        <button
            type="button"
            onclick={toggleTheme}
            class="relative rounded-md p-1.5 text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
            aria-label="Toggle theme"
        >
            <SunIcon
                class="size-4 scale-100 rotate-0 transition-all dark:scale-0 dark:-rotate-90"
            />
            <MoonIcon
                class="absolute size-4 scale-0 rotate-90 transition-all dark:scale-100 dark:rotate-0 top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2"
            />
        </button>
        {#if hasSession}
            <div class="group/profile relative">
                <a
                    href="/profile"
                    class="inline-flex size-7 items-center justify-center rounded-full text-muted-foreground no-underline transition-colors hover:bg-accent group-hover/profile:bg-accent group-focus-within/profile:bg-accent"
                    aria-label="Projects"
                    aria-haspopup="menu"
                >
                    {#if userId}
                        <UserAvatar userId={userId} class="size-6" />
                    {:else}
                        <UserIcon class="size-4" />
                    {/if}
                </a>
                <div
                    class="invisible absolute right-0 top-full z-50 min-w-48 pt-2 opacity-0 transition-none group-hover/profile:visible group-hover/profile:opacity-100 group-focus-within/profile:visible group-focus-within/profile:opacity-100"
                >
                    <div
                        class="rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-md"
                    >
                        <p
                            class="px-2 py-1.5 text-xs font-medium text-muted-foreground"
                        >
                            Account
                        </p>
                        {#if userId}
                            <a
                                href="/users/{userId}"
                                class="flex items-center gap-2 rounded-sm px-2 py-1.5 text-xs text-foreground no-underline hover:bg-accent hover:text-accent-foreground"
                            >
                                <UserIcon class="size-3.5 shrink-0" />
                                Your profile
                            </a>
                        {/if}
                        <a
                            href="/profile"
                            class="flex items-center gap-2 rounded-sm px-2 py-1.5 text-xs text-foreground no-underline hover:bg-accent hover:text-accent-foreground"
                        >
                            <FolderKanbanIcon class="size-3.5 shrink-0" />
                            Projects
                        </a>
                        <a
                            href="/orgs"
                            class="flex items-center gap-2 rounded-sm px-2 py-1.5 text-xs text-foreground no-underline hover:bg-accent hover:text-accent-foreground"
                        >
                            <Building2Icon class="size-3.5 shrink-0" />
                            Organisations
                        </a>
                        <a
                            href="/settings"
                            class="flex items-center gap-2 rounded-sm px-2 py-1.5 text-xs text-foreground no-underline hover:bg-accent hover:text-accent-foreground"
                        >
                            <SettingsIcon class="size-3.5 shrink-0" />
                            Settings
                        </a>
                        <div class="my-1 h-px bg-border"></div>
                        <a
                            href="/auth/logout"
                            class="flex items-center gap-2 rounded-sm px-2 py-1.5 text-xs text-foreground no-underline hover:bg-accent hover:text-accent-foreground"
                        >
                            <LogOutIcon class="size-3.5 shrink-0" />
                            Log out
                        </a>
                    </div>
                </div>
            </div>
        {:else}
            <a
                href="/auth/login"
                class="cursor-pointer rounded-full px-3.5 py-1.5 text-xs font-semibold transition-colors no-underline inline-block bg-foreground text-background hover:bg-primary hover:text-primary-foreground"
                >Sign in</a
            >
        {/if}
    </nav>
    </div>
</header>
