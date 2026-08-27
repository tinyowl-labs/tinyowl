<script lang="ts">
    import { goto } from "$app/navigation";
    import { page } from "$app/stores";
    import { browser } from "$app/environment";
    import HistoryIcon from "@lucide/svelte/icons/history";
    import ChangesetInspect from "$lib/components/changeset/ChangesetInspect.svelte";
    import ReviewMap from "$lib/components/dashboard/ReviewMap.svelte";

    let { data } = $props();

    const accessToken = $derived(
        ((data as any)?.accessToken as string) ||
            (($page.data as any)?.accessToken as string) ||
            "",
    );
    const slug = $derived($page.params.project ?? "");
    const diffs = $derived(
        ([...((((data as any)?.diffs as any[]) ?? []) as any[])] as any[]).sort(
            (a, b) => (a.seq ?? 0) - (b.seq ?? 0),
        ),
    );
    const tables = $derived((((data as any)?.tables as { name: string }[]) ?? []).filter(
        (t) => !t.name.startsWith("_"),
    ));
    const pendingChangesets = $derived(
        ((data as any)?.pendingChangesets as any[]) ?? [],
    );

    const maxSeq = $derived(diffs.length ? Number(diffs[diffs.length - 1].seq) : 0);
    let seq = $state(0);
    $effect(() => {
        if (seq === 0 && maxSeq > 0) seq = maxSeq;
    });

    const selected = $derived(
        diffs.find((d) => Number(d.seq) === Number(seq)) ?? null,
    );

    let geodiff = $state<any[]>([]);
    let summary = $state<any[]>([]);
    let scrubFeatures = $state<any[]>([]);
    let loadErr = $state("");
    let loadGen = 0;

    async function loadSeq(seqNum: number) {
        if (!seqNum) return;
        const gen = ++loadGen;
        loadErr = "";
        const headers: Record<string, string> = {};
        if (accessToken) headers["Authorization"] = `Bearer ${accessToken}`;
        try {
            const res = await fetch(
                `/api/v1/projects/${slug}/diffs/${seqNum}/changes`,
                { headers },
            );
            const body = await res.json().catch(() => ({}));
            if (gen !== loadGen) return;
            if (!res.ok) {
                loadErr = body.error || `Failed to load seq ${seqNum}`;
                geodiff = [];
                summary = [];
            } else {
                geodiff = body.changes?.geodiff ?? [];
                summary = body.summary?.geodiff_summary ?? [];
            }
        } catch (e: any) {
            if (gen !== loadGen) return;
            loadErr = e?.message || "Failed to load changes";
        }

        const feats: any[] = [];
        const names = new Set<string>();
        for (const t of tables) {
            if (t?.name && !t.name.startsWith("_")) names.add(t.name);
        }
        for (const s of summary) {
            const tableName = String((s as any)?.table ?? "");
            if (tableName && !tableName.startsWith("_")) names.add(tableName);
        }
        for (const e of geodiff) {
            const tableName = String((e as any)?.table ?? "");
            if (tableName && !tableName.startsWith("_")) names.add(tableName);
        }
        if (names.size === 0) names.add("Sites");
        for (const name of names) {
            try {
                const res = await fetch(
                    `/api/v1/projects/${slug}/at/${seqNum}/layers/${encodeURIComponent(name)}/geojson`,
                    { headers },
                );
                if (!res.ok) continue;
                const fc = await res.json();
                for (const f of fc.features ?? []) {
                    feats.push({
                        id: `${name}:${f.properties?.entity_id ?? feats.length}`,
                        table: name,
                        type: "head",
                        geometry: f.geometry,
                    });
                }
            } catch {
                /* skip table */
            }
        }
        if (feats.length === 0) {
            for (const e of geodiff) {
                if (!(e as any)?.geometry) continue;
                feats.push({
                    id: `${(e as any).table}:${(e as any).changes?.[0]?.new ?? feats.length}`,
                    table: (e as any).table,
                    type: (e as any).type ?? "head",
                    geometry: (e as any).geometry,
                });
            }
        }
        if (gen !== loadGen) return;
        scrubFeatures = feats;
    }

    $effect(() => {
        if (!browser) return;
        if (seq > 0) loadSeq(seq);
    });

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
</script>

<svelte:head>
    <title>History — {slug} — echidna</title>
</svelte:head>

