<script lang="ts">
    import { page } from "$app/stores";
    import ChangesetInspect from "$lib/components/changeset/ChangesetInspect.svelte";

    let { data } = $props();

    const slug = $derived($page.params.project ?? "");
    const seq = $derived((data as any)?.seq as number);
    const diffMeta = $derived((data as any)?.diff as any);
    const geodiff = $derived(
        (((data as any)?.changes?.geodiff as any[]) ?? []) as any[],
    );
    const summary = $derived(
        (((data as any)?.summary?.geodiff_summary as any[]) ?? []) as any[],
    );
    const entitySummary = $derived(
        summary.filter((s: any) => !String(s.table ?? "").startsWith("_")),
    );
</script>

<svelte:head>
    <title>Seq {seq} — {slug} — echidna</title>
</svelte:head>

<article class="flex flex-col h-full min-h-0 overflow-hidden">
    <header
        class="shrink-0 flex flex-wrap items-start justify-between gap-3 px-4 py-3 border-b border-border"
    >
        <div class="min-w-0 max-w-3xl">
            <p class="text-xs text-muted-foreground mb-1">
                <a href="/{slug}/history" class="hover:underline">History</a>
                <span class="mx-1">/</span>
                seq {seq}
            </p>
            <h1 class="text-lg font-medium text-foreground truncate">
                {diffMeta?.message?.trim() || `Changeset #${seq}`}
            </h1>
            <p class="text-sm text-muted-foreground mt-0.5">
                <span class="font-mono text-xs"
                    >{diffMeta?.sha256?.slice(0, 10) ?? ""}</span
                >
                {#if entitySummary.length}
                    <span class="mx-1.5">·</span>
                    {#each entitySummary as s, i}
                        {#if i > 0}<span class="mx-1">·</span>{/if}
                        <span class="text-foreground">{s.table}</span>
                        {#if s.insert}<span class="text-emerald-400"
                                >+{s.insert}</span
                            >{/if}
                        {#if s.update}<span class="text-amber-400"
                                >~{s.update}</span
                            >{/if}
                        {#if s.delete}<span class="text-red-400"
                                >−{s.delete}</span
                            >{/if}
                    {/each}
                {/if}
            </p>
        </div>
    </header>
    <ChangesetInspect {geodiff} />
</article>
