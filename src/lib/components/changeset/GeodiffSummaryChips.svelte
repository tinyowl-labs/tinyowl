<script lang="ts">
    import {
        entitySummary,
        type GeodiffTableSummary,
    } from "$lib/changeset/client";

    let {
        summary,
        dotted = true,
        lead = "",
    }: {
        summary: GeodiffTableSummary[] | unknown;
        dotted?: boolean;
        lead?: string;
    } = $props();

    const rows = $derived(entitySummary(summary));
</script>

{#if rows.length}
    {#if lead}<span class="mx-1.5">{lead}</span>{/if}
    {#if dotted}
        <span>
            {#each rows as s, i}
                {#if i > 0}<span class="mx-1">·</span>{/if}
                <span class="text-foreground">{s.table}</span>
                {#if s.insert}<span class="text-emerald-400">+{s.insert}</span
                    >{/if}
                {#if s.update}<span class="text-amber-400">~{s.update}</span
                    >{/if}
                {#if s.delete}<span class="text-red-400">−{s.delete}</span>{/if}
            {/each}
        </span>
    {:else}
        {#each rows as s}
            <span>
                {s.table}
                {#if s.insert}<span class="text-emerald-400">+{s.insert}</span
                    >{/if}
                {#if s.update}<span class="text-amber-400">~{s.update}</span
                    >{/if}
                {#if s.delete}<span class="text-red-400">−{s.delete}</span>{/if}
            </span>
        {/each}
    {/if}
{/if}
