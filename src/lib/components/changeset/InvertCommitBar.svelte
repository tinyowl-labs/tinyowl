<script lang="ts">
    import { invertCommit } from "$lib/changeset/client";

    let {
        slug,
        accessToken,
        commitId,
        label,
        error = $bindable(""),
        onDone,
    }: {
        slug: string;
        accessToken: string;
        commitId: string;
        label: string;
        error?: string;
        onDone?: (commitId: string) => void | Promise<void>;
    } = $props();

    let note = $state("");
    let busy = $state(false);

    $effect(() => {
        const id = commitId;
        const msg = label;
        note = id ? `Invert ${id.slice(0, 8)}: ${msg}` : "";
        error = "";
    });

    const canInvert = $derived(
        commitId.length > 0 && note.trim().length > 0 && !busy,
    );

    async function invert() {
        if (!canInvert) {
            if (commitId && !note.trim()) {
                error = "An invert message is required.";
            }
            return;
        }
        busy = true;
        error = "";
        const result = await invertCommit({
            slug,
            accessToken,
            commitId,
            message: note,
        });
        busy = false;
        if (!result.ok) {
            error = result.error;
            return;
        }
        await onDone?.(result.commitId);
    }
</script>

<input
    class="h-8 w-56 rounded-md border border-border bg-background px-3 text-xs"
    placeholder="Required invert message"
    bind:value={note}
    disabled={busy}
    onkeydown={(e) => {
        if (e.key === "Enter") void invert();
    }}
/>
<button
    type="button"
    class="inline-flex h-8 items-center rounded-md bg-primary px-3 text-xs text-primary-foreground disabled:opacity-50"
    disabled={!canInvert}
    onclick={() => void invert()}
>
    {busy ? "Inverting…" : "Invert"}
</button>
