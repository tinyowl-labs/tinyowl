<script lang="ts">
    import { onMount } from "svelte";
    import type { Snippet } from "svelte";
    import {
        isDark,
        setPreference,
        pushThemeToSupabase,
    } from "$lib/stores/theme.svelte";
    import SunIcon from "@lucide/svelte/icons/sun";
    import MoonIcon from "@lucide/svelte/icons/moon";
    import UserIcon from "@lucide/svelte/icons/user";
    import SettingsIcon from "@lucide/svelte/icons/settings";
    import LogOutIcon from "@lucide/svelte/icons/log-out";
    import ChevronDownIcon from "@lucide/svelte/icons/chevron-down";
    import PanelLeftIcon from "@lucide/svelte/icons/panel-left";
    import PanelLeftCloseIcon from "@lucide/svelte/icons/panel-left-close";
    import { cn } from "$lib/utils.js";
    import EchidnaLogo from "$lib/components/ui/echidna-logo.svelte";

    let {
        subtitle = "",
        hasSession = false,
        fixed = false,
        /** When set with onSidebarToggle, shows a panel control next to the brand. */
        sidebarCollapsed = false,
        onSidebarToggle,
        /** Visibility class for the toggle (match the sidebar breakpoint). */
        sidebarToggleClass = "hidden md:inline-flex",
        /** Extra content after the brand/subtitle (e.g. project nav dropdowns). */
        leading,
    }: {
        subtitle?: string;
        hasSession?: boolean;
        fixed?: boolean;
        sidebarCollapsed?: boolean;
        onSidebarToggle?: () => void;
        sidebarToggleClass?: string;
        leading?: Snippet;
    } = $props();

    const dark = $derived(isDark());

    let isMounted = $state(false);
    onMount(() => (isMounted = true));

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
        class="glass-dock pointer-events-none absolute inset-0 border-b border-border"
        aria-hidden="true"
    ></div>
    <div
        class="relative flex h-11 items-center justify-between overflow-visible px-4"
    >
    <div class="flex min-w-0 items-center gap-2">
        <a
            href="/"
            aria-label="echidna"
            class="inline-flex items-center gap-2 text-[15px] font-semibold tracking-tight text-foreground"
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
            <span class="w-px h-4 shrink-0 bg-border"></span>
            <span class="min-w-0 text-sm font-medium truncate text-foreground"
                >{subtitle}</span
            >
        {/if}
        {#if leading}
            <div class="flex min-w-0 shrink-0 items-center">
                {@render leading()}
            </div>
        {/if}
    </div>

    <nav class="flex items-center gap-1">
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
                    class="inline-flex items-center gap-1 rounded-md px-3 py-1.5 text-xs font-medium text-muted-foreground no-underline transition-colors hover:bg-accent hover:text-foreground group-hover/profile:bg-accent group-hover/profile:text-foreground group-focus-within/profile:bg-accent group-focus-within/profile:text-foreground"
                >
                    <UserIcon class="size-3.5" />
                    Profile
                    <ChevronDownIcon class="size-3 opacity-60" />
                </a>
                <div
                    class="invisible absolute right-0 top-full z-50 min-w-48 pt-1 opacity-0 transition-none group-hover/profile:visible group-hover/profile:opacity-100 group-focus-within/profile:visible group-focus-within/profile:opacity-100"
                >
                    <div
                        class="rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-md"
                    >
                        <p
                            class="px-2 py-1.5 text-xs font-medium text-muted-foreground"
                        >
                            Account
                        </p>
                        <a
                            href="/profile"
                            class="flex items-center gap-2 rounded-sm px-2 py-1.5 text-xs text-foreground no-underline hover:bg-accent hover:text-accent-foreground"
                        >
                            <UserIcon class="size-3.5 shrink-0" />
                            Projects
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
