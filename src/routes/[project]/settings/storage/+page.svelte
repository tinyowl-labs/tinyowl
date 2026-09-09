<script lang="ts">
    import { enhance } from "$app/forms";
    import { Button } from "$lib/components/ui/button/index.js";
    import { Input } from "$lib/components/ui/input/index.js";
    import { Field, FieldLabel } from "$lib/components/ui/field/index.js";

    let { data, form: rawForm } = $props();
    const form = $derived(rawForm as any);
    const storage = $derived((data as any)?.storage as {
        project_slug: string;
        org_slug?: string;
        used_bytes: number;
        limit_bytes?: number | null;
        available_bytes?: number | null;
        can_set_limit?: boolean;
    } | null);

    const gib = 1024 * 1024 * 1024;

    function bytes(value: number) {
        if (value < 1024 * 1024) return `${Math.round(value / 1024)} KB`;
        if (value < gib) return `${(value / (1024 * 1024)).toFixed(1)} MB`;
        return `${(value / gib).toFixed(2)} GiB`;
    }

    function limitGiB(value?: number | null) {
        if (!value) return "";
        return String(Math.round((value / gib) * 100) / 100);
    }

    const usedPct = $derived(
        storage?.limit_bytes
            ? Math.min(100, (storage.used_bytes / storage.limit_bytes) * 100)
            : null,
    );
</script>

<svelte:head>
    <title>Storage — echidna</title>
</svelte:head>

<section>
    <h2 class="mb-1 text-sm font-medium text-foreground">Storage</h2>
    <p class="mb-4 text-sm text-muted-foreground">
        Total media stored in this project against its limit. Limits are
        enforced on new media uploads; a blank value leaves the project
        unlimited. GeoPackages and commit history are not counted yet.
    </p>
    {#if form?.error}
        <p
            class="mb-4 rounded-md border border-destructive/25 bg-destructive/5 px-3 py-2 text-sm text-destructive"
        >
            {form.error}
        </p>
    {/if}
    {#if form?.success}
        <p
            class="mb-4 rounded-md border border-border bg-secondary/50 px-3 py-2 text-sm text-foreground"
        >
            Storage limit saved.
        </p>
    {/if}
    {#if !storage}
        <p class="text-sm text-muted-foreground">Storage usage unavailable.</p>
    {:else}
        <div class="rounded-lg border border-border p-4">
            <p class="text-sm font-medium text-foreground">
                {bytes(storage.used_bytes)} used{#if storage.limit_bytes}
                    of {bytes(storage.limit_bytes)}
                {:else}
                    · no limit
                {/if}
            </p>
            {#if usedPct !== null}
                <div
                    class="mt-2 h-2 w-full overflow-hidden rounded-full bg-secondary"
                    role="progressbar"
                    aria-valuenow={Math.round(usedPct)}
                    aria-valuemin={0}
                    aria-valuemax={100}
                >
                    <div
                        class="h-full rounded-full bg-primary"
                        style={`width: ${usedPct.toFixed(1)}%`}
                    ></div>
                </div>
                <p class="mt-1 text-xs text-muted-foreground">
                    {bytes(storage.available_bytes ?? 0)} available
                </p>
            {/if}
            {#if storage.can_set_limit}
                <form
                    method="POST"
                    action="?/setStorageLimit"
                    use:enhance
                    class="mt-4 sm:flex sm:items-end sm:gap-4"
                >
                    <Field class="sm:w-40">
                        <FieldLabel for="limit">Limit (GiB)</FieldLabel>
                        <Input
                            id="limit"
                            name="limit_gib"
                            type="number"
                            min="0.01"
                            step="0.01"
                            value={limitGiB(storage.limit_bytes)}
                            placeholder="Unlimited"
                        />
                    </Field>
                    <Button type="submit" size="sm" class="mt-3 sm:mt-0">
                        Save limit
                    </Button>
                </form>
            {/if}
        </div>
    {/if}
</section>
