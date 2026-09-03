<script lang="ts">
    import { enhance } from "$app/forms";
    import XIcon from "@lucide/svelte/icons/x";
    import { Button } from "$lib/components/ui/button/index.js";
    import { Input } from "$lib/components/ui/input/index.js";
    import {
        Field,
        FieldLabel,
        FieldDescription,
        FieldGroup,
    } from "$lib/components/ui/field/index.js";

    let { data, form: rawForm } = $props();
    const form = $derived(rawForm as any);

    const project = $derived(data?.project);
    const projectTitle = $derived(project?.title ?? "Project");
    const slug = $derived(
        ((data as { slug?: string }).slug ?? (project?.slug as string) ?? ""),
    );
    const currentDescription = $derived(
        ((project as any)?.description as string | null | undefined) ?? "",
    );
    const tagsAuto = $derived(
        ((project as any)?.tags_auto as string[] | undefined) ?? [],
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

    let tags = $state<string[]>(
        [
            ...((((data as any)?.project)?.tags_manual as string[] | undefined) ??
                []),
        ],
    );
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
</script>

<svelte:head>
    <title>General — {projectTitle} — echidna</title>
</svelte:head>

<section>
    <h2 class="text-sm font-medium text-foreground mb-1">General</h2>
    <p class="text-sm text-muted-foreground mb-4">
        Title, description, dates, and tags used on the project page and in
        search.
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
            Saved.
        </p>
    {/if}

    <form method="POST" action="?/updateGeneral" use:enhance class="space-y-4">
        {#each tags as tag}
            <input type="hidden" name="tag" value={tag} />
        {/each}
        <FieldGroup>
            <Field>
                <FieldLabel for="title">Title</FieldLabel>
                <Input
                    id="title"
                    name="title"
                    required
                    value={project?.title ?? ""}
                    placeholder="Project title"
                />
            </Field>
            <Field>
                <FieldLabel for="slug">Slug</FieldLabel>
                <Input
                    id="slug"
                    value={slug}
                    readonly
                    class="font-mono text-muted-foreground"
                />
                <FieldDescription>Used in URLs. Cannot be changed.</FieldDescription>
            </Field>
            <Field>
                <FieldLabel for="description">Description</FieldLabel>
                <textarea
                    id="description"
                    name="description"
                    rows="4"
                    class="dark:bg-input/30 border-input focus-visible:border-ring focus-visible:ring-ring/50 placeholder:text-muted-foreground h-auto min-h-[2.5rem] w-full rounded-md border bg-transparent px-2.5 py-2 text-sm shadow-xs outline-none focus-visible:ring-3"
                    placeholder="Source, citation, short context…">{currentDescription}</textarea
                >
                <FieldDescription>
                    Shown in search results. The README on the project page can
                    hold longer notes.
                </FieldDescription>
            </Field>
            <Field>
                <FieldLabel>Dates</FieldLabel>
                <div class="grid gap-4 sm:grid-cols-2">
                    <Field>
                        <FieldLabel for="date_start">Start year</FieldLabel>
                        <Input
                            id="date_start"
                            name="date_start"
                            type="number"
                            step="1"
                            value={dateStart ?? ""}
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
                            value={dateEnd ?? ""}
                            placeholder="400"
                        />
                    </Field>
                    <Field>
                        <FieldLabel for="date_start_label">Start label</FieldLabel>
                        <Input
                            id="date_start_label"
                            name="date_start_label"
                            value={dateStartLabel}
                            placeholder="Iron Age"
                        />
                    </Field>
                    <Field>
                        <FieldLabel for="date_end_label">End label</FieldLabel>
                        <Input
                            id="date_end_label"
                            name="date_end_label"
                            value={dateEndLabel}
                            placeholder="Roman"
                        />
                    </Field>
                </div>
                <FieldDescription>
                    Astronomical years — negative is BCE (−800 is 800 BCE).
                    Labels are optional. Clear the years to remove the extent.
                </FieldDescription>
            </Field>
            <Field>
                <FieldLabel for="tag-input">Tags</FieldLabel>
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
                        placeholder={tags.length ? "Add tag" : "Place, period, topic…"}
                    />
                </div>
                {#if suggestions.length > 0}
                    <ul
                        class="rounded-md border border-border bg-popover p-1 text-sm shadow-md"
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
                <FieldDescription>
                    Curator tags for search and similar projects. Press Enter or
                    comma to add.
                </FieldDescription>
                {#if tagsAuto.length > 0}
                    <p class="text-xs text-muted-foreground">
                        Auto-derived:
                        {tagsAuto.join(" · ")}
                    </p>
                {/if}
            </Field>
        </FieldGroup>
        <Button type="submit">Save</Button>
    </form>
</section>
