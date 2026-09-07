<script lang="ts">
    import { goto } from "$app/navigation";
    import { page } from "$app/stores";
    import CheckIcon from "@lucide/svelte/icons/check";
    import XIcon from "@lucide/svelte/icons/x";
    import MessageSquareIcon from "@lucide/svelte/icons/message-square";
    import ChangesetInspect from "$lib/components/changeset/ChangesetInspect.svelte";
    import ChangesetWorkspace from "$lib/components/changeset/ChangesetWorkspace.svelte";
    import GeodiffSummaryChips from "$lib/components/changeset/GeodiffSummaryChips.svelte";
    import { jsonAuthHeaders } from "$lib/changeset/client";

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
                    headers: jsonAuthHeaders(accessToken),
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

<ChangesetWorkspace title="Review — {slug} — echidna">
    {#snippet meta()}
        <span class="min-w-0 truncate text-foreground">
            {changeset?.message?.trim() || "Changeset review"}
        </span>
        <span class="capitalize">{changeset?.status ?? ""}</span>
        <span class="font-mono"
            >{changeset?.sha256?.slice(0, 10) ?? ""}</span
        >
        <GeodiffSummaryChips {summary} />
    {/snippet}
    {#snippet actions()}
        {#if open}
            <input
                class="h-8 w-56 rounded-md border border-border bg-background px-3 text-xs"
                placeholder="Note (for request changes)"
                bind:value={note}
            />
            <button
                class="inline-flex h-8 items-center gap-1.5 rounded-md bg-primary px-3 text-xs text-primary-foreground disabled:opacity-50"
                disabled={busy}
                onclick={() => act("approve")}
            >
                <CheckIcon class="size-3.5" />
                Approve
            </button>
            <button
                class="inline-flex h-8 items-center gap-1.5 rounded-md border border-border px-3 text-xs disabled:opacity-50"
                disabled={busy}
                onclick={() => act("request-changes")}
            >
                <MessageSquareIcon class="size-3.5" />
                Request changes
            </button>
            <button
                class="inline-flex h-8 items-center gap-1.5 rounded-md border border-destructive/40 px-3 text-xs text-destructive disabled:opacity-50"
                disabled={busy}
                onclick={() => act("reject")}
            >
                <XIcon class="size-3.5" />
                Reject
            </button>
        {/if}
    {/snippet}
    {#snippet banner()}
        {#if errorMsg}
            <p class="px-4 py-2 text-sm text-destructive border-b border-border">
                {errorMsg}
            </p>
        {/if}
    {/snippet}

    <ChangesetInspect {geodiff} />
</ChangesetWorkspace>
