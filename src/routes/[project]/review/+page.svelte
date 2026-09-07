<script lang="ts">
    import { invalidateAll } from "$app/navigation";
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
    const preview = $derived(((data as any)?.preview as any) ?? {});
    const inSync = $derived(Boolean(preview.in_sync));
    const ahead = $derived((((preview.commits as any[]) ?? []) as any[]) ?? []);
    const geodiff = $derived(
        (((preview.changes?.geodiff as any[]) ?? []) as any[]) ?? [],
    );
    const summary = $derived(
        (((preview.summary?.geodiff_summary as any[]) ?? []) as any[]) ?? [],
    );
    const leftover = $derived(((data as any)?.changesets as any[]) ?? []);
    const conflictedCommits = $derived(
        ((data as any)?.conflictedCommits as any[]) ?? [],
    );

    let note = $state("");
    let busy = $state(false);
    let errorMsg = $state("");

    const entitySummary = $derived(
        summary.filter((s: any) => !String(s.table ?? "").startsWith("_")),
    );

    function formatDate(ts: string): string {
        if (!ts) return "";
        return new Date(ts).toLocaleDateString("en-GB", {
            day: "numeric",
            month: "short",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit",
        });
    }

    function authHeaders(): HeadersInit {
        const h: Record<string, string> = {
            "Content-Type": "application/json",
        };
        if (accessToken) h["Authorization"] = `Bearer ${accessToken}`;
        return h;
    }

    const canPublish = $derived(!inSync && note.trim().length > 0 && !busy);

    async function publish() {
        if (!canPublish) {
            if (!inSync && !note.trim()) {
                errorMsg = "A publish note is required.";
            }
            return;
        }
        busy = true;
        errorMsg = "";
        try {
            const res = await fetch(`/api/v1/projects/${slug}/promote`, {
                method: "POST",
                headers: authHeaders(),
                body: JSON.stringify({ note: note.trim() }),
            });
            const body = await res.json().catch(() => ({}));
            if (!res.ok) {
                errorMsg = body.error || `Failed (${res.status})`;
                return;
            }
            note = "";
            await invalidateAll();
        } catch (e: any) {
            errorMsg = e?.message || "Publish failed";
        } finally {
            busy = false;
        }
    }
</script>

<svelte:head>
    <title>Publish — {slug} — echidna</title>
</svelte:head>

<article class="flex h-full min-h-0 flex-col overflow-hidden">
    <WorkspaceToolbar>
        {#snippet meta()}
            <span class="min-w-0 truncate text-foreground">
                {#if inSync}
                    main and develop are in sync
                {:else}
                    Publish develop → main
                    {#if ahead.length}
                        <span class="text-muted-foreground"
                            >· {ahead.length} commit{ahead.length === 1
                                ? ""
                                : "s"} ahead</span
                        >
                    {/if}
                {/if}
            </span>
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
            {#if !inSync}
                <input
                    class="h-8 w-56 rounded-md border border-border bg-background px-3 text-xs"
                    placeholder="Required publish note"
                    bind:value={note}
                    disabled={busy}
                    onkeydown={(e) => {
                        if (e.key === "Enter") void publish();
                    }}
                />
                <button
                    class="inline-flex h-8 items-center rounded-md bg-primary px-3 text-xs text-primary-foreground disabled:opacity-50"
                    disabled={!canPublish}
                    onclick={() => void publish()}
                >
                    {busy ? "Publishing…" : "Publish"}
                </button>
            {/if}
        {/snippet}
    </WorkspaceToolbar>

    {#if errorMsg}
        <p class="px-4 py-2 text-sm text-destructive border-b border-border">
            {errorMsg}
        </p>
    {/if}

    <div
        class="flex-1 min-h-0 overflow-hidden grid grid-cols-1 lg:grid-cols-[minmax(220px,260px)_minmax(0,1fr)]"
    >
        <div
            class="min-h-0 flex flex-col border-b lg:border-b-0 lg:border-r border-border max-h-[32vh] lg:max-h-none"
        >
            <div
                class="px-3 py-2 text-xs text-muted-foreground border-b border-border"
            >
                Develop vs main
            </div>
            <div class="flex-1 min-h-0 overflow-y-auto">
                {#if inSync && leftover.length === 0 && conflictedCommits.length === 0}
                    <p class="p-4 text-sm text-muted-foreground">
                        Nothing unpublished. Viewers already see this tip.
                    </p>
                {:else}
                    <ul class="divide-y divide-border">
                        {#each ahead as c}
                            <li>
                                <a
                                    href="/{slug}/history/{c.id}"
                                    class="block px-3 py-2.5 hover:bg-accent/40"
                                >
                                    <div
                                        class="flex items-center gap-2 text-xs"
                                    >
                                        <span
                                            class="shrink-0 text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-400"
                                            >ahead</span
                                        >
                                        <span
                                            class="font-mono text-muted-foreground"
                                            >{(c.id ?? "").slice(0, 8)}</span
                                        >
                                        <span
                                            class="text-foreground truncate"
                                            >{c.message?.trim() ||
                                                "Untitled"}</span
                                        >
                                    </div>
                                    <p
                                        class="mt-0.5 text-[11px] text-muted-foreground"
                                    >
                                        {formatDate(c.created_at)}
                                    </p>
                                </a>
                            </li>
                        {/each}
                        {#each leftover as cs}
                            <li>
                                <a
                                    href="/{slug}/review/{cs.id}"
                                    class="block px-3 py-2.5 hover:bg-accent/40"
                                >
                                    <div
                                        class="flex items-center gap-2 text-xs"
                                    >
                                        <span
                                            class="shrink-0 text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-400"
                                            >leftover</span
                                        >
                                        <span
                                            class="text-foreground truncate"
                                            >{cs.message?.trim() ||
                                                "Untitled"}</span
                                        >
                                    </div>
                                    <p
                                        class="mt-0.5 text-[11px] text-muted-foreground"
                                    >
                                        {formatDate(cs.created_at)} · pre-DAG
                                        pending
                                    </p>
                                </a>
                            </li>
                        {/each}
                        {#each conflictedCommits as c}
                            <li>
                                <a
                                    href="/{slug}/history/{c.id}"
                                    class="block px-3 py-2.5 hover:bg-accent/40"
                                >
                                    <div
                                        class="flex items-center gap-2 text-xs"
                                    >
                                        <span
                                            class="shrink-0 text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded bg-red-500/15 text-red-400"
                                            >conflicted</span
                                        >
                                        <span
                                            class="font-mono text-muted-foreground"
                                            >{(c.id ?? "").slice(0, 8)}</span
                                        >
                                        <span
                                            class="text-foreground truncate"
                                            >{c.message?.trim() ||
                                                "Untitled"}</span
                                        >
                                    </div>
                                    <p
                                        class="mt-0.5 text-[11px] text-muted-foreground"
                                    >
                                        {formatDate(c.created_at)} · unmerged
                                    </p>
                                </a>
                            </li>
                        {/each}
                    </ul>
                {/if}
            </div>
        </div>

        <div class="min-h-0 h-full overflow-hidden flex flex-col">
            <ChangesetInspect {geodiff} />
        </div>
    </div>
</article>
