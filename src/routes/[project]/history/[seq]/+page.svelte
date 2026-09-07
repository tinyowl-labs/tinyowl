<script lang="ts">
    import { goto, invalidateAll } from "$app/navigation";
    import { page } from "$app/stores";
    import ChangesetInspect from "$lib/components/changeset/ChangesetInspect.svelte";
    import ChangesetWorkspace from "$lib/components/changeset/ChangesetWorkspace.svelte";
    import GeodiffSummaryChips from "$lib/components/changeset/GeodiffSummaryChips.svelte";
    import InvertCommitBar from "$lib/components/changeset/InvertCommitBar.svelte";
    import { canWriteRole } from "$lib/changeset/client";

    let { data } = $props();

    const accessToken = $derived(
        ((data as any)?.accessToken as string) ||
            (($page.data as any)?.accessToken as string) ||
            "",
    );
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
    const message = $derived(
        (commitMeta?.message ?? diffMeta?.message)?.trim() ||
            (seq ? `Changeset #${seq}` : "Commit"),
    );
    const fingerprint = $derived(
        String(commitMeta?.changeset_sha ?? diffMeta?.sha256 ?? "").slice(0, 10),
    );
    const role = $derived(String((data as any)?.role ?? ""));
    const canWrite = $derived(canWriteRole(role));
    const invertCommitId = $derived(String(commitMeta?.id ?? ""));

    let invertErr = $state("");

    async function afterInvert(newId: string) {
        if (newId) {
            await goto(`/${slug}/history/${newId}`);
        } else {
            await invalidateAll();
        }
    }
</script>

<ChangesetWorkspace title="{shortRev} — {slug} — echidna">
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
        <GeodiffSummaryChips {summary} />
    {/snippet}
    {#snippet actions()}
        {#if canWrite && invertCommitId}
            <InvertCommitBar
                {slug}
                {accessToken}
                commitId={invertCommitId}
                label={message}
                bind:error={invertErr}
                onDone={afterInvert}
            />
        {/if}
    {/snippet}
    {#snippet banner()}
        {#if invertErr}
            <p class="px-4 py-2 text-sm text-destructive border-b border-border">
                {invertErr}
            </p>
        {/if}
    {/snippet}

    <ChangesetInspect {geodiff} />
</ChangesetWorkspace>
