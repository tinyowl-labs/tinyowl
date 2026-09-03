<script lang="ts">
    import { enhance } from "$app/forms";
    import { Button } from "$lib/components/ui/button/index.js";
    import { Input } from "$lib/components/ui/input/index.js";
    import {
        Field,
        FieldLabel,
        FieldDescription,
        FieldGroup,
    } from "$lib/components/ui/field/index.js";
    import { LOCATION_PRECISIONS } from "$lib/project/licences";
    import { SELECT_CLASS } from "../pages";

    let { data, form: rawForm } = $props();
    const form = $derived(rawForm as any);

    const projectTitle = $derived(data?.project?.title ?? "Project");
    const project = $derived(data?.project);
    const currentEmbargoUntil = $derived.by(() => {
        const raw = (project as any)?.embargo_until as string | null | undefined;
        if (!raw) return "";
        const d = new Date(raw);
        if (Number.isNaN(d.getTime())) return raw.slice(0, 16);
        return d.toISOString().slice(0, 16);
    });
    const currentEmbargoNote = $derived(
        ((project as any)?.embargo_note as string | null | undefined) ?? "",
    );
    const currentLocationPrecision = $derived(
        ((project as any)?.location_precision as string | undefined) ?? "exact",
    );
</script>

<svelte:head>
    <title>Embargo — {projectTitle} — echidna</title>
</svelte:head>

<section>
    <h2 class="text-sm font-medium text-foreground mb-1">
        Embargo &amp; location precision
    </h2>
    <p class="text-sm text-muted-foreground mb-4">
        While embargoed, or when precision is reduced, viewers and anonymous
        readers see fuzzed or hidden locations. Collaborators always see exact
        coordinates.
    </p>
    {#if form?.error}
        <p
            class="mb-4 rounded-md border border-destructive/25 bg-destructive/5 px-3 py-2 text-sm text-destructive"
        >
            {form.error}
        </p>
    {/if}

    <form method="POST" action="?/updateEmbargo" use:enhance class="space-y-4">
        <FieldGroup>
            <Field>
                <FieldLabel for="embargo_until">Embargo until</FieldLabel>
                <Input
                    id="embargo_until"
                    type="datetime-local"
                    name="embargo_until"
                    value={currentEmbargoUntil}
                />
                <FieldDescription
                    >Clear the date to lift the embargo.</FieldDescription
                >
            </Field>
            <Field>
                <FieldLabel for="embargo_note">Embargo note</FieldLabel>
                <textarea
                    id="embargo_note"
                    name="embargo_note"
                    rows="2"
                    class="dark:bg-input/30 border-input focus-visible:border-ring focus-visible:ring-ring/50 placeholder:text-muted-foreground h-auto min-h-[2.5rem] w-full rounded-md border bg-transparent px-2.5 py-2 text-sm shadow-xs outline-none focus-visible:ring-3"
                    placeholder="Optional reason shown to admins">{currentEmbargoNote}</textarea
                >
            </Field>
            <Field>
                <FieldLabel for="location_precision">Location precision</FieldLabel>
                <select
                    id="location_precision"
                    name="location_precision"
                    value={currentLocationPrecision}
                    class={SELECT_CLASS}
                >
                    {#each LOCATION_PRECISIONS as p}
                        <option value={p.key}>{p.label}</option>
                    {/each}
                </select>
                <FieldDescription>
                    Applied to maps, centroids, and search for non-collaborators.
                </FieldDescription>
            </Field>
        </FieldGroup>
        <Button type="submit">Save</Button>
    </form>
</section>
