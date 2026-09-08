<script lang="ts">
    import XIcon from "@lucide/svelte/icons/x";
    import { Button } from "$lib/components/ui/button/index.js";
    import { Field, FieldLabel } from "$lib/components/ui/field/index.js";
    import type { DrawGeomMode } from "$lib/stores/editBuffer.svelte";
    import {
        loadFkLookups,
        type LookupOpt,
        type SchemaTableKind,
    } from "$lib/project/schemaFields";
    import SchemaField from "./SchemaField.svelte";
    import JunctionRelated from "./JunctionRelated.svelte";

    type Props = {
        layer: string;
        geomType?: DrawGeomMode | "none";
        fields?: string[];
        mode?: "create" | "edit";
        entityId?: string;
        initial?: Record<string, string>;
        slug?: string;
        accessToken?: string;
        schemaTables?: SchemaTableKind[];
        rows?: Record<string, Record<string, unknown>[]>;
        onConfirm?: (attrs: Record<string, string>) => void;
        onCancel?: () => void;
        onOpenRelated?: (table: string, id: string) => void;
    };

    let {
        layer,
        geomType = "none",
        fields = [],
        mode = "create",
        entityId = "",
        initial = {},
        slug = "",
        accessToken = "",
        schemaTables = [],
        rows = {},
        onConfirm,
        onCancel,
        onOpenRelated,
    }: Props = $props();

    let values = $state<Record<string, string>>({});
    let lastSeed = "";
    let lookups = $state<Record<string, LookupOpt[]>>({});

    $effect(() => {
        const seed = `${fields.join("|")}\0${JSON.stringify(initial)}`;
        if (seed === lastSeed) return;
        lastSeed = seed;
        const next: Record<string, string> = {};
        for (const f of fields) next[f] = initial[f] ?? "";
        values = next;
    });

    $effect(() => {
        if (!slug || !layer || fields.length === 0) {
            lookups = {};
            return;
        }
        const table = layer;
        const cols = [...fields];
        const token = accessToken;
        void loadFkLookups({
            slug,
            table,
            columns: cols,
            accessToken: token,
        }).then((next) => {
            lookups = next;
        });
    });

    function confirm() {
        const attrs: Record<string, string> = {};
        for (const [k, v] of Object.entries(values)) {
            if (v.trim() !== "") attrs[k] = v;
        }
        onConfirm?.(attrs);
    }

    function cancel() {
        onCancel?.();
    }

    function setField(name: string, value: string) {
        values = { ...values, [name]: value };
    }

    const attrOnly = $derived(geomType === "none");
</script>

<form
    class="surface pointer-events-auto flex max-h-[min(22rem,45vh)] min-h-0 w-60 shrink-0 flex-col overflow-hidden rounded-lg border border-border text-xs shadow-lg"
    onsubmit={(e) => {
        e.preventDefault();
        confirm();
    }}
>
    <div
        class="flex shrink-0 items-start justify-between gap-2 border-b border-border px-2 py-1.5"
    >
        <div class="min-w-0">
            <p class="font-medium text-foreground">
                {mode === "edit"
                    ? "Edit attributes"
                    : attrOnly
                      ? "New row"
                      : "New feature"}
            </p>
            <p class="mt-0.5 truncate text-[11px] text-muted-foreground">
                {#if mode === "edit"}
                    {layer}{entityId ? ` · ${entityId}` : ""}
                {:else if attrOnly}
                    {layer}
                {:else}
                    {geomType} on {layer}
                {/if}
            </p>
        </div>
        <button
            type="button"
            class="rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
            aria-label="Discard"
            onclick={cancel}
        >
            <XIcon class="size-3.5" />
        </button>
    </div>

    <div class="min-h-0 flex-1 space-y-2 overflow-y-auto p-2">
        {#if fields.length === 0}
            <p class="text-[11px] text-muted-foreground">
                {mode === "edit"
                    ? "No editable attribute columns on this table."
                    : attrOnly
                      ? "No attribute columns."
                      : "No attribute columns. Add to keep geometry in this session."}
            </p>
        {:else}
            {#each fields as name (name)}
                <Field>
                    <FieldLabel class="text-[11px]">{name}</FieldLabel>
                    <SchemaField
                        value={values[name] ?? ""}
                        options={lookups[name]}
                        onInput={(v) => setField(name, v)}
                        onCommit={(v) => setField(name, v)}
                    />
                </Field>
            {/each}
        {/if}
        {#if mode === "edit"}
            <JunctionRelated
                table={layer}
                {entityId}
                {schemaTables}
                {rows}
                {onOpenRelated}
            />
        {/if}
    </div>

    <div class="flex shrink-0 justify-end gap-1.5 border-t border-border p-2">
        <Button variant="ghost" size="sm" type="button" onclick={cancel}
            >Discard</Button
        >
        <Button size="sm" type="submit">Add</Button>
    </div>
</form>
