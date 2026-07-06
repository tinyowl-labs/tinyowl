<script lang="ts">
    import { enhance } from "$app/forms";
    import PencilIcon from "@lucide/svelte/icons/pencil";
    import ClockIcon from "@lucide/svelte/icons/clock";
    import BookOpenIcon from "@lucide/svelte/icons/book-open";
    import ChevronDownIcon from "@lucide/svelte/icons/chevron-down";
    import ExternalLinkIcon from "@lucide/svelte/icons/external-link";
    import Loader2Icon from "@lucide/svelte/icons/loader-2";
    import FileTextIcon from "@lucide/svelte/icons/file-text";
    import { marked } from "marked";
    import { browser } from "$app/environment";

    let { data, form } = $props();

    const project = $derived(data?.project);
    const isMember = $derived(data?.isMember);
    const entities = $derived(data?.entities ?? []);
    const head = $derived(data?.head as Record<string, unknown> | null);
    const readmeRaw = $derived(data?.readme ?? null);

    const descriptionHtml = $derived(
        project?.description ? marked.parse(project.description as string) : "",
    );

    // Split markdown into H1-headed sections for accordion rendering.
    // Sections without an H1 get an empty title (rendered as a non-collapsible preamble).
    interface Section {
        title: string;
        html: string;
    }
    const sections = $derived.by(() => {
        const raw = (project?.description as string) ?? "";
        if (!raw.trim()) return [];

        // Split on lines that start with "# " (H1)
        const parts = raw.split(/^(?=# )/m);
        return parts
            .map((part) => {
                const trimmed = part.trim();
                const m = trimmed.match(/^# (.+)$/m);
                if (m) {
                    const body = trimmed.replace(/^# .+\n?/, "").trim();
                    return {
                        title: m[1].trim(),
                        html: body ? marked.parse(body) : "",
                    };
                }
                // Preamble text before first H1
                return {
                    title: "",
                    html: marked.parse(trimmed),
                };
            })
            .filter((s) => s.html);
    });

    // Track which accordion sections are collapsed. All start expanded.
    let collapsed = $state<Record<number, boolean>>({});
    function toggleSection(idx: number) {
        collapsed = { ...collapsed, [idx]: !collapsed[idx] };
    }

    const updated = $derived(
        head?.created_at
            ? new Date(head.created_at as string).toLocaleDateString("en-GB", {
                  day: "numeric",
                  month: "long",
                  year: "numeric",
              })
            : null,
    );

    // Research accordion
    let expanded = $state(false);

    // Map rendering action (client-side only)
    async function renderMap(node: HTMLElement, bboxStr: string) {
        if (!browser) return;
        const L = (await import("leaflet")).default;
        await import("leaflet/dist/leaflet.css");

        const map = L.map(node, {
            attributionControl: false,
            zoomControl: false,
            dragging: false,
            scrollWheelZoom: false,
            touchZoom: false,
            doubleClickZoom: false,
        }).setView([0, 0], 1);

        L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
            maxZoom: 19,
        }).addTo(map);

        try {
            const geojson = JSON.parse(bboxStr);
            const layer = L.geoJSON(geojson, {
                style: {
                    color: "hsl(var(--primary))",
                    weight: 2,
                    fillOpacity: 0.1,
                },
            }).addTo(map);
            map.fitBounds(layer.getBounds(), { padding: [20, 20] });
        } catch (_) {}

        return {
            destroy() {
                map.remove();
            },
        };
    }

    let articles = $state<Article[]>([]);
    let loading = $state(false);
    let error = $state("");

    // Readme editing
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

    async function toggle() {
        expanded = !expanded;
        if (expanded && articles.length === 0 && !loading) {
            loading = true;
            error = "";
            try {
                const query = encodeURIComponent(project?.title ?? "");
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
                error = e?.message ?? "Failed to load";
            } finally {
                loading = false;
            }
        }
    }
</script>

<svelte:head>
    <title>{project?.title ?? "Project"} — TinyOwl</title>
</svelte:head>

<article class="mx-auto max-w-4xl px-6 py-12">
    <!-- Title -->
    <div class="mb-10">
        <div class="flex items-center gap-3">
            <h1 class="text-4xl font-bold tracking-tight text-foreground">
                {project?.title ?? "Untitled"}
            </h1>
            {#if isMember}
                <a
                    href="/{project?.slug}/settings"
                    class="text-muted-foreground hover:text-foreground transition-colors -mb-1"
                    title="Edit project"
                >
                    <PencilIcon class="size-5" />
                </a>
            {/if}
        </div>
        {#if updated}
            <div
                class="mt-3 flex items-center gap-1 text-sm text-muted-foreground"
            >
                <ClockIcon class="size-3.5" />
                Updated {updated}
            </div>
        {/if}
    </div>

    <!-- Description (markdown, Wikipedia-style accordion) -->
    {#if sections.length > 0}
        <section class="mb-10 max-w-2xl">
            {#each sections as section, idx}
                {#if section.title}
                    <!-- H1 accordion section -->
                    <div
                        class="rounded-lg border border-border mb-3 overflow-hidden"
                    >
                        <button
                            onclick={() => toggleSection(idx)}
                            class="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-secondary/30 transition-colors"
                        >
                            <h2
                                class="text-lg font-semibold tracking-tight text-foreground"
                            >
                                {section.title}
                            </h2>
                            <ChevronDownIcon
                                class="size-4 shrink-0 text-muted-foreground transition-transform duration-150 {collapsed[
                                    idx
                                ]
                                    ? ''
                                    : 'rotate-180'}"
                            />
                        </button>
                        {#if !collapsed[idx]}
                            <div class="border-t border-border px-4 py-4">
                                <div
                                    class="prose dark:prose-invert max-w-none
                                        prose-headings:font-semibold prose-headings:tracking-tight prose-headings:text-foreground
                                        prose-h2:text-2xl prose-h2:mt-8 prose-h2:mb-3
                                        prose-h3:text-xl prose-h3:mt-6 prose-h3:mb-2
                                        prose-h4:text-lg prose-h4:mt-4 prose-h4:mb-1.5
                                        prose-p:text-foreground/80 prose-p:leading-relaxed prose-p:text-base
                                        prose-a:text-primary prose-a:no-underline hover:prose-a:underline
                                        prose-strong:text-foreground
                                        prose-li:text-foreground/80
                                        prose-code:text-sm prose-code:bg-secondary prose-code:rounded prose-code:px-1.5 prose-code:py-0.5
                                        prose-pre:bg-secondary"
                                >
                                    {@html section.html}
                                </div>
                            </div>
                        {/if}
                    </div>
                {:else}
                    <!-- Preamble (no H1) -->
                    <div
                        class="prose dark:prose-invert max-w-none prose-headings:text-foreground prose-p:text-foreground/80 prose-p:leading-relaxed prose-a:text-primary mb-6"
                    >
                        {@html section.html}
                    </div>
                {/if}
            {/each}
        </section>
    {:else}
        <section class="mb-10">
            <p class="text-base leading-relaxed text-foreground/80 max-w-2xl">
                {project?.description ?? ""}
            </p>
        </section>
    {/if}

    <!-- Project extent map -->
    {#if project?.bbox}
        <section class="mb-10 max-w-2xl">
            <div class="rounded-lg border border-border overflow-hidden">
                <div
                    class="w-full h-48 bg-secondary/20"
                    use:renderMap={project.bbox}
                ></div>
            </div>
        </section>
    {/if}

    <!-- Research accordion -->
    <section class="mb-10 max-w-2xl">
        <div class="rounded-lg border border-border overflow-hidden">
            <button
                onclick={toggle}
                class="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-secondary/50 transition-colors"
            >
                <div class="flex items-center gap-2.5 min-w-0">
                    <BookOpenIcon
                        class="size-4 shrink-0 text-muted-foreground"
                    />
                    <span class="text-sm font-medium text-foreground">
                        Related research
                    </span>
                    {#if articles.length > 0 && !loading}
                        <span class="text-xs text-muted-foreground">
                            ({articles.length})
                        </span>
                    {/if}
                </div>
                <ChevronDownIcon
                    class="size-4 shrink-0 text-muted-foreground transition-transform duration-150 {expanded
                        ? 'rotate-180'
                        : ''}"
                />
            </button>

            {#if expanded}
                <div class="border-t border-border">
                    {#if loading}
                        <div
                            class="flex items-center justify-center py-10 gap-2 text-sm text-muted-foreground"
                        >
                            <Loader2Icon class="size-4 animate-spin" />
                            Searching…
                        </div>
                    {:else if error}
                        <div
                            class="py-10 text-center text-sm text-muted-foreground px-4"
                        >
                            {error}
                        </div>
                    {:else if articles.length === 0}
                        <div
                            class="py-10 text-center text-sm text-muted-foreground px-4"
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
                                            {article.authors || "Unknown"}
                                            {#if article.year}
                                                · {article.year}{/if}
                                            {#if article.citedBy > 0}
                                                <span
                                                    class="text-muted-foreground/50"
                                                >
                                                    · Cited {article.citedBy}
                                                    {article.citedBy === 1
                                                        ? "time"
                                                        : "times"}
                                                </span>
                                            {/if}
                                        </p>
                                        {#if article.journal}
                                            <p
                                                class="text-[10px] text-muted-foreground/60 mt-0.5 truncate"
                                            >
                                                {article.journal}
                                            </p>
                                        {/if}
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
    </section>

    <!-- README -->
    <section class="mb-10 max-w-2xl">
        {#if editing}
            <form
                method="POST"
                action="?/saveReadme"
                use:enhance
                class="space-y-3"
            >
                <div class="flex items-center justify-between">
                    <div class="flex items-center gap-2">
                        <FileTextIcon class="size-4 text-muted-foreground" />
                        <span class="text-sm font-medium text-foreground"
                            >README.md</span
                        >
                    </div>
                </div>
                <textarea
                    name="content"
                    bind:value={editContent}
                    rows={12}
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
                    >
                        Cancel
                    </button>
                    <button
                        type="submit"
                        class="inline-flex items-center rounded-md bg-primary text-primary-foreground px-3 py-1.5 text-sm font-medium hover:bg-primary/90 transition-colors"
                    >
                        Save
                    </button>
                </div>
            </form>
        {:else if readmeRaw}
            <div class="group relative">
                {#if isMember}
                    <button
                        onclick={startEdit}
                        class="absolute -right-2 -top-1 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center size-7 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary"
                        title="Edit README"
                    >
                        <PencilIcon class="size-3.5" />
                    </button>
                {/if}
                <div class="readme-content">
                    {@html marked.parse(readmeRaw)}
                </div>
            </div>
        {:else if isMember}
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

    <!-- Entity table -->
    {#if entities.length > 0}
        <section class="mb-10">
            <h2 class="text-lg font-semibold text-foreground mb-4">Entities</h2>
            <div
                class="overflow-hidden rounded-lg border border-border bg-card"
            >
                <table class="w-full text-sm">
                    <thead class="border-b border-border">
                        <tr
                            class="bg-secondary/50 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider"
                        >
                            <th class="px-4 py-2.5 font-medium">Type</th>
                            <th class="px-4 py-2.5 font-medium">Label</th>
                            <th
                                class="px-4 py-2.5 font-medium hidden sm:table-cell"
                                >ID</th
                            >
                        </tr>
                    </thead>
                    <tbody class="divide-y divide-border">
                        {#each entities as entity}
                            <tr class="hover:bg-secondary/30 transition-colors">
                                <td class="px-4 py-2.5 text-muted-foreground">
                                    {entity.type ?? "—"}
                                </td>
                                <td
                                    class="px-4 py-2.5 text-foreground font-medium"
                                >
                                    {entity.label ?? entity.id ?? "—"}
                                </td>
                                <td
                                    class="px-4 py-2.5 text-muted-foreground font-mono text-xs hidden sm:table-cell"
                                >
                                    {entity.id ?? "—"}
                                </td>
                            </tr>
                        {/each}
                    </tbody>
                </table>
            </div>
            {#if entities.length >= 50}
                <p class="mt-2 text-xs text-muted-foreground">
                    Showing first 50 entities.
                </p>
            {/if}
        </section>
    {/if}
</article>

<style>
    :global(.readme-content) {
        font-size: 0.9375rem;
        line-height: 1.7;
        color: hsl(var(--foreground));
        max-width: none;
    }

    :global(.readme-content h1) {
        font-size: 1.75rem;
        font-weight: 600;
        margin: 1.5em 0 0.5em;
        padding-bottom: 0.3em;
        border-bottom: 1px solid hsl(var(--border));
        color: hsl(var(--foreground));
        line-height: 1.3;
    }
    :global(.readme-content h1:first-child) {
        margin-top: 0;
    }
    :global(.readme-content h2) {
        font-size: 1.35rem;
        font-weight: 600;
        margin: 1.8em 0 0.4em;
        padding-bottom: 0.25em;
        border-bottom: 1px solid hsl(var(--border));
        color: hsl(var(--foreground));
        line-height: 1.3;
    }
    :global(.readme-content h3) {
        font-size: 1.15rem;
        font-weight: 600;
        margin: 1.4em 0 0.3em;
        color: hsl(var(--foreground));
        line-height: 1.3;
    }
    :global(.readme-content h4) {
        font-size: 1rem;
        font-weight: 600;
        margin: 1.2em 0 0.2em;
        color: hsl(var(--foreground));
    }
    :global(.readme-content p) {
        margin: 0.8em 0;
    }
    :global(.readme-content p:first-child) {
        margin-top: 0;
    }
    :global(.readme-content strong) {
        font-weight: 600;
    }
    :global(.readme-content a) {
        color: hsl(var(--primary));
        text-decoration: none;
    }
    :global(.readme-content a:hover) {
        text-decoration: underline;
    }
    :global(.readme-content ul),
    :global(.readme-content ol) {
        margin: 0.5em 0;
        padding-left: 1.8em;
    }
    :global(.readme-content li) {
        margin: 0.15em 0;
    }
    :global(.readme-content ul) {
        list-style-type: disc;
    }
    :global(.readme-content ul ul) {
        list-style-type: circle;
    }
    :global(.readme-content ul ul ul) {
        list-style-type: square;
    }
    :global(.readme-content blockquote) {
        margin: 0.8em 0;
        padding: 0.5em 1em;
        border-left: 4px solid hsl(var(--border));
        background: hsl(var(--secondary) / 0.5);
        color: hsl(var(--muted-foreground));
    }
    :global(.readme-content blockquote p) {
        margin: 0.3em 0;
    }
    :global(.readme-content code) {
        font-family:
            ui-monospace, "Cascadia Code", "Source Code Pro", Menlo, Consolas,
            monospace;
        font-size: 0.875em;
        background: hsl(var(--secondary) / 0.7);
        padding: 0.15em 0.4em;
        border-radius: 3px;
    }
    :global(.readme-content pre) {
        margin: 0.8em 0;
        padding: 1em 1.2em;
        background: hsl(var(--secondary) / 0.5);
        border: 1px solid hsl(var(--border));
        border-radius: 6px;
        overflow-x: auto;
        font-size: 0.85em;
        line-height: 1.5;
    }
    :global(.readme-content pre code) {
        background: none;
        padding: 0;
        font-size: inherit;
    }
    :global(.readme-content table) {
        width: 100%;
        margin: 0.8em 0;
        border-collapse: collapse;
        font-size: 0.9em;
    }
    :global(.readme-content thead th) {
        background: hsl(var(--secondary) / 0.6);
        font-weight: 600;
        text-align: left;
        padding: 0.5em 0.75em;
        border: 1px solid hsl(var(--border));
        font-size: 0.9em;
    }
    :global(.readme-content tbody td) {
        padding: 0.4em 0.75em;
        border: 1px solid hsl(var(--border));
        vertical-align: top;
    }
    :global(.readme-content tbody tr:nth-child(even)) {
        background: hsl(var(--secondary) / 0.3);
    }
    :global(.readme-content hr) {
        margin: 1.5em 0;
        border: none;
        border-top: 1px solid hsl(var(--border));
    }
    :global(.readme-content img) {
        max-width: 100%;
        height: auto;
        border-radius: 4px;
    }
</style>
