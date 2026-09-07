<script lang="ts">
    import { invalidateAll } from "$app/navigation";
    import { page } from "$app/stores";
    import ChangesetInspect from "$lib/components/changeset/ChangesetInspect.svelte";
    import ChangesetListRow from "$lib/components/changeset/ChangesetListRow.svelte";
    import ChangesetWorkspace from "$lib/components/changeset/ChangesetWorkspace.svelte";
    import GeodiffSummaryChips from "$lib/components/changeset/GeodiffSummaryChips.svelte";
    import ReviewMap from "$lib/components/dashboard/ReviewMap.svelte";
    import {
        formatCommitDate,
        jsonAuthHeaders,
    } from "$lib/changeset/client";
    import { asGeometry, geometriesEqual } from "$lib/geoDiff";

    let { data } = $props();

    const accessToken = $derived(
        ((data as any)?.accessToken as string) ||
            (($page.data as any)?.accessToken as string) ||
            "",
    );
    const slug = $derived($page.params.project ?? "");
    const preview = $derived(((data as any)?.preview as any) ?? {});
    const inSync = $derived(Boolean(preview.in_sync));
    const ahead = $derived(((preview.commits as any[]) ?? []) as any[]);
    const geodiff = $derived(
        ((preview.changes?.geodiff as any[]) ?? []) as any[],
    );
    const summary = $derived(
        ((preview.summary?.geodiff_summary as any[]) ?? []) as any[],
    );
    const leftover = $derived(((data as any)?.changesets as any[]) ?? []);
    const conflictedCommits = $derived(
        ((data as any)?.conflictedCommits as any[]) ?? [],
    );
    const heads = $derived(
        ((data as any)?.heads as { name: string; commit_id: string; author?: string }[]) ??
            [],
    );

    let note = $state("");
    let busy = $state(false);
    let errorMsg = $state("");
    let integrateBusy = $state("");
    let resolveNote = $state("");
    let conflictFrom = $state("");
    let conflictEntries = $state<any[]>([]);
    let conflictTake = $state<Record<string, "ours" | "theirs">>({});
    let selectedConflict = $state(0);
    let mapSide = $state<"theirs" | "ours">("theirs");
    let selectedAheadId = $state("");
    let commitChanges = $state<Record<string, any[]>>({});
    let commitBusy = $state("");

    function conflictKey(e: any): string {
        return `${e?.table ?? ""}/${e?.source_id ?? ""}`;
    }

    function formatSideVal(v: unknown, max = 80): string {
        if (v == null || v === "") return "—";
        if (typeof v === "string") {
            return v.length > max ? v.slice(0, max - 1) + "…" : v;
        }
        if (typeof v === "number" || typeof v === "boolean") return String(v);
        try {
            const s = JSON.stringify(v);
            return s.length > max ? s.slice(0, max - 1) + "…" : s;
        } catch {
            return String(v);
        }
    }

    function attrNames(entry: any): string[] {
        const keys = new Set<string>([
            ...Object.keys(entry?.theirs?.attributes ?? {}),
            ...Object.keys(entry?.ours?.attributes ?? {}),
            ...Object.keys(entry?.base?.attributes ?? {}),
        ]);
        return [...keys].sort();
    }

    const allTakesChosen = $derived(
        conflictEntries.length > 0 &&
            conflictEntries.every((e) => {
                const t = conflictTake[conflictKey(e)];
                return t === "ours" || t === "theirs";
            }),
    );
    const keepingParked = $derived(
        conflictEntries.some((e) => conflictTake[conflictKey(e)] === "ours"),
    );
    const canResolve = $derived(
        allTakesChosen &&
            (!keepingParked || resolveNote.trim().length > 0) &&
            !busy &&
            integrateBusy === "",
    );

    function conflictGeomFeatures(e: any): {
        id: string;
        table?: string;
        type?: string;
        geometry: unknown;
    }[] {
        if (!e) return [];
        const feats: {
            id: string;
            table?: string;
            type?: string;
            geometry: unknown;
        }[] = [];
        if (e.theirs?.geometry) {
            feats.push({
                id: "theirs",
                table: e.table,
                type: "update",
                geometry: e.theirs.geometry,
            });
        }
        if (e.ours?.geometry) {
            feats.push({
                id: "ours",
                table: e.table,
                type: "insert",
                geometry: e.ours.geometry,
            });
        }
        return feats;
    }

    const conflictMapEnvelope = $derived(
        conflictGeomFeatures(conflictEntries[selectedConflict]),
    );
    const conflictMapFeatures = $derived(
        conflictMapEnvelope.filter((f) => f.id === mapSide),
    );

    function conflictHasAnyGeom(e: any): boolean {
        return Boolean(
            asGeometry(e?.theirs?.geometry) || asGeometry(e?.ours?.geometry),
        );
    }

    function conflictHasGeomEdit(e: any): boolean {
        const a = asGeometry(e?.theirs?.geometry);
        const b = asGeometry(e?.ours?.geometry);
        if (!a && !b) return false;
        return !geometriesEqual(a, b);
    }

    const selectedConflictEntry = $derived(
        conflictEntries[selectedConflict] ?? null,
    );
    const showConflictMap = $derived(conflictHasAnyGeom(selectedConflictEntry));
    const showMapToggle = $derived(conflictHasGeomEdit(selectedConflictEntry));

    const inspectGeodiff = $derived.by(() => {
        if (selectedAheadId && commitChanges[selectedAheadId]) {
            return commitChanges[selectedAheadId];
        }
        return geodiff;
    });

    function geodiffFromChangesPayload(body: any): any[] {
        const raw = body?.changes;
        if (Array.isArray(raw?.geodiff)) return raw.geodiff;
        if (Array.isArray(raw)) return raw;
        return [];
    }

    async function selectAhead(id: string) {
        if (!id || busy || integrateBusy) return;
        clearConflicts();
        if (selectedAheadId === id) {
            selectedAheadId = "";
            return;
        }
        selectedAheadId = id;
        if (commitChanges[id]) return;
        commitBusy = id;
        errorMsg = "";
        try {
            const res = await fetch(
                `/api/v1/projects/${slug}/commits/${id}/changes`,
                { headers: jsonAuthHeaders(accessToken) },
            );
            const body = await res.json().catch(() => ({}));
            if (!res.ok) {
                errorMsg = body.error || `Failed to load commit (${res.status})`;
                selectedAheadId = "";
                return;
            }
            commitChanges = {
                ...commitChanges,
                [id]: geodiffFromChangesPayload(body),
            };
        } catch (e: any) {
            errorMsg = e?.message || "Failed to load commit";
            selectedAheadId = "";
        } finally {
            commitBusy = "";
        }
    }

    function clearConflicts() {
        conflictFrom = "";
        conflictEntries = [];
        conflictTake = {};
        selectedConflict = 0;
        mapSide = "theirs";
        resolveNote = "";
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
                headers: jsonAuthHeaders(accessToken),
                body: JSON.stringify({ note: note.trim() }),
            });
            const body = await res.json().catch(() => ({}));
            if (!res.ok) {
                errorMsg = body.error || `Failed (${res.status})`;
                return;
            }
            note = "";
            selectedAheadId = "";
            await invalidateAll();
        } catch (e: any) {
            errorMsg = e?.message || "Publish failed";
        } finally {
            busy = false;
        }
    }

    async function integrate(from: string) {
        if (!from || integrateBusy || busy) return;
        integrateBusy = from;
        errorMsg = "";
        clearConflicts();
        try {
            const res = await fetch(`/api/v1/projects/${slug}/integrate`, {
                method: "POST",
                headers: jsonAuthHeaders(accessToken),
                body: JSON.stringify({
                    from,
                    message: `Integrate ${from}`,
                }),
            });
            const body = await res.json().catch(() => ({}));
            if (res.status === 409 && body?.status === "conflicted") {
                const entries = (body?.conflicts?.geodiff as any[]) ?? [];
                if (entries.length) {
                    conflictFrom = from;
                    conflictEntries = entries;
                    selectedConflict = 0;
                    return;
                }
                errorMsg = body.error || `Integrate failed (${res.status})`;
                return;
            }
            if (!res.ok) {
                errorMsg = body.error || `Integrate failed (${res.status})`;
                return;
            }
            await invalidateAll();
        } catch (e: any) {
            errorMsg = e?.message || "Integrate failed";
        } finally {
            integrateBusy = "";
        }
    }

    async function resolveConflicts() {
        if (!canResolve || !conflictFrom) return;
        busy = true;
        errorMsg = "";
        try {
            const resolve = conflictEntries.map((e) => ({
                table: e.table,
                source_id: e.source_id,
                take: conflictTake[conflictKey(e)],
            }));
            const res = await fetch(`/api/v1/projects/${slug}/integrate`, {
                method: "POST",
                headers: jsonAuthHeaders(accessToken),
                body: JSON.stringify({
                    from: conflictFrom,
                    message: resolveNote.trim() || `Integrate ${conflictFrom}`,
                    resolve,
                }),
            });
            const body = await res.json().catch(() => ({}));
            if (!res.ok) {
                errorMsg = body.error || `Resolve failed (${res.status})`;
                return;
            }
            clearConflicts();
            selectedAheadId = "";
            await invalidateAll();
        } catch (e: any) {
            errorMsg = e?.message || "Resolve failed";
        } finally {
            busy = false;
        }
    }
