<script lang="ts">
    import { enhance } from "$app/forms";
    import { invalidateAll } from "$app/navigation";
    import XIcon from "@lucide/svelte/icons/x";
    import { Button } from "$lib/components/ui/button/index.js";
    import { Input } from "$lib/components/ui/input/index.js";
    import {
        Field,
        FieldLabel,
        FieldDescription,
        FieldGroup,
    } from "$lib/components/ui/field/index.js";
    import CoverCropDialog from "$lib/components/ui/cover-crop-dialog.svelte";
    import ProjectPreviewCard from "$lib/components/discovery/ProjectPreviewCard.svelte";
    import { isAllowedAvatarType } from "$lib/avatar-crop";
    import { createClient } from "$lib/supabase/client";

    let { data, form: rawForm } = $props();
    const form = $derived(rawForm as any);

    const project = $derived(data?.project);
    const projectTitle = $derived(project?.title ?? "Project");
    const slug = $derived(
        ((data as { slug?: string }).slug ?? (project?.slug as string) ?? ""),
    );
    const dateStart = $derived(
        (project as any)?.date_start as number | null | undefined,
    );
    const dateEnd = $derived(
        (project as any)?.date_end as number | null | undefined,
    );
    const dateStartLabel = $derived(
        ((project as any)?.date_start_label as string | null | undefined) ?? "",
    );
    const dateEndLabel = $derived(
        ((project as any)?.date_end_label as string | null | undefined) ?? "",
    );
    const hasCover = $derived(Boolean((project as any)?.has_cover));

    let titleDraft = $state("");
    let descriptionDraft = $state("");
    let dateStartDraft = $state("");
    let dateEndDraft = $state("");
    let dateStartLabelDraft = $state("");
    let dateEndLabelDraft = $state("");

    $effect(() => {
        titleDraft = project?.title ?? "";
        descriptionDraft =
            ((project as any)?.description as string | null | undefined) ?? "";
        dateStartDraft = dateStart != null ? String(dateStart) : "";
        dateEndDraft = dateEnd != null ? String(dateEnd) : "";
        dateStartLabelDraft = dateStartLabel;
        dateEndLabelDraft = dateEndLabel;
    });

    const previewDescription = $derived(descriptionDraft.trim());

    let coverInput = $state<HTMLInputElement | null>(null);
    let coverSaving = $state(false);
    let coverBust = $state("");
    let coverError = $state("");
    let coverPresent = $state(false);
    let coverCropOpen = $state(false);
    let coverCropUrl = $state("");

    $effect(() => {
        coverPresent = hasCover;
    });

    $effect(() => {
        if (coverCropOpen || !coverCropUrl.startsWith("blob:")) return;
        const url = coverCropUrl;
        coverCropUrl = "";
        URL.revokeObjectURL(url);
    });

    let tags = $state<string[]>([
        ...((((data as any)?.project)?.tags_manual as string[] | undefined) ??
            []),
    ]);
    const previewTags = $derived(tags.slice(0, 8));
    let tagDraft = $state("");
    let suggestions = $state<string[]>([]);

    $effect(() => {
        const q = tagDraft.trim();
        const have = new Set(tags.map((t) => t.toLowerCase()));
        if (q.length < 2) {
            suggestions = [];
            return;
        }
        let cancelled = false;
        const t = setTimeout(async () => {
            try {
                const res = await fetch(
                    `/api/v1/search/lexicon/tags?prefix=${encodeURIComponent(q)}&limit=8`,
                );
                if (!res.ok || cancelled) return;
                const body = (await res.json()) as { tags?: string[] };
                if (cancelled) return;
                suggestions = (body.tags ?? []).filter(
                    (s) => !have.has(s.toLowerCase()),
                );
            } catch {
                if (!cancelled) suggestions = [];
            }
        }, 200);
        return () => {
            cancelled = true;
            clearTimeout(t);
        };
    });

    function addTag(raw: string) {
        const t = raw.trim();
        if (!t) return;
        if (tags.some((x) => x.toLowerCase() === t.toLowerCase())) {
            tagDraft = "";
            suggestions = [];
            return;
        }
        if (tags.length >= 32) return;
        tags = [...tags, t.slice(0, 48)];
        tagDraft = "";
        suggestions = [];
    }

    function removeTag(index: number) {
        tags = tags.filter((_, i) => i !== index);
    }

    function onTagKey(e: KeyboardEvent) {
        if (e.key === "Enter" || e.key === ",") {
            e.preventDefault();
            addTag(tagDraft.replace(/,/g, ""));
            return;
        }
        if (e.key === "Backspace" && tagDraft === "" && tags.length > 0) {
            e.preventDefault();
            tags = tags.slice(0, -1);
        }
    }

    async function onCoverFile(event: Event) {
        const input = event.currentTarget as HTMLInputElement;
        const file = input.files?.[0];
        input.value = "";
        if (!file) return;
        if (!isAllowedAvatarType(file.type)) {
            coverError = "Choose a JPG, PNG, WEBP, or GIF image.";
            return;
        }
        if (coverCropUrl.startsWith("blob:")) URL.revokeObjectURL(coverCropUrl);
        coverCropUrl = URL.createObjectURL(file);
        coverCropOpen = true;
        coverError = "";
    }

    async function saveCroppedCover(file: File) {
        const supabase = createClient();
        const { data: sessionData } = await supabase.auth.getSession();
        const token = sessionData.session?.access_token;
        if (!token) throw new Error("Not signed in.");
        coverSaving = true;
        coverError = "";
        try {
            const res = await fetch(
                `/api/v1/projects/${encodeURIComponent(slug)}/cover`,
                {
                    method: "PUT",
                    headers: {
                        Authorization: `Bearer ${token}`,
                        "Content-Type": file.type || "image/webp",
                    },
                    body: file,
                },
            );
            if (!res.ok) throw new Error((await res.text()) || "Upload failed.");
            coverPresent = true;
            coverBust = String(Date.now());
            await invalidateAll();
        } catch (e) {
            coverError = e instanceof Error ? e.message : "Upload failed.";
            throw e;
        } finally {
            coverSaving = false;
            if (coverCropUrl.startsWith("blob:")) URL.revokeObjectURL(coverCropUrl);
            coverCropUrl = "";
        }
    }

    async function removeCover() {
        const supabase = createClient();
        const { data: sessionData } = await supabase.auth.getSession();
        const token = sessionData.session?.access_token;
        if (!token) {
            coverError = "Not signed in.";
            return;
        }
        coverSaving = true;
        coverError = "";
        try {
            const res = await fetch(
                `/api/v1/projects/${encodeURIComponent(slug)}/cover`,
                {
                    method: "DELETE",
                    headers: { Authorization: `Bearer ${token}` },
                },
            );
            if (!res.ok) {
                coverError = (await res.text()) || "Remove failed.";
                return;
            }
            coverPresent = false;
            coverBust = "";
            await invalidateAll();
        } catch (e: any) {
            coverError = e?.message ?? "Remove failed.";
        } finally {
            coverSaving = false;
        }
    }
