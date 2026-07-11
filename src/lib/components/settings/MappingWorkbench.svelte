<script lang="ts">
    import { enhance } from "$app/forms";
    import LinkIcon from "@lucide/svelte/icons/link";
    import CheckIcon from "@lucide/svelte/icons/check";
    import XIcon from "@lucide/svelte/icons/x";
    import SearchIcon from "@lucide/svelte/icons/search";
    import LoaderIcon from "@lucide/svelte/icons/loader";

    export type ValueMappingRow = {
        entity_type: string;
        column_name: string;
        local_value: string;
        concept_uri: string | null;
        vocabulary?: string | null;
        entity_count?: number;
        display_label?: string | null;
        column_type?: string | null;
        allow_multi?: boolean;
        item?: string | null;
        references?: string | null;
        references_value?: string | null;
    };

    export type ColumnMappingRow = {
        entity_type: string;
        column_name: string;
        vocabulary: string | null;
        crm_property: string | null;
        crm_range: string | null;
    };

    type VocabResult = {
        uri: string;
        label: string;
        vocabulary: string;
        context?: string;
        score: number;
    };

    let {
        mode,
        rows,
        description = "",
        form = null as any,
    }: {
        mode: "values" | "columns";
        rows: ValueMappingRow[] | ColumnMappingRow[];
        description?: string;
        form?: any;
    } = $props();

    function isArrayColumn(row: ValueMappingRow): boolean {
        return (
            row.allow_multi === true ||
            (row.column_type ?? "").toLowerCase() === "array"
        );
    }

    /** Prefer FK label; fall back to raw exploded element. */
    function valueDisplay(row: ValueMappingRow): string {
        const label = row.display_label?.trim();
        if (label) return label;
        return row.local_value;
    }

    function valueSubtext(row: ValueMappingRow): string | null {
        if (row.display_label?.trim() && row.display_label.trim() !== row.local_value) {
            return row.local_value;
        }
        return null;
    }

    function isCompositeLeftover(row: ValueMappingRow): boolean {
        if (!isArrayColumn(row)) return false;
        const v = row.local_value.trim();
        return (
            (v.startsWith("{") && v.endsWith("}") && v.includes(",")) ||
            (v.startsWith("[") && v.endsWith("]") && v.includes(","))
        );
    }

    const selectClass =
        "h-8 rounded-md border border-input bg-background px-2.5 text-xs shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";

    function isMapped(row: ValueMappingRow | ColumnMappingRow): boolean {
        if (mode === "values") {
            return !!(row as ValueMappingRow).concept_uri;
        }
        return !!columnProperty(row as ColumnMappingRow);
    }

    /** Real CRM/property URI — never the vocabulary name itself. */
    function columnProperty(c: ColumnMappingRow): string | null {
        const prop = c.crm_property?.trim() || null;
        if (!prop) return null;
        const vocab = (c.vocabulary ?? "").trim().toLowerCase();
        if (prop.toLowerCase() === vocab) return null;
        if (["crm", "aat", "periodo", "getty", "wikidata"].includes(prop.toLowerCase())) {
            return null;
        }
        return prop;
    }

    function conceptLabel(row: ValueMappingRow | ColumnMappingRow): string {
        if (mode === "values") {
            return (row as ValueMappingRow).concept_uri ?? "";
        }
        return columnProperty(row as ColumnMappingRow) ?? "";
    }

    function rowKey(row: ValueMappingRow | ColumnMappingRow): string {
        if (mode === "values") {
            const v = row as ValueMappingRow;
            return `${v.entity_type}|${v.column_name}|${v.local_value}`;
        }
        const c = row as ColumnMappingRow;
        return `${c.entity_type}|${c.column_name}`;
    }

    function searchQuery(row: ValueMappingRow | ColumnMappingRow): string {
        if (mode === "values") {
            const v = row as ValueMappingRow;
            // Prefer human label for vocab search (e.g. "GeoSlam" over "2").
            return v.display_label?.trim() || v.local_value;
        }
        // Prefer humanized column name for CRM property search.
        return (row as ColumnMappingRow).column_name.replace(/_/g, " ");
    }

    const tableOptions = $derived(
        [...new Set(rows.map((r) => r.entity_type))].sort(),
    );

    let tableFilter = $state("");
    let columnFilter = $state("");
    let statusFilter = $state<"all" | "unmapped">("all");

    // Require exactly one table — default to first available.
    $effect(() => {
        if (!tableFilter && tableOptions.length > 0) {
            tableFilter = tableOptions[0];
        } else if (
            tableFilter &&
            tableOptions.length > 0 &&
            !tableOptions.includes(tableFilter)
        ) {
            tableFilter = tableOptions[0];
        }
    });

    const columnOptions = $derived.by(() => {
        if (mode !== "values" || !tableFilter) return [] as string[];
        return [
            ...new Set(
                (rows as ValueMappingRow[])
                    .filter((r) => r.entity_type === tableFilter)
                    .map((r) => r.column_name),
            ),
        ].sort();
    });

    const tableRows = $derived(
        rows.filter((r) => {
            if (!tableFilter || r.entity_type === tableFilter) {
                if (mode === "values" && isCompositeLeftover(r as ValueMappingRow)) {
                    return false;
                }
                return true;
            }
            return false;
        }),
    );

    const mappedInTable = $derived(tableRows.filter(isMapped).length);
    const unmappedInTable = $derived(tableRows.length - mappedInTable);
    const pctMapped = $derived(
        tableRows.length > 0
            ? Math.round((mappedInTable / tableRows.length) * 100)
            : 0,
    );

    const filteredRows = $derived(
        tableRows.filter((r) => {
            if (statusFilter === "unmapped" && isMapped(r)) return false;
            if (
                mode === "values" &&
                columnFilter &&
                (r as ValueMappingRow).column_name !== columnFilter
            ) {
                return false;
            }
            return true;
        }),
    );

    let editingKey = $state<string | null>(null);
    let editConcept = $state("");
    let vocabResults = $state<VocabResult[]>([]);
    let vocabLoading = $state(false);

    let hiddenForm = $state<HTMLFormElement | null>(null);
    let formData = $state({
        entity_type: "",
        column_name: "",
        local_value: "",
        concept_uri: "",
        vocabulary: "",
        crm_property: "",
        crm_range: "",
        confidence: "",
    });

    let pendingBulk = $state<{
        local_value: string;
        column_name: string;
        count: number;
        concept_uri: string;
        vocabulary: string;
        confidence: string;
    } | null>(null);

    $effect(() => {
        if (form?.mappingAction || form?.annotationAction) {
            editingKey = null;
            editConcept = "";
            vocabResults = [];
            vocabLoading = false;
        }
    });

    function cancelEdit() {
        editingKey = null;
        editConcept = "";
        vocabResults = [];
        vocabLoading = false;
    }

    async function searchVocab(query: string) {
        vocabLoading = true;
        vocabResults = [];

        async function fetchVocab(vocab: string) {
            const ctrl = new AbortController();
            const timer = setTimeout(() => ctrl.abort(), 5000);
            try {
                const res = await fetch(
                    `/api/v1/vocab/search?vocab=${vocab}&q=${encodeURIComponent(query)}&limit=10`,
                    { signal: ctrl.signal },
                );
                clearTimeout(timer);
                return res.ok ? await res.json() : [];
            } catch {
                return [];
            }
        }

        // Columns map to CRM properties; values search across concept vocabs.
        if (mode === "columns") {
            const crm = await fetchVocab("crm");
            vocabResults = [...crm].sort(
                (a: VocabResult, b: VocabResult) => b.score - a.score,
            );
        } else {
            const [periodo, aat, crm] = await Promise.all([
                fetchVocab("periodo"),
                fetchVocab("aat"),
                fetchVocab("crm"),
            ]);
            vocabResults = [...periodo, ...aat, ...crm].sort(
                (a: VocabResult, b: VocabResult) => b.score - a.score,
            );
        }
        vocabLoading = false;
    }

    function startSearch(row: ValueMappingRow | ColumnMappingRow) {
        editingKey = rowKey(row);
        editConcept = conceptLabel(row);
        if (!isMapped(row)) {
            searchVocab(searchQuery(row));
        } else {
            vocabResults = [];
            vocabLoading = false;
        }
    }

    function startManual(row: ValueMappingRow | ColumnMappingRow) {
        editingKey = rowKey(row);
        editConcept = conceptLabel(row);
        vocabResults = [];
        vocabLoading = false;
    }

    function applyResult(
        row: ValueMappingRow | ColumnMappingRow,
        result: VocabResult,
    ) {
        const confidence = String(Math.round(result.score * 100) / 100);
        if (mode === "values") {
            const v = row as ValueMappingRow;
            formData = {
                entity_type: v.entity_type,
                column_name: v.column_name,
                local_value: v.local_value,
                concept_uri: result.uri,
                vocabulary: result.vocabulary,
                crm_property: "",
                crm_range: "",
                confidence,
            };
            const similar = (rows as ValueMappingRow[]).filter(
                (m) =>
                    !m.concept_uri &&
                    m.local_value === v.local_value &&
                    m.column_name === v.column_name &&
                    m.entity_type !== v.entity_type,
            );
            pendingBulk =
                similar.length > 0
                    ? {
                          local_value: v.local_value,
                          column_name: v.column_name,
                          count: similar.length,
                          concept_uri: result.uri,
                          vocabulary: result.vocabulary,
                          confidence,
                      }
                    : null;
        } else {
            const c = row as ColumnMappingRow;
            formData = {
                entity_type: c.entity_type,
                column_name: c.column_name,
                local_value: "",
                concept_uri: "",
                vocabulary: c.vocabulary || result.vocabulary || "crm",
                crm_property: result.uri,
                crm_range: c.crm_range ?? "",
                confidence: "",
            };
            pendingBulk = null;
        }
        editingKey = null;
        vocabResults = [];
        vocabLoading = false;
        setTimeout(() => hiddenForm?.requestSubmit(), 0);
    }

    async function doBulkApply() {
        if (!pendingBulk) return;
        await fetch("?/bulkMapping", {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams({
                local_value: pendingBulk.local_value,
                column_name: pendingBulk.column_name,
                concept_uri: pendingBulk.concept_uri,
                vocabulary: pendingBulk.vocabulary,
                confidence: pendingBulk.confidence,
            }).toString(),
        });
        pendingBulk = null;
        window.location.reload();
    }

    const formAction = $derived(
        mode === "values" ? "?/updateMapping" : "?/updateAnnotation",
    );
    const formFlag = $derived(
        mode === "values" ? form?.mappingAction : form?.annotationAction,
    );
    const emptyTitle = $derived(
        mode === "values" ? "No value mappings yet" : "No columns yet",
    );
    const emptyHint = $derived(
        mode === "values"
            ? "Run tinyowl push to index distinct values (array cells are exploded per element), then map them here."
            : "Push a project with tables to annotate columns.",
    );
    const conceptHeader = $derived(mode === "values" ? "Concept" : "Property");
    const unmappedLabel = $derived(
        mode === "values" ? "unmapped" : "no property",
    );
