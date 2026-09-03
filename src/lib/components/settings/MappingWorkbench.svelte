<script lang="ts">
    import { enhance } from "$app/forms";
    import LinkIcon from "@lucide/svelte/icons/link";
    import SearchIcon from "@lucide/svelte/icons/search";
    import LoaderIcon from "@lucide/svelte/icons/loader";
    import ChevronDownIcon from "@lucide/svelte/icons/chevron-down";
    import * as Popover from "$lib/components/ui/popover/index.js";
    import * as DropdownMenu from "$lib/components/ui/dropdown-menu/index.js";
    import { Button, buttonVariants } from "$lib/components/ui/button/index.js";
    import { cn } from "$lib/utils.js";

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

    const SHARED_VOCABS = ["periodo", "aat", "crm"] as const;

    function sharedVocabName(name: string | null | undefined): string | null {
        const v = (name ?? "").trim().toLowerCase();
        if (v === "periodo" || v === "aat" || v === "crm") return v;
        return null;
    }

    function isSharedVocab(name: string | null | undefined): boolean {
        return sharedVocabName(name) !== null;
    }

    function colKey(entity: string, column: string): string {
        return `${entity}|${column}`.toLowerCase();
    }

    type VocabResult = {
        uri: string;
        label: string;
        vocabulary: string;
        context?: string;
        score: number;
    };

    let {
        columns = [],
        values = [],
        samples = {},
        form = null as any,
    }: {
        columns?: ColumnMappingRow[];
        values?: ValueMappingRow[];
        samples?: Record<string, string[]>;
        form?: any;
    } = $props();

    function isArrayColumn(row: ValueMappingRow): boolean {
        return (
            row.allow_multi === true ||
            (row.column_type ?? "").toLowerCase() === "array"
        );
    }

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

    const navSelectClass = cn(
        buttonVariants({ variant: "ghost", size: "sm" }),
        "gap-1 text-xs font-medium bg-secondary text-foreground hover:bg-secondary max-w-[16rem]",
    );

    const tableOptions = $derived(
        [...new Set(columns.map((c) => c.entity_type))].sort(),
    );

    let tableFilter = $state("");
    let columnFilter = $state("");
    let statusFilter = $state<"all" | "unmapped">("all");
    let expandedKey = $state<string | null>(null);

    const valuesByColumn = $derived.by(() => {
        const map = new Map<string, ValueMappingRow[]>();
        for (const v of values) {
            if (isCompositeLeftover(v)) continue;
            const key = colKey(v.entity_type, v.column_name);
            const list = map.get(key);
            if (list) list.push(v);
            else map.set(key, [v]);
        }
        return map;
    });

    function valuesFor(col: ColumnMappingRow): ValueMappingRow[] {
        return valuesByColumn.get(colKey(col.entity_type, col.column_name)) ?? [];
    }

    function displayRows(col: ColumnMappingRow): ValueMappingRow[] {
        const mapped = valuesFor(col);
        const seen = new Set(mapped.map((m) => m.local_value.toLowerCase()));
        const out = [...mapped];
        for (const s of samples[colKey(col.entity_type, col.column_name)] ?? []) {
            if (seen.has(s.toLowerCase())) continue;
            seen.add(s.toLowerCase());
            out.push({
                entity_type: col.entity_type,
                column_name: col.column_name,
                local_value: s,
                concept_uri: null,
            });
        }
        return out;
    }

    function columnNeedsWork(col: ColumnMappingRow): boolean {
        if (!isSharedVocab(col.vocabulary)) return false;
        const rows = valuesFor(col);
        return rows.length === 0 || rows.some((v) => !v.concept_uri);
    }

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

    const tableColumns = $derived(
        columns.filter((c) => !tableFilter || c.entity_type === tableFilter),
    );

    const queueColumns = $derived(tableColumns.filter(columnNeedsWork));
    const filteredColumns = $derived(
        tableColumns.filter((c) => {
            if (columnFilter && c.column_name !== columnFilter) return false;
            if (statusFilter === "unmapped" && !columnNeedsWork(c)) return false;
            return true;
        }),
    );

    function exampleLabels(col: ColumnMappingRow, limit = 3): string {
        const fromSamples = samples[colKey(col.entity_type, col.column_name)] ?? [];
        const fromMapped = valuesFor(col).map(valueDisplay).filter(Boolean);
        const labels = [...new Set([...fromSamples, ...fromMapped])];
        if (labels.length === 0) return "";
        const shown = labels.slice(0, limit);
        return shown.join(", ") + (labels.length > limit ? "…" : "");
    }

    const queueValues = $derived(
        tableColumns.flatMap((c) =>
            isSharedVocab(c.vocabulary) ? valuesFor(c) : [],
        ),
    );
    const mappedInTable = $derived(
        queueValues.filter((v) => !!v.concept_uri).length,
    );
    const unmappedInTable = $derived(queueValues.length - mappedInTable);
    const pctMapped = $derived(
        queueValues.length > 0
            ? Math.round((mappedInTable / queueValues.length) * 100)
            : 0,
    );

    $effect(() => {
        const keys = new Set(
            filteredColumns.map((c) => colKey(c.entity_type, c.column_name)),
        );
        if (expandedKey && !keys.has(expandedKey)) {
            expandedKey = null;
        }
    });

    const selectedExamples = $derived.by(() => {
        if (!columnFilter) return "";
        const col = tableColumns.find((c) => c.column_name === columnFilter);
        return col ? exampleLabels(col) : "";
    });

    function toggleExpand(col: ColumnMappingRow) {
        const key = colKey(col.entity_type, col.column_name);
        expandedKey = expandedKey === key ? null : key;
    }

    let editingKey = $state<string | null>(null);
    let editConcept = $state("");
    let vocabResults = $state<VocabResult[]>([]);
    let vocabLoading = $state(false);
    let manualSearchQuery = $state("");
    let pickerMode = $state<"search" | "manual">("search");
    let pickerVocabs = $state<string[]>([...SHARED_VOCABS]);
    let searchTimer: ReturnType<typeof setTimeout> | null = null;

    let annotationForm = $state<HTMLFormElement | null>(null);
    let mappingForm = $state<HTMLFormElement | null>(null);
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
            closePicker();
        }
    });

    function closePicker() {
        editingKey = null;
        editConcept = "";
        vocabResults = [];
        vocabLoading = false;
        manualSearchQuery = "";
        pickerMode = "search";
        pickerVocabs = [...SHARED_VOCABS];
        if (searchTimer) clearTimeout(searchTimer);
    }

    async function searchVocab(query: string) {
        const q = query.trim();
        if (!q) {
            vocabResults = [];
            vocabLoading = false;
            return;
        }
        vocabLoading = true;
        vocabResults = [];

        async function fetchVocab(vocab: string) {
            const ctrl = new AbortController();
            const timer = setTimeout(() => ctrl.abort(), 5000);
            try {
                const res = await fetch(
                    `/api/v1/vocab/search?vocab=${vocab}&q=${encodeURIComponent(q)}&limit=10`,
                    { signal: ctrl.signal },
                );
                clearTimeout(timer);
                return res.ok ? await res.json() : [];
            } catch {
                return [];
            }
        }

        const lists = await Promise.all(pickerVocabs.map((v) => fetchVocab(v)));
        vocabResults = lists
            .flat()
            .sort((a: VocabResult, b: VocabResult) => b.score - a.score);
        vocabLoading = false;
    }

    function vocabsForValue(row: ValueMappingRow, col: ColumnMappingRow): string[] {
        const shared =
            sharedVocabName(col.vocabulary) ?? sharedVocabName(row.vocabulary);
        return shared ? [shared] : [...SHARED_VOCABS];
    }

    function valueKey(row: ValueMappingRow): string {
        return `${row.entity_type}|${row.column_name}|${row.local_value}`;
    }

    function openPicker(row: ValueMappingRow, col: ColumnMappingRow) {
        editingKey = valueKey(row);
        editConcept = row.concept_uri ?? "";
        pickerMode = "search";
        pickerVocabs = vocabsForValue(row, col);
        const auto = row.display_label?.trim() || row.local_value;
        manualSearchQuery = auto;
        void searchVocab(auto);
    }

    function onManualQueryInput(value: string) {
        manualSearchQuery = value;
        pickerMode = "search";
        if (searchTimer) clearTimeout(searchTimer);
        searchTimer = setTimeout(() => {
            void searchVocab(value);
        }, 280);
    }

    function startManualEdit() {
        pickerMode = "manual";
        vocabResults = [];
        vocabLoading = false;
    }

    function applyResult(
        row: ValueMappingRow,
        result: VocabResult,
    ) {
        const confidence = String(Math.round(result.score * 100) / 100);
        formData = {
            entity_type: row.entity_type,
            column_name: row.column_name,
            local_value: row.local_value,
            concept_uri: result.uri,
            vocabulary: result.vocabulary,
            crm_property: "",
            crm_range: "",
            confidence,
        };
        const similar = values.filter(
            (m) =>
                !m.concept_uri &&
                m.local_value === row.local_value &&
                m.column_name === row.column_name &&
                m.entity_type !== row.entity_type,
        );
        pendingBulk =
            similar.length > 0
                ? {
                      local_value: row.local_value,
                      column_name: row.column_name,
                      count: similar.length,
                      concept_uri: result.uri,
                      vocabulary: result.vocabulary,
                      confidence,
                  }
                : null;
        closePicker();
        setTimeout(() => mappingForm?.requestSubmit(), 0);
    }

    function submitManual(row: ValueMappingRow, col: ColumnMappingRow) {
        const uri = editConcept.trim();
        if (!uri) return;
        formData = {
            entity_type: row.entity_type,
            column_name: row.column_name,
            local_value: row.local_value,
            concept_uri: uri,
            vocabulary: sharedVocabName(col.vocabulary) ?? sharedVocabName(row.vocabulary) ?? "",
            crm_property: "",
            crm_range: "",
            confidence: "1",
        };
        closePicker();
        setTimeout(() => mappingForm?.requestSubmit(), 0);
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

    function setColumnVocabulary(row: ColumnMappingRow, vocabulary: string) {
        formData = {
            entity_type: row.entity_type,
            column_name: row.column_name,
            local_value: "",
            concept_uri: "",
            vocabulary,
            crm_property: row.crm_property ?? "",
            crm_range: row.crm_range ?? "",
            confidence: "",
        };
        setTimeout(() => annotationForm?.requestSubmit(), 0);
    }

    const searchPlaceholder = $derived.by(() => {
        if (pickerVocabs.length === 1) {
            const names: Record<string, string> = {
                periodo: "PeriodO",
                aat: "AAT",
                crm: "CRM",
            };
            return `Search ${names[pickerVocabs[0]] ?? pickerVocabs[0]}…`;
        }
        return "Search PeriodO, AAT, CRM…";
    });
</script>

<div>
    <form
        method="POST"
        action="?/updateAnnotation"
        use:enhance
        bind:this={annotationForm}
        class="hidden"
    >
        <input type="hidden" name="entity_type" value={formData.entity_type} />
        <input type="hidden" name="column_name" value={formData.column_name} />
        <input type="hidden" name="vocabulary" value={formData.vocabulary} />
        <input type="hidden" name="crm_property" value={formData.crm_property} />
        <input type="hidden" name="crm_range" value={formData.crm_range} />
    </form>
    <form
        method="POST"
        action="?/updateMapping"
        use:enhance
        bind:this={mappingForm}
        class="hidden"
    >
        <input type="hidden" name="entity_type" value={formData.entity_type} />
        <input type="hidden" name="column_name" value={formData.column_name} />
        <input type="hidden" name="local_value" value={formData.local_value} />
        <input type="hidden" name="concept_uri" value={formData.concept_uri} />
        <input type="hidden" name="vocabulary" value={formData.vocabulary} />
        <input type="hidden" name="confidence" value={formData.confidence} />
    </form>

    {#if columns.length === 0 && values.length === 0}
        <div
            class="flex flex-col items-center justify-center rounded-lg border border-dashed border-border py-16"
        >
            <LinkIcon class="size-8 text-muted-foreground/40 mb-3" />
            <p class="text-sm text-muted-foreground mb-1">No columns yet</p>
            <p class="text-xs text-muted-foreground max-w-sm text-center">
                Push a project with tables, then opt columns into PeriodO, AAT,
                or CRM and map their labels here.
            </p>
        </div>
    {:else}
        <div
            class="mb-4 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border border-border bg-secondary/20 px-3 py-2.5"
        >
            <DropdownMenu.Root>
                <DropdownMenu.Trigger class={navSelectClass} aria-label="Table">
                    <span class="truncate">{tableFilter || "Table"}</span>
                    <ChevronDownIcon class="size-3 shrink-0 opacity-60" />
                </DropdownMenu.Trigger>
                <DropdownMenu.Content
                    align="start"
                    class="max-h-72 min-w-44 overflow-y-auto"
                >
                    {#each tableOptions as t}
                        <DropdownMenu.Item
                            class={t === tableFilter
                                ? "bg-secondary font-medium"
                                : ""}
                            onSelect={() => {
                                tableFilter = t;
                                columnFilter = "";
                                expandedKey = null;
                            }}
                        >
                            {t}
                        </DropdownMenu.Item>
                    {/each}
                </DropdownMenu.Content>
            </DropdownMenu.Root>

            <DropdownMenu.Root>
                <DropdownMenu.Trigger class={navSelectClass} aria-label="Column">
                    <span class="min-w-0 truncate text-left">
                        {#if columnFilter}
                            {columnFilter}
                            {#if selectedExamples}
                                <span class="font-normal text-muted-foreground">
                                    · {selectedExamples}</span
                                >
                            {/if}
                        {:else}
                            All columns
                        {/if}
                    </span>
                    <ChevronDownIcon class="size-3 shrink-0 opacity-60" />
                </DropdownMenu.Trigger>
                <DropdownMenu.Content
                    align="start"
                    class="max-h-80 min-w-72 overflow-y-auto"
                >
                    <DropdownMenu.Item
                        class={!columnFilter ? "bg-secondary font-medium" : ""}
                        onSelect={() => (columnFilter = "")}
                    >
                        All columns
                    </DropdownMenu.Item>
                    <DropdownMenu.Separator />
                    {#each tableColumns as col (colKey(col.entity_type, col.column_name))}
                        {@const examples = exampleLabels(col)}
                        <DropdownMenu.Item
                            class={cn(
                                "items-start",
                                columnFilter === col.column_name
                                    ? "bg-secondary font-medium"
                                    : "",
                            )}
                            onSelect={() => (columnFilter = col.column_name)}
                        >
                            <span class="flex min-w-0 flex-col gap-0.5">
                                <span class="truncate">{col.column_name}</span>
                                {#if examples}
                                    <span
                                        class="truncate font-normal text-muted-foreground"
                                        >{examples}</span
                                    >
                                {/if}
                            </span>
                        </DropdownMenu.Item>
                    {/each}
                </DropdownMenu.Content>
            </DropdownMenu.Root>

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
                    {mappedInTable}/{queueValues.length}
                </span>
            </div>
        </div>

        {#if form?.error && (form?.mappingAction || form?.annotationAction)}
            <p
                class="mb-4 rounded-md border border-destructive/25 bg-destructive/5 px-3 py-2 text-sm text-destructive"
            >
                {form.error}
            </p>
        {/if}
        {#if form?.success && (form?.mappingAction || form?.annotationAction)}
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
                class="grid grid-cols-[auto_minmax(0,1fr)_minmax(0,10rem)_minmax(0,5rem)] gap-3 px-4 py-2 bg-secondary/40 border-b border-border text-[11px] font-medium text-muted-foreground uppercase tracking-wide"
            >
                <span class="w-7"></span>
                <span>Column</span>
                <span>Shared vocabulary</span>
                <span>Values</span>
            </div>

            {#if filteredColumns.length === 0}
                <div class="flex flex-col items-center justify-center py-12">
                    <p class="text-sm text-muted-foreground">
                        {statusFilter === "unmapped" &&
                        queueColumns.length === 0
                            ? "No shared-vocabulary columns need URIs. Opt a column in, then push to index values."
                            : "No columns match this filter"}
                    </p>
                    <button
                        type="button"
                        onclick={() => {
                            statusFilter = "all";
                            columnFilter = "";
                        }}
                        class="mt-1 text-xs text-primary hover:underline"
                    >
                        Show all columns
                    </button>
                </div>
            {:else}
                <div class="divide-y divide-border">
                    {#each filteredColumns as col (colKey(col.entity_type, col.column_name))}
                        {@const key = colKey(col.entity_type, col.column_name)}
                        {@const open = expandedKey === key}
                        {@const colValues = displayRows(col)}
                        {@const unmapped = colValues.filter((v) => !v.concept_uri)}
                        {@const shared = isSharedVocab(col.vocabulary)}
                        <div>
                            <div
                                class="grid grid-cols-[auto_minmax(0,1fr)_minmax(0,10rem)_minmax(0,5rem)] gap-3 items-center px-4 py-2.5 text-sm"
                            >
                                <button
                                    type="button"
                                    class="flex size-7 items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
                                    aria-expanded={open}
                                    aria-label={open
                                        ? "Collapse values"
                                        : "Show values"}
                                    onclick={() => toggleExpand(col)}
                                >
                                    <ChevronDownIcon
                                        class="size-3.5 transition-transform {open
                                            ? 'rotate-180'
                                            : ''}"
                                    />
                                </button>
                                <button
                                    type="button"
                                    class="min-w-0 text-left truncate font-medium text-foreground hover:underline"
                                    onclick={() => toggleExpand(col)}
                                >
                                    {col.column_name}
                                </button>
                                <select
                                    class="{selectClass} min-w-0 max-w-full"
                                    value={col.vocabulary ?? ""}
                                    aria-label="Shared vocabulary for {col.column_name}"
                                    onchange={(e) =>
                                        setColumnVocabulary(
                                            col,
                                            (
                                                e.currentTarget as HTMLSelectElement
                                            ).value,
                                        )}
                                >
                                    <option value="">Local (none)</option>
                                    {#if col.vocabulary && !shared}
                                        <option value={col.vocabulary}
                                            >{col.vocabulary} (local)</option
                                        >
                                    {/if}
                                    <option value="periodo">PeriodO</option>
                                    <option value="aat">AAT</option>
                                    <option value="crm">CIDOC CRM</option>
                                </select>
                                <span
                                    class="text-xs text-muted-foreground tabular-nums"
                                >
                                    {#if colValues.length === 0}
                                        {shared ? "not indexed" : "—"}
                                    {:else}
                                        {colValues.length - unmapped.length}/{colValues.length}
                                    {/if}
                                </span>
                            </div>

                            {#if open}
                                <div
                                    class="border-t border-border bg-secondary/10 px-4 py-3"
                                >
                    {#if colValues.length === 0}
                        <p class="text-xs text-muted-foreground">
                            No values found in this column.
                        </p>
                    {:else}
                                    <div
                                        class="grid grid-cols-[minmax(0,1.4fr)_minmax(0,0.4fr)_minmax(0,1.4fr)_auto] gap-3 px-1 pb-1.5 text-[11px] font-medium text-muted-foreground uppercase tracking-wide"
                                    >
                                        <span>Value</span>
                                        <span>Count</span>
                                        <span>Concept</span>
                                        <span class="w-7"></span>
                                    </div>
                                    <div class="divide-y divide-border/60">
                                        {#each colValues as row (valueKey(row))}
                                            {@const vKey = valueKey(row)}
                                            {@const editing = editingKey === vKey}
                                            {@const mapped = !!row.concept_uri}

                                            <div
                                                class="grid grid-cols-[minmax(0,1.4fr)_minmax(0,0.4fr)_minmax(0,1.4fr)_auto] gap-3 items-center py-2 text-sm"
                                            >
                                                <div class="min-w-0">
                                                    <span
                                                        class="truncate font-medium text-foreground block"
                                                        >{valueDisplay(row)}</span
                                                    >
                                                    {#if valueSubtext(row)}
                                                        <span
                                                            class="truncate text-[11px] text-muted-foreground font-mono"
                                                            >{valueSubtext(
                                                                row,
                                                            )}</span
                                                        >
                                                    {/if}
                                                    {#if isArrayColumn(row)}
                                                        <span
                                                            class="mt-0.5 inline-block rounded border border-border px-1 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground"
                                                            >multi</span
                                                        >
                                                    {/if}
                                                </div>
                                                <span
                                                    class="tabular-nums text-muted-foreground text-xs"
                                                    >{row.entity_count ?? "—"}</span
                                                >
                                                <span
                                                    class="truncate {mapped
                                                        ? 'font-mono text-xs text-foreground'
                                                        : 'italic text-xs text-muted-foreground/50'}"
                                                >
                                                    {mapped
                                                        ? row.concept_uri
                                                        : "unmapped"}
                                                </span>

                                                <Popover.Root
                                                    open={editing}
                                                    onOpenChange={(next) => {
                                                        if (next)
                                                            openPicker(row, col);
                                                        else if (
                                                            editingKey === vKey
                                                        )
                                                            closePicker();
                                                    }}
                                                >
                                                    <Popover.Trigger
                                                        class="flex size-7 items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
                                                        title={mapped
                                                            ? "Edit concept URI"
                                                            : "Link local label to a shared concept"}
                                                    >
                                                        <SearchIcon
                                                            class="size-3.5"
                                                        />
                                                    </Popover.Trigger>
                                                    <Popover.Content
                                                        class="w-80 p-0"
                                                        align="end"
                                                        sideOffset={6}
                                                    >
                                                        <div
                                                            class="border-b border-border p-2.5 space-y-2"
                                                        >
                                                            <div
                                                                class="flex items-center gap-1.5"
                                                            >
                                                                <button
                                                                    type="button"
                                                                    onclick={() =>
                                                                        (pickerMode =
                                                                            "search")}
                                                                    class="rounded px-2 py-1 text-[11px] font-medium transition-colors {pickerMode ===
                                                                    'search'
                                                                        ? 'bg-foreground text-background'
                                                                        : 'text-muted-foreground hover:bg-muted'}"
                                                                >
                                                                    Search
                                                                </button>
                                                                <button
                                                                    type="button"
                                                                    onclick={startManualEdit}
                                                                    class="rounded px-2 py-1 text-[11px] font-medium transition-colors {pickerMode ===
                                                                    'manual'
                                                                        ? 'bg-foreground text-background'
                                                                        : 'text-muted-foreground hover:bg-muted'}"
                                                                >
                                                                    Manual
                                                                </button>
                                                            </div>
                                                            {#if pickerMode === "search"}
                                                                <div
                                                                    class="relative"
                                                                >
                                                                    <SearchIcon
                                                                        class="absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground"
                                                                    />
                                                                    <input
                                                                        type="search"
                                                                        value={manualSearchQuery}
                                                                        oninput={(e) =>
                                                                            onManualQueryInput(
                                                                                (
                                                                                    e.currentTarget as HTMLInputElement
                                                                                )
                                                                                    .value,
                                                                            )}
                                                                        placeholder={searchPlaceholder}
                                                                        class="h-8 w-full rounded-md border border-input bg-background pl-7 pr-2 text-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                                                                    />
                                                                </div>
                                                            {:else}
                                                                <input
                                                                    type="text"
                                                                    bind:value={editConcept}
                                                                    placeholder="concept URI"
                                                                    class="h-8 w-full rounded-md border border-input bg-background px-2 font-mono text-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                                                                />
                                                                <div
                                                                    class="flex justify-end gap-1.5"
                                                                >
                                                                    <Button
                                                                        type="button"
                                                                        variant="ghost"
                                                                        size="xs"
                                                                        onclick={closePicker}
                                                                    >
                                                                        Cancel
                                                                    </Button>
                                                                    <Button
                                                                        type="button"
                                                                        size="xs"
                                                                        onclick={() =>
                                                                            submitManual(
                                                                                row,
                                                                                col,
                                                                            )}
                                                                    >
                                                                        Save
                                                                    </Button>
                                                                </div>
                                                            {/if}
                                                        </div>

                                                        {#if pickerMode === "search"}
                                                            <div
                                                                class="max-h-56 overflow-y-auto p-1.5"
                                                            >
                                                                {#if vocabLoading}
                                                                    <div
                                                                        class="flex items-center gap-2 px-2 py-4 text-xs text-muted-foreground"
                                                                    >
                                                                        <LoaderIcon
                                                                            class="size-3.5 animate-spin"
                                                                        />
                                                                        Searching…
                                                                    </div>
                                                                {:else if vocabResults.length > 0}
                                                                    {#each vocabResults as result}
                                                                        <button
                                                                            type="button"
                                                                            onclick={() =>
                                                                                applyResult(
                                                                                    row,
                                                                                    result,
                                                                                )}
                                                                            class="w-full flex items-center justify-between gap-3 rounded-md px-2.5 py-2 text-left text-xs hover:bg-accent transition-colors"
                                                                        >
                                                                            <div
                                                                                class="min-w-0"
                                                                            >
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
                                                                                    result.score *
                                                                                        100,
                                                                                )}%</span
                                                                            >
                                                                        </button>
                                                                    {/each}
                                                                {:else}
                                                                    <p
                                                                        class="px-2 py-4 text-xs text-muted-foreground"
                                                                    >
                                                                        {manualSearchQuery.trim()
                                                                            ? "No matching terms. Try another query or switch to Manual."
                                                                            : "Type to search vocabularies."}
                                                                    </p>
                                                                {/if}
                                                            </div>
                                                        {/if}
                                                    </Popover.Content>
                                                </Popover.Root>
                                            </div>
                                        {/each}
                                    </div>
                                {/if}
                                </div>
                            {/if}
                        </div>
                    {/each}
                </div>
            {/if}
        </div>
    {/if}
</div>
