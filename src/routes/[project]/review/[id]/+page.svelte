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
    let showMetaTables = $state(false);

    const INTERNAL_COLS = new Set([
        "geom",
        "geometry",
        "shape",
        "_revision",
        "_snapshot",
        "_deleted",
        "_hash",
    ]);

    type ColChange = {
        name: string;
        oldV: string;
        newV: string;
        changed: boolean;
        internal: boolean;
    };

    type RowChange = {
        id: string;
        table: string;
        type: string;
        geometry: any;
        cols: ColChange[];
        label: string;
        changedNames: string[];
        isMeta: boolean;
    };

    function formatVal(v: unknown, max = 120): string {
        if (v == null || v === "") return "—";
        if (typeof v === "string") {
            if (v.length > max) return v.slice(0, max - 1) + "…";
            return v;
        }
        if (typeof v === "number" || typeof v === "boolean") return String(v);
        try {
            const s = JSON.stringify(v);
            return s.length > max ? s.slice(0, max - 1) + "…" : s;
        } catch {
            return String(v);
        }
    }

    function rawPresent(v: unknown): boolean {
        return v != null && v !== "";
    }

    const rows = $derived.by((): RowChange[] =>
        geodiff.map((e, i) => {
            const table = e.table ?? "";
            const type = (e.type ?? "").toLowerCase();
            const cols: ColChange[] = (e.changes ?? []).map((c: any) => {
                const name = c.name || `col${c.column}`;
                const oldV = formatVal(c.old);
                const newV = formatVal(c.new);
                const hasOld = rawPresent(c.old);
                const hasNew = rawPresent(c.new);
                const changed =
                    type === "update"
                        ? oldV !== newV && (hasOld || hasNew)
                        : type === "insert"
                          ? hasNew
                          : hasOld;
                return {
                    name,
                    oldV,
                    newV,
                    changed,
                    internal: INTERNAL_COLS.has(name) || name.startsWith("_"),
                };
            });

            const identity =
                cols.find((c) => c.name === "source_id")?.newV ||
                cols.find((c) => c.name === "source_id")?.oldV ||
                cols.find((c) => c.name === "id")?.newV ||
                cols.find((c) => c.name === "fid")?.newV ||
                `#${i + 1}`;

            const changedNames = cols
                .filter(
                    (c) =>
                        c.changed &&
                        !c.internal &&
                        c.name !== "source_id" &&
                        c.name !== "fid",
                )
                .map((c) => c.name);

            return {
                id: String(i),
                table,
                type,
                geometry: e.geometry ?? null,
                cols,
                label: String(identity),
                changedNames,
                isMeta: table.startsWith("_"),
            };
        }),
    );

    const entityRows = $derived(rows.filter((r) => !r.isMeta));
    const metaRows = $derived(rows.filter((r) => r.isMeta));
    const visibleRows = $derived(
        showMetaTables ? rows : entityRows.length ? entityRows : rows,
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

    const hasMap = $derived(features.length > 0);

    const selected = $derived(
        visibleRows[selectedIdx] ?? visibleRows[0] ?? null,
    );

    const selectedFields = $derived.by(() => {
        if (!selected) return [] as ColChange[];
        const type = selected.type;
        const cols = selected.cols.filter((c) => !c.internal);
        if (type === "update") {
            const changed = cols.filter(
                (c) => c.oldV !== c.newV && (c.oldV !== "—" || c.newV !== "—"),
            );
            return changed.length ? changed : cols;
        }
        return cols.filter((c) => c.newV !== "—" || c.oldV !== "—");
    });

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

    function selectRow(i: number) {
        selectedIdx = i;
    }

    function typeBadge(type: string): string {
        if (type === "insert") return "bg-emerald-500/15 text-emerald-400";
        if (type === "delete") return "bg-red-500/15 text-red-400";
        if (type === "update") return "bg-amber-500/15 text-amber-400";
        return "bg-muted text-muted-foreground";
    }
</script>

<svelte:head>
    <title>Review — {slug} — echidna</title>
</svelte:head>

<article class="flex flex-col h-full min-h-0">
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

    <div
        class="flex-1 min-h-0 grid {hasMap
            ? 'grid-cols-1 lg:grid-cols-[minmax(0,1.1fr)_minmax(280px,0.9fr)_minmax(320px,1fr)]'
            : 'grid-cols-1 lg:grid-cols-[minmax(280px,380px)_minmax(0,1fr)]'}"
    >
        {#if hasMap}
            <div
                class="relative min-h-[220px] border-b lg:border-b-0 lg:border-r border-border"
            >
                <ReviewMap
                    {features}
                    selectedId={selected?.id ?? null}
                    class="absolute inset-0"
                />
            </div>
        {/if}

        <!-- Change list -->
        <div
            class="min-h-0 flex flex-col border-b lg:border-b-0 lg:border-r border-border"
        >
            <div
                class="shrink-0 flex items-center justify-between gap-2 px-3 py-2 border-b border-border text-xs text-muted-foreground"
            >
                <span
                    >{visibleRows.length} change{visibleRows.length === 1
                        ? ""
                        : "s"}</span
                >
                {#if metaRows.length && entityRows.length}
                    <button
                        class="hover:text-foreground underline-offset-2 hover:underline"
                        onclick={() => (showMetaTables = !showMetaTables)}
                    >
                        {showMetaTables
                            ? "Hide meta tables"
                            : `Show meta (${metaRows.length})`}
                    </button>
                {/if}
            </div>
            <div class="flex-1 min-h-0 overflow-y-auto">
                {#if visibleRows.length === 0}
                    <p class="p-4 text-sm text-muted-foreground">
                        No row changes.
                    </p>
                {:else}
                    <ul class="divide-y divide-border">
                        {#each visibleRows as row, i}
                            <li>
                                <button
                                    type="button"
                                    class="w-full text-left px-3 py-2.5 {selectedIdx ===
                                    i
                                        ? 'bg-accent'
                                        : 'hover:bg-accent/40'}"
                                    onclick={() => selectRow(i)}
                                >
                                    <div class="flex items-center gap-2 min-w-0">
                                        <span
                                            class="shrink-0 text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded {typeBadge(
                                                row.type,
                                            )}">{row.type}</span
                                        >
                                        <span
                                            class="font-mono text-xs text-foreground truncate"
                                            >{row.table}</span
                                        >
                                        <span
                                            class="font-mono text-xs text-muted-foreground truncate ml-auto"
                                            >{row.label}</span
                                        >
                                    </div>
                                    <p
                                        class="mt-1 text-xs text-muted-foreground truncate"
                                    >
                                        {#if row.type === "update" && row.changedNames.length}
                                            Changed: {row.changedNames.join(
                                                ", ",
                                            )}
                                        {:else if row.type === "insert"}
                                            New row{#if row.changedNames.length}
                                                · {row.changedNames
                                                    .slice(0, 4)
                                                    .join(", ")}{row
                                                    .changedNames.length > 4
                                                    ? "…"
                                                    : ""}{/if}
                                        {:else if row.type === "delete"}
                                            Deleted
                                        {:else}
                                            —
                                        {/if}
                                    </p>
                                </button>
                            </li>
                        {/each}
                    </ul>
                {/if}
            </div>
        </div>

        <!-- Field detail -->
        <div class="min-h-0 overflow-y-auto bg-card/30">
            {#if !selected}
                <p class="p-6 text-sm text-muted-foreground">
                    Select a change to inspect fields.
                </p>
            {:else}
                <div class="px-4 py-3 border-b border-border">
                    <p class="text-sm text-foreground">
                        <span class="font-mono">{selected.table}</span>
                        <span class="text-muted-foreground mx-1.5">/</span>
                        <span class="font-mono text-muted-foreground"
                            >{selected.label}</span
                        >
                    </p>
                    <p class="text-xs text-muted-foreground mt-0.5 capitalize">
                        {selected.type}
                        {#if selected.type === "update"}
                            · {selectedFields.length} field{selectedFields.length ===
                            1
                                ? ""
                                : "s"} changed
                        {/if}
                    </p>
                </div>
                {#if selectedFields.length === 0}
                    <p class="p-6 text-sm text-muted-foreground">
                        No attribute fields to show.
                    </p>
                {:else if selected.type === "update"}
                    <table class="w-full text-sm">
                        <thead
                            class="sticky top-0 bg-card border-b border-border text-left text-xs text-muted-foreground"
                        >
                            <tr>
                                <th class="px-4 py-2 font-medium w-[28%]"
                                    >Field</th
                                >
                                <th class="px-4 py-2 font-medium">Before</th>
                                <th class="px-4 py-2 font-medium">After</th>
                            </tr>
                        </thead>
                        <tbody class="divide-y divide-border">
                            {#each selectedFields as f}
                                <tr>
                                    <td
                                        class="px-4 py-2.5 font-mono text-xs align-top text-foreground"
                                        >{f.name}</td
                                    >
                                    <td
                                        class="px-4 py-2.5 text-xs align-top text-muted-foreground break-all"
                                        >{f.oldV}</td
                                    >
                                    <td
                                        class="px-4 py-2.5 text-xs align-top text-foreground break-all"
                                        >{f.newV}</td
                                    >
                                </tr>
                            {/each}
                        </tbody>
                    </table>
                {:else}
                    <table class="w-full text-sm">
                        <thead
                            class="sticky top-0 bg-card border-b border-border text-left text-xs text-muted-foreground"
                        >
                            <tr>
                                <th class="px-4 py-2 font-medium w-[32%]"
                                    >Field</th
                                >
                                <th class="px-4 py-2 font-medium">Value</th>
                            </tr>
                        </thead>
                        <tbody class="divide-y divide-border">
                            {#each selectedFields as f}
                                <tr>
                                    <td
                                        class="px-4 py-2.5 font-mono text-xs align-top text-muted-foreground"
                                        >{f.name}</td
                                    >
                                    <td
                                        class="px-4 py-2.5 text-xs align-top text-foreground break-all"
                                    >
                                        {selected.type === "delete"
                                            ? f.oldV
                                            : f.newV}
                                    </td>
                                </tr>
                            {/each}
                        </tbody>
                    </table>
                {/if}
            {/if}
        </div>
    </div>
</article>
