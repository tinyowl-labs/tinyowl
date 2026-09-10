<script lang="ts">
    import { goto, invalidateAll } from "$app/navigation";
    import { page } from "$app/stores";
    import { browser } from "$app/environment";
    import ChangesetInspect from "$lib/components/changeset/ChangesetInspect.svelte";
    import ChangesetListRow from "$lib/components/changeset/ChangesetListRow.svelte";
    import ChangesetWorkspace from "$lib/components/changeset/ChangesetWorkspace.svelte";
    import GeodiffSummaryChips from "$lib/components/changeset/GeodiffSummaryChips.svelte";
    import InvertCommitBar from "$lib/components/changeset/InvertCommitBar.svelte";
    import ReviewMap from "$lib/components/dashboard/ReviewMap.svelte";
    import StepScrubber, {
        type StepItem,
    } from "$lib/components/ui/step-scrubber.svelte";
    import {
        canWriteRole,
        formatCommitDate,
    } from "$lib/changeset/client";
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
    const canWrite = $derived(canWriteRole(role));

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
            ? `/api/v1/projects/${encodeURIComponent(slug)}/commits/${rev}/changes`
            : `/api/v1/projects/${encodeURIComponent(slug)}/diffs/${rev}/changes`;
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
                        `/api/v1/projects/${encodeURIComponent(slug)}/at/${encodeURIComponent(rev)}/layers/${encodeURIComponent(name)}/geojson`,
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

    const historySteps = $derived<StepItem[]>(
        onDevelop
            ? developOldest.map((c) => ({
                  key: String(c.id ?? ""),
                  label: (c.message as string | undefined)?.trim() || "Untitled",
                  hint: formatCommitDate(String(c.created_at ?? "")),
              }))
            : diffs.map((d) => ({
                  key: String(d.seq),
                  label: (d.message as string | undefined)?.trim() || `seq ${d.seq}`,
                  hint: formatCommitDate(String(d.created_at ?? "")),
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
    let invertErr = $state("");

    async function afterInvert() {
        chain = "develop";
        await invalidateAll();
        commitIdx = Math.max(0, developOldest.length - 1);
    }
</script>

<ChangesetWorkspace title="History — {slug} — echidna">
    {#snippet meta()}
        {#if selected}
            <span class="min-w-0 truncate">
                {#if onDevelop}
                    {(selected.id ?? "").slice(0, 8)}
                {:else}
                    #{selected.seq}
                {/if}
                {selected.message?.trim() || "(no message)"}
                <GeodiffSummaryChips {summary} lead="·" />
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
            <InvertCommitBar
                {slug}
                {accessToken}
                commitId={invertCommitId}
                label={invertLabel}
                bind:error={invertErr}
                onDone={afterInvert}
            />
        {/if}
    {/snippet}
    {#snippet banner()}
        {#if historySteps.length > 0}
            <div
                class="flex shrink-0 items-center gap-3 border-b border-border bg-background px-3 py-1.5"
            >
                <span
                    class="hidden shrink-0 text-[10px] font-medium uppercase tracking-wide text-muted-foreground sm:inline"
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
    {/snippet}
    {#snippet sidebar()}
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
                                <ChangesetListRow
                                    href="/{encodeURIComponent(slug)}/history/{c.id}"
                                    badge="conflicted"
                                    mono={(c.id ?? "").slice(0, 8)}
                                    title={c.message?.trim() || "Untitled"}
                                    subtitle="{formatCommitDate(c.created_at)} · unmerged"
                                />
                            </li>
                        {/each}
                        {#each developOldest as c, i}
                            <li>
                                <ChangesetListRow
                                    selected={i === commitIdx}
                                    onclick={() => (commitIdx = i)}
                                    mono={(c.id ?? "").slice(0, 8)}
                                    title={c.message?.trim() || "Untitled"}
                                    subtitle={formatCommitDate(c.created_at)}
                                />
                            </li>
                        {/each}
                    {:else}
                        {#each pendingChangesets as cs}
                            <li>
                                <ChangesetListRow
                                    href="/{encodeURIComponent(slug)}/review/{cs.id}"
                                    badge="pending"
                                    title={cs.message?.trim() || "Untitled"}
                                    subtitle={formatCommitDate(cs.created_at)}
                                />
                            </li>
                        {/each}
                        {#each [...diffs].reverse() as d}
                            <li>
                                <ChangesetListRow
                                    selected={Number(seq) === Number(d.seq)}
                                    onclick={() => (seq = Number(d.seq))}
                                    mono="#{d.seq}"
                                    title={d.message?.trim() || "Untitled"}
                                    subtitle={formatCommitDate(d.created_at)}
                                />
                            </li>
                        {/each}
                    {/if}
                </ul>
            {/if}
        </div>
    {/snippet}

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
                    onclick={() => goto(`/${encodeURIComponent(slug)}/history/${selectedRev}`)}
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
</ChangesetWorkspace>
