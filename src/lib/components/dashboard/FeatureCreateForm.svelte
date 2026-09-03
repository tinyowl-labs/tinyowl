<script lang="ts">
    import { Dialog } from "bits-ui";
    import XIcon from "@lucide/svelte/icons/x";
    import { Button } from "$lib/components/ui/button/index.js";
    import { Field, FieldLabel } from "$lib/components/ui/field/index.js";
    import { Input } from "$lib/components/ui/input/index.js";
    import type { DrawGeomMode } from "$lib/stores/editBuffer.svelte";

    type Props = {
        open?: boolean;
        layer: string;
        geomType: DrawGeomMode;
        fields?: string[];
        onConfirm?: (attrs: Record<string, string>) => void;
        onCancel?: () => void;
    };

    let {
        open = $bindable(false),
        layer,
        geomType,
        fields = [],
        onConfirm,
        onCancel,
    }: Props = $props();

    let values = $state<Record<string, string>>({});
    let confirmed = false;

    $effect(() => {
        if (!open) return;
        confirmed = false;
        const next: Record<string, string> = {};
        for (const f of fields) next[f] = "";
        values = next;
    });

    function confirm() {
        confirmed = true;
        const attrs: Record<string, string> = {};
        for (const [k, v] of Object.entries(values)) {
            if (v.trim() !== "") attrs[k] = v;
        }
        onConfirm?.(attrs);
        open = false;
    }

    function cancel() {
        if (confirmed) return;
        onCancel?.();
        open = false;
    }

    function setField(name: string, value: string) {
        values = { ...values, [name]: value };
    }
</script>

<Dialog.Root
    bind:open
    onOpenChange={(v) => {
        if (!v) onCancel?.();
    }}
>
    <Dialog.Portal>
        <Dialog.Overlay
            class="fixed inset-0 z-50 bg-black/50 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0"
        />
        <Dialog.Content
            class="fixed top-[50%] left-[50%] z-50 max-h-[90vh] w-[calc(100%-2rem)] max-w-md translate-x-[-50%] translate-y-[-50%] overflow-y-auto rounded-lg border border-border bg-background p-4 shadow-lg outline-none"
        >
            <div class="mb-4 flex items-start justify-between gap-3">
                <div>
                    <Dialog.Title class="text-sm font-medium text-foreground"
                        >New feature</Dialog.Title
                    >
                    <Dialog.Description
                        class="mt-0.5 text-xs text-muted-foreground"
                    >
                        {geomType} on {layer}. Attributes stay local until
                        commit.
                    </Dialog.Description>
                </div>
                <Dialog.Close
                    class="rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
                    aria-label="Close"
                    onclick={cancel}
                >
                    <XIcon class="size-4" />
                </Dialog.Close>
            </div>

            <div class="space-y-3">
                {#if fields.length === 0}
                    <p class="text-xs text-muted-foreground">
                        No attribute columns on this layer. Save to keep the
                        geometry in the session buffer.
                    </p>
                {:else}
                    {#each fields as name}
                        <Field>
                            <FieldLabel class="text-xs">{name}</FieldLabel>
                            <Input
                                class="h-8 text-sm"
                                value={values[name] ?? ""}
                                autocomplete="off"
                                oninput={(e) =>
                                    setField(
                                        name,
                                        (e.currentTarget as HTMLInputElement)
                                            .value,
                                    )}
                            />
                        </Field>
                    {/each}
                {/if}
            </div>

            <div class="mt-4 flex justify-end gap-2">
                <Button variant="ghost" size="sm" onclick={cancel}
                    >Discard</Button
                >
                <Button size="sm" onclick={confirm}>Add to buffer</Button>
            </div>
        </Dialog.Content>
    </Dialog.Portal>
</Dialog.Root>
