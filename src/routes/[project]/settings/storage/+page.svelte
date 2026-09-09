<script lang="ts">
    import { enhance } from "$app/forms";
    import { Button } from "$lib/components/ui/button/index.js";
    import { Input } from "$lib/components/ui/input/index.js";
    import { Field, FieldLabel } from "$lib/components/ui/field/index.js";

    let { data, form: rawForm } = $props();
    const form = $derived(rawForm as any);
    type Bucket = { label: string; bytes: number; files: number };
    const storage = $derived((data as any)?.storage as {
        project_slug: string;
        org_slug?: string;
        used_bytes: number;
        limit_bytes?: number | null;
        available_bytes?: number | null;
        can_set_limit?: boolean;
        breakdown?: Bucket[];
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

    const bucketNames: Record<string, string> = {
        images: "Images",
        video: "Video",
        audio: "Audio",
        models: "3D models & tiles",
        other: "Other files",
    };

    const buckets = $derived(
        ((storage?.breakdown ?? []) as Bucket[]).map((b) => ({
            ...b,
            name: bucketNames[b.label] ?? b.label,
            share: storage?.used_bytes
                ? Math.min(100, (b.bytes / storage.used_bytes) * 100)
                : 0,
        })),
    );

    const usedPct = $derived(
        storage?.limit_bytes
            ? Math.min(100, (storage.used_bytes / storage.limit_bytes) * 100)
            : null,
    );
    /** Bar turns amber past 70%, red past 90% — readable in both themes. */
    const barClass = $derived(
        usedPct === null
            ? "bg-primary"
            : usedPct >= 90
              ? "bg-red-500"
              : usedPct >= 70
                ? "bg-amber-500"
                : "bg-emerald-500",
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
            <div class="flex flex-wrap items-baseline justify-between gap-2">
                <p class="text-sm font-medium text-foreground">
                    {bytes(storage.used_bytes)} used{" "}
                    {#if storage.limit_bytes}
                        <span class="font-normal text-muted-foreground">
                            of {bytes(storage.limit_bytes)}
                        </span>
                    {:else}
                        <span class="font-normal text-muted-foreground">
                            · no limit
                        </span>
                    {/if}
                </p>
                {#if usedPct !== null}
                    <p
                        class="rounded-full bg-secondary px-2 py-0.5 text-xs font-medium tabular-nums text-foreground"
                    >
                        {usedPct.toFixed(1)}%
                    </p>
                {/if}
            </div>
            {#if usedPct !== null}
                <div
                    class="mt-2 h-3 w-full overflow-hidden rounded-full bg-secondary"
                    role="progressbar"
                    aria-valuenow={Math.round(usedPct)}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-label="Storage used"
                >
                    <div
                        class={`h-full rounded-full transition-[width] ${barClass}`}
                        style={`width: ${Math.max(usedPct, 1.5).toFixed(1)}%`}
                    ></div>
                </div>
                <p class="mt-1 text-xs text-muted-foreground">
                    {bytes(storage.available_bytes ?? 0)} available
                </p>
            {/if}
            {#if buckets.length > 0}
                <ul class="mt-4 space-y-2.5 border-t border-border pt-4">
                    {#each buckets as bucket (bucket.label)}
                        <li>
                            <div
                                class="flex items-baseline justify-between gap-2 text-xs"
                            >
                                <span class="font-medium text-foreground">
                                    {bucket.name}
                                    <span
                                        class="font-normal tabular-nums text-muted-foreground"
                                    >
                                        · {bucket.files}
                                        {bucket.files === 1 ? "file" : "files"}
                                    </span>
                                </span>
                                <span
                                    class="shrink-0 tabular-nums text-muted-foreground"
                                >
                                    {bytes(bucket.bytes)} · {bucket.share.toFixed(1)}%
                                </span>
                            </div>
                            <div
                                class="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-secondary"
                            >
                                <div
                                    class="h-full rounded-full bg-primary/70"
                                    style={`width: ${Math.max(bucket.share, 1).toFixed(1)}%`}
                                ></div>
                            </div>
                        </li>
                    {/each}
                </ul>
            {/if}
        </div>
        {#if storage.can_set_limit}
            <div class="mt-6">
                <h3 class="mb-1 text-sm font-medium text-foreground">Limit</h3>
                <p class="mb-3 text-sm text-muted-foreground">
                    Cap total media for this project. The cap is enforced on
                    new uploads; clear it to leave the project unlimited.
                </p>
                <form
                    method="POST"
                    action="?/setStorageLimit"
                    use:enhance
                    class="flex flex-wrap items-end gap-3"
                >
                    <Field class="w-40">
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
                    <Button type="submit" size="sm">Save limit</Button>
                </form>
            </div>
        {/if}
    {/if}
</section>
