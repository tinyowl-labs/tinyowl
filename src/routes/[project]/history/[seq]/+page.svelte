<script lang="ts">
    import { page } from "$app/stores";
    import ChangesetInspect from "$lib/components/changeset/ChangesetInspect.svelte";
    import WorkspaceToolbar from "$lib/components/ui/workspace-toolbar.svelte";

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

<article class="flex h-full min-h-0 flex-col overflow-hidden">
    <WorkspaceToolbar>
        {#snippet meta()}
            <a href="/{slug}/history" class="hover:text-foreground hover:underline"
                >History</a
            >
            <span>/</span>
            <span>seq {seq}</span>
            <span class="min-w-0 truncate text-foreground">
                {diffMeta?.message?.trim() || `Changeset #${seq}`}
            </span>
            <span class="font-mono">{diffMeta?.sha256?.slice(0, 10) ?? ""}</span>
            {#if entitySummary.length}
                <span>
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
                </span>
            {/if}
        {/snippet}
    </WorkspaceToolbar>
    <ChangesetInspect {geodiff} />
</article>
