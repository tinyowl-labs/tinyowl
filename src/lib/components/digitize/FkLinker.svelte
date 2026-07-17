<script lang="ts">
    import {
        suggestForeignKeys,
        type FkSuggestion,
    } from "$lib/project/licences";

    type SchemaTable = {
        name: string;
        label?: string;
        columns: { name: string; type: string; pk?: boolean }[];
        count: number;
    };
    type SchemaEdge = {
        source: string;
        target: string;
        source_column: string;
        target_column?: string;
        label?: string;
        kind?: string;
    };

    type MatchSample = {
        from: string;
        to?: string;
        status: string;
        via?: string;
        count: number;
        candidates?: string[];
    };

    type MatchReport = {
        matched: number;
        unmatched: number;
        ambiguous: number;
        already_ok: number;
        would_rewrite: number;
        samples: MatchSample[];
    };

    type Props = {
        accessToken: string;
        slug: string;
        tables: SchemaTable[];
        edges?: SchemaEdge[];
        onSaved?: () => void;
    };

    let { accessToken, slug, tables, edges = [], onSaved }: Props = $props();

    let sourceTable = $state("");
    let sourceColumn = $state("");
    let targetTable = $state("");
    let targetColumn = $state("source_id");
    let matchOn = $state("source_id");
    let displayColumn = $state("");
    let allowMulti = $state(false);
    let saveLinkAfterNormalize = $state(true);
    let busy = $state(false);
    let error = $state("");
    let ok = $state("");
    let report = $state<MatchReport | null>(null);
    /** Manual overrides: FK value → target source_id */
    let overrides = $state<Record<string, string>>({});

    $effect(() => {
        if (!sourceTable && tables.length) sourceTable = tables[0].name;
        if (!targetTable && tables.length > 1) targetTable = tables[1].name;
        else if (!targetTable && tables.length) targetTable = tables[0].name;
    });

    const sourceCols = $derived(
        tables.find((t) => t.name === sourceTable)?.columns ?? [],
    );
    const targetCols = $derived(
        tables.find((t) => t.name === targetTable)?.columns ?? [],
    );

    const suggestions = $derived(
        suggestForeignKeys(
            tables.map((t) => ({ name: t.name, columns: t.columns })),
            edges
                .filter((e) => e.kind !== "inferred")
                .map((e) => ({
                    source: e.source,
                    source_column: e.source_column,
                })),
        ),
    );

    $effect(() => {
        if (
            sourceCols.length &&
            !sourceCols.some((c) => c.name === sourceColumn)
        ) {
            const pick =
                sourceCols.find((c) => !c.pk && c.name !== "entity_type") ??
                sourceCols[0];
            sourceColumn = pick?.name ?? "";
        }
    });

    $effect(() => {
        if (
            targetCols.length &&
            !targetCols.some((c) => c.name === targetColumn)
        ) {
            targetColumn =
                targetCols.find((c) => c.name === "source_id")?.name ??
                targetCols.find((c) => c.pk)?.name ??
                targetCols[0]?.name ??
                "source_id";
        }
        if (targetCols.length && !targetCols.some((c) => c.name === matchOn)) {
            matchOn =
                targetCols.find((c) => c.name === "fid")?.name ??
                targetCols.find((c) => c.name === "id")?.name ??
                targetCols.find((c) => c.name === "source_id")?.name ??
                targetCols.find((c) =>
                    /label|name|code|title|uuid/i.test(c.name),
                )?.name ??
                targetCols[0]?.name ??
                "source_id";
        }
    });

    const confirmed = $derived(
        edges.filter((e) => e.kind !== "inferred" && e.kind !== "relation"),
    );

    async function putReference(opts: {
        entity_type: string;
        column_name: string;
        references: string;
        references_value?: string;
        allow_multi?: boolean;
    }) {
        const res = await fetch(
            `/api/v1/projects/${encodeURIComponent(slug)}/schema/references`,
            {
                method: "PUT",
                headers: {
                    Authorization: `Bearer ${accessToken}`,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify(opts),
            },
        );
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
            throw new Error(data.error || `Save failed (${res.status})`);
        }
        return data;
    }

    function matchBody(extra: Record<string, unknown> = {}) {
        return {
            entity_type: sourceTable,
            column_name: sourceColumn,
            target_table: targetTable,
            match_on: matchOn || "source_id",
            target_key: targetColumn || "source_id",
            overrides,
            references_value: displayColumn || undefined,
            allow_multi: allowMulti,
            ...extra,
        };
    }

    function applySuggestion(s: FkSuggestion) {
        sourceTable = s.sourceTable;
        sourceColumn = s.sourceColumn;
        targetTable = s.targetTable;
        targetColumn = s.targetColumn;
        matchOn = s.targetColumn;
        report = null;
        overrides = {};
        error = "";
        ok = `Filled — pick how values match, then Validate`;
    }

    async function confirmSuggestion(s: FkSuggestion) {
        applySuggestion(s);
        await validate();
    }

    async function save() {
        error = "";
        ok = "";
        if (!sourceTable || !sourceColumn || !targetTable) {
            error = "Pick source column and target table";
            return;
        }
        busy = true;
        try {
            const references = `${targetTable}.${targetColumn || "source_id"}`;
            await putReference({
                entity_type: sourceTable,
                column_name: sourceColumn,
                references,
                references_value: displayColumn || undefined,
                allow_multi: allowMulti,
            });
            ok = `Linked ${sourceTable}.${sourceColumn} → ${references}`;
            onSaved?.();
        } catch (err) {
            error = err instanceof Error ? err.message : "Save failed";
        } finally {
            busy = false;
        }
    }

    async function clearLink(entityType?: string, columnName?: string) {
        error = "";
        ok = "";
        const et = entityType || sourceTable;
        const col = columnName || sourceColumn;
        if (!et || !col) {
            error = "Pick a column to clear";
            return;
        }
        busy = true;
        try {
            await putReference({
                entity_type: et,
                column_name: col,
                references: "",
            });
            ok = `Cleared FK on ${et}.${col}`;
            if (et === sourceTable && col === sourceColumn) {
                report = null;
            }
            onSaved?.();
        } catch (err) {
            error = err instanceof Error ? err.message : "Clear failed";
        } finally {
            busy = false;
        }
    }

    async function validate() {
        error = "";
        ok = "";
        if (!sourceTable || !sourceColumn || !targetTable) {
            error = "Pick source column and target table";
            return;
        }
        busy = true;
        try {
            const res = await fetch(
                `/api/v1/projects/${encodeURIComponent(slug)}/schema/fk/validate`,
                {
                    method: "POST",
                    headers: {
                        Authorization: `Bearer ${accessToken}`,
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify(matchBody()),
                },
            );
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                throw new Error(data.error || `Validate failed (${res.status})`);
            }
            report = data as MatchReport;
            ok = `Validated: ${data.matched ?? 0} matched, ${data.unmatched ?? 0} unmatched, ${data.ambiguous ?? 0} ambiguous, ${data.already_ok ?? 0} already OK`;
        } catch (err) {
            error = err instanceof Error ? err.message : "Validate failed";
        } finally {
            busy = false;
        }
    }

    async function normalize() {
        error = "";
        ok = "";
        if (!report) {
            error = "Validate first";
            return;
        }
        if ((report.unmatched > 0 || report.ambiguous > 0) && Object.keys(overrides).length === 0) {
            // still allow if only unmatched remain — user may want partial normalize
        }
        busy = true;
        try {
            const res = await fetch(
                `/api/v1/projects/${encodeURIComponent(slug)}/schema/fk/normalize`,
                {
                    method: "POST",
                    headers: {
                        Authorization: `Bearer ${accessToken}`,
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify(
                        matchBody({ save_link: saveLinkAfterNormalize }),
                    ),
                },
            );
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                throw new Error(data.error || `Normalize failed (${res.status})`);
            }
            report = (data.report as MatchReport) ?? report;
            const n = data.result?.updated_rows ?? 0;
            ok = `Rewrote ${n} cell(s) to ${targetTable}.source_id` +
                (data.references ? ` · saved link ${data.references}` : "");
            onSaved?.();
            // Re-validate to refresh status
            await validateQuiet();
        } catch (err) {
            error = err instanceof Error ? err.message : "Normalize failed";
        } finally {
            busy = false;
        }
    }

    async function validateQuiet() {
        try {
            const res = await fetch(
                `/api/v1/projects/${encodeURIComponent(slug)}/schema/fk/validate`,
                {
                    method: "POST",
                    headers: {
                        Authorization: `Bearer ${accessToken}`,
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify(matchBody()),
                },
            );
            const data = await res.json().catch(() => ({}));
            if (res.ok) report = data as MatchReport;
        } catch {
            /* ignore */
        }
    }

    function setOverride(from: string, to: string) {
        overrides = { ...overrides, [from]: to };
    }

    function clearOverride(from: string) {
        const next = { ...overrides };
        delete next[from];
        overrides = next;
    }
</script>

{#if tables.length < 1}
    <p class="text-sm text-muted-foreground">
        Import at least one table before linking foreign keys.
    </p>
{:else}
    <div class="flex flex-col gap-4">
        <div>
            <h3 class="text-sm font-semibold text-foreground">
                Link &amp; normalize foreign keys
            </h3>
            <p class="text-xs text-muted-foreground mt-0.5 max-w-xl">
                TinyOwl always mints a new
                <code class="font-mono">source_id</code>
                (e.g. <code class="font-mono">SP-0001-web</code>). Your file’s
                id stays as a normal column (<code class="font-mono">fid</code>,
                <code class="font-mono">id</code>, …). Match the FK column
                (<code class="font-mono">chunk_id</code>) to that natural key,
                validate (exact / digits / suffix soft match), then rewrite
                cells to the target’s <code class="font-mono">source_id</code>.
            </p>
        </div>

        {#if suggestions.length}
            <div class="rounded-lg border border-border overflow-hidden">
                <div
                    class="border-b border-border bg-secondary/40 px-3 py-2 text-xs font-medium text-muted-foreground"
                >
                    Suggested links (name conventions)
                </div>
                <ul class="divide-y divide-border">
                    {#each suggestions as s}
                        <li
                            class="flex flex-wrap items-center gap-2 px-3 py-2.5 text-sm"
                        >
                            <span
                                class="font-mono text-xs text-foreground min-w-0 truncate"
                            >
                                {s.sourceTable}.{s.sourceColumn} → {s.targetTable}.{s.targetColumn}
                            </span>
                            <span class="text-[11px] text-muted-foreground truncate"
                                >{s.reason}</span
                            >
                            <span class="ml-auto flex gap-1.5 shrink-0">
                                <button
                                    type="button"
                                    disabled={busy}
                                    class="rounded border border-border px-2 py-1 text-[11px] text-muted-foreground hover:text-foreground"
                                    onclick={() => applySuggestion(s)}
                                >
                                    Fill
                                </button>
                                <button
                                    type="button"
                                    disabled={busy}
                                    class="rounded bg-primary/90 px-2 py-1 text-[11px] font-medium text-primary-foreground disabled:opacity-50"
                                    onclick={() => void confirmSuggestion(s)}
                                >
                                    Fill + validate
                                </button>
                            </span>
                        </li>
                    {/each}
                </ul>
            </div>
        {/if}

        <div class="grid gap-3 sm:grid-cols-2">
            <label class="flex flex-col gap-1 text-xs">
                <span class="text-muted-foreground">From table</span>
                <select
                    class="rounded-md border border-input bg-background px-2 py-2 text-sm"
                    bind:value={sourceTable}
                >
                    {#each tables as t}
                        <option value={t.name}>{t.label || t.name}</option>
                    {/each}
                </select>
            </label>
            <label class="flex flex-col gap-1 text-xs">
                <span class="text-muted-foreground">From column (FK)</span>
                <select
                    class="rounded-md border border-input bg-background px-2 py-2 text-sm font-mono"
                    bind:value={sourceColumn}
                >
                    {#each sourceCols as c}
                        <option value={c.name}>{c.name}</option>
                    {/each}
                </select>
            </label>
            <label class="flex flex-col gap-1 text-xs">
                <span class="text-muted-foreground">To table</span>
                <select
                    class="rounded-md border border-input bg-background px-2 py-2 text-sm"
                    bind:value={targetTable}
                >
                    {#each tables as t}
                        <option value={t.name}>{t.label || t.name}</option>
                    {/each}
                </select>
            </label>
            <label class="flex flex-col gap-1 text-xs">
                <span class="text-muted-foreground"
                    >Match values via (target column)</span
                >
                <select
                    class="rounded-md border border-input bg-background px-2 py-2 text-sm font-mono"
                    bind:value={matchOn}
                >
                    {#each targetCols as c}
                        <option value={c.name}>{c.name}</option>
                    {/each}
                </select>
            </label>
            <label class="flex flex-col gap-1 text-xs">
                <span class="text-muted-foreground"
                    >Inject / link to (target key)</span
                >
                <select
                    class="rounded-md border border-input bg-background px-2 py-2 text-sm font-mono"
                    bind:value={targetColumn}
                >
                    {#each targetCols as c}
                        <option value={c.name}>{c.name}</option>
                    {/each}
                </select>
            </label>
            <label class="flex flex-col gap-1 text-xs">
                <span class="text-muted-foreground"
                    >Display column on target (optional)</span
                >
                <select
                    class="rounded-md border border-input bg-background px-2 py-2 text-sm font-mono"
                    bind:value={displayColumn}
                >
                    <option value="">— none —</option>
                    {#each targetCols as c}
                        <option value={c.name}>{c.name}</option>
                    {/each}
                </select>
            </label>
        </div>

        <label class="flex items-center gap-2 text-xs text-muted-foreground">
            <input type="checkbox" bind:checked={allowMulti} class="rounded" />
            Allow multiple values (array / multi-FK)
        </label>
        <label class="flex items-center gap-2 text-xs text-muted-foreground">
            <input
                type="checkbox"
                bind:checked={saveLinkAfterNormalize}
                class="rounded"
            />
            Save schema link when normalizing
        </label>

        <div class="flex flex-wrap gap-2">
            <button
                type="button"
                disabled={busy}
                onclick={() => void validate()}
                class="rounded-md border border-border px-3 py-1.5 text-sm text-foreground hover:bg-secondary/40 disabled:opacity-50"
            >
                Validate matches
            </button>
            <button
                type="button"
                disabled={busy || !report || (report.would_rewrite ?? 0) < 1}
                onclick={() => void normalize()}
                class="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground disabled:opacity-50"
            >
                Normalize → source_id
            </button>
            <button
                type="button"
                disabled={busy}
                onclick={() => void save()}
                class="rounded-md border border-border px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground"
            >
                Save link only
            </button>
            <button
                type="button"
                disabled={busy}
                onclick={() => void clearLink()}
                class="rounded-md border border-border px-3 py-1.5 text-sm text-muted-foreground hover:text-destructive"
            >
                Clear this link
            </button>
        </div>

        {#if report}
            <div class="rounded-lg border border-border overflow-hidden">
                <div
                    class="flex flex-wrap gap-3 border-b border-border bg-secondary/40 px-3 py-2 text-xs"
                >
                    <span class="text-foreground"
                        ><span class="font-medium tabular-nums"
                            >{report.matched}</span
                        >
                        matched</span
                    >
                    <span class="text-foreground"
                        ><span class="font-medium tabular-nums"
                            >{report.already_ok}</span
                        >
                        already OK</span
                    >
                    <span class="text-amber-700 dark:text-amber-400"
                        ><span class="font-medium tabular-nums"
                            >{report.unmatched}</span
                        >
                        unmatched</span
                    >
                    <span class="text-destructive"
                        ><span class="font-medium tabular-nums"
                            >{report.ambiguous}</span
                        >
                        ambiguous</span
                    >
                    <span class="text-muted-foreground ml-auto"
                        >would rewrite {report.would_rewrite}</span
                    >
                </div>
                <ul class="divide-y divide-border max-h-64 overflow-y-auto">
                    {#each report.samples as s}
                        <li class="px-3 py-2 text-xs">
                            <div class="flex flex-wrap items-center gap-2">
                                <span
                                    class="font-mono text-foreground truncate max-w-[10rem]"
                                    title={s.from}>{s.from}</span
                                >
                                <span class="text-muted-foreground">→</span>
                                {#if s.status === "matched" || s.status === "already"}
                                    <span
                                        class="font-mono text-foreground truncate max-w-[12rem]"
                                        >{s.to}</span
                                    >
                                    <span
                                        class="rounded px-1.5 py-0.5 text-[10px] uppercase tracking-wide {s.status ===
                                        'already'
                                            ? 'bg-secondary text-muted-foreground'
                                            : 'bg-primary/15 text-primary'}"
                                        >{s.status}{#if s.via}
                                            · {s.via}{/if}</span
                                    >
                                {:else if s.status === "ambiguous"}
                                    <select
                                        class="rounded border border-input bg-background px-1.5 py-1 font-mono text-[11px] max-w-[14rem]"
                                        value={overrides[s.from] ?? ""}
                                        onchange={(e) => {
                                            const v = (
                                                e.currentTarget as HTMLSelectElement
                                            ).value;
                                            if (v) setOverride(s.from, v);
                                            else clearOverride(s.from);
                                        }}
                                    >
                                        <option value="">Pick target…</option>
                                        {#each s.candidates ?? [] as c}
                                            <option value={c}>{c}</option>
                                        {/each}
                                    </select>
                                    <span
                                        class="rounded bg-destructive/15 px-1.5 py-0.5 text-[10px] uppercase text-destructive"
                                        >ambiguous</span
                                    >
                                {:else}
                                    <input
                                        class="rounded border border-input bg-background px-1.5 py-1 font-mono text-[11px] w-40"
                                        placeholder="target source_id"
                                        value={overrides[s.from] ?? ""}
                                        oninput={(e) => {
                                            const v = (
                                                e.currentTarget as HTMLInputElement
                                            ).value.trim();
                                            if (v) setOverride(s.from, v);
                                            else clearOverride(s.from);
                                        }}
                                    />
                                    <span
                                        class="rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] uppercase text-amber-700 dark:text-amber-400"
                                        >unmatched</span
                                    >
                                {/if}
                                <span
                                    class="ml-auto tabular-nums text-muted-foreground"
                                    >×{s.count}</span
                                >
                            </div>
                        </li>
                    {/each}
                </ul>
                {#if report.unmatched > 0 || report.ambiguous > 0}
                    <div
                        class="border-t border-border px-3 py-2 text-[11px] text-muted-foreground"
                    >
                        Define unmatched / ambiguous rows above, then Validate
                        again before Normalize.
                    </div>
                {/if}
            </div>
        {/if}

        {#if confirmed.length}
            <div class="text-xs text-muted-foreground">
                <p class="font-medium text-foreground mb-1">Confirmed links</p>
                <ul class="space-y-1">
                    {#each confirmed as e}
                        <li
                            class="flex flex-wrap items-center gap-2 font-mono"
                        >
                            <span
                                >{e.source}.{e.source_column} → {e.target}.{e.target_column ||
                                    "source_id"}</span
                            >
                            <button
                                type="button"
                                disabled={busy}
                                class="text-[11px] text-muted-foreground hover:text-destructive not-italic font-sans"
                                onclick={() =>
                                    void clearLink(e.source, e.source_column)}
                            >
                                Clear
                            </button>
                        </li>
                    {/each}
                </ul>
            </div>
        {/if}

        {#if error}
            <p class="text-sm text-destructive">{error}</p>
        {/if}
        {#if ok}
            <p class="text-sm text-primary">{ok}</p>
        {/if}
    </div>
{/if}