</script>

<div>
    <form
        method="POST"
        action={formAction}
        use:enhance
        bind:this={hiddenForm}
        class="hidden"
    >
        <input type="hidden" name="entity_type" value={formData.entity_type} />
        <input type="hidden" name="column_name" value={formData.column_name} />
        {#if mode === "values"}
            <input
                type="hidden"
                name="local_value"
                value={formData.local_value}
            />
            <input
                type="hidden"
                name="concept_uri"
                value={formData.concept_uri}
            />
            <input
                type="hidden"
                name="vocabulary"
                value={formData.vocabulary}
            />
            <input
                type="hidden"
                name="confidence"
                value={formData.confidence}
            />
        {:else}
            <input
                type="hidden"
                name="vocabulary"
                value={formData.vocabulary}
            />
            <input
                type="hidden"
                name="crm_property"
                value={formData.crm_property}
            />
            <input type="hidden" name="crm_range" value={formData.crm_range} />
        {/if}
    </form>

    {#if description}
        <p class="mb-4 text-sm text-muted-foreground">{description}</p>
    {/if}

    {#if rows.length === 0}
        <div
            class="flex flex-col items-center justify-center rounded-lg border border-dashed border-border py-16"
        >
            <LinkIcon class="size-8 text-muted-foreground/40 mb-3" />
            <p class="text-sm text-muted-foreground mb-1">{emptyTitle}</p>
            <p class="text-xs text-muted-foreground max-w-sm text-center">
                {emptyHint}
            </p>
        </div>
    {:else}
        <div
            class="mb-4 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border border-border bg-secondary/20 px-3 py-2.5"
        >
            <select
                bind:value={tableFilter}
                onchange={() => (columnFilter = "")}
                class="{selectClass} min-w-[10rem]"
                aria-label="Table"
            >
                {#each tableOptions as t}
                    <option value={t}>{t}</option>
                {/each}
            </select>

            {#if mode === "values"}
                <select
                    bind:value={columnFilter}
                    class="{selectClass} min-w-[8rem]"
                    aria-label="Column"
                >
                    <option value="">All columns</option>
                    {#each columnOptions as c}
                        <option value={c}>{c}</option>
                    {/each}
                </select>
            {/if}

            <div class="flex items-center gap-0.5 rounded-md bg-secondary p-0.5">
                <button
                    type="button"
                    onclick={() => (statusFilter = "all")}
                    class="px-2.5 py-1 rounded text-xs font-medium transition-colors {statusFilter ===
                    'all'
                        ? 'bg-background text-foreground shadow-sm'
                        : 'text-muted-foreground hover:text-foreground'}"
                >
                    All
                </button>
                <button
                    type="button"
                    onclick={() => (statusFilter = "unmapped")}
                    class="px-2.5 py-1 rounded text-xs font-medium transition-colors {statusFilter ===
                    'unmapped'
                        ? 'bg-background text-foreground shadow-sm'
                        : 'text-muted-foreground hover:text-foreground'}"
                >
                    Unmapped ({unmappedInTable})
                </button>
            </div>

            <div class="ml-auto flex items-center gap-2 min-w-[8rem]">
                <div
                    class="h-1.5 w-24 rounded-full bg-secondary overflow-hidden"
                >
                    <div
                        class="h-full rounded-full bg-primary transition-all duration-300"
                        style="width: {pctMapped}%"
                    ></div>
                </div>
                <span
                    class="text-xs text-muted-foreground tabular-nums whitespace-nowrap"
                >
                    {mappedInTable}/{tableRows.length}
                </span>
            </div>
        </div>

        {#if form?.error && formFlag}
            <p
                class="mb-4 rounded-md border border-destructive/25 bg-destructive/5 px-3 py-2 text-sm text-destructive"
            >
                {form.error}
            </p>
        {/if}
        {#if form?.success && formFlag}
            <p
                class="mb-4 rounded-md border border-border bg-secondary/50 px-3 py-2 text-sm text-foreground"
            >
                Mapping updated.
            </p>
        {/if}

        {#if pendingBulk}
            <div
                class="mb-4 rounded-md border border-border bg-secondary/40 px-3 py-2.5 text-sm flex items-center justify-between gap-3"
            >
                <span class="text-foreground"
                    >Also map <strong>{pendingBulk.count}</strong> other “{pendingBulk.local_value}”
                    terms?</span
                >
                <button
                    type="button"
                    onclick={doBulkApply}
                    class="shrink-0 rounded-md bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
                >
                    Apply to all
                </button>
            </div>
        {/if}

        <div class="rounded-lg border border-border overflow-hidden">
            <div
                class="grid {mode === 'values'
                    ? 'grid-cols-[minmax(0,1.3fr)_minmax(0,0.9fr)_minmax(0,0.45fr)_minmax(0,1.3fr)_auto]'
                    : 'grid-cols-[minmax(0,1fr)_minmax(0,0.8fr)_minmax(0,1.4fr)_auto]'} gap-3 px-4 py-2 bg-secondary/40 border-b border-border text-[11px] font-medium text-muted-foreground uppercase tracking-wide"
            >
                {#if mode === "values"}
                    <span>Value</span>
                    <span>Column</span>
                    <span>Count</span>
                {:else}
                    <span>Column</span>
                    <span>Vocabulary</span>
                {/if}
                <span>{conceptHeader}</span>
                <span class="w-7"></span>
            </div>

            <div class="divide-y divide-border">
                {#each filteredRows as row (rowKey(row))}
                    {@const key = rowKey(row)}
                    {@const editing = editingKey === key}
                    {@const mapped = isMapped(row)}
                    {@const concept = conceptLabel(row)}

                    <div
                        class="grid {mode === 'values'
                            ? 'grid-cols-[minmax(0,1.3fr)_minmax(0,0.9fr)_minmax(0,0.45fr)_minmax(0,1.3fr)_auto]'
                            : 'grid-cols-[minmax(0,1fr)_minmax(0,0.8fr)_minmax(0,1.4fr)_auto]'} gap-3 items-center px-4 py-2.5 text-sm"
                    >
                        {#if mode === "values"}
                            {@const v = row as ValueMappingRow}
                            <div class="min-w-0">
                                <span class="truncate font-medium text-foreground block"
                                    >{valueDisplay(v)}</span
                                >
                                {#if valueSubtext(v)}
                                    <span class="truncate text-[11px] text-muted-foreground font-mono"
                                        >{valueSubtext(v)}</span
                                    >
                                {/if}
                            </div>
                            <div class="min-w-0 flex items-center gap-1.5">
                                <span class="truncate text-muted-foreground"
                                    >{v.column_name}</span
                                >
                                {#if isArrayColumn(v)}
                                    <span
                                        class="shrink-0 rounded border border-border px-1 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground"
                                        title="Array / multi-value column — values are exploded per element"
                                        >multi</span
                                    >
                                {/if}
                            </div>
                            <span class="tabular-nums text-muted-foreground text-xs"
                                >{v.entity_count ?? "—"}</span
                            >
                        {:else}
                            <span class="truncate font-medium text-foreground"
                                >{(row as ColumnMappingRow).column_name}</span
                            >
                            <span class="truncate text-muted-foreground"
                                >{(row as ColumnMappingRow).vocabulary ??
                                    "—"}</span
                            >
                        {/if}

                        {#if editing && mapped}
                            <form
                                method="POST"
                                action={formAction}
                                use:enhance
                                class="col-span-2 flex items-center gap-1.5 min-w-0"
                            >
                                <input
                                    type="hidden"
                                    name="entity_type"
                                    value={row.entity_type}
                                />
                                <input
                                    type="hidden"
                                    name="column_name"
                                    value={row.column_name}
                                />
                                {#if mode === "values"}
                                    <input
                                        type="hidden"
                                        name="local_value"
                                        value={(row as ValueMappingRow)
                                            .local_value}
                                    />
                                    <input
                                        type="text"
                                        name="concept_uri"
                                        bind:value={editConcept}
                                        class="h-7 w-full min-w-0 rounded border border-input bg-background px-2 text-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                                    />
                                {:else}
                                    <input
                                        type="hidden"
                                        name="vocabulary"
                                        value={(row as ColumnMappingRow)
                                            .vocabulary ?? ""}
                                    />
                                    <input
                                        type="text"
                                        name="crm_property"
                                        bind:value={editConcept}
                                        class="h-7 w-full min-w-0 rounded border border-input bg-background px-2 text-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                                    />
                                {/if}
                                <button
                                    type="submit"
                                    title="Save"
                                    class="flex size-6 shrink-0 items-center justify-center rounded text-foreground hover:bg-secondary"
                                >
                                    <CheckIcon class="size-3.5" />
                                </button>
                                <button
                                    type="button"
                                    title="Cancel"
                                    onclick={cancelEdit}
                                    class="flex size-6 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-secondary"
                                >
                                    <XIcon class="size-3.5" />
                                </button>
                            </form>
                        {:else if editing && !mapped}
                            <span class="truncate text-xs text-muted-foreground"
                                >searching…</span
                            >
                            <button
                                type="button"
                                title="Cancel"
                                onclick={cancelEdit}
                                class="flex size-7 items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
                            >
                                <XIcon class="size-3.5" />
                            </button>
                        {:else}
                            <span
                                class="truncate {mapped
                                    ? 'font-mono text-xs text-foreground'
                                    : 'italic text-xs text-muted-foreground/50'}"
                            >
                                {mapped ? concept : unmappedLabel}
                            </span>
                            <button
                                type="button"
                                onclick={() => startSearch(row)}
                                class="flex size-7 items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
                                title={mapped
                                    ? "Edit mapping"
                                    : "Search vocabularies"}
                            >
                                <SearchIcon class="size-3.5" />
                            </button>
                        {/if}
                    </div>

                    {#if editing && !mapped}
                        <div class="px-4 py-3 bg-secondary/25 border-t border-border">
                            {#if vocabLoading}
                                <div
                                    class="flex items-center gap-2 text-xs text-muted-foreground py-3"
                                >
                                    <LoaderIcon class="size-3.5 animate-spin" />
                                    Searching {mode === "columns"
                                        ? "CRM properties"
                                        : "vocabularies"}…
                                </div>
                            {:else if vocabResults.length > 0}
                                <div
                                    class="space-y-0.5 max-h-48 overflow-y-auto"
                                >
                                    {#each vocabResults as result}
                                        <button
                                            type="button"
                                            onclick={() =>
                                                applyResult(row, result)}
                                            class="w-full flex items-center justify-between gap-3 px-2.5 py-2 rounded-md text-left text-xs hover:bg-background transition-colors"
                                        >
                                            <div class="min-w-0">
                                                <span
                                                    class="font-medium text-foreground truncate block"
                                                    >{result.label}</span
                                                >
                                                <span
                                                    class="text-muted-foreground"
                                                    >{result.vocabulary}{#if result.context}
                                                        — {result.context}{/if}</span
                                                >
                                            </div>
                                            <span
                                                class="shrink-0 text-muted-foreground font-mono text-[10px]"
                                                >{Math.round(
                                                    result.score * 100,
                                                )}%</span
                                            >
                                        </button>
                                    {/each}
                                </div>
                            {:else}
                                <p
                                    class="text-xs text-muted-foreground py-2"
                                >
                                    No matching terms found.
                                </p>
                                <button
                                    type="button"
                                    onclick={() => startManual(row)}
                                    class="text-xs text-primary hover:underline"
                                >
                                    Enter {mode === "columns"
                                        ? "CRM property"
                                        : "concept URI"} manually
                                </button>
                            {/if}
                        </div>
                    {/if}
                {/each}

                {#if filteredRows.length === 0}
                    <div
                        class="flex flex-col items-center justify-center py-12"
                    >
                        <p class="text-sm text-muted-foreground">
                            No terms match this filter
                        </p>
                        <button
                            type="button"
                            onclick={() => {
                                statusFilter = "all";
                                columnFilter = "";
                            }}
                            class="mt-1 text-xs text-primary hover:underline"
                        >
                            Clear filters
                        </button>
                    </div>
                {/if}
            </div>
        </div>
    {/if}
</div>
