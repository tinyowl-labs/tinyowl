<script lang="ts">
    import type { Snippet } from "svelte";

    const BADGE: Record<string, string> = {
        conflicted: "bg-red-500/15 text-red-400",
        pending: "bg-amber-500/15 text-amber-400",
        leftover: "bg-amber-500/15 text-amber-400",
        ahead: "bg-emerald-500/15 text-emerald-400",
        parked: "bg-sky-500/15 text-sky-400",
    };

    let {
        href,
        selected = false,
        disabled = false,
        onclick,
        badge,
        mono,
        title,
        subtitle,
        children,
    }: {
        href?: string;
        selected?: boolean;
        disabled?: boolean;
        onclick?: () => void;
        badge?: keyof typeof BADGE;
        mono?: string;
        title: string;
        subtitle?: string;
        children?: Snippet;
    } = $props();

    const rowClass = $derived(
        `px-3 py-2.5 ${
            selected
                ? href
                    ? "bg-accent/50"
                    : "bg-accent"
                : href || onclick
                  ? "hover:bg-accent/40"
                  : ""
        }`,
    );
</script>

{#snippet body()}
    <div class="flex items-center gap-2 text-xs">
        {#if badge}
            <span
                class="shrink-0 text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded {BADGE[
                    badge
                ]}">{badge}</span
            >
        {/if}
        {#if mono}
            <span class="font-mono text-muted-foreground">{mono}</span>
        {/if}
        <span class="text-foreground truncate">{title}</span>
    </div>
    {#if subtitle}
        <p class="mt-0.5 text-[11px] text-muted-foreground">{subtitle}</p>
    {/if}
    {@render children?.()}
{/snippet}

{#if href}
    <a {href} class="block {rowClass}">{@render body()}</a>
{:else if onclick}
    <button
        type="button"
        class="block w-full text-left {rowClass}"
        {disabled}
        {onclick}>{@render body()}</button
    >
{:else}
    <div class={rowClass}>{@render body()}</div>
{/if}
