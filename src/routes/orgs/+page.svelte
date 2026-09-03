<script lang="ts">
    import { enhance } from "$app/forms";
    import { page } from "$app/stores";
    import PlusIcon from "@lucide/svelte/icons/plus";
    import Building2Icon from "@lucide/svelte/icons/building-2";
    import Header from "$lib/components/ui/header.svelte";
    import { Button } from "$lib/components/ui/button/index.js";
    import { Input } from "$lib/components/ui/input/index.js";
    import { Field, FieldLabel } from "$lib/components/ui/field/index.js";

    let { data, form } = $props();
    const hasSession = $derived(Boolean($page.data?.user ?? data?.user));
    const orgs = $derived(data?.orgs ?? []);
    let showCreate = $state(false);
</script>

<svelte:head><title>Organisations — echidna</title></svelte:head>

<div class="flex h-screen flex-col overflow-hidden">
    <Header subtitle="Organisations" {hasSession} />
    <main class="min-h-0 flex-1 overflow-y-auto bg-background">
        <div class="mx-auto max-w-5xl px-6 py-6">
            <div class="mb-6 flex items-center justify-between gap-4">
                <div>
                    <h1 class="text-lg font-semibold text-foreground">
                        Organisations
                    </h1>
                    <p class="mt-1 text-sm text-muted-foreground">
                        Own projects and members. Not a social profile.
                    </p>
                </div>
                <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onclick={() => (showCreate = !showCreate)}
                >
                    <PlusIcon class="size-3.5" />
                    {showCreate ? "Cancel" : "New organisation"}
                </Button>
            </div>

            {#if form?.error}
                <p
                    class="mb-4 rounded-md border border-destructive/25 bg-destructive/5 px-3 py-2 text-sm text-destructive"
                >
                    {form.error}
                </p>
            {/if}

            {#if showCreate}
                <form
                    method="POST"
                    action="?/create"
                    class="mb-6 rounded-lg border border-border p-4 space-y-3"
                    use:enhance
                >
                    <div class="grid gap-3 sm:grid-cols-2">
                        <Field>
                            <FieldLabel for="org_name">Name</FieldLabel>
                            <Input
                                id="org_name"
                                name="name"
                                required
                                placeholder="Acme Fieldwork"
                            />
                        </Field>
                        <Field>
                            <FieldLabel for="org_slug"
                                >Slug (optional)</FieldLabel
                            >
                            <Input
                                id="org_slug"
                                name="slug"
                                placeholder="acme"
                            />
                        </Field>
                    </div>
                    <Button type="submit" size="sm">Create</Button>
                </form>
            {/if}

            {#if orgs.length === 0}
                <div
                    class="flex flex-col items-center justify-center rounded-lg border border-border bg-card px-4 py-12 text-center"
                >
                    <Building2Icon
                        class="mb-2 size-6 text-muted-foreground"
                    />
                    <p class="text-sm text-muted-foreground">
                        No organisations yet.
                    </p>
                </div>
            {:else}
                <div class="grid gap-2 sm:grid-cols-2">
                    {#each orgs as org (org.slug)}
                        <a
                            href="/orgs/{org.slug}"
                            class="flex items-center gap-3 rounded-lg border border-border bg-card px-3.5 py-3 no-underline transition-colors hover:bg-accent hover:text-foreground"
                        >
                            {#if org.has_avatar}
                                <img
                                    src="/orgs/{org.slug}/avatar"
                                    alt=""
                                    class="size-9 shrink-0 rounded-full object-cover"
                                />
                            {:else}
                                <span
                                    class="flex size-9 shrink-0 items-center justify-center rounded-full bg-secondary text-xs font-medium text-muted-foreground"
                                    >{org.name.charAt(0).toUpperCase()}</span
                                >
                            {/if}
                            <span class="min-w-0">
                                <span
                                    class="block truncate text-sm font-medium text-foreground"
                                    >{org.name}</span
                                >
                                <span
                                    class="mt-0.5 block truncate text-[11px] text-muted-foreground"
                                    >{org.slug} · {org.role}</span
                                >
                            </span>
                        </a>
                    {/each}
                </div>
            {/if}
        </div>
    </main>
</div>
