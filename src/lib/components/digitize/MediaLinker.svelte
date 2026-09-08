<script lang="ts">
    type SchemaTable = {
        name: string;
        label?: string;
        columns: { name: string; type: string; pk?: boolean }[];
        count: number;
    };

    type MatchSample = {
        from: string;
        to?: string;
        status: string;
        via?: string;
        count: number;
        would_link?: number;
        hashes?: string[];
        names?: string[];
        candidates?: string[];
    };

    type MatchReport = {
        matched: number;
        unmatched: number;
        ambiguous: number;
        already_ok: number;
        would_link: number;
        samples: MatchSample[];
    };

    type Props = {
        accessToken: string;
        slug: string;
        tables: SchemaTable[];
        focusTable?: string;
        onSaved?: () => void;
    };

    let { accessToken, slug, tables, focusTable = "", onSaved }: Props = $props();

    let tablePick = $state("");
    let columnPick = $state("");
    let mode = $state<"file" | "folder">("file");
    let message = $state("");
    let busy = $state(false);
    let error = $state("");
    let ok = $state("");
    let report = $state<MatchReport | null>(null);
    let overrides = $state<Record<string, string>>({});

    const factTables = $derived(tables.filter((t) => !t.name.startsWith("_")));
    const sourceTable = $derived(tablePick || factTables[0]?.name || "");

    $effect(() => {
        if (focusTable && factTables.some((t) => t.name === focusTable)) {
            tablePick = focusTable;
        }
    });

    const sourceCols = $derived(
        (factTables.find((t) => t.name === sourceTable)?.columns ?? []).filter(
            (c) =>
                !c.pk &&
                c.name !== "entity_type" &&
                c.name !== "source_id" &&
                !/^_?geom/i.test(c.name),
        ),
    );

    const preferredColumn = $derived(
        sourceCols.find((c) =>
            /photo|image|media|picture|attachment|path|folder|file/i.test(
                c.name,
            ),
        )?.name ??
            sourceCols[0]?.name ??
            "",
    );
    const sourceColumn = $derived(
        sourceCols.some((c) => c.name === columnPick)
            ? columnPick
            : preferredColumn,
    );

    function matchBody(extra: Record<string, unknown> = {}) {
        return {
            entity_type: sourceTable,
            column_name: sourceColumn,
            mode,
            overrides,
            ...extra,
        };
    }

    async function validate() {
        error = "";
        ok = "";
        if (!sourceTable || !sourceColumn) {
            error = "Pick a table and column";
            return;
        }
        busy = true;
        try {
            const res = await fetch(
                `/api/v1/projects/${encodeURIComponent(slug)}/schema/media/validate`,
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
            ok = `Validated: ${data.matched ?? 0} matched, ${data.unmatched ?? 0} unmatched, ${data.ambiguous ?? 0} ambiguous, ${data.already_ok ?? 0} already linked`;
        } catch (err) {
            error = err instanceof Error ? err.message : "Validate failed";
        } finally {
            busy = false;
        }
    }

    async function link() {
        error = "";
        ok = "";
        if (!report) {
            error = "Validate first";
            return;
        }
        if (!message.trim()) {
            error = "Commit message required";
            return;
        }
        busy = true;
        try {
            const res = await fetch(
                `/api/v1/projects/${encodeURIComponent(slug)}/schema/media/link`,
                {
                    method: "POST",
                    headers: {
                        Authorization: `Bearer ${accessToken}`,
                        "Content-Type": "application/json",
                        "X-TinyOwl-Message": message.trim(),
                    },
                    body: JSON.stringify(
                        matchBody({ message: message.trim() }),
                    ),
                },
            );
            const data = (await res.json().catch(() => ({}))) as {
                error?: string;
                linked?: number;
                report?: MatchReport;
            };
            if (!res.ok) {
                throw new Error(data.error || `Link failed (${res.status})`);
            }
            if (data.report) report = data.report;
            ok = `Linked ${data.linked ?? 0} media row(s). Path cells unchanged.`;
            onSaved?.();
            await validateQuiet();
        } catch (err) {
            error = err instanceof Error ? err.message : "Link failed";
        } finally {
            busy = false;
        }
    }

    async function validateQuiet() {
        try {
            const res = await fetch(
                `/api/v1/projects/${encodeURIComponent(slug)}/schema/media/validate`,
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

    function shortHash(h: string) {
        return h.length > 12 ? `${h.slice(0, 8)}…` : h;
    }
</script>

{#if factTables.length < 1}
    <p class="text-sm text-muted-foreground">
        Import a table with a path or photo column first.
    </p>
{:else}
    <div class="flex flex-col gap-4">
        <div>
            <h3 class="text-sm font-semibold text-foreground">
                Link column to media
            </h3>
            <p class="text-xs text-muted-foreground mt-0.5">
                Match a column of filenames or folder paths to indexed files,
                then commit
                <code class="font-mono">_media</code>
                rows. Path cells stay as they are. QField
                <code class="font-mono">DCIM/…</code>
                columns are one file per cell — use File mode, not Folder.
                Photos already uploaded as hashes are matched by original name
                when Cloud still has the file (unique size).
            </p>
        </div>

        <div class="grid gap-3">
            <label class="flex flex-col gap-1 text-xs">
                <span class="text-muted-foreground">Table</span>
                <select
                    class="rounded-md border border-input bg-background px-2 py-2 text-sm"
                    value={sourceTable}
                    onchange={(e) => {
                        tablePick = (
                            e.currentTarget as HTMLSelectElement
                        ).value;
                        columnPick = "";
                    }}
                >
                    {#each factTables as t (t.name)}
                        <option value={t.name}>{t.label || t.name}</option>
                    {/each}
                </select>
            </label>
            <label class="flex flex-col gap-1 text-xs">
                <span class="text-muted-foreground">Path / photo column</span>
                <select
                    class="rounded-md border border-input bg-background px-2 py-2 text-sm font-mono"
                    value={sourceColumn}
                    onchange={(e) => {
                        columnPick = (
                            e.currentTarget as HTMLSelectElement
                        ).value;
                    }}
                >
                    {#each sourceCols as c (c.name)}
                        <option value={c.name}>{c.name}</option>
                    {/each}
                </select>
            </label>
            <label class="flex flex-col gap-1 text-xs">
                <span class="text-muted-foreground">Match mode</span>
                <select
                    class="rounded-md border border-input bg-background px-2 py-2 text-sm"
                    bind:value={mode}
                >
                    <option value="file">File (basename or hash)</option>
                    <option value="folder">Folder (path prefix)</option>
                </select>
            </label>
            <label class="flex flex-col gap-1 text-xs">
                <span class="text-muted-foreground">Commit message</span>
                <input
                    class="rounded-md border border-input bg-background px-2 py-2 text-sm"
                    placeholder="link photo_path to media"
                    bind:value={message}
                />
            </label>
        </div>

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
                disabled={busy || !report || (report.would_link ?? 0) < 1}
                onclick={() => void link()}
                class="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground disabled:opacity-50"
            >
                Link → _media
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
                        already linked</span
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
                        >would link {report.would_link}</span
                    >
                </div>
                <ul class="divide-y divide-border max-h-64 overflow-y-auto">
                    {#each report.samples as s (s.from)}
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
                                        title={(s.hashes ?? []).join(", ")}
                                        >{s.names?.filter(Boolean).join(", ") ||
                                            s.to}</span
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
                                        <option value="">Pick file…</option>
                                        {#each s.candidates ?? [] as c, i (c)}
                                            <option value={c}
                                                >{(s.names?.[i] ||
                                                    shortHash(c)) +
                                                    " " +
                                                    shortHash(c)}</option
                                            >
                                        {/each}
                                    </select>
                                    <span
                                        class="rounded bg-destructive/15 px-1.5 py-0.5 text-[10px] uppercase text-destructive"
                                        >ambiguous</span
                                    >
                                {:else}
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
                        Unmatched cells need an uploaded file whose original
                        name is known (Cloud listing or
                        <code class="font-mono">media_index</code>
                        meta). Ambiguous basenames: pick a hash, then Validate
                        again.
                    </div>
                {/if}
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
