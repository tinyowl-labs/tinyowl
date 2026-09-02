<script lang="ts">
    import { onMount } from "svelte";
    import { goto } from "$app/navigation";
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
    import * as DropdownMenu from "$lib/components/ui/dropdown-menu/index.js";
    import { buttonVariants } from "$lib/components/ui/button/button.svelte";
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
    }: {
        subtitle?: string;
        hasSession?: boolean;
        fixed?: boolean;
        sidebarCollapsed?: boolean;
        onSidebarToggle?: () => void;
        sidebarToggleClass?: string;
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
        "glass-dock flex h-11 shrink-0 items-center justify-between px-4 border-b border-border text-foreground",
        fixed ? "fixed top-0 inset-x-0 z-50" : "relative z-20",
    )}
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
            <span class="text-sm font-medium truncate text-foreground"
                >{subtitle}</span
            >
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
        <a
            href="/docs"
            class="rounded-md px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
            >Docs</a
        >
        {#if hasSession}
            <a
                href="/digitize"
                class="rounded-md px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                >Digitize</a
            >
            <DropdownMenu.Root>
                <DropdownMenu.Trigger
                    class={cn(
                        buttonVariants({ variant: "ghost", size: "sm" }),
                        "text-muted-foreground gap-1",
                    )}
                >
                    <UserIcon class="size-3.5" />
                    Profile
                    <ChevronDownIcon class="size-3 opacity-60" />
                </DropdownMenu.Trigger>
                <DropdownMenu.Content class="w-48" align="end">
                    <DropdownMenu.Group>
                        <DropdownMenu.Label>Account</DropdownMenu.Label>
                        <DropdownMenu.Item onSelect={() => goto("/profile")}>
                            <UserIcon />
                            Profile overview
                        </DropdownMenu.Item>
                        <DropdownMenu.Item onSelect={() => goto("/settings")}>
                            <SettingsIcon />
                            Settings
                        </DropdownMenu.Item>
                    </DropdownMenu.Group>
                    <DropdownMenu.Separator />
                    <DropdownMenu.Group>
                        <DropdownMenu.Item onSelect={() => goto("/auth/logout")}>
                            <LogOutIcon />
                            Log out
                        </DropdownMenu.Item>
                    </DropdownMenu.Group>
                </DropdownMenu.Content>
            </DropdownMenu.Root>
        {:else}
            <a
                href="/auth/login"
                class="cursor-pointer rounded-full px-3.5 py-1.5 text-xs font-semibold transition-colors no-underline inline-block bg-foreground text-background hover:bg-primary hover:text-primary-foreground"
                >Sign in</a
            >
        {/if}
    </nav>
</header>
