<script lang="ts">
    import {
        deleteProjectMedia,
        isMessageRequiredError,
    } from "$lib/project/deleteMedia";

    let {
        accessToken,
        projectSlug,
        hash,
        linked,
        onRemoved,
    }: {
        accessToken: string;
        projectSlug: string;
        hash: string;
        linked: boolean;
        onRemoved: () => void;
    } = $props();

    let open = $state(false);
    let message = $state("");
    let busy = $state(false);
    let error = $state("");

    function cancel() {
        if (busy) return;
        open = false;
        error = "";
    }

    async function confirm() {
        if (busy) return;
        error = "";
        if (linked && !message.trim()) {
            error = "Commit message required";
            return;
        }
        busy = true;
        try {
            await deleteProjectMedia({
                projectSlug,
                accessToken,
                hash,
                message: message.trim(),
            });
            onRemoved();
        } catch (err) {
            error = err instanceof Error ? err.message : "Remove failed";
            if (isMessageRequiredError(err) && !open) open = true;
        } finally {
            busy = false;
        }
    }
</script>

<div class="border-t border-border pt-2">
    {#if !open}
        <button
            type="button"
            onclick={() => {
                open = true;
                error = "";
            }}
            class="text-[11px] text-muted-foreground hover:text-destructive"
        >
            Remove
        </button>
    {:else}
        <p class="text-[11px] text-muted-foreground">
            Unlists this file. Linked geopackage rows need a commit message.
            Public main is not wiped.
        </p>
        <label class="mt-2 flex flex-col gap-1">
            <span class="text-[11px] text-muted-foreground">
                {linked
                    ? "Commit message"
                    : "Commit message (if linked in the geopackage)"}
            </span>
            <textarea
                class="min-h-[3.5rem] rounded-md border border-input bg-background px-2 py-1.5 text-xs"
                rows="2"
                placeholder="remove unused photo"
                bind:value={message}
                disabled={busy}
            ></textarea>
        </label>
        {#if error}
            <p class="mt-1 text-[11px] text-destructive">{error}</p>
        {/if}
        <div class="mt-2 flex items-center gap-2">
            <button
                type="button"
                disabled={busy}
                onclick={cancel}
                class="rounded-md px-2 py-1 text-[11px] text-muted-foreground hover:text-foreground disabled:opacity-50"
            >
                Cancel
            </button>
            <button
                type="button"
                disabled={busy}
                onclick={() => void confirm()}
                class="rounded-md bg-destructive px-2 py-1 text-[11px] font-medium text-destructive-foreground disabled:opacity-50"
            >
                {busy ? "Removing…" : "Remove"}
            </button>
        </div>
    {/if}
</div>
