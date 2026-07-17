<script lang="ts">
    import redthreadSvg from "$lib/assets/redthread.svg?raw";
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
    import * as DropdownMenu from "$lib/components/ui/dropdown-menu/index.js";
    import { buttonVariants } from "$lib/components/ui/button/button.svelte";
    import { cn } from "$lib/utils.js";

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

    function toggleTheme() {
        setPreference("bgBase", dark ? "paper" : "dark");
        void pushThemeToSupabase();
    }
</script>

<header
    class="glass-dock flex h-11 shrink-0 items-center justify-between px-4 border-b border-border text-foreground"
    class:fixed
    class:top-0={fixed}
    class:inset-x-0={fixed}
    class:z-50={fixed}
>
    <div class="flex items-center gap-2.5">
        <a
            href="/"
            aria-label="tinyowl"
            class="text-sm font-semibold text-foreground"
        >
            <span
                class="size-5 shrink-0 inline-block [&>svg]:w-full [&>svg]:h-full mr-1.5 align-middle"
            >
                {#if isMounted}{@html owlSvg}{/if}
            </span>
            tinyowl
        </a>
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
