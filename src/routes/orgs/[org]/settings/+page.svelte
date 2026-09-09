<script lang="ts">
    import { enhance } from "$app/forms";
    import { invalidateAll } from "$app/navigation";
    import { Button } from "$lib/components/ui/button/index.js";
    import { Input } from "$lib/components/ui/input/index.js";
    import {
        Field,
        FieldLabel,
        FieldDescription,
        FieldGroup,
    } from "$lib/components/ui/field/index.js";
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
            const res = await fetch(
                `/api/v1/orgs/${encodeURIComponent(org.slug)}/avatar`,
                {
                    method: "PUT",
                    headers: {
                        Authorization: `Bearer ${token}`,
                        "Content-Type": file.type || "image/webp",
                    },
                    body: file,
                },
            );
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
    <div class="mb-4 flex items-center gap-4">
        {#if org.has_avatar}
            <img
                src="/orgs/{org.slug}/avatar{avatarBust ? `?v=${avatarBust}` : ""}"
                alt=""
                class="size-16 shrink-0 rounded-full object-cover"
            />
        {:else}
            <span
                class="flex size-16 shrink-0 items-center justify-center rounded-full bg-secondary text-xl font-medium text-muted-foreground"
                >{org.name.charAt(0).toUpperCase()}</span
            >
        {/if}
        <div class="min-w-0">
            <p class="truncate text-sm font-medium text-foreground">{org.name}</p>
            <p class="truncate text-sm text-muted-foreground">@{org.slug}</p>
            <a
                href="/orgs/{org.slug}"
                class="mt-1 inline-block text-xs text-muted-foreground no-underline hover:text-foreground"
                >View organisation</a
            >
        </div>
    </div>

    <div class="mb-4 flex flex-wrap gap-2">
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
                    class="text-muted-foreground">Remove photo</Button
                >
            </form>
        {/if}
    </div>

    <AvatarCropDialog
        bind:open={cropOpen}
        imageUrl={cropUrl}
        saving={avatarSaving}
        onSave={saveCroppedAvatar}
    />

    {#if form?.error || avatarError}
        <p
            class="mb-4 rounded-md border border-destructive/25 bg-destructive/5 px-3 py-2 text-sm text-destructive"
        >
            {avatarError || form?.error}
        </p>
    {/if}
    {#if form?.success}
        <p
            class="mb-4 rounded-md border border-border bg-secondary/50 px-3 py-2 text-sm text-foreground"
        >
            Saved.
        </p>
    {/if}

    <form method="POST" action="?/update" class="space-y-4" use:enhance>
        <FieldGroup>
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
                    class="dark:bg-input/30 border-input focus-visible:border-ring focus-visible:ring-ring/50 placeholder:text-muted-foreground h-auto min-h-[2.5rem] w-full rounded-md border bg-transparent px-2.5 py-2 text-sm shadow-xs outline-none focus-visible:ring-3"
                    >{org.description ?? ""}</textarea
                >
                <FieldDescription>
                    Shown on the organisation page.
                </FieldDescription>
            </Field>
        </FieldGroup>
        <Button type="submit">Save</Button>
    </form>
</section>
