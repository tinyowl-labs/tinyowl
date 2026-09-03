<script lang="ts">
    import { enhance } from "$app/forms";
    import { SELECT_CLASS } from "../pages";

    let { data, form: rawForm } = $props();
    const form = $derived(rawForm as any);

    const projectTitle = $derived(data?.project?.title ?? "Project");
    const tables = $derived(
        ((data as any)?.tables as Record<string, string[]> | null) ?? {},
    );
    const tableNames = $derived(Object.keys(tables));
    const project = $derived(data?.project);
    const globalVisibility = $derived(
        (project as any)?.visibility ?? "private",
    );
    const tableVisibility = $derived(
        ((project as any)?.table_visibility as Record<string, string>) ?? {},
    );
</script>

<svelte:head>
    <title>Visibility — {projectTitle} — echidna</title>
</svelte:head>

<section>
    <h2 class="text-sm font-medium text-foreground mb-1">Visibility</h2>
    <p class="text-sm text-muted-foreground mb-4">
        Private tables require authentication. Overrides apply per table.
    </p>
    {#if form?.error}
        <p
            class="mb-4 rounded-md border border-destructive/25 bg-destructive/5 px-3 py-2 text-sm text-destructive"
        >
            {form.error}
        </p>
    {/if}

    <div class="rounded-lg border border-border divide-y divide-border">
        <div class="flex items-center justify-between gap-4 px-4 py-3">
            <div class="min-w-0">
                <p class="text-sm text-foreground">Default</p>
                <p class="text-xs text-muted-foreground mt-0.5">
                    Used when a table has no override
                </p>
            </div>
            <form method="POST" action="?/updateVisibility" use:enhance>
                <select
                    name="visibility"
                    value={globalVisibility}
                    onchange={(e) =>
                        e.currentTarget.closest("form")?.requestSubmit()}
                    class="{SELECT_CLASS} w-28"
                >
                    <option value="private">Private</option>
                    <option value="public">Public</option>
                </select>
            </form>
        </div>

        {#if tableNames.length > 0}
            {#each tableNames as name}
                {@const vis = tableVisibility[name] ?? globalVisibility}
                <div
                    class="flex items-center justify-between gap-4 px-4 py-2.5"
                >
                    <span class="truncate text-sm text-foreground">
                        {name.replace(/_/g, " ")}
                    </span>
                    <form method="POST" action="?/updateVisibility" use:enhance>
                        <input type="hidden" name="table_name" value={name} />
                        <select
                            name="visibility"
                            value={vis}
                            onchange={(e) =>
                                e.currentTarget
                                    .closest("form")
                                    ?.requestSubmit()}
                            class="{SELECT_CLASS} h-8 w-24 text-xs"
                        >
                            <option value="public">Public</option>
                            <option value="private">Private</option>
                        </select>
                    </form>
                </div>
            {/each}
        {:else}
            <div class="px-4 py-8 text-center text-sm text-muted-foreground">
                No tables yet — push data to set per-table visibility.
            </div>
        {/if}
    </div>
</section>
