<script lang="ts">
    import { goto } from "$app/navigation";
    import { page } from "$app/stores";
    import CheckIcon from "@lucide/svelte/icons/check";
    import XIcon from "@lucide/svelte/icons/x";
    import MessageSquareIcon from "@lucide/svelte/icons/message-square";
    import ChangesetInspect from "$lib/components/changeset/ChangesetInspect.svelte";

    let { data } = $props();

    const accessToken = $derived(
        ((data as any)?.accessToken as string) ||
            (($page.data as any)?.accessToken as string) ||
            "",
    );
    const slug = $derived($page.params.project ?? "");
    const changeset = $derived((data as any)?.changeset as any);
    const geodiff = $derived(
        (((data as any)?.changes?.geodiff as any[]) ?? []) as any[],
    );
    const summary = $derived(
        (((data as any)?.summary?.geodiff_summary as any[]) ?? []) as any[],
    );

    let note = $state("");
    let busy = $state(false);
    let errorMsg = $state("");

    const entitySummary = $derived(
        summary.filter((s: any) => !String(s.table ?? "").startsWith("_")),
    );

    function authHeaders(): HeadersInit {
        const h: Record<string, string> = {
            "Content-Type": "application/json",
        };
        if (accessToken) h["Authorization"] = `Bearer ${accessToken}`;
        return h;
    }

    async function act(action: "approve" | "reject" | "request-changes") {
        if (busy) return;
        if (action === "request-changes" && !note.trim()) {
            errorMsg = "Add a note when requesting changes.";
            return;
        }
        busy = true;
        errorMsg = "";
        try {
            const res = await fetch(
                `/api/v1/projects/${slug}/changesets/${changeset.id}/${action}`,
                {
                    method: "POST",
                    headers: authHeaders(),
                    body: JSON.stringify({ note: note.trim() }),
                },
            );
            const body = await res.json().catch(() => ({}));
            if (!res.ok) {
                errorMsg = body.error || `Failed (${res.status})`;
                return;
            }
            await goto(`/${slug}/dashboard`);
        } catch (e: any) {
            errorMsg = e?.message || "Request failed";
        } finally {
            busy = false;
        }
    }

    const open = $derived(
        changeset?.status === "pending" ||
            changeset?.status === "changes_requested",
    );
</script>

<svelte:head>
    <title>Review — {slug} — echidna</title>
</svelte:head>

<article class="absolute inset-0 flex flex-col overflow-hidden">
    <header
        class="shrink-0 flex flex-wrap items-start justify-between gap-3 px-4 py-3 border-b border-border"
    >
        <div class="min-w-0 max-w-3xl">
            <h1 class="text-lg font-medium text-foreground truncate">
                {changeset?.message?.trim() || "Changeset review"}
            </h1>
            <p class="text-sm text-muted-foreground mt-0.5">
                <span class="capitalize">{changeset?.status ?? ""}</span>
                <span class="mx-1.5">·</span>
                <span class="font-mono text-xs"
                    >{changeset?.sha256?.slice(0, 10) ?? ""}</span
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
        {#if open}
            <div class="flex flex-wrap items-center gap-2">
                <input
                    class="h-9 w-56 rounded-md border border-border bg-background px-3 text-sm"
                    placeholder="Note (for request changes)"
                    bind:value={note}
                />
                <button
                    class="inline-flex items-center gap-1.5 h-9 px-3 rounded-md bg-primary text-primary-foreground text-sm disabled:opacity-50"
                    disabled={busy}
                    onclick={() => act("approve")}
                >
                    <CheckIcon class="size-4" />
                    Approve
                </button>
                <button
                    class="inline-flex items-center gap-1.5 h-9 px-3 rounded-md border border-border text-sm disabled:opacity-50"
                    disabled={busy}
                    onclick={() => act("request-changes")}
                >
                    <MessageSquareIcon class="size-4" />
                    Request changes
                </button>
                <button
                    class="inline-flex items-center gap-1.5 h-9 px-3 rounded-md border border-destructive/40 text-destructive text-sm disabled:opacity-50"
                    disabled={busy}
                    onclick={() => act("reject")}
                >
                    <XIcon class="size-4" />
                    Reject
                </button>
            </div>
        {/if}
    </header>

    {#if errorMsg}
        <p class="px-4 py-2 text-sm text-destructive border-b border-border">
            {errorMsg}
        </p>
    {/if}

    <ChangesetInspect {geodiff} />
</article>
