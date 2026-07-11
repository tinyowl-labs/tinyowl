<script lang="ts">
    import { enhance } from "$app/forms";
    import PencilIcon from "@lucide/svelte/icons/pencil";
    import ClockIcon from "@lucide/svelte/icons/clock";
    import BookOpenIcon from "@lucide/svelte/icons/book-open";
    import LayersIcon from "@lucide/svelte/icons/layers";
    import ChevronDownIcon from "@lucide/svelte/icons/chevron-down";
    import ExternalLinkIcon from "@lucide/svelte/icons/external-link";
    import Loader2Icon from "@lucide/svelte/icons/loader-2";
    import FileTextIcon from "@lucide/svelte/icons/file-text";
    import { marked } from "marked";
    import BboxMap from "$lib/components/dashboard/BboxMap.svelte";

    let { data, form } = $props();

    const project = $derived(data?.project);
    const accessToken = $derived(((data as any)?.accessToken as string) ?? "");
    const role = $derived(((data as any)?.role as string) ?? "viewer");
    const canManage = $derived(role === "owner" || role === "admin");
    const head = $derived(
        (data as any)?.head as Record<string, unknown> | null,
    );
    const updated = $derived(
        head?.created_at
            ? new Date(head.created_at as string).toLocaleDateString("en-GB", {
                  day: "numeric",
                  month: "long",
                  year: "numeric",
              })
            : null,
    );
    const readmeRaw = $derived(data?.readme ?? null);

    const tagsManual = $derived(
        ((project as any)?.tags_manual as string[] | undefined) ?? [],
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
        ((project as any)?.date_start_label as string | null | undefined) ??
            null,
    );
    const dateEndLabel = $derived(
        ((project as any)?.date_end_label as string | null | undefined) ?? null,
    );
    const dateRangeText = $derived.by(() => {
        const fmt = (y: number | null | undefined, label: string | null) => {
            if (y == null && !label) return null;
            if (label && y != null) {
                const era = y < 0 ? `${Math.abs(y)} BCE` : `${y} CE`;
                return `${label} (${era})`;
            }
            if (label) return label;
            if (y == null) return null;
            return y < 0 ? `${Math.abs(y)} BCE` : `${y} CE`;
        };
        const a = fmt(dateStart, dateStartLabel);
        const b = fmt(dateEnd, dateEndLabel);
        if (!a && !b) return null;
        if (a && b) return `${a} – ${b}`;
        return a ?? b;
    });

    // Quieter tag display: prefer manual, de-dupe, drop noisy auto heading crumbs.
    const noisyAuto = new Set([
        "details",
        "project-details",
        "overview",
        "introduction",
        "excavations",
        "project",
    ]);
    const displayTags = $derived.by(() => {
        const manual = [...new Set(tagsManual.map((t) => t.trim()).filter(Boolean))];
        const manualSet = new Set(manual.map((t) => t.toLowerCase()));
        const auto = [
            ...new Set(
                tagsAuto
                    .map((t) => t.trim())
                    .filter(Boolean)
                    .filter((t) => !manualSet.has(t.toLowerCase()))
                    .filter((t) => !noisyAuto.has(t.toLowerCase()))
                    .filter((t) => !t.includes("-excavations"))
                    .filter((t) => t.length >= 3 && t.length <= 32),
            ),
        ].slice(0, 8);
        return { manual, auto };
    });

    // Drop leading H1 when it duplicates the project title.
    const readmeHtml = $derived.by(() => {
        let raw = readmeRaw ?? "";
        if (!raw.trim()) return "";
        const title = ((project?.title as string) ?? "").trim().toLowerCase();
        const m = raw.match(/^#\s+(.+?)\s*\n+/);
        if (m && title && m[1].trim().toLowerCase() === title) {
            raw = raw.slice(m[0].length);
        }
        return marked.parse(raw) as string;
    });

    let editing = $state(false);
    let editContent = $state("");

    $effect(() => {
        if (form?.success) editing = false;
    });

    function startEdit() {
        editContent = readmeRaw ?? "";
        editing = true;
    }

    interface Article {
        title: string;
        authors: string;
        year: number | null;
        journal: string;
        citedBy: number;
        url: string;
    }

    interface SimilarItem {
        slug: string;
        title: string;
        description?: string | null;
        score: number;
        tag_overlap: number;
        shared_tags?: string[];
        temporal_overlap?: boolean;
        spatial_overlap?: boolean;
    }

    let researchOpen = $state(false);
    let articles = $state<Article[]>([]);
    let researchLoading = $state(false);
    let researchError = $state("");

    let similarOpen = $state(false);
    let similar = $state<SimilarItem[]>([]);
    let similarLoading = $state(false);
    let similarError = $state("");
    let similarFetched = $state(false);

    async function toggleResearch() {
        researchOpen = !researchOpen;
        if (researchOpen && articles.length === 0 && !researchLoading) {
            researchLoading = true;
            researchError = "";
            try {
                // Prefer place/topic tags; drop product/UI noise. Hyphens → spaces for OpenAlex.
                const drop = new Set([
                    "qfield",
                    "demo",
                    "project",
                    "present",
                    "survey",
                ]);
                const tagBits = [...tagsManual, ...tagsAuto]
                    .map((t) => t.trim().toLowerCase())
                    .filter((t) => t && !drop.has(t))
                    .map((t) => t.replace(/-/g, " "))
                    .filter(Boolean)
                    .slice(0, 5)
                    .join(" ");
                const titleBits = String(project?.title ?? "")
                    .replace(/\bQField\b/gi, "")
                    .replace(/\bDemo\b/gi, "")
                    .replace(/\s+/g, " ")
                    .trim();
                const q = [titleBits, tagBits].filter(Boolean).join(" ");
                const query = encodeURIComponent(q || "archaeology");
                const res = await fetch(
                    `https://api.openalex.org/works?search=${query}&per_page=6&sort=cited_by_count:desc`,
                );
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                const json = await res.json();
                articles = (json.results ?? [])
                    .map((w: any) => ({
                        title: w.title ?? "",
                        authors:
                            (w.authorships ?? [])
                                .slice(0, 3)
                                .map((a: any) => a.author?.display_name ?? "")
                                .filter(Boolean)
                                .join(", ") +
                            (w.authorships?.length > 3 ? " et al." : ""),
                        year: w.publication_year ?? null,
                        journal: w.primary_location?.source?.display_name ?? "",
                        citedBy: w.cited_by_count ?? 0,
                        url: w.doi
                            ? `https://doi.org/${w.doi.replace("https://doi.org/", "")}`
                            : (w.id ?? ""),
                    }))
                    .filter((a: Article) => a.title);
            } catch (e: any) {
                researchError = e?.message ?? "Failed to load";
            } finally {
                researchLoading = false;
            }
        }
    }

    async function toggleSimilar() {
        similarOpen = !similarOpen;
        if (similarOpen && !similarFetched && !similarLoading) {
            similarLoading = true;
            similarError = "";
            try {
                const headers: HeadersInit = {};
                if (accessToken) {
                    headers.Authorization = `Bearer ${accessToken}`;
                }
                const res = await fetch(
                    `/api/v1/projects/${project?.slug}/similar?limit=6`,
                    { headers },
                );
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                similar = await res.json();
                similarFetched = true;
            } catch (e: any) {
                similarError = e?.message ?? "Failed to load";
            } finally {
                similarLoading = false;
            }
        }
    }
</script>

<svelte:head>
    <title>{project?.title ?? "Project"} — TinyOwl</title>
</svelte:head>

<article class="mx-auto max-w-5xl px-6 py-12">
    <div class="mb-8">
        <div class="flex items-center gap-3">
            <h1 class="text-4xl font-bold tracking-tight text-foreground">
                {project?.title ?? "Untitled"}
            </h1>
            {#if canManage}
                <a
                    href="/{project?.slug}/settings"
                    class="text-muted-foreground hover:text-foreground transition-colors -mb-1"
                    title="Edit project"
                >
                    <PencilIcon class="size-5" />
                </a>
            {/if}
        </div>
        <div
            class="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground"
        >
            {#if updated}
                <span class="inline-flex items-center gap-1">
                    <ClockIcon class="size-3.5" />
                    Updated {updated}
                </span>
            {/if}
            {#if dateRangeText}
                {#if updated}<span class="text-muted-foreground/40">·</span>{/if}
                <span>{dateRangeText}</span>
            {/if}
            {#if project?.entity_count != null || project?.table_count != null}
                <span class="text-muted-foreground/40">·</span>
                <span>
                    {#if project?.entity_count != null}{project.entity_count} entities{/if}
                    {#if project?.entity_count != null && project?.table_count != null} · {/if}
                    {#if project?.table_count != null}{project.table_count} tables{/if}
                </span>
            {/if}
        </div>
    </div>

    <div class="grid gap-8 lg:grid-cols-[minmax(0,1fr)_16rem] lg:items-start">
        <div class="min-w-0">
            {#if (project as any)?.bbox}
                <section class="mb-8">
                    <BboxMap
                        bbox={(project as any).bbox}
                        href={`/${project?.slug}/layers`}
                        class="h-48"
                    />
                </section>
            {/if}

            <section>
                {#if displayTags.manual.length > 0 || displayTags.auto.length > 0}
                    <div class="mb-5 flex flex-wrap items-center gap-2">
                        {#each displayTags.manual as tag}
                            <span
                                class="rounded-md bg-secondary px-2 py-1 text-[12px] text-foreground/85"
                                >{tag}</span
                            >
                        {/each}
                        {#if displayTags.manual.length > 0 && displayTags.auto.length > 0}
                            <span class="text-muted-foreground/30 mx-0.5">·</span>
                        {/if}
                        {#each displayTags.auto as tag, i}
                            <span
                                class="text-[12px] text-muted-foreground/65"
                                title="Auto-derived">{tag}</span
                            >
                            {#if i < displayTags.auto.length - 1}
                                <span class="text-muted-foreground/25">·</span>
                            {/if}
                        {/each}
                    </div>
                {/if}

                {#if editing}
                    <form
                        method="POST"
                        action="?/saveReadme"
                        use:enhance
                        class="space-y-3"
                    >
                        <div class="flex items-center gap-2">
                            <FileTextIcon class="size-4 text-muted-foreground" />
                            <span class="text-sm font-medium text-foreground"
                                >README.md</span
                            >
                        </div>
                        <textarea
                            name="content"
                            bind:value={editContent}
                            rows={16}
                            class="w-full rounded-lg border border-input bg-background px-3.5 py-3 text-sm font-mono shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-y"
                            placeholder="# Project Title&#10;&#10;Describe your project here..."
                        ></textarea>
                        {#if form?.error}
                            <p class="text-sm text-destructive">{form.error}</p>
                        {/if}
                        <div class="flex gap-2 justify-end">
                            <button
                                type="button"
                                onclick={() => (editing = false)}
                                class="inline-flex items-center rounded-md border border-input bg-background px-3 py-1.5 text-sm hover:bg-secondary transition-colors"
                                >Cancel</button
                            >
                            <button
                                type="submit"
                                class="inline-flex items-center rounded-md bg-primary text-primary-foreground px-3 py-1.5 text-sm font-medium hover:bg-primary/90 transition-colors"
                                >Save</button
                            >
                        </div>
                    </form>
                {:else if readmeRaw}
                    <div class="group relative">
                        {#if canManage}
                            <button
                                onclick={startEdit}
                                class="absolute -right-2 -top-1 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center size-7 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary"
                                title="Edit README"
                            >
                                <PencilIcon class="size-3.5" />
                            </button>
                        {/if}
                        <div class="readme-content">{@html readmeHtml}</div>
                    </div>
                {:else if canManage}
                    <button
                        onclick={startEdit}
                        class="flex items-center gap-2 rounded-lg border border-dashed border-border px-4 py-3 w-full text-left hover:bg-secondary/50 transition-colors"
                    >
                        <FileTextIcon class="size-4 text-muted-foreground" />
                        <span class="text-sm text-muted-foreground"
                            >Add a README.md to describe this project</span
                        >
                    </button>
                {/if}
            </section>
        </div>

        <aside class="flex flex-col gap-3 lg:sticky lg:top-6">
            <div class="rounded-lg border border-border overflow-hidden">
                <button
                    onclick={toggleSimilar}
                    class="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-secondary/50 transition-colors"
                >
                    <div class="flex items-center gap-2.5 min-w-0">
                        <LayersIcon
                            class="size-4 shrink-0 text-muted-foreground"
                        />
                        <span class="text-sm font-medium text-foreground"
                            >Similar projects</span
                        >
                        {#if similar.length > 0 && !similarLoading}
                            <span class="text-xs text-muted-foreground"
                                >({similar.length})</span
                            >
                        {/if}
                    </div>
                    <ChevronDownIcon
                        class="size-4 shrink-0 text-muted-foreground transition-transform duration-150 {similarOpen
                            ? 'rotate-180'
                            : ''}"
                    />
                </button>
                {#if similarOpen}
                    <div class="border-t border-border">
                        {#if similarLoading}
                            <div
                                class="flex items-center justify-center py-8 gap-2 text-sm text-muted-foreground"
                            >
                                <Loader2Icon class="size-4 animate-spin" /> Finding…
                            </div>
                        {:else if similarError}
                            <div
                                class="py-8 text-center text-sm text-muted-foreground px-4"
                            >
                                {similarError}
                            </div>
                        {:else if similar.length === 0}
                            <div
                                class="py-8 text-center text-sm text-muted-foreground px-4"
                            >
                                No similar projects yet. Tags and dates improve
                                matches.
                            </div>
                        {:else}
                            <div class="divide-y divide-border">
                                {#each similar as item}
                                    <a
                                        href="/{item.slug}"
                                        class="block px-4 py-3 hover:bg-secondary/50 transition-colors no-underline group"
                                    >
                                        <p
                                            class="text-sm font-medium text-foreground group-hover:text-primary transition-colors line-clamp-2 leading-snug"
                                        >
                                            {item.title}
                                        </p>
                                        {#if item.shared_tags?.length}
                                            <p
                                                class="text-[11px] text-muted-foreground mt-1 line-clamp-1"
                                            >
                                                {item.shared_tags
                                                    .slice(0, 4)
                                                    .join(" · ")}
                                            </p>
                                        {:else if item.temporal_overlap || item.spatial_overlap}
                                            <p
                                                class="text-[11px] text-muted-foreground mt-1"
                                            >
                                                {#if item.spatial_overlap}Nearby{/if}
                                                {#if item.spatial_overlap && item.temporal_overlap}
                                                    ·
                                                {/if}
                                                {#if item.temporal_overlap}Overlapping dates{/if}
                                            </p>
                                        {/if}
                                    </a>
                                {/each}
                            </div>
                        {/if}
                    </div>
                {/if}
            </div>

            <div class="rounded-lg border border-border overflow-hidden">
                <button
                    onclick={toggleResearch}
                    class="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-secondary/50 transition-colors"
                >
                    <div class="flex items-center gap-2.5 min-w-0">
                        <BookOpenIcon
                            class="size-4 shrink-0 text-muted-foreground"
                        />
                        <span class="text-sm font-medium text-foreground"
                            >Related research</span
                        >
                        {#if articles.length > 0 && !researchLoading}
                            <span class="text-xs text-muted-foreground"
                                >({articles.length})</span
                            >
                        {/if}
                    </div>
                    <ChevronDownIcon
                        class="size-4 shrink-0 text-muted-foreground transition-transform duration-150 {researchOpen
                            ? 'rotate-180'
                            : ''}"
                    />
                </button>
                {#if researchOpen}
                    <div class="border-t border-border">
                        {#if researchLoading}
                            <div
                                class="flex items-center justify-center py-8 gap-2 text-sm text-muted-foreground"
                            >
                                <Loader2Icon class="size-4 animate-spin" /> Searching…
                            </div>
                        {:else if researchError}
                            <div
                                class="py-8 text-center text-sm text-muted-foreground px-4"
                            >
                                {researchError}
                            </div>
                        {:else if articles.length === 0}
                            <div
                                class="py-8 text-center text-sm text-muted-foreground px-4"
                            >
                                No articles found for this project.
                            </div>
                        {:else}
                            <div class="divide-y divide-border">
                                {#each articles as article}
                                    <a
                                        href={article.url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        class="flex items-start justify-between gap-3 px-4 py-3 hover:bg-secondary/50 transition-colors no-underline group"
                                    >
                                        <div class="min-w-0">
                                            <p
                                                class="text-sm font-medium text-foreground group-hover:text-primary transition-colors line-clamp-2 leading-snug"
                                            >
                                                {article.title}
                                            </p>
                                            <p
                                                class="text-xs text-muted-foreground mt-0.5"
                                            >
                                                {article.authors || "Unknown"}{#if article.year}
                                                    · {article.year}{/if}
                                            </p>
                                        </div>
                                        <ExternalLinkIcon
                                            class="size-3.5 shrink-0 mt-0.5 text-muted-foreground/20 group-hover:text-muted-foreground/50 transition-colors"
                                        />
                                    </a>
                                {/each}
                            </div>
                        {/if}
                        <div
                            class="px-4 py-2 border-t border-border bg-secondary/30"
                        >
                            <p class="text-[10px] text-muted-foreground">
                                via openalex.org
                            </p>
                        </div>
                    </div>
                {/if}
            </div>
        </aside>
    </div>
</article>

<style>
    :global(.readme-content) {
        font-size: 0.9375rem;
        line-height: 1.7;
        color: var(--color-foreground);
        max-width: none;
    }
    :global(.readme-content h1) {
        font-size: 1.75rem;
        font-weight: 600;
        margin: 1.5em 0 0.5em;
        padding-bottom: 0.3em;
        border-bottom: 1px solid var(--color-border);
        color: var(--color-foreground);
        line-height: 1.3;
    }
    :global(.readme-content h1:first-child) { margin-top: 0; }
    :global(.readme-content h2) {
        font-size: 1.35rem;
        font-weight: 600;
        margin: 1.8em 0 0.4em;
        padding-bottom: 0.25em;
        border-bottom: 1px solid var(--color-border);
        color: var(--color-foreground);
        line-height: 1.3;
    }
    :global(.readme-content h3) {
        font-size: 1.15rem;
        font-weight: 600;
        margin: 1.4em 0 0.3em;
        color: var(--color-foreground);
        line-height: 1.3;
    }
    :global(.readme-content h4) {
        font-size: 1rem;
        font-weight: 600;
        margin: 1.2em 0 0.2em;
        color: var(--color-foreground);
    }
    :global(.readme-content p) { margin: 0.8em 0; }
    :global(.readme-content p:first-child) { margin-top: 0; }
    :global(.readme-content strong) { font-weight: 600; }
    :global(.readme-content a) { color: var(--color-primary); text-decoration: none; }
    :global(.readme-content a:hover) { text-decoration: underline; }
    :global(.readme-content ul),
    :global(.readme-content ol) { margin: 0.5em 0; padding-left: 1.8em; }
    :global(.readme-content li) { margin: 0.15em 0; }
    :global(.readme-content ul) { list-style-type: disc; }
    :global(.readme-content ul ul) { list-style-type: circle; }
    :global(.readme-content ul ul ul) { list-style-type: square; }
    :global(.readme-content blockquote) {
        margin: 0.8em 0;
        padding: 0.5em 1em;
        border-left: 4px solid var(--color-border);
        background: color-mix(in oklab, var(--color-secondary) 50%, transparent);
        color: var(--color-muted-foreground);
    }
    :global(.readme-content blockquote p) { margin: 0.3em 0; }
    :global(.readme-content code) {
        font-family: ui-monospace, "Cascadia Code", "Source Code Pro", Menlo, Consolas, monospace;
        font-size: 0.875em;
        background: color-mix(in oklab, var(--color-secondary) 70%, transparent);
        padding: 0.15em 0.4em;
        border-radius: 3px;
    }
    :global(.readme-content pre) {
        margin: 0.8em 0;
        padding: 1em 1.2em;
        background: color-mix(in oklab, var(--color-secondary) 50%, transparent);
        border: 1px solid var(--color-border);
        border-radius: 6px;
        overflow-x: auto;
        font-size: 0.85em;
        line-height: 1.5;
    }
    :global(.readme-content pre code) { background: none; padding: 0; font-size: inherit; }
    :global(.readme-content table) { width: 100%; margin: 0.8em 0; border-collapse: collapse; font-size: 0.9em; }
    :global(.readme-content thead th) {
        background: color-mix(in oklab, var(--color-secondary) 60%, transparent);
        font-weight: 600;
        text-align: left;
        padding: 0.5em 0.75em;
        border: 1px solid var(--color-border);
        font-size: 0.9em;
    }
    :global(.readme-content tbody td) {
        padding: 0.4em 0.75em;
        border: 1px solid var(--color-border);
        vertical-align: top;
    }
    :global(.readme-content tbody tr:nth-child(even)) {
        background: color-mix(in oklab, var(--color-secondary) 30%, transparent);
    }
    :global(.readme-content hr) { margin: 1.5em 0; border: none; border-top: 1px solid var(--color-border); }
    :global(.readme-content img) { max-width: 100%; height: auto; border-radius: 4px; }
</style>
