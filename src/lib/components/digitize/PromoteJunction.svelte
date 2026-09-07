<script lang="ts">
    type SchemaTable = {
        name: string;
        label?: string;
        columns: { name: string; type: string; pk?: boolean }[];
        count: number;
    };

    type Props = {
        accessToken: string;
        slug: string;
        tables: SchemaTable[];
        onSaved?: () => void;
    };

    let { accessToken, slug, tables, onSaved }: Props = $props();

    let junctionTable = $state("");
    let message = $state("");
    let busy = $state(false);
    let error = $state("");
    let ok = $state("");

    let fromId = $state("");
    let toId = $state("");
    let addMessage = $state("");

    let sourceTable = $derived(tables[0]?.name ?? "");
    const sourceCols = $derived(
        tables.find((t) => t.name === sourceTable)?.columns ?? [],
    );
    let sourceColumn = $derived.by(() => {
        const pick =
            sourceCols.find(
                (c) =>
                    !c.pk &&
                    c.name !== "entity_type" &&
                    c.name !== "source_id" &&
                    c.name !== "geom" &&
                    c.name !== "geometry" &&
                    c.name !== "from_id" &&
                    c.name !== "to_id",
            ) ?? sourceCols[0];
        return pick?.name ?? "";
    });
    let targetTable = $derived(sourceTable);

    const junctionTables = $derived(
        tables.filter((t) => {
            const names = new Set(t.columns.map((c) => c.name));
            return names.has("from_id") && names.has("to_id");
        }),
    );
    let addTable = $derived(junctionTables[0]?.name ?? "");

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
                `/api/v1/projects/${encodeURIComponent(slug)}/schema/promote-junction`,
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
                        junction_table: junctionTable.trim() || undefined,
                        target_table: targetTable.trim() || undefined,
                        message: message.trim(),
                    }),
                },
            );
            const data = (await res.json().catch(() => ({}))) as {
                error?: string;
                junction_table?: string;
                junction_rows?: number;
                unresolved?: number;
            };
            if (!res.ok) {
                throw new Error(data.error || `Promote failed (${res.status})`);
            }
            const extra =
                data.unresolved && data.unresolved > 0
                    ? `; ${data.unresolved} token(s) unmatched`
                    : "";
            ok = `Promoted ${sourceTable}.${sourceColumn} → ${data.junction_table} (${data.junction_rows ?? 0} links${extra})`;
            addTable = data.junction_table || addTable;
            onSaved?.();
        } catch (err) {
            error = err instanceof Error ? err.message : "Promote failed";
        } finally {
            busy = false;
        }
    }

    async function addLink() {
        error = "";
        ok = "";
        if (!addTable || !fromId.trim() || !toId.trim()) {
            error = "Pick a junction table and both source_ids";
            return;
        }
        const msg =
            addMessage.trim() ||
            `add link ${fromId.trim()} → ${toId.trim()} in ${addTable}`;
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
                                entityId: "draft-junction",
                                attributes: {
                                    from_id: fromId.trim(),
                                    to_id: toId.trim(),
                                },
                            },
                        ],
                    }),
                },
            );
            const data = (await res.json().catch(() => ({}))) as {
                error?: string;
            };
            if (!res.ok) {
                throw new Error(data.error || `Add failed (${res.status})`);
            }
            ok = `Added link in ${addTable}`;
            fromId = "";
            toId = "";
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
        Import a table before promoting a many-to-many column.
    </p>
{:else}
    <div class="flex flex-col gap-4">
        <div>
            <h3 class="text-sm font-semibold text-foreground">
                Promote to junction
            </h3>
            <p class="text-xs text-muted-foreground mt-0.5">
                Split a delimited cell (e.g. <code class="font-mono">104, 105</code>)
                into link rows. The cell is frozen — add more parents as junction
                rows, not CSV edits.
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
                <span class="text-muted-foreground">Delimited column</span>
                <select
                    class="rounded-md border border-input bg-background px-2 py-2 text-sm font-mono"
                    bind:value={sourceColumn}
                >
                    {#each sourceCols as c (c.name)}
                        <option value={c.name}>{c.name}</option>
                    {/each}
                </select>
            </label>
            <label class="flex flex-col gap-1 text-xs">
                <span class="text-muted-foreground">Points at</span>
                <select
                    class="rounded-md border border-input bg-background px-2 py-2 text-sm"
                    bind:value={targetTable}
                >
                    {#each tables as t (t.name)}
                        <option value={t.name}>{t.label || t.name}</option>
                    {/each}
                </select>
            </label>
            <label class="flex flex-col gap-1 text-xs">
                <span class="text-muted-foreground"
                    >Junction name (optional)</span
                >
                <input
                    class="rounded-md border border-input bg-background px-2 py-2 text-sm font-mono"
                    placeholder="{sourceTable || 'table'}_{sourceColumn ||
                        'rel'}"
                    bind:value={junctionTable}
                />
            </label>
            <label class="flex flex-col gap-1 text-xs">
                <span class="text-muted-foreground">Commit message</span>
                <input
                    class="rounded-md border border-input bg-background px-2 py-2 text-sm"
                    placeholder="promote below to junction"
                    bind:value={message}
                />
            </label>
            <button
                type="button"
                class="rounded bg-primary/90 px-2 py-1.5 text-[11px] font-medium text-primary-foreground disabled:opacity-50"
                disabled={busy}
                onclick={() => void promote()}
            >
                Promote to junction
            </button>
        </div>

        {#if junctionTables.length}
            <div class="border-t border-border pt-3 space-y-3">
                <h4 class="text-xs font-semibold text-foreground">Add a link</h4>
                <p class="text-[11px] text-muted-foreground">
                    Paste each row’s <code class="font-mono">source_id</code>. A
                    second parent is another row here.
                </p>
                <label class="flex flex-col gap-1 text-xs">
                    <span class="text-muted-foreground">Junction table</span>
                    <select
                        class="rounded-md border border-input bg-background px-2 py-2 text-sm"
                        bind:value={addTable}
                    >
                        {#each junctionTables as t (t.name)}
                            <option value={t.name}>{t.label || t.name}</option>
                        {/each}
                    </select>
                </label>
                <label class="flex flex-col gap-1 text-xs">
                    <span class="text-muted-foreground">From source_id</span>
                    <input
                        class="rounded-md border border-input bg-background px-2 py-2 text-sm font-mono"
                        placeholder="child"
                        bind:value={fromId}
                    />
                </label>
                <label class="flex flex-col gap-1 text-xs">
                    <span class="text-muted-foreground">To source_id</span>
                    <input
                        class="rounded-md border border-input bg-background px-2 py-2 text-sm font-mono"
                        placeholder="parent"
                        bind:value={toId}
                    />
                </label>
                <label class="flex flex-col gap-1 text-xs">
                    <span class="text-muted-foreground"
                        >Commit message (optional)</span
                    >
                    <input
                        class="rounded-md border border-input bg-background px-2 py-2 text-sm"
                        placeholder="add second parent"
                        bind:value={addMessage}
                    />
                </label>
                <button
                    type="button"
                    class="rounded bg-secondary px-2 py-1.5 text-[11px] font-medium text-foreground disabled:opacity-50"
                    disabled={busy}
                    onclick={() => void addLink()}
                >
                    Add link on develop
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
