<script lang="ts">
    type Column = {
        name: string;
        type: string;
        label?: string;
        source_name: string;
    };

    type Props = {
        accessToken: string;
        slug: string;
        onImported: (info: {
            tableKey: string;
            rows: number;
            format?: string;
        }) => void;
    };

    type Phase =
        | "idle"
        | "reading"
        | "previewing"
        | "importing"
        | "indexing"
        | "done";

    let { accessToken, slug, onImported }: Props = $props();

    let file = $state<File | null>(null);
    let format = $state("");
    let tableKey = $state("");
    let columns = $state<Column[]>([]);
    let sampleRows = $state<Record<string, string>[]>([]);
    let rowCount = $state(0);
    let busy = $state(false);
    let phase = $state<Phase>("idle");
    let progressPct = $state(0);
    let error = $state("");
    let dragOver = $state(false);

    const typeOptions = [
        "string",
        "integer",
        "double",
        "boolean",
        "geometry",
        "arch_date",
    ];

    const phaseLabel = $derived.by(() => {
        switch (phase) {
            case "reading":
                return "Reading file…";
            case "previewing":
                return "Detecting columns…";
            case "importing":
                return "Writing rows…";
            case "indexing":
                return "Updating schema index…";
            case "done":
                return "Done";
            default:
                return "";
        }
    });

    function setPhase(p: Phase, pct: number) {
        phase = p;
        progressPct = pct;
    }

    async function preview(f: File) {
        error = "";
        busy = true;
        file = f;
        columns = [];
        sampleRows = [];
        setPhase("reading", 12);
        try {
            const fd = new FormData();
            fd.append("file", f);
            setPhase("previewing", 45);
            const res = await fetch(
                `/api/v1/projects/${encodeURIComponent(slug)}/import/preview`,
                {
                    method: "POST",
                    headers: { Authorization: `Bearer ${accessToken}` },
                    body: fd,
                },
            );
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                error =
                    data.error ||
                    data.message ||
                    `Preview failed (${res.status})`;
                setPhase("idle", 0);
                return;
            }
            format = data.format || "";
            tableKey = data.suggested_table_key || "imported";
            columns = (data.columns || []).map(
                (c: { name: string; type: string; label?: string }) => ({
                    name: c.name,
                    type: c.type || "string",
                    label: c.label || c.name,
                    source_name: c.name,
                }),
            );
            sampleRows = data.sample_rows || [];
            rowCount = data.row_count || 0;
            setPhase("idle", 0);
        } catch (err) {
            error = err instanceof Error ? err.message : "Preview failed";
            setPhase("idle", 0);
        } finally {
            busy = false;
        }
    }

    function onFileInput(e: Event) {
        const input = e.target as HTMLInputElement;
        const f = input.files?.[0];
        if (f) void preview(f);
    }

    function onDrop(e: DragEvent) {
        e.preventDefault();
        dragOver = false;
        const f = e.dataTransfer?.files?.[0];
        if (f) void preview(f);
    }

    async function commit() {
        if (!file) {
            error = "Choose a file first";
            return;
        }
        error = "";
        busy = true;
        setPhase("importing", 25);
        try {
            const fd = new FormData();
            fd.append("file", file);
            fd.append("table_key", tableKey.trim() || "imported");
            fd.append(
                "columns",
                JSON.stringify(
                    columns.map((c) => ({
                        source_name: c.source_name,
                        name: c.name,
                        type: c.type,
                        label: c.label,
                    })),
                ),
            );
            // Soft progress while request is in flight
            const tick = window.setInterval(() => {
                if (phase === "importing" && progressPct < 70) {
                    progressPct = Math.min(70, progressPct + 4);
                } else if (phase === "indexing" && progressPct < 92) {
                    progressPct = Math.min(92, progressPct + 3);
                }
            }, 280);
            const res = await fetch(
                `/api/v1/projects/${encodeURIComponent(slug)}/import`,
                {
                    method: "POST",
                    headers: { Authorization: `Bearer ${accessToken}` },
                    body: fd,
                },
            );
            setPhase("indexing", 78);
            const data = await res.json().catch(() => ({}));
            window.clearInterval(tick);
            if (!res.ok) {
                error =
                    data.error ||
                    data.message ||
                    `Import failed (${res.status})`;
                setPhase("idle", 0);
                return;
            }
            setPhase("done", 100);
            await new Promise((r) => setTimeout(r, 350));
            onImported({
                tableKey: data.table_key || tableKey,
                rows: data.rows ?? rowCount,
                format: data.format || format,
            });
        } catch (err) {
            error = err instanceof Error ? err.message : "Import failed";
            setPhase("idle", 0);
        } finally {
            busy = false;
        }
    }

    function clearFile() {
        file = null;
        format = "";
        columns = [];
        sampleRows = [];
        rowCount = 0;
        error = "";
        setPhase("idle", 0);
    }
