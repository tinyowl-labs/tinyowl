<script lang="ts">
    import { page } from "$app/stores";
    import ChangesetInspect from "$lib/components/changeset/ChangesetInspect.svelte";
    import WorkspaceToolbar from "$lib/components/ui/workspace-toolbar.svelte";

    let { data } = $props();

    const slug = $derived($page.params.project ?? "");
    const seq = $derived((data as any)?.seq as number);
    const rev = $derived(String((data as any)?.rev ?? ""));
    const commitMeta = $derived((data as any)?.commit as any);
    const diffMeta = $derived((data as any)?.diff as any);
    const shortRev = $derived(
        commitMeta?.id
            ? String(commitMeta.id).slice(0, 8)
            : seq
              ? `seq ${seq}`
              : rev.slice(0, 8),
    );
    const geodiff = $derived(
        (((data as any)?.changes?.geodiff as any[]) ?? []) as any[],
    );
    const summary = $derived(
        (((data as any)?.summary?.geodiff_summary as any[]) ?? []) as any[],
    );
    const entitySummary = $derived(
        summary.filter((s: any) => !String(s.table ?? "").startsWith("_")),
    );
    const message = $derived(
        (commitMeta?.message ?? diffMeta?.message)?.trim() ||
            (seq ? `Changeset #${seq}` : "Commit"),
    );
    const fingerprint = $derived(
        String(commitMeta?.changeset_sha ?? diffMeta?.sha256 ?? "").slice(0, 10),
    );
</script>

<svelte:head>
    <title>{shortRev} — {slug} — echidna</title>
</svelte:head>

<article class="flex h-full min-h-0 flex-col overflow-hidden">
    <WorkspaceToolbar>
        {#snippet meta()}
            <a href="/{slug}/history" class="hover:text-foreground hover:underline"
                >History</a
            >
            <span>/</span>
            <span class="font-mono">{shortRev}</span>
            <span class="min-w-0 truncate text-foreground">
                {message}
            </span>
            <span class="font-mono">{fingerprint}</span>
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
