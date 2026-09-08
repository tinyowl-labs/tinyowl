<script lang="ts">
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
        kind?: string;
    };

    type Props = {
        accessToken: string;
        slug: string;
        tables: SchemaTable[];
        edges?: SchemaEdge[];
        focusTable?: string;
        onSaved?: () => void;
    };

    let {
        accessToken,
        slug,
        tables,
        edges = [],
        focusTable = "",
        onSaved,
    }: Props = $props();

    let sourceTable = $derived(
        (focusTable && tables.some((t) => t.name === focusTable)
            ? focusTable
            : tables[0]?.name) ?? "",
    );
    let sourceColumn = $state("");
    let lookupTable = $state("");
    let message = $state("");
    let busy = $state(false);
    let error = $state("");
    let ok = $state("");

    let addTable = $state("");
    let addLabel = $state("");
    let addMessage = $state("");

    const sourceCols = $derived(
        tables.find((t) => t.name === sourceTable)?.columns ?? [],
    );

    $effect(() => {
        if (
            sourceCols.length &&
            !sourceCols.some((c) => c.name === sourceColumn)
        ) {
            const pick =
                sourceCols.find(
                    (c) =>
                        !c.pk &&
                        c.name !== "entity_type" &&
                        c.name !== "source_id" &&
                        c.name !== "geom" &&
                        c.name !== "geometry",
                ) ?? sourceCols[0];
            sourceColumn = pick?.name ?? "";
        }
    });

    const alreadyLinked = $derived(
        new Set(
            edges
                .filter((e) => e.kind === "fk")
                .map((e) => `${e.source}.${e.source_column}`),
        ),
    );

    const lookupTables = $derived(
        tables.filter(
            (t) =>
                t.name.endsWith("_types") ||
                t.columns.some((c) => c.name === "label"),
        ),
    );

    $effect(() => {
        if (!addTable && lookupTables.length) addTable = lookupTables[0].name;
    });

    async function promote() {
        error = "";
        ok = "";
        if (!sourceTable || !sourceColumn) {
            error = "Pick a table and column";
            return;
        }
        if (!message.trim()) {
            error = "Commit message required";
            return;
        }
        busy = true;
        try {
            const res = await fetch(
                `/api/v1/projects/${encodeURIComponent(slug)}/schema/promote-enum`,
                {
                    method: "POST",
                    headers: {
                        Authorization: `Bearer ${accessToken}`,
                        "Content-Type": "application/json",
                        "X-TinyOwl-Message": message.trim(),
                    },
                    body: JSON.stringify({
                        entity_type: sourceTable,
                        column_name: sourceColumn,
                        lookup_table: lookupTable.trim() || undefined,
                        message: message.trim(),
                    }),
                },
            );
            const data = (await res.json().catch(() => ({}))) as {
                error?: string;
                lookup_table?: string;
                lookup_values?: number;
            };
            if (!res.ok) {
                throw new Error(data.error || `Promote failed (${res.status})`);
            }
            ok = `Promoted ${sourceTable}.${sourceColumn} → ${data.lookup_table} (${data.lookup_values ?? 0} values)`;
            addTable = data.lookup_table || addTable;
            onSaved?.();
        } catch (err) {
            error = err instanceof Error ? err.message : "Promote failed";
        } finally {
            busy = false;
        }
    }

    async function addTerm() {
        error = "";
        ok = "";
        if (!addTable || !addLabel.trim()) {
            error = "Pick a lookup table and a label";
            return;
        }
        const msg = addMessage.trim() || `add ${addLabel.trim()} to ${addTable}`;
        busy = true;
        try {
            const res = await fetch(
                `/api/v1/projects/${encodeURIComponent(slug)}/edit-buffer`,
                {
                    method: "POST",
                    headers: {
                        Authorization: `Bearer ${accessToken}`,
                        "Content-Type": "application/json",
                        "X-TinyOwl-Message": msg,
                    },
                    body: JSON.stringify({
                        message: msg,
                        entries: [
                            {
                                op: "insert",
                                table: addTable,
                                entityId: "draft-lookup",
                                attributes: { label: addLabel.trim() },
                            },
                        ],
                    }),
                },
            );
            const data = (await res.json().catch(() => ({}))) as {
                error?: string;
                status?: string;
            };
            if (!res.ok) {
                throw new Error(data.error || `Add failed (${res.status})`);
            }
            ok = `Added “${addLabel.trim()}” to ${addTable}`;
            addLabel = "";
            onSaved?.();
        } catch (err) {
            error = err instanceof Error ? err.message : "Add failed";
        } finally {
            busy = false;
        }
    }
