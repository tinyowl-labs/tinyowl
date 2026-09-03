<script lang="ts">
    import XIcon from "@lucide/svelte/icons/x";
    import { Button } from "$lib/components/ui/button/index.js";
    import { Field, FieldLabel } from "$lib/components/ui/field/index.js";
    import { Input } from "$lib/components/ui/input/index.js";
    import type { DrawGeomMode } from "$lib/stores/editBuffer.svelte";

    type Props = {
        layer: string;
        geomType: DrawGeomMode;
        fields?: string[];
        onConfirm?: (attrs: Record<string, string>) => void;
        onCancel?: () => void;
    };

    let {
        layer,
        geomType,
        fields = [],
        onConfirm,
        onCancel,
    }: Props = $props();

    let values = $state<Record<string, string>>({});

    $effect(() => {
        const next: Record<string, string> = {};
        for (const f of fields) next[f] = "";
        values = next;
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
            <p class="font-medium text-foreground">New feature</p>
            <p class="mt-0.5 truncate text-[11px] text-muted-foreground">
                {geomType} on {layer}
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
                No attribute columns. Save to keep geometry in the session
                buffer.
            </p>
        {:else}
            {#each fields as name}
                <Field>
                    <FieldLabel class="text-[11px]">{name}</FieldLabel>
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
                </Field>
            {/each}
        {/if}
    </div>

    <div class="flex shrink-0 justify-end gap-1.5 border-t border-border p-2">
        <Button variant="ghost" size="sm" type="button" onclick={cancel}
            >Discard</Button
        >
        <Button size="sm" type="submit">Add to buffer</Button>
    </div>
</form>
