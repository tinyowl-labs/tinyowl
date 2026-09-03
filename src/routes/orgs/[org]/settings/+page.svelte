<script lang="ts">
    import { enhance } from "$app/forms";
    import { Button } from "$lib/components/ui/button/index.js";
    import { Input } from "$lib/components/ui/input/index.js";
    import { Field, FieldLabel } from "$lib/components/ui/field/index.js";

    let { data, form } = $props();
    const org = $derived(data.org);
</script>

<svelte:head>
    <title>Settings — {org.name} — echidna</title>
</svelte:head>

<section>
    <h2 class="mb-1 text-sm font-medium text-foreground">General</h2>
    <p class="mb-4 text-sm text-muted-foreground">
        Name, description, and avatar for this organisation.
    </p>
    {#if form?.error}
        <p
            class="mb-4 rounded-md border border-destructive/25 bg-destructive/5 px-3 py-2 text-sm text-destructive"
        >
            {form.error}
        </p>
    {/if}

    <div class="mb-6 flex items-center gap-4">
        {#if org.has_avatar}
            <img
                src="/orgs/{org.slug}/avatar"
                alt=""
                class="size-16 rounded-full object-cover"
            />
        {:else}
            <span
                class="flex size-16 items-center justify-center rounded-full bg-secondary text-lg font-medium text-muted-foreground"
                >{org.name.charAt(0).toUpperCase()}</span
            >
        {/if}
        <div class="flex flex-wrap gap-2">
            <form
                method="POST"
                action="?/uploadAvatar"
                enctype="multipart/form-data"
                use:enhance
            >
                <label
                    class="inline-flex cursor-pointer items-center gap-2 rounded-md border border-border px-3 py-1.5 text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
                >
                    Upload avatar
                    <input
                        type="file"
                        name="avatar"
                        accept="image/jpeg,image/png,image/gif,image/webp"
                        class="sr-only"
                        onchange={(e) => {
                            e.currentTarget.form?.requestSubmit();
                        }}
                    />
                </label>
            </form>
            {#if org.has_avatar}
                <form method="POST" action="?/removeAvatar" use:enhance>
                    <Button
                        type="submit"
                        size="sm"
                        variant="ghost"
                        class="text-muted-foreground">Remove</Button
                    >
                </form>
            {/if}
        </div>
    </div>

    <form method="POST" action="?/update" class="space-y-3" use:enhance>
        <Field>
            <FieldLabel for="org_name">Name</FieldLabel>
            <Input id="org_name" name="name" value={org.name} required />
        </Field>
        <Field>
            <FieldLabel for="org_desc">Description</FieldLabel>
            <textarea
                id="org_desc"
                name="description"
                rows="3"
                class="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm"
                >{org.description ?? ""}</textarea
            >
        </Field>
        <Button type="submit" size="sm">Save</Button>
    </form>
</section>
