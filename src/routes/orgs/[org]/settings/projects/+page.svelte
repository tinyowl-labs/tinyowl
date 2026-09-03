<script lang="ts">
    import { enhance } from "$app/forms";
    import { Button } from "$lib/components/ui/button/index.js";
    import { Input } from "$lib/components/ui/input/index.js";
    import { Field, FieldLabel } from "$lib/components/ui/field/index.js";

    let { data, form } = $props();
    const org = $derived(data.org);
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
            Project attached. The organisation is now the owner.
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
</section>
