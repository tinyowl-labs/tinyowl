<script lang="ts">
    import { enhance } from "$app/forms";
    import PlusIcon from "@lucide/svelte/icons/plus";
    import { Button } from "$lib/components/ui/button/index.js";
    import { Input } from "$lib/components/ui/input/index.js";
    import { Field, FieldLabel } from "$lib/components/ui/field/index.js";

    let { data, form } = $props();
    const org = $derived(data.org);
    const isMember = $derived(Boolean(data.isMember));
    let showCreate = $state(false);

    function projectHref(slug: string) {
        return "/" + encodeURIComponent(slug);
    }
</script>

<svelte:head>
    <title>{org.name} — echidna</title>
</svelte:head>

<div class="mx-auto max-w-5xl px-6 py-8">
    {#if form?.error}
        <p
            class="mb-4 rounded-md border border-destructive/25 bg-destructive/5 px-3 py-2 text-sm text-destructive"
        >
            {form.error}
        </p>
    {/if}

    <div class="mb-10 flex items-start gap-4">
        {#if org.has_avatar}
            <img
                src="/orgs/{org.slug}/avatar"
                alt=""
                class="size-16 shrink-0 rounded-full object-cover"
            />
        {:else}
            <span
                class="flex size-16 shrink-0 items-center justify-center rounded-full bg-secondary text-lg font-medium text-muted-foreground"
                >{org.name.charAt(0).toUpperCase()}</span
            >
        {/if}
        <div class="min-w-0">
            <h1 class="text-2xl font-semibold text-foreground">{org.name}</h1>
            {#if org.description}
                <p class="mt-1 max-w-2xl text-sm text-muted-foreground">
                    {org.description}
                </p>
            {/if}
            <p class="mt-1 text-xs text-muted-foreground">{org.slug}</p>
        </div>
    </div>

    <section>
        <div class="mb-4 flex items-center justify-between gap-4">
            <h2 class="text-sm font-medium text-foreground">Projects</h2>
            {#if isMember}
                <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onclick={() => (showCreate = !showCreate)}
                >
                    <PlusIcon class="size-3.5" />
                    New project
                </Button>
            {/if}
        </div>
        {#if showCreate && isMember}
            <form
                method="POST"
                action="?/createProject"
                class="mb-4 space-y-3 rounded-lg border border-border p-4"
                use:enhance
            >
                <Field>
                    <FieldLabel for="proj_name">Project name</FieldLabel>
                    <Input
                        id="proj_name"
                        name="name"
                        required
                        placeholder="Trench A"
                    />
                </Field>
                <Button type="submit" size="sm">Create</Button>
            </form>
        {/if}
        {#if (org.projects ?? []).length === 0}
            <p class="text-sm text-muted-foreground">
                No projects you can open yet.
            </p>
        {:else}
            <div class="grid gap-2 sm:grid-cols-2">
                {#each org.projects as project (project.slug)}
                    <a
                        href={projectHref(project.slug)}
                        class="rounded-lg border border-border bg-card px-3.5 py-3 no-underline transition-colors hover:bg-accent hover:text-foreground"
                    >
                        <span
                            class="block truncate text-sm font-medium text-foreground"
                            >{project.title}</span
                        >
                        <span
                            class="mt-0.5 block truncate text-[11px] text-muted-foreground"
                            >{project.slug}{#if project.role}
                                · {project.role}{/if}</span
                        >
                    </a>
                {/each}
            </div>
        {/if}
    </section>
</div>