</script>

<ChangesetWorkspace title="Review — {slug} — echidna">
    {#snippet meta()}
        <span class="min-w-0 truncate text-foreground">
            {#if inSync}
                main and develop are in sync
            {:else}
                Review develop → main
                {#if ahead.length}
                    <span class="text-muted-foreground"
                        >· {ahead.length} commit{ahead.length === 1
                            ? ""
                            : "s"} ahead</span
                    >
                {/if}
            {/if}
        </span>
        <GeodiffSummaryChips {summary} />
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
    {#snippet banner()}
        {#if errorMsg}
            <p class="px-4 py-2 text-sm text-destructive border-b border-border">
                {errorMsg}
            </p>
        {/if}
    {/snippet}
    {#snippet sidebar()}
        <button
            type="button"
            class="px-3 py-2 text-xs text-left w-full border-b border-border hover:bg-accent/40 {selectedAheadId
                ? 'text-muted-foreground'
                : 'text-foreground'}"
            onclick={() => (selectedAheadId = "")}
        >
            Develop vs main
            {#if selectedAheadId}
                <span class="text-muted-foreground"> · all unpublished</span>
            {/if}
        </button>
        <div class="flex-1 min-h-0 overflow-y-auto">
            {#if inSync && leftover.length === 0 && conflictedCommits.length === 0 && heads.length === 0}
                <p class="p-4 text-sm text-muted-foreground">
                    Nothing unpublished. Viewers already see this tip.
                </p>
            {:else}
                <ul class="divide-y divide-border">
                    {#each ahead as c}
                        <li>
                            <ChangesetListRow
                                selected={selectedAheadId === c.id}
                                disabled={busy ||
                                    integrateBusy !== "" ||
                                    commitBusy !== ""}
                                onclick={() => void selectAhead(c.id)}
                                badge="ahead"
                                mono={(c.id ?? "").slice(0, 8)}
                                title={c.message?.trim() || "Untitled"}
                                subtitle={commitBusy === c.id
                                    ? "Loading changes…"
                                    : formatCommitDate(c.created_at)}
                            />
                        </li>
                    {/each}
                    {#each leftover as cs}
                        <li>
                            <ChangesetListRow
                                href="/{slug}/review/{cs.id}"
                                badge="leftover"
                                title={cs.message?.trim() || "Untitled"}
                                subtitle="{formatCommitDate(cs.created_at)} · pre-DAG pending"
                            />
                        </li>
                    {/each}
                    {#each conflictedCommits as c}
                        <li>
                            <ChangesetListRow
                                href="/{slug}/history/{c.id}"
                                badge="conflicted"
                                mono={(c.id ?? "").slice(0, 8)}
                                title={c.message?.trim() || "Untitled"}
                                subtitle="{formatCommitDate(c.created_at)} · unmerged"
                            />
                        </li>
                    {/each}
                    {#each heads as h}
                        <li>
                            <ChangesetListRow
                                selected={conflictFrom === h.name}
                                badge="parked"
                                mono={(h.commit_id ?? "").slice(0, 8)}
                                title={h.name}
                            >
                                <div
                                    class="mt-1.5 flex items-center justify-between gap-2"
                                >
                                    <p class="text-[11px] text-muted-foreground">
                                        {h.author || "personal"} · not on
                                        develop
                                    </p>
                                    <button
                                        class="inline-flex h-6 items-center rounded-md border border-border px-2 text-[11px] text-foreground hover:bg-accent/40 disabled:opacity-50"
                                        disabled={busy || integrateBusy !== ""}
                                        onclick={() => void integrate(h.name)}
                                    >
                                        {integrateBusy === h.name
                                            ? "Integrating…"
                                            : "Integrate"}
                                    </button>
                                </div>
                            </ChangesetListRow>
                        </li>
                    {/each}
                </ul>
            {/if}
        </div>
    {/snippet}
            {#if conflictEntries.length}
                <div
                    class="px-3 py-2 text-xs border-b border-border flex items-center justify-between gap-2"
                >
                    <span class="text-foreground truncate">
                        Overlap with {conflictFrom}
                    </span>
                    <button
                        class="text-[11px] text-muted-foreground hover:text-foreground"
                        onclick={() => clearConflicts()}
                    >
                        Cancel
                    </button>
                </div>
                <div class="flex-1 min-h-0 overflow-hidden grid grid-rows-[minmax(0,1fr)_auto]">
                    <div class="min-h-0 overflow-hidden grid grid-cols-1 lg:grid-cols-[minmax(220px,280px)_minmax(0,1fr)]">
                        <ul class="min-h-0 overflow-y-auto border-b lg:border-b-0 lg:border-r border-border divide-y divide-border">
                            {#each conflictEntries as e, i}
                                {@const key = conflictKey(e)}
                                <li>
                                    <div
                                        class="px-3 py-2.5 hover:bg-accent/40 {selectedConflict === i
                                            ? 'bg-accent/50'
                                            : ''}"
                                    >
                                        <button
                                            type="button"
                                            class="w-full text-left"
                                            onclick={() => (selectedConflict = i)}
                                        >
                                            <div class="flex items-center gap-2 text-xs">
                                                <span
                                                    class="shrink-0 text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded bg-red-500/15 text-red-400"
                                                    >conflict</span
                                                >
                                                <span class="font-mono text-muted-foreground truncate"
                                                    >{e.source_id}</span
                                                >
                                            </div>
                                            <p class="mt-0.5 text-[11px] text-muted-foreground">
                                                {e.table}
                                            </p>
                                        </button>
                                        <div class="mt-1.5 flex gap-1">
                                            <button
                                                type="button"
                                                class="h-6 px-2 text-[11px] rounded-md border {conflictTake[key] ===
                                                'theirs'
                                                    ? 'border-amber-400 bg-amber-500/15 text-amber-300'
                                                    : 'border-border text-muted-foreground'}"
                                                onclick={() => {
                                                    conflictTake = {
                                                        ...conflictTake,
                                                        [key]: "theirs",
                                                    };
                                                    selectedConflict = i;
                                                    mapSide = "theirs";
                                                }}
                                            >
                                                Keep develop
                                            </button>
                                            <button
                                                type="button"
                                                class="h-6 px-2 text-[11px] rounded-md border {conflictTake[key] ===
                                                'ours'
                                                    ? 'border-emerald-400 bg-emerald-500/15 text-emerald-300'
                                                    : 'border-border text-muted-foreground'}"
                                                onclick={() => {
                                                    conflictTake = {
                                                        ...conflictTake,
                                                        [key]: "ours",
                                                    };
                                                    selectedConflict = i;
                                                    mapSide = "ours";
                                                }}
                                            >
                                                Keep parked
                                            </button>
                                        </div>
                                    </div>
                                </li>
                            {/each}
                        </ul>
                        <div class="min-h-0 overflow-y-auto p-3 space-y-3">
                            {#if conflictEntries[selectedConflict]}
                                {@const e = conflictEntries[selectedConflict]}
                                {#if showConflictMap}
                                <div class="relative h-56 rounded-md border border-border overflow-hidden">
                                    <ReviewMap
                                        features={conflictMapFeatures}
                                        envelopeFeatures={conflictMapEnvelope}
                                        selectedId={mapSide}
                                    />
                                    {#if showMapToggle}
                                    <div
                                        class="absolute top-2 left-2 z-[1100] flex rounded-md border border-border bg-background/90 shadow-sm overflow-hidden"
                                    >
                                        <button
                                            type="button"
                                            class="h-7 px-2.5 text-[11px] {mapSide === 'theirs'
                                                ? 'bg-amber-500/20 text-amber-300'
                                                : 'text-muted-foreground hover:bg-accent/40'}"
                                            disabled={!conflictMapEnvelope.some((f) => f.id === "theirs")}
                                            onclick={() => (mapSide = "theirs")}
                                        >
                                            Develop
                                        </button>
                                        <button
                                            type="button"
                                            class="h-7 px-2.5 text-[11px] border-l border-border {mapSide === 'ours'
                                                ? 'bg-emerald-500/20 text-emerald-300'
                                                : 'text-muted-foreground hover:bg-accent/40'}"
                                            disabled={!conflictMapEnvelope.some((f) => f.id === "ours")}
                                            onclick={() => (mapSide = "ours")}
                                        >
                                            Parked
                                        </button>
                                    </div>
                                    {/if}
                                </div>
                                {/if}
                                <table class="w-full text-xs">
                                    <thead>
                                        <tr class="text-muted-foreground">
                                            <th class="text-left font-normal py-1">Field</th>
                                            <th class="text-left font-normal py-1">Develop</th>
                                            <th class="text-left font-normal py-1">Parked</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {#each attrNames(e) as name}
                                            <tr class="border-t border-border">
                                                <td class="py-1 pr-2 text-muted-foreground"
                                                    >{name}</td
                                                >
                                                <td class="py-1 pr-2">{formatSideVal(e.theirs?.attributes?.[name])}</td>
                                                <td class="py-1">{formatSideVal(e.ours?.attributes?.[name])}</td>
                                            </tr>
                                        {/each}
                                    </tbody>
                                </table>
                            {/if}
                        </div>
                    </div>
                    <div
                        class="border-t border-border px-3 py-2 flex flex-wrap items-center gap-2"
                    >
                        <input
                            class="h-8 min-w-[12rem] flex-1 rounded-md border border-border bg-background px-3 text-xs"
                            placeholder={keepingParked
                                ? "Required resolve message"
                                : "Optional note"}
                            bind:value={resolveNote}
                            disabled={busy}
                            onkeydown={(e) => {
                                if (e.key === "Enter") void resolveConflicts();
                            }}
                        />
                        <button
                            class="inline-flex h-8 items-center rounded-md bg-primary px-3 text-xs text-primary-foreground disabled:opacity-50"
                            disabled={!canResolve}
                            onclick={() => void resolveConflicts()}
                        >
                            {busy ? "Resolving…" : "Resolve onto develop"}
                        </button>
                    </div>
                </div>
            {:else}
                <ChangesetInspect geodiff={inspectGeodiff} />
            {/if}
</ChangesetWorkspace>
