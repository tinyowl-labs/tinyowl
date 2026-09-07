<script lang="ts">
    import { goto } from "$app/navigation";
    import { page } from "$app/stores";
    import { browser } from "$app/environment";
    import ChangesetInspect from "$lib/components/changeset/ChangesetInspect.svelte";
    import ReviewMap from "$lib/components/dashboard/ReviewMap.svelte";
    import WorkspaceToolbar from "$lib/components/ui/workspace-toolbar.svelte";
    import { fromListChanges, parseDiffOp } from "$lib/geoDiff";

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
    const developCommits = $derived(
        ((data as any)?.commits as any[]) ?? [],
    );
    const conflictedCommits = $derived(
        ((data as any)?.conflictedCommits as any[]) ?? [],
    );

    let chain = $state<"main" | "develop">("main");
    const onDevelop = $derived(chain === "develop" && developCommits.length > 0);
    const developOldest = $derived([...developCommits].reverse());

    const maxSeq = $derived(diffs.length ? Number(diffs[diffs.length - 1].seq) : 0);
    let seq = $state(0);
    let commitIdx = $state(0);
    $effect(() => {
        if (seq === 0 && maxSeq > 0) seq = maxSeq;
    });
    $effect(() => {
        if (developOldest.length && commitIdx >= developOldest.length) {
            commitIdx = developOldest.length - 1;
        }
    });

    const selected = $derived(
        onDevelop
            ? (developOldest[commitIdx] ?? null)
            : (diffs.find((d) => Number(d.seq) === Number(seq)) ?? null),
    );
    const selectedRev = $derived(
        onDevelop ? String(selected?.id ?? "") : String(seq || ""),
    );

    let geodiff = $state<any[]>([]);
    let summary = $state<any[]>([]);
    let scrubFeatures = $state<any[]>([]);
    let loadErr = $state("");
    let loadGen = 0;
    let onlyChanges = $state(true);

    const mapFeatures = $derived(
        onlyChanges
            ? scrubFeatures.filter((f) => parseDiffOp(f.type) !== "head")
            : scrubFeatures,
    );

    async function loadRev(rev: string) {
        if (!rev) return;
        const gen = ++loadGen;
        loadErr = "";
        const headers: Record<string, string> = {};
        if (accessToken) headers["Authorization"] = `Bearer ${accessToken}`;
        const changesURL = onDevelop
            ? `/api/v1/projects/${slug}/commits/${rev}/changes`
            : `/api/v1/projects/${slug}/diffs/${rev}/changes`;
        try {
            const res = await fetch(changesURL, { headers });
            const body = await res.json().catch(() => ({}));
            if (gen !== loadGen) return;
            if (!res.ok) {
                loadErr = body.error || `Failed to load ${rev}`;
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
        if (names.size === 0 && !onlyChanges) names.add("Sites");

        const parsed = fromListChanges(geodiff);
        const opByKey = new Map<
            string,
            { type: string; geometry: any; oldGeometry?: any }
        >();
        for (let i = 0; i < geodiff.length; i++) {
            const e = geodiff[i] as any;
            const table = String(e?.table ?? "");
            if (!table || table.startsWith("_")) continue;
            const f = parsed[i];
            const op = String(f?.op ?? e?.type ?? "").toLowerCase();
            if (op !== "insert" && op !== "update" && op !== "delete") continue;
            const cols = Array.isArray(e?.changes) ? e.changes : [];
            let eid = "";
            for (const c of cols) {
                const n = String(c?.name ?? "");
                if (n !== "source_id" && n !== "fid" && n !== "id" && n !== "entity_id")
                    continue;
                const v = c.new ?? c.old;
                if (v != null && v !== "") {
                    eid = String(v);
                    break;
                }
            }
            const key = eid ? `${table}:${eid}` : "";
            if (key) {
                opByKey.set(key, {
                    type: op,
                    geometry: f?.geometry ?? e.geometry,
                    oldGeometry: f?.oldGeometry,
                });
            }
        }

        const hideSnapshot = onlyChanges;
        if (!hideSnapshot) {
            for (const name of names) {
                try {
                    const res = await fetch(
                        `/api/v1/projects/${slug}/at/${encodeURIComponent(rev)}/layers/${encodeURIComponent(name)}/geojson`,
                        { headers },
                    );
                    if (!res.ok) continue;
                    const fc = await res.json();
                    for (const f of fc.features ?? []) {
                        const eid = f.properties?.entity_id;
                        const key = eid != null ? `${name}:${eid}` : `${name}:${feats.length}`;
                        const op = opByKey.get(key);
                        feats.push({
                            id: key,
                            table: name,
                            type: op?.type ?? "head",
                            geometry: f.geometry,
                            oldGeometry: op?.oldGeometry,
                        });
                        if (op) opByKey.delete(key);
                    }
                } catch {
                    /* skip table */
                }
            }
        }
        for (const [key, op] of opByKey) {
            if (!op.geometry && !op.oldGeometry) continue;
            const table = key.slice(0, key.indexOf(":"));
            feats.push({
                id: key,
                table,
                type: op.type,
                geometry: op.geometry,
                oldGeometry: op.oldGeometry,
            });
        }
        if (feats.length === 0) {
            for (const f of parsed) {
                if (!f.geometry && !f.oldGeometry) continue;
                feats.push({
                    id: `${f.table}:${f.entityId}`,
                    table: f.table,
                    type: f.op,
                    geometry: f.geometry,
                    oldGeometry: f.oldGeometry,
                });
            }
        }
        if (gen !== loadGen) return;
        scrubFeatures = feats;
    }

    $effect(() => {
        if (!browser) return;
        onlyChanges;
        if (selectedRev) loadRev(selectedRev);
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

<article class="flex h-full min-h-0 flex-col overflow-hidden">
    <WorkspaceToolbar>
        {#snippet meta()}
            {#if selected}
                <span class="min-w-0 truncate">
                    {#if onDevelop}
                        {(selected.id ?? "").slice(0, 8)}
                    {:else}
                        #{selected.seq}
                    {/if}
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
                </span>
            {:else}
                <span>No applied changesets yet</span>
            {/if}
        {/snippet}
        {#snippet actions()}
            <button
                type="button"
                class="px-2 py-1 rounded-md border border-border text-xs shrink-0 {onlyChanges
                    ? 'bg-accent text-foreground'
                    : 'text-muted-foreground hover:text-foreground'}"
                title={onlyChanges
                    ? "Showing changed geometry only"
                    : "Showing the full snapshot with changes highlighted"}
                aria-pressed={onlyChanges}
                onclick={() => (onlyChanges = !onlyChanges)}
            >
                Only changes
            </button>
            {#if developOldest.length > 0}
                <div class="flex rounded-md border border-border text-xs overflow-hidden shrink-0">
                    <button
                        type="button"
                        class="px-2 py-1 {chain === 'main' ? 'bg-accent text-foreground' : 'text-muted-foreground'}"
                        onclick={() => (chain = "main")}>main</button
                    >
                    <button
                        type="button"
                        class="px-2 py-1 {chain === 'develop' ? 'bg-accent text-foreground' : 'text-muted-foreground'}"
                        onclick={() => {
                            chain = "develop";
                            commitIdx = Math.max(0, developOldest.length - 1);
                        }}>develop</button
                    >
                </div>
            {/if}
            {#if onDevelop && developOldest.length > 0}
                <label class="text-xs text-muted-foreground shrink-0" for="history-commit"
                    >{commitIdx + 1}/{developOldest.length}</label
                >
                <input
                    id="history-commit"
                    type="range"
                    min="0"
                    max={developOldest.length - 1}
                    value={commitIdx}
                    oninput={(e) =>
                        (commitIdx = Number(
                            (e.currentTarget as HTMLInputElement).value,
                        ))}
                    class="w-48"
                />
            {:else if maxSeq > 0}
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
            {/if}
        {/snippet}
    </WorkspaceToolbar>

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
                {onDevelop ? "Develop history" : "Published history (main)"}
            </div>
            <div class="flex-1 min-h-0 overflow-y-auto">
                {#if onDevelop
                    ? developOldest.length === 0
                    : diffs.length === 0 && pendingChangesets.length === 0}
                    <p class="p-4 text-sm text-muted-foreground">
                        {onDevelop
                            ? "No develop commits yet."
                            : "No applied diffs."}
                    </p>
                {:else}
                    <ul class="divide-y divide-border">
                        {#if onDevelop}
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
                            {#each developOldest as c, i}
                                <li>
                                    <button
                                        type="button"
                                        class="w-full text-left px-3 py-2.5 {i ===
                                        commitIdx
                                            ? 'bg-accent'
                                            : 'hover:bg-accent/40'}"
                                        onclick={() => (commitIdx = i)}
                                    >
                                        <div
                                            class="flex items-center gap-2 text-xs"
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
                                    </button>
                                </li>
                            {/each}
                        {:else}
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
                        {/if}
                    </ul>
                {/if}
            </div>
        </div>

        <div class="min-h-0 overflow-hidden flex flex-col">
            <div class="relative z-0 isolate flex-1 min-h-0 overflow-hidden">
                <ReviewMap
                    features={mapFeatures}
                    selectedId={null}
                    class="h-full w-full"
                />
                {#if selectedRev && !loadErr && mapFeatures.length === 0}
                    <p
                        class="pointer-events-none absolute left-3 top-3 z-20 rounded-md bg-background/80 px-2 py-1 text-xs text-muted-foreground"
                    >
                        {#if onlyChanges && scrubFeatures.length > 0}
                            No changed geometry
                        {:else if onDevelop}
                            No geometry at {(selectedRev ?? "").slice(0, 8)}
                        {:else}
                            No geometry at seq {seq}
                        {/if}
                    </p>
                {/if}
            </div>
            <div
                class="shrink-0 h-[min(280px,38vh)] overflow-hidden flex flex-col border-t border-border"
            >
                <div
                    class="shrink-0 px-4 py-2 border-b border-border flex items-center justify-between"
                >
                    <span class="text-xs text-muted-foreground">
                        {#if onDevelop}
                            ListChanges at {(selectedRev ?? "").slice(0, 8)}
                        {:else}
                            ListChanges at seq {seq}
                        {/if}
                    </span>
                    {#if selectedRev}
                        <button
                            class="text-xs text-primary hover:underline"
                            onclick={() =>
                                goto(`/${slug}/history/${selectedRev}`)}
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