</script>

<svelte:head>
    <title>General — {projectTitle} — echidna</title>
</svelte:head>

<div class="space-y-6 w-full">
    {#if form?.error || coverError}
        <p
            class="rounded-md border border-destructive/25 bg-destructive/5 px-3 py-2 text-sm text-destructive"
        >
            {coverError || form.error}
        </p>
    {/if}
    {#if form?.success}
        <p
            class="rounded-md border border-border bg-secondary/50 px-3 py-2 text-sm text-foreground"
        >
            Saved.
        </p>
    {/if}

    <section>
        <h2 class="text-sm font-medium text-foreground mb-1">Preview</h2>
        <p class="text-sm text-muted-foreground mb-4">
            How this project appears in search and on the map.
        </p>
        <ProjectPreviewCard
            {slug}
            title={titleDraft}
            description={previewDescription}
            tags={previewTags}
            hasCover={coverPresent}
            {coverBust}
            href="/{slug}"
        />
    </section>

    <div class="flex flex-wrap gap-2">
        <input
            bind:this={coverInput}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            class="sr-only"
            onchange={onCoverFile}
        />
        <button
            type="button"
            class="inline-flex cursor-pointer items-center gap-2 rounded-md border border-border px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-50"
            disabled={coverSaving}
            onclick={() => coverInput?.click()}
        >
            {coverPresent ? "Replace cover" : "Upload cover"}
        </button>
        {#if coverPresent}
            <button
                type="button"
                class="inline-flex items-center rounded-md border border-border px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-50"
                disabled={coverSaving}
                onclick={removeCover}
            >
                Remove cover
            </button>
        {/if}
    </div>

    <CoverCropDialog
        bind:open={coverCropOpen}
        imageUrl={coverCropUrl}
        saving={coverSaving}
        onSave={saveCroppedCover}
    />

    <form method="POST" action="?/updateGeneral" use:enhance class="space-y-6">
        {#each tags as tag}
            <input type="hidden" name="tag" value={tag} />
        {/each}

        <section>
            <h2 class="text-sm font-medium text-foreground mb-1">
                Title & description
            </h2>
            <p class="text-sm text-muted-foreground mb-4">
                Title appears on the project home and in search. Description is
                the short blurb under the cover.
            </p>
            <FieldGroup>
                <Field>
                    <FieldLabel for="title">Title</FieldLabel>
                    <Input
                        id="title"
                        name="title"
                        required
                        bind:value={titleDraft}
                        placeholder="Project title"
                    />
                </Field>
                <Field>
                    <FieldLabel for="description">Description</FieldLabel>
                    <textarea
                        id="description"
                        name="description"
                        rows="4"
                        bind:value={descriptionDraft}
                        class="dark:bg-input/30 border-input focus-visible:border-ring focus-visible:ring-ring/50 placeholder:text-muted-foreground h-auto min-h-[2.5rem] w-full rounded-md border bg-transparent px-2.5 py-2 text-sm shadow-xs outline-none focus-visible:ring-3"
                        placeholder="Source, citation, short context…"
                    ></textarea>
                    <FieldDescription>
                        Longer notes belong in the project README.
                    </FieldDescription>
                </Field>
            </FieldGroup>
        </section>

        <section>
            <h2 class="text-sm font-medium text-foreground mb-1">Dates</h2>
            <p class="text-sm text-muted-foreground mb-4">
                Temporal extent for search and the project home rail. Negative
                years are BCE.
            </p>
            <FieldGroup>
                <div class="grid gap-4 sm:grid-cols-2">
                    <Field>
                        <FieldLabel for="date_start">Start year</FieldLabel>
                        <Input
                            id="date_start"
                            name="date_start"
                            type="number"
                            step="1"
                            bind:value={dateStartDraft}
                            placeholder="-800"
                        />
                    </Field>
                    <Field>
                        <FieldLabel for="date_end">End year</FieldLabel>
                        <Input
                            id="date_end"
                            name="date_end"
                            type="number"
                            step="1"
                            bind:value={dateEndDraft}
                            placeholder="400"
                        />
                    </Field>
                    <Field>
                        <FieldLabel for="date_start_label">Start label</FieldLabel>
                        <Input
                            id="date_start_label"
                            name="date_start_label"
                            bind:value={dateStartLabelDraft}
                            placeholder="Iron Age"
                        />
                    </Field>
                    <Field>
                        <FieldLabel for="date_end_label">End label</FieldLabel>
                        <Input
                            id="date_end_label"
                            name="date_end_label"
                            bind:value={dateEndLabelDraft}
                            placeholder="Roman"
                        />
                    </Field>
                </div>
            </FieldGroup>
        </section>

        <section>
            <h2 class="text-sm font-medium text-foreground mb-1">Tags</h2>
            <p class="text-sm text-muted-foreground mb-4">
                Curator tags for search and similar projects. Press Enter or
                comma to add.
            </p>
            <Field>
                <div
                    class="dark:bg-input/30 border-input focus-within:border-ring focus-within:ring-ring/50 flex min-h-9 w-full flex-wrap items-center gap-1.5 rounded-md border bg-transparent px-2 py-1.5 shadow-xs focus-within:ring-3"
                >
                    {#each tags as tag, i}
                        <span
                            class="inline-flex items-center gap-1 rounded-md bg-secondary px-2 py-0.5 text-xs text-foreground/85"
                        >
                            {tag}
                            <button
                                type="button"
                                class="text-muted-foreground hover:text-foreground"
                                aria-label="Remove {tag}"
                                onclick={() => removeTag(i)}
                            >
                                <XIcon class="size-3" />
                            </button>
                        </span>
                    {/each}
                    <input
                        id="tag-input"
                        name="tag_draft"
                        bind:value={tagDraft}
                        onkeydown={onTagKey}
                        autocomplete="off"
                        class="min-w-[8rem] flex-1 bg-transparent py-0.5 text-sm outline-none placeholder:text-muted-foreground"
                        placeholder={tags.length
                            ? "Add tag"
                            : "Place, period, topic…"}
                    />
                </div>
                {#if suggestions.length > 0}
                    <ul
                        class="surface mt-2 rounded-md border border-border p-1 text-sm shadow-md"
                    >
                        {#each suggestions as s}
                            <li>
                                <button
                                    type="button"
                                    class="flex w-full rounded-sm px-2 py-1.5 text-left hover:bg-accent"
                                    onclick={() => addTag(s)}
                                >
                                    {s}
                                </button>
                            </li>
                        {/each}
                    </ul>
                {/if}
            </Field>
        </section>

        <div class="flex items-center gap-3 border-t border-border pt-6">
            <Button type="submit">Save changes</Button>
            <a
                href="/{slug}"
                class="text-sm text-muted-foreground no-underline hover:text-foreground"
                >View project</a
            >
        </div>
    </form>
</div>
