<script lang="ts">
    import { enhance } from "$app/forms";
    import { invalidateAll } from "$app/navigation";
    import { Button } from "$lib/components/ui/button/index.js";
    import { Input } from "$lib/components/ui/input/index.js";
    import { Field, FieldLabel } from "$lib/components/ui/field/index.js";
    import AvatarCropDialog from "$lib/components/ui/avatar-crop-dialog.svelte";
    import { isAllowedAvatarType } from "$lib/avatar-crop";
    import { createClient } from "$lib/supabase/client";

    let { data, form } = $props();
    const org = $derived(data.org);

    let cropOpen = $state(false);
    let cropUrl = $state("");
    let cropInput = $state<HTMLInputElement | null>(null);
    let avatarSaving = $state(false);
    let avatarBust = $state("");
    let avatarError = $state("");

    function pickAvatarFile() {
        cropInput?.click();
    }

    function onAvatarFile(event: Event) {
        const input = event.currentTarget as HTMLInputElement;
        const file = input.files?.[0];
        input.value = "";
        if (!file) return;
        if (!isAllowedAvatarType(file.type)) {
            avatarError = "Choose a JPG, PNG, WEBP, or GIF image.";
            return;
        }
        if (cropUrl.startsWith("blob:")) URL.revokeObjectURL(cropUrl);
        cropUrl = URL.createObjectURL(file);
        cropOpen = true;
        avatarError = "";
    }

    async function saveCroppedAvatar(file: File) {
        const supabase = createClient();
        const { data: sessionData } = await supabase.auth.getSession();
        const token = sessionData.session?.access_token;
        if (!token) throw new Error("Not signed in.");
        avatarSaving = true;
        avatarError = "";
        try {
            const res = await fetch(`/api/v1/orgs/${encodeURIComponent(org.slug)}/avatar`, {
                method: "PUT",
                headers: {
                    Authorization: `Bearer ${token}`,
                    "Content-Type": file.type || "image/webp",
                },
                body: file,
            });
            if (!res.ok) throw new Error(await res.text());
            avatarBust = String(Date.now());
            await invalidateAll();
        } finally {
            avatarSaving = false;
            if (cropUrl.startsWith("blob:")) URL.revokeObjectURL(cropUrl);
            cropUrl = "";
        }
    }

    $effect(() => {
        if (cropOpen || !cropUrl.startsWith("blob:")) return;
        const url = cropUrl;
        cropUrl = "";
        URL.revokeObjectURL(url);
    });
</script>

<svelte:head>
    <title>Settings — {org.name} — echidna</title>
</svelte:head>

<section>
    <h2 class="mb-1 text-sm font-medium text-foreground">General</h2>
    <p class="mb-4 text-sm text-muted-foreground">
        Name, description, and avatar for this organisation.
    </p>
    {#if form?.error || avatarError}
        <p
            class="mb-4 rounded-md border border-destructive/25 bg-destructive/5 px-3 py-2 text-sm text-destructive"
        >
            {avatarError || form?.error}
        </p>
    {/if}

    <div class="mb-6 flex items-center gap-4">
        {#if org.has_avatar}
            <img
                src="/orgs/{org.slug}/avatar{avatarBust ? `?v=${avatarBust}` : ""}"
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
            <button
                type="button"
                class="inline-flex cursor-pointer items-center gap-2 rounded-md border border-border px-3 py-1.5 text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
                onclick={pickAvatarFile}
            >
                Upload avatar
            </button>
            <input
                bind:this={cropInput}
                type="file"
                accept="image/jpeg,image/png,image/gif,image/webp"
                class="sr-only"
                onchange={onAvatarFile}
            />
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

    <AvatarCropDialog
        bind:open={cropOpen}
        imageUrl={cropUrl}
        saving={avatarSaving}
        onSave={saveCroppedAvatar}
    />

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
