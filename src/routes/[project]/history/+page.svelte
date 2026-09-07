<script lang="ts">
    import { goto, invalidateAll } from "$app/navigation";
    import { page } from "$app/stores";
    import { browser } from "$app/environment";
    import ChangesetInspect from "$lib/components/changeset/ChangesetInspect.svelte";
    import ReviewMap from "$lib/components/dashboard/ReviewMap.svelte";
    import WorkspaceToolbar from "$lib/components/ui/workspace-toolbar.svelte";
    import StepScrubber, {
        type StepItem,
    } from "$lib/components/ui/step-scrubber.svelte";
    import { fromListChanges, isChangeOp, parseDiffOp } from "$lib/geoDiff";

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
    const mainCommits = $derived(((data as any)?.mainCommits as any[]) ?? []);
    const mainOldest = $derived([...mainCommits].reverse());
    const role = $derived(String((data as any)?.role ?? ""));
    const canWrite = $derived(
        role === "owner" || role === "admin" || role === "collaborator",
    );

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
    let diffOnly = $state(true);
    let inspectId = $state<string | null>(null);

    const mapFeatures = $derived(
        diffOnly
            ? scrubFeatures.filter((f) =>
                  isChangeOp(parseDiffOp(f.op ?? f.type)),
              )
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
        if (names.size === 0 && !diffOnly) names.add("Sites");

        const parsed = fromListChanges(geodiff);
        const changeByKey = new Map<string, (typeof parsed)[number]>();
        for (const f of parsed) {
            if (!isChangeOp(f.op) || f.table.startsWith("_")) continue;
            if (f.entityId) changeByKey.set(`${f.table}:${f.entityId}`, f);
        }

        const toMapFeat = (f: (typeof parsed)[number], geom = f.geometry) => ({
            id: f.id,
            table: f.table,
            type: f.op,
            op: f.op,
            geometry: geom,
            oldGeometry: f.oldGeometry,
        });

        const hideSnapshot = diffOnly;
        if (!hideSnapshot) {
            for (const name of names) {
                try {
                    const res = await fetch(
                        `/api/v1/projects/${slug}/at/${encodeURIComponent(rev)}/layers/${encodeURIComponent(name)}/geojson`,
                        { headers },
                    );
                    if (!res.ok) continue;
                    const fc = await res.json();
                    for (const feat of fc.features ?? []) {
                        const eid =
                            feat.properties?.entity_id ??
                            feat.properties?.source_id ??
                            "";
                        const key =
                            eid !== ""
                                ? `${name}:${eid}`
                                : `${name}:${feats.length}`;
                        const ch = changeByKey.get(key);
                        feats.push({
                            id: ch?.id ?? key,
                            table: name,
                            type: ch?.op ?? "head",
                            op: ch?.op ?? "head",
                            geometry: feat.geometry,
                            oldGeometry: ch?.oldGeometry,
                        });
                        if (ch) changeByKey.delete(key);
                    }
                } catch {
                    /* skip table */
                }
            }
        }
        if (hideSnapshot) {
            for (const f of parsed) {
                if (!isChangeOp(f.op) || f.table.startsWith("_")) continue;
                if (!f.geometry && !f.oldGeometry) continue;
                feats.push(toMapFeat(f));
            }
        } else {
            for (const f of changeByKey.values()) {
                if (!f.geometry && !f.oldGeometry) continue;
                feats.push(toMapFeat(f));
            }
        }
        if (gen !== loadGen) return;
        scrubFeatures = feats;
    }

    $effect(() => {
        if (!browser) return;
        diffOnly;
        const rev = selectedRev;
        if (!rev) return;
        const t = setTimeout(() => {
            void loadRev(rev);
        }, 160);
        return () => clearTimeout(t);
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

    const historySteps = $derived<StepItem[]>(
        onDevelop
            ? developOldest.map((c) => ({
                  key: String(c.id ?? ""),
                  label: (c.message as string | undefined)?.trim() || "Untitled",
                  hint: formatDate(String(c.created_at ?? "")),
              }))
            : diffs.map((d) => ({
                  key: String(d.seq),
                  label: (d.message as string | undefined)?.trim() || `seq ${d.seq}`,
                  hint: formatDate(String(d.created_at ?? "")),
              })),
    );
    const historyIndex = $derived(
        onDevelop
            ? commitIdx
            : Math.max(
                  0,
                  diffs.findIndex((d) => Number(d.seq) === Number(seq)),
              ),
    );

    function setHistoryIndex(i: number) {
        if (onDevelop) {
            commitIdx = i;
            return;
        }
        const d = diffs[i];
        if (d) seq = Number(d.seq);
    }

    const invertCommitId = $derived(
        onDevelop
            ? String(selected?.id ?? "")
            : mainOldest.length === diffs.length
              ? String(mainOldest[historyIndex]?.id ?? "")
              : "",
    );
    const invertLabel = $derived(
        (selected?.message as string | undefined)?.trim() || "this commit",
    );
    let invertNote = $state("");
    let invertBusy = $state(false);
    let invertErr = $state("");

    $effect(() => {
        const id = invertCommitId;
        const msg = invertLabel;
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
        canWrite && invertCommitId.length > 0 && invertNote.trim().length > 0 && !invertBusy,
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
            chain = "develop";
            await invalidateAll();
            commitIdx = Math.max(0, developOldest.length - 1);
        } catch (e: any) {
            invertErr = e?.message || "Invert failed";
        } finally {
            invertBusy = false;
        }
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
                class="px-2 py-1 rounded-md border border-border text-xs shrink-0 {diffOnly
                    ? 'bg-accent text-foreground'
                    : 'text-muted-foreground hover:text-foreground'}"
                title={diffOnly
                    ? "Showing insert / update / delete geometry"
                    : "Showing the full snapshot with changes highlighted"}
                aria-pressed={diffOnly}
                onclick={() => (diffOnly = !diffOnly)}
            >
                Diff only
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

    {#if historySteps.length > 0}
        <div
            class="flex shrink-0 items-center gap-3 border-b border-border bg-background px-3 py-1.5"
        >
            <span class="hidden shrink-0 text-[10px] font-medium uppercase tracking-wide text-muted-foreground sm:inline"
                >{onDevelop ? "Commits" : "Seq"}
                {historyIndex + 1}/{historySteps.length}</span
            >
            <StepScrubber
                class="min-w-0 flex-1"
                steps={historySteps}
                index={historyIndex}
                onIndex={setHistoryIndex}
                ariaLabel={onDevelop ? "Develop commits" : "Published history"}
            />
        </div>
    {/if}

    {#if invertErr}
        <p class="px-4 py-2 text-sm text-destructive border-b border-border">
            {invertErr}
        </p>
    {/if}
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
                    selectedId={inspectId}
                    class="h-full w-full"
                />
                {#if selectedRev && !loadErr && mapFeatures.length === 0}
                    <p
                        class="pointer-events-none absolute left-3 top-3 z-20 rounded-md bg-background/80 px-2 py-1 text-xs text-muted-foreground"
                    >
                        {#if diffOnly && geodiff.length > 0}
                            No geometry on these changes
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
                <ChangesetInspect
                    {geodiff}
                    showMap={false}
                    onSelect={(id) => (inspectId = id)}
                />
            </div>
        </div>
    </div>
</article>
