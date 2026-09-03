<script lang="ts">
    import { browser } from "$app/environment";
    import MenuIcon from "@lucide/svelte/icons/menu";
    import XIcon from "@lucide/svelte/icons/x";

    let {
        open = $bindable(false),
        title = "",
        titleHref = "",
        /** Visibility class for the FAB and overlay (match the desktop nav breakpoint). */
        toggleClass = "lg:hidden",
        children,
    }: {
        open?: boolean;
        title?: string;
        titleHref?: string;
        toggleClass?: string;
        children: import("svelte").Snippet;
    } = $props();

    function close() {
        open = false;
    }

    // Close on Escape
    $effect(() => {
        if (!browser || !open) return;
        const onKey = (e: KeyboardEvent) => {
            if (e.key === "Escape") close();
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    });
</script>

<!-- Toggle button (visible on mobile) -->
<button
    class="{toggleClass} fixed bottom-4 left-4 z-1100 flex items-center justify-center size-10 rounded-full bg-card border border-border shadow-lg text-foreground"
    onclick={() => (open = true)}
    aria-label="Open navigation"
>
    <MenuIcon class="size-5" />
</button>

<!-- Full-screen overlay -->
{#if open}
    <div class="fixed inset-0 z-1100 bg-background flex flex-col {toggleClass}">
        <div
            class="flex items-center justify-between px-4 h-11 border-b border-border shrink-0"
        >
            {#if titleHref}
                <a
                    href={titleHref}
                    onclick={close}
                    class="min-w-0 truncate text-sm font-semibold text-foreground no-underline"
                    >{title}</a
                >
            {:else}
                <span class="text-sm font-semibold">{title}</span>
            {/if}
            <button
                onclick={close}
                class="flex items-center justify-center size-8 rounded-md text-muted-foreground hover:text-foreground transition-colors"
                aria-label="Close navigation"
            >
                <XIcon class="size-4" />
            </button>
        </div>
        <div class="flex-1 overflow-y-auto">
            {@render children()}
        </div>
    </div>
{/if}