<article class="flex flex-col h-full min-h-0 overflow-hidden">
    <header
        class="shrink-0 flex flex-wrap items-start justify-between gap-3 px-4 py-3 border-b border-border"
    >
        <div class="min-w-0">
            <div class="flex items-center gap-2">
                <HistoryIcon class="size-5 text-muted-foreground" />
                <h1 class="text-lg font-medium text-foreground">Time machine</h1>
            </div>
            <p class="text-sm text-muted-foreground mt-0.5">
                {#if selected}
                    #{selected.seq}
                    {selected.message?.trim() || "(no message)"}
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
                {:else}
                    No applied changesets yet
                {/if}
            </p>
        </div>
        {#if maxSeq > 0}
            <div class="flex items-center gap-3 min-w-[240px]">
                <label
                    for="history-seq"
                    class="text-xs text-muted-foreground shrink-0">seq {seq}</label
                >
                <input
                    id="history-seq"
                    type="range"
                    min="1"
                    max={maxSeq}
                    value={seq}
                    oninput={(e) =>
                        (seq = Number(
                            (e.currentTarget as HTMLInputElement).value,
                        ))}
                    class="w-48"
                />
            </div>
        {/if}
    </header>

    {#if loadErr}
        <p class="px-4 py-2 text-sm text-destructive border-b border-border">
            {loadErr}
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
                Applied history
            </div>
            <div class="flex-1 min-h-0 overflow-y-auto">
                {#if diffs.length === 0 && pendingChangesets.length === 0}
                    <p class="p-4 text-sm text-muted-foreground">
                        No applied diffs.
                    </p>
                {:else}
                    <ul class="divide-y divide-border">
                        {#each pendingChangesets as cs}
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
                                            >pending</span
                                        >
                                        <span class="text-foreground truncate"
                                            >{cs.message?.trim() ||
                                                "Untitled"}</span
                                        >
                                    </div>
                                    <p
                                        class="mt-0.5 text-[11px] text-muted-foreground"
                                    >
                                        {formatDate(cs.created_at)}
                                    </p>
                                </a>
                            </li>
                        {/each}
                        {#each [...diffs].reverse() as d}
                            <li>
                                <button
                                    type="button"
                                    class="w-full text-left px-3 py-2.5 {Number(
                                        seq,
                                    ) === Number(d.seq)
                                        ? 'bg-accent'
                                        : 'hover:bg-accent/40'}"
                                    onclick={() => (seq = Number(d.seq))}
                                >
                                    <div
                                        class="flex items-center gap-2 text-xs"
                                    >
                                        <span
                                            class="font-mono text-muted-foreground"
                                            >#{d.seq}</span
                                        >
                                        <span
                                            class="text-foreground truncate"
                                            >{d.message?.trim() ||
                                                "Untitled"}</span
                                        >
                                    </div>
                                    <p
                                        class="mt-0.5 text-[11px] text-muted-foreground"
                                    >
                                        {formatDate(d.created_at)}
                                    </p>
                                </button>
                            </li>
                        {/each}
                    </ul>
                {/if}
            </div>
        </div>

        <div
            class="min-h-0 overflow-hidden grid grid-rows-[minmax(0,1fr)_minmax(200px,42%)]"
        >
            <div class="relative min-h-0 overflow-hidden">
                <ReviewMap
                    features={scrubFeatures}
                    selectedId={null}
                    class="h-full w-full"
                />
                {#if seq > 0 && !loadErr && scrubFeatures.length === 0}
                    <p
                        class="pointer-events-none absolute left-3 top-3 z-10 rounded-md bg-background/80 px-2 py-1 text-xs text-muted-foreground"
                    >
                        No geometry at seq {seq}
                    </p>
                {/if}
            </div>
            <div
                class="min-h-0 overflow-hidden flex flex-col border-t border-border"
            >
                <div
                    class="shrink-0 px-4 py-2 border-b border-border flex items-center justify-between"
                >
                    <span class="text-xs text-muted-foreground"
                        >ListChanges at seq {seq}</span
                    >
                    {#if seq}
                        <button
                            class="text-xs text-primary hover:underline"
                            onclick={() => goto(`/${slug}/history/${seq}`)}
                        >
                            Open inspect
                        </button>
                    {/if}
                </div>
                <ChangesetInspect {geodiff} showMap={false} />
            </div>
        </div>
    </div>
</article>
