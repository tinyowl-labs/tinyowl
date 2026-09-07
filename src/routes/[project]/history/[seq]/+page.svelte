<script lang="ts">
    import { goto, invalidateAll } from "$app/navigation";
    import { page } from "$app/stores";
    import ChangesetInspect from "$lib/components/changeset/ChangesetInspect.svelte";
    import WorkspaceToolbar from "$lib/components/ui/workspace-toolbar.svelte";

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
    const role = $derived(String((data as any)?.role ?? ""));
    const canWrite = $derived(
        role === "owner" || role === "admin" || role === "collaborator",
    );
    const invertCommitId = $derived(String(commitMeta?.id ?? ""));

    let invertNote = $state("");
    let invertBusy = $state(false);
    let invertErr = $state("");

    $effect(() => {
        const id = invertCommitId;
        const msg = message;
        invertNote = id ? `Invert ${id.slice(0, 8)}: ${msg}` : "";
        invertErr = "";
    });

    function authHeaders(): HeadersInit {
        const h: Record<string, string> = {
            "Content-Type": "application/json",
        };
        if (accessToken) h["Authorization"] = `Bearer ${accessToken}`;
        return h;
    }

    const canInvert = $derived(
        canWrite &&
            invertCommitId.length > 0 &&
            invertNote.trim().length > 0 &&
            !invertBusy,
    );

    async function invert() {
        if (!canInvert) {
            if (canWrite && invertCommitId && !invertNote.trim()) {
                invertErr = "An invert message is required.";
            }
            return;
        }
        invertBusy = true;
        invertErr = "";
        try {
            const res = await fetch(
                `/api/v1/projects/${slug}/commits/${invertCommitId}/invert`,
                {
                    method: "POST",
                    headers: authHeaders(),
                    body: JSON.stringify({ message: invertNote.trim() }),
                },
            );
            const body = await res.json().catch(() => ({}));
            if (!res.ok) {
                invertErr = body.error || `Failed (${res.status})`;
                return;
            }
            const newId = String(body.commit_id ?? "");
            if (newId) {
                await goto(`/${slug}/history/${newId}`);
            } else {
                await invalidateAll();
            }
        } catch (e: any) {
            invertErr = e?.message || "Invert failed";
        } finally {
            invertBusy = false;
        }
    }
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
        {#snippet actions()}
            {#if canWrite && invertCommitId}
                <input
                    class="h-8 w-56 rounded-md border border-border bg-background px-3 text-xs"
                    placeholder="Required invert message"
                    bind:value={invertNote}
                    disabled={invertBusy}
                    onkeydown={(e) => {
                        if (e.key === "Enter") void invert();
                    }}
                />
                <button
                    type="button"
                    class="inline-flex h-8 items-center rounded-md bg-primary px-3 text-xs text-primary-foreground disabled:opacity-50"
                    disabled={!canInvert}
                    onclick={() => void invert()}
                >
                    {invertBusy ? "Inverting…" : "Invert"}
                </button>
            {/if}
        {/snippet}
    </WorkspaceToolbar>
    {#if invertErr}
        <p class="px-4 py-2 text-sm text-destructive border-b border-border">
            {invertErr}
        </p>
    {/if}
    <ChangesetInspect {geodiff} />
</article>
