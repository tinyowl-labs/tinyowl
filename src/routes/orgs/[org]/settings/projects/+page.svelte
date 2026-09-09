<script lang="ts">
    import { enhance } from "$app/forms";
    import { Button } from "$lib/components/ui/button/index.js";
    import { Input } from "$lib/components/ui/input/index.js";
    import { Field, FieldLabel } from "$lib/components/ui/field/index.js";

    let { data, form } = $props();
    const org = $derived(data.org);
    const gib = 1024 * 1024 * 1024;
    const storage = $derived(
        ((data as any)?.projectStorage ?? []) as {
            project_slug: string;
            used_bytes: number;
            limit_bytes?: number | null;
            available_bytes?: number | null;
            can_set_limit?: boolean;
        }[],
    );
    const projects = $derived(
        ((org?.projects ?? []) as { slug: string; title: string }[]).map(
            (project) => ({
                ...project,
                storage: storage.find((item) => item.project_slug === project.slug),
            }),
        ),
    );

    function bytes(value: number) {
        if (value < 1024 * 1024) return `${Math.round(value / 1024)} KB`;
        if (value < gib) return `${(value / (1024 * 1024)).toFixed(1)} MB`;
        return `${(value / gib).toFixed(2)} GiB`;
    }

    function limitGiB(value?: number | null) {
        if (!value) return "";
        return String(Math.round((value / gib) * 100) / 100);
    }
</script>

<svelte:head>
    <title>Projects — {org.name} — echidna</title>
</svelte:head>

<section>
    <h2 class="mb-1 text-sm font-medium text-foreground">Attach a project</h2>
    <p class="mb-4 text-sm text-muted-foreground">
        The organisation becomes the project owner. You must be a project
        owner or admin to attach it.
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
            {form.orgAction === "storage"
                ? "Storage limit saved."
                : "Project attached. The organisation is now the owner."}
        </p>
    {/if}
    <form
        method="POST"
        action="?/attachProject"
        class="space-y-3"
        use:enhance
    >
        <Field>
            <FieldLabel for="attach_slug">Project slug</FieldLabel>
            <Input
                id="attach_slug"
                name="project_slug"
                required
                placeholder="inj-demo"
            />
        </Field>
        <Button type="submit" size="sm">Attach</Button>
    </form>

    <div class="mt-10">
        <h2 class="mb-1 text-sm font-medium text-foreground">Storage</h2>
        <p class="mb-4 text-sm text-muted-foreground">
            Set a per-project media limit in GiB. Limits are enforced on new
            media uploads; a blank value leaves a project unlimited. This is
            the storage-tier foundation, so GeoPackages and commit history are
            not counted yet.
        </p>
        {#if projects.length === 0}
            <p class="text-sm text-muted-foreground">No attached projects yet.</p>
        {:else}
            <div class="space-y-3">
                {#each projects as project (project.slug)}
                    {@const item = project.storage}
                    <form
                        method="POST"
                        action="?/setStorageLimit"
                        use:enhance
                        class="rounded-lg border border-border p-4 sm:flex sm:items-end sm:gap-4"
                    >
                        <input type="hidden" name="project_slug" value={project.slug} />
                        <div class="min-w-0 flex-1">
                            <h3 class="text-sm font-medium text-foreground">
                                {project.title}
                            </h3>
                            <p class="mt-1 text-xs text-muted-foreground">
                                {#if item}
                                    {bytes(item.used_bytes)} used{#if item.limit_bytes}
                                        · {bytes(item.available_bytes ?? 0)} available
                                    {:else}
                                        · no limit
                                    {/if}
                                {:else}
                                    Storage usage unavailable.
                                {/if}
                            </p>
                        </div>
                        <Field class="mt-3 sm:mt-0 sm:w-40">
                            <FieldLabel for={`limit-${project.slug}`}>Limit (GiB)</FieldLabel>
                            <Input
                                id={`limit-${project.slug}`}
                                name="limit_gib"
                                type="number"
                                min="0.01"
                                step="0.01"
                                value={limitGiB(item?.limit_bytes)}
                                placeholder="Unlimited"
                            />
                        </Field>
                        <Button type="submit" size="sm" class="mt-3 sm:mt-0">
                            Save limit
                        </Button>
                    </form>
                {/each}
            </div>
        {/if}
    </div>
</section>