</script>

<div class="flex flex-col gap-5">
    <div class="flex flex-wrap items-end justify-between gap-3">
        <div>
            <h2 class="text-base font-semibold text-foreground">Add a table</h2>
            <p class="text-sm text-muted-foreground mt-0.5 max-w-lg">
                Drop a CSV or GeoJSON. Columns become <em>this</em> project’s
                schema — rename freely.
            </p>
        </div>
        <div class="flex gap-1.5 text-[11px]">
            <span
                class="rounded-full border border-border px-2 py-0.5 text-muted-foreground"
                >CSV</span
            >
            <span
                class="rounded-full border border-border px-2 py-0.5 text-muted-foreground"
                >GeoJSON</span
            >
        </div>
    </div>

    {#if busy && phase !== "idle"}
        <div
            class="rounded-lg border border-border bg-secondary/30 px-4 py-3"
            role="status"
            aria-live="polite"
        >
            <div class="flex items-center justify-between gap-3 mb-2">
                <span class="text-sm text-foreground">{phaseLabel}</span>
                <span class="text-xs tabular-nums text-muted-foreground"
                    >{progressPct}%</span
                >
            </div>
            <div
                class="h-1.5 overflow-hidden rounded-full bg-muted"
            >
                <div
                    class="h-full rounded-full bg-primary transition-[width] duration-300 ease-out"
                    style="width: {progressPct}%"
                ></div>
            </div>
            <ol
                class="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted-foreground"
            >
                {#each [
                    { id: "reading", label: "Read" },
                    { id: "previewing", label: "Preview" },
                    { id: "importing", label: "Import" },
                    { id: "indexing", label: "Index" },
                ] as step}
                    {@const active =
                        phase === step.id ||
                        (phase === "done" && step.id === "indexing") ||
                        (["previewing", "importing", "indexing", "done"].includes(
                            phase,
                        ) &&
                            step.id === "reading") ||
                        (["importing", "indexing", "done"].includes(phase) &&
                            step.id === "previewing") ||
                        (["indexing", "done"].includes(phase) &&
                            step.id === "importing")}
                    <li
                        class={active
                            ? "text-foreground font-medium"
                            : ""}
                    >
                        {step.label}
                    </li>
                {/each}
            </ol>
        </div>
    {/if}

    {#if !columns.length}
        <label
            class="flex cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed px-6 py-14 text-center transition-colors {dragOver
                ? 'border-primary bg-primary/5'
                : 'border-border hover:border-muted-foreground/40 hover:bg-secondary/20'} {busy
                ? 'pointer-events-none opacity-60'
                : ''}"
            ondragover={(e) => {
                e.preventDefault();
                dragOver = true;
            }}
            ondragleave={() => (dragOver = false)}
            ondrop={onDrop}
        >
            <input
                type="file"
                accept=".csv,.geojson,.json,text/csv,application/geo+json,application/json"
                class="sr-only"
                disabled={busy}
                onchange={onFileInput}
            />
            <span class="text-sm font-medium text-foreground"
                >{busy && !columns.length
                    ? phaseLabel || "Reading file…"
                    : "Drop file or click to browse"}</span
            >
            <span class="text-xs text-muted-foreground"
                >.csv · .geojson · FeatureCollection</span
            >
            {#if file}
                <span class="text-xs font-mono text-primary">{file.name}</span>
            {/if}
        </label>
    {:else}
        <div
            class="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-secondary/30 px-3 py-2"
        >
            <span class="text-xs font-mono text-foreground truncate max-w-[14rem]"
                >{file?.name}</span
            >
            {#if format}
                <span
                    class="rounded-full bg-primary/15 px-2 py-0.5 text-[10px] uppercase tracking-wide text-primary"
                    >{format}</span
                >
            {/if}
            <span class="text-xs text-muted-foreground tabular-nums"
                >{rowCount} rows · {columns.length} cols</span
            >
            <button
                type="button"
                class="ml-auto text-xs text-muted-foreground hover:text-foreground"
                disabled={busy}
                onclick={clearFile}
            >
                Change file
            </button>
        </div>

        <label class="flex flex-col gap-1.5 text-sm max-w-sm">
            <span class="text-xs font-medium text-muted-foreground"
                >Table key</span
            >
            <input
                class="rounded-md border border-input bg-background px-3 py-2 font-mono text-sm text-foreground"
                bind:value={tableKey}
                disabled={busy}
            />
        </label>

        <div class="overflow-hidden rounded-xl border border-border">
            <div
                class="border-b border-border bg-secondary/40 px-3 py-2 text-xs font-medium text-muted-foreground"
            >
                Columns — edit names and types for this site only
            </div>
            <div class="overflow-x-auto">
                <table class="w-full text-sm">
                    <thead
                        class="text-left text-[11px] uppercase tracking-wide text-muted-foreground"
                    >
                        <tr>
                            <th class="px-3 py-2 font-medium">Source</th>
                            <th class="px-3 py-2 font-medium">Name</th>
                            <th class="px-3 py-2 font-medium">Type</th>
                            <th class="px-3 py-2 font-medium">Label</th>
                        </tr>
                    </thead>
                    <tbody>
                        {#each columns as col, i}
                            <tr class="border-t border-border/80">
                                <td
                                    class="px-3 py-1.5 font-mono text-[11px] text-muted-foreground"
                                    >{col.source_name}</td
                                >
                                <td class="px-2 py-1">
                                    <input
                                        class="w-full min-w-[7rem] rounded border border-input bg-background px-2 py-1.5 font-mono text-xs"
                                        bind:value={columns[i].name}
                                        disabled={busy}
                                    />
                                </td>
                                <td class="px-2 py-1">
                                    <select
                                        class="w-full rounded border border-input bg-background px-2 py-1.5 text-xs"
                                        bind:value={columns[i].type}
                                        disabled={busy}
                                    >
                                        {#each typeOptions as t}
                                            <option value={t}>{t}</option>
                                        {/each}
                                    </select>
                                </td>
                                <td class="px-2 py-1">
                                    <input
                                        class="w-full min-w-[7rem] rounded border border-input bg-background px-2 py-1.5 text-xs"
                                        bind:value={columns[i].label}
                                        disabled={busy}
                                    />
                                </td>
                            </tr>
                        {/each}
                    </tbody>
                </table>
            </div>
        </div>

        {#if sampleRows.length > 0}
            <details class="group rounded-lg border border-border">
                <summary
                    class="cursor-pointer list-none px-3 py-2 text-xs font-medium text-muted-foreground hover:text-foreground"
                >
                    Sample rows ({sampleRows.length})
                </summary>
                <pre
                    class="max-h-44 overflow-auto border-t border-border bg-secondary/20 p-3 text-[11px] font-mono text-muted-foreground"
                    >{JSON.stringify(sampleRows, null, 2)}</pre
                >
            </details>
        {/if}

        <button
            type="button"
            disabled={busy}
            onclick={() => void commit()}
            class="self-start rounded-md bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground disabled:opacity-50"
        >
            {busy
                ? phaseLabel || "Importing…"
                : `Import ${tableKey || "table"}`}
        </button>
    {/if}

    {#if error}
        <p
            class="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
            {error}
        </p>
    {/if}
</div>
