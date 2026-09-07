<script lang="ts">
    import XIcon from "@lucide/svelte/icons/x";
    import { Button } from "$lib/components/ui/button/index.js";
    import { Field, FieldLabel } from "$lib/components/ui/field/index.js";
    import { Input } from "$lib/components/ui/input/index.js";
    import type { DrawGeomMode } from "$lib/stores/editBuffer.svelte";

    type LookupOpt = { id: string; label: string };
    type SchemaEdge = {
        source: string;
        target: string;
        source_column: string;
        kind?: string;
    };

    type Props = {
        layer: string;
        geomType: DrawGeomMode;
        fields?: string[];
        mode?: "create" | "edit";
        entityId?: string;
        initial?: Record<string, string>;
        slug?: string;
        accessToken?: string;
        onConfirm?: (attrs: Record<string, string>) => void;
        onCancel?: () => void;
    };

    let {
        layer,
        geomType,
        fields = [],
        mode = "create",
        entityId = "",
        initial = {},
        slug = "",
        accessToken = "",
        onConfirm,
        onCancel,
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
        void (async () => {
            try {
                const headers: Record<string, string> = {};
                if (token) headers.Authorization = `Bearer ${token}`;
                const res = await fetch(
                    `/api/v1/projects/${encodeURIComponent(slug)}/schema`,
                    { headers },
                );
                if (!res.ok) return;
                const json = (await res.json()) as { edges?: SchemaEdge[] };
                const next: Record<string, LookupOpt[]> = {};
                await Promise.all(
                    cols.map(async (name) => {
                        const edge = (json.edges ?? []).find(
                            (e) =>
                                e.kind === "fk" &&
                                e.source === table &&
                                e.source_column === name,
                        );
                        if (!edge?.target) return;
                        const rowsRes = await fetch(
                            `/api/v1/projects/${encodeURIComponent(slug)}/tables/${encodeURIComponent(edge.target)}/rows`,
                            { headers },
                        );
                        if (!rowsRes.ok) return;
                        const body = (await rowsRes.json()) as {
                            rows?: Record<string, unknown>[];
                        };
                        next[name] = (body.rows ?? []).map((row) => {
                            const id = String(row.source_id ?? "");
                            const label = lookupLabel(row, id);
                            return { id, label };
                        });
                    }),
                );
                lookups = next;
            } catch {
                lookups = {};
            }
        })();
    });

    function lookupLabel(row: Record<string, unknown>, fallback: string) {
        for (const k of ["label", "name", "title", "code"]) {
            const v = row[k];
            if (v != null && String(v).trim() !== "") return String(v);
        }
        return fallback;
    }

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
</script>

<form
    class="pointer-events-auto flex max-h-[min(22rem,45vh)] min-h-0 w-60 shrink-0 flex-col overflow-hidden rounded-lg border border-border bg-background/95 text-xs shadow-lg backdrop-blur-sm"
    onsubmit={(e) => {
        e.preventDefault();
        confirm();
    }}
>
    <div class="flex shrink-0 items-start justify-between gap-2 border-b border-border px-2 py-1.5">
        <div class="min-w-0">
            <p class="font-medium text-foreground">
                {mode === "edit" ? "Edit attributes" : "New feature"}
            </p>
            <p class="mt-0.5 truncate text-[11px] text-muted-foreground">
                {#if mode === "edit"}
                    {layer}{entityId ? ` · ${entityId}` : ""}
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
                    : "No attribute columns. Save to keep geometry in the session buffer."}
            </p>
        {:else}
            {#each fields as name}
                <Field>
                    <FieldLabel class="text-[11px]">{name}</FieldLabel>
                    {#if lookups[name]}
                        <select
                            class="h-8 w-full rounded-md border border-input bg-background px-2 text-sm"
                            value={values[name] ?? ""}
                            onchange={(e) =>
                                setField(
                                    name,
                                    (e.currentTarget as HTMLSelectElement)
                                        .value,
                                )}
                        >
                            <option value="">—</option>
                            {#each lookups[name] as opt}
                                <option value={opt.id}>{opt.label}</option>
                            {/each}
                        </select>
                    {:else}
                        <Input
                            class="h-8 text-sm"
                            value={values[name] ?? ""}
                            autocomplete="off"
                            oninput={(e) =>
                                setField(
                                    name,
                                    (e.currentTarget as HTMLInputElement).value,
                                )}
                        />
                    {/if}
                </Field>
            {/each}
        {/if}
    </div>

    <div class="flex shrink-0 justify-end gap-1.5 border-t border-border p-2">
        <Button variant="ghost" size="sm" type="button" onclick={cancel}
            >{mode === "edit" ? "Cancel" : "Discard"}</Button
        >
        <Button size="sm" type="submit"
            >{mode === "edit" ? "Save to buffer" : "Add to buffer"}</Button
        >
    </div>
</form>