</script>

{#if tables.length < 1}
    <p class="text-sm text-muted-foreground">
        Import a table before promoting a closed list.
    </p>
{:else}
    <div class="flex flex-col gap-4">
        <div>
            <h3 class="text-sm font-semibold text-foreground">
                Promote to lookup
            </h3>
            <p class="text-xs text-muted-foreground mt-0.5">
                Copy distinct values into a lookup table. New terms are extra
                rows, not a TOML edit.
            </p>
        </div>

        <div class="grid gap-3">
            <label class="flex flex-col gap-1 text-xs">
                <span class="text-muted-foreground">Table</span>
                <select
                    class="rounded-md border border-input bg-background px-2 py-2 text-sm"
                    bind:value={sourceTable}
                >
                    {#each tables as t (t.name)}
                        <option value={t.name}>{t.label || t.name}</option>
                    {/each}
                </select>
            </label>
            <label class="flex flex-col gap-1 text-xs">
                <span class="text-muted-foreground">Closed-list column</span>
                <select
                    class="rounded-md border border-input bg-background px-2 py-2 text-sm font-mono"
                    bind:value={sourceColumn}
                >
                    {#each sourceCols as c (c.name)}
                        <option value={c.name}
                            >{c.name}{alreadyLinked.has(
                                `${sourceTable}.${c.name}`,
                            )
                                ? " (linked)"
                                : ""}</option
                        >
                    {/each}
                </select>
            </label>
            <label class="flex flex-col gap-1 text-xs">
                <span class="text-muted-foreground"
                    >Lookup table name (optional)</span
                >
                <input
                    class="rounded-md border border-input bg-background px-2 py-2 text-sm font-mono"
                    placeholder="{sourceColumn || 'column'}_types"
                    bind:value={lookupTable}
                />
            </label>
            <label class="flex flex-col gap-1 text-xs">
                <span class="text-muted-foreground">Commit message</span>
                <input
                    class="rounded-md border border-input bg-background px-2 py-2 text-sm"
                    placeholder="promote context_type to lookup"
                    bind:value={message}
                />
            </label>
            <button
                type="button"
                class="rounded bg-primary/90 px-2 py-1.5 text-[11px] font-medium text-primary-foreground disabled:opacity-50"
                disabled={busy}
                onclick={() => void promote()}
            >
                Promote to lookup
            </button>
        </div>

        {#if lookupTables.length}
            <div class="border-t border-border pt-3 space-y-3">
                <h4 class="text-xs font-semibold text-foreground">
                    Add lookup term
                </h4>
                <label class="flex flex-col gap-1 text-xs">
                    <span class="text-muted-foreground">Lookup table</span>
                    <select
                        class="rounded-md border border-input bg-background px-2 py-2 text-sm"
                        bind:value={addTable}
                    >
                        {#each lookupTables as t (t.name)}
                            <option value={t.name}>{t.label || t.name}</option>
                        {/each}
                    </select>
                </label>
                <label class="flex flex-col gap-1 text-xs">
                    <span class="text-muted-foreground">Label</span>
                    <input
                        class="rounded-md border border-input bg-background px-2 py-2 text-sm"
                        placeholder="occupation"
                        bind:value={addLabel}
                    />
                </label>
                <label class="flex flex-col gap-1 text-xs">
                    <span class="text-muted-foreground"
                        >Commit message (optional)</span
                    >
                    <input
                        class="rounded-md border border-input bg-background px-2 py-2 text-sm"
                        placeholder="add occupation type"
                        bind:value={addMessage}
                    />
                </label>
                <button
                    type="button"
                    class="rounded bg-secondary px-2 py-1.5 text-[11px] font-medium text-foreground disabled:opacity-50"
                    disabled={busy}
                    onclick={() => void addTerm()}
                >
                    Add term on develop
                </button>
            </div>
        {/if}

        {#if error}
            <p class="text-xs text-destructive">{error}</p>
        {/if}
        {#if ok}
            <p class="text-xs text-muted-foreground">{ok}</p>
        {/if}
    </div>
{/if}
