<script lang="ts">
    import { goto } from "$app/navigation";
    import { page } from "$app/stores";
    import CheckIcon from "@lucide/svelte/icons/check";
    import XIcon from "@lucide/svelte/icons/x";
    import MessageSquareIcon from "@lucide/svelte/icons/message-square";
    import ReviewMap from "$lib/components/dashboard/ReviewMap.svelte";

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

    let selectedIdx = $state(0);
    let note = $state("");
    let busy = $state(false);
    let errorMsg = $state("");

    const rows = $derived(
        geodiff.map((e, i) => {
            const cols = (e.changes ?? [])
                .map((c: any) => {
                    const name = c.name || `col${c.column}`;
                    const oldV = formatVal(c.old);
                    const newV = formatVal(c.new);
                    return { name, oldV, newV };
                })
                .filter((c: any) => c.name);
            return {
                id: String(i),
                table: e.table ?? "",
                type: e.type ?? "",
                geometry: e.geometry ?? null,
                cols,
            };
        }),
    );

    const features = $derived(
        rows
            .filter((r) => r.geometry)
            .map((r) => ({
                id: r.id,
                table: r.table,
                type: r.type,
                geometry: r.geometry,
            })),
    );

    const selectedId = $derived(
        rows[selectedIdx] ? rows[selectedIdx].id : null,
    );

    function formatVal(v: unknown): string {
        if (v == null) return "—";
        if (typeof v === "string") {
            if (v.length > 48) return v.slice(0, 45) + "…";
            return v;
        }
        try {
            const s = JSON.stringify(v);
            return s.length > 48 ? s.slice(0, 45) + "…" : s;
        } catch {
            return String(v);
        }
    }

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
    <title>Review — {slug} — TinyOwl</title>
</svelte:head>

<article class="flex flex-col h-full min-h-0">
    <header
        class="shrink-0 flex flex-wrap items-start justify-between gap-3 px-4 py-3 border-b border-border"
    >
        <div class="min-w-0">
            <h1 class="text-lg font-medium text-foreground truncate">
                Changeset review
            </h1>
            <p class="text-sm text-muted-foreground mt-0.5">
                {changeset?.message?.trim() || "No message"}
                <span class="mx-1.5">·</span>
                <span class="font-mono text-xs"
                    >{changeset?.sha256?.slice(0, 10) ?? ""}</span
                >
                <span class="mx-1.5">·</span>
                <span class="capitalize">{changeset?.status ?? ""}</span>
            </p>
            {#if summary.length}
                <p class="text-xs text-muted-foreground mt-1">
                    {#each summary as s, i}
                        {#if i > 0}<span class="mx-1">·</span>{/if}
                        {s.table}: +{s.insert} ~{s.update} −{s.delete}
                    {/each}
                </p>
            {/if}
        </div>
        {#if open}
            <div class="flex flex-wrap items-center gap-2">
                <input
                    class="h-9 min-w-[12rem] flex-1 rounded-md border border-border bg-background px-3 text-sm"
                    placeholder="Note (required for request changes)"
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

    <div
        class="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(320px,42%)]"
    >
        <div class="relative min-h-[280px] border-b lg:border-b-0 lg:border-r border-border">
            {#if features.length === 0}
                <div
                    class="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground p-6 text-center"
                >
                    No geometries in this changeset — attribute-only edits.
                </div>
            {:else}
                <ReviewMap
                    {features}
                    selectedId={selectedId}
                    class="absolute inset-0"
                />
            {/if}
        </div>

        <div class="min-h-0 overflow-y-auto">
            {#if rows.length === 0}
                <p class="p-6 text-sm text-muted-foreground">No row changes.</p>
            {:else}
                <table class="w-full text-sm">
                    <thead
                        class="sticky top-0 bg-card border-b border-border text-left text-xs text-muted-foreground"
                    >
                        <tr>
                            <th class="px-3 py-2 font-medium">Table</th>
                            <th class="px-3 py-2 font-medium">Type</th>
                            <th class="px-3 py-2 font-medium">Columns</th>
                        </tr>
                    </thead>
                    <tbody class="divide-y divide-border">
                        {#each rows as row, i}
                            <tr
                                class="cursor-pointer {selectedIdx === i
                                    ? 'bg-accent ring-1 ring-inset ring-primary/20'
                                    : 'hover:bg-accent/40'}"
                                onclick={() => (selectedIdx = i)}
                            >
                                <td class="px-3 py-2 font-mono text-xs"
                                    >{row.table}</td
                                >
                                <td class="px-3 py-2 capitalize text-xs"
                                    >{row.type}</td
                                >
                                <td class="px-3 py-2 text-xs text-muted-foreground">
                                    {#each row.cols as c, j}
                                        {#if j > 0}<span class="mx-1">·</span
                                            >{/if}
                                        <span class="text-foreground"
                                            >{c.name}</span
                                        >
                                        {#if c.oldV !== "—" || c.newV !== "—"}
                                            <span class="opacity-70">
                                                {c.oldV}→{c.newV}
                                            </span>
                                        {/if}
                                    {/each}
                                </td>
                            </tr>
                        {/each}
                    </tbody>
                </table>
            {/if}
        </div>
    </div>
</article>
