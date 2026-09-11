<script lang="ts">
    import ArrowLeftIcon from "@lucide/svelte/icons/arrow-left";
    import FolderKanbanIcon from "@lucide/svelte/icons/folder-kanban";
    import MapIcon from "@lucide/svelte/icons/map";
    import { formatYear } from "$lib/search/params";
    import { projectTags, type DiscoveryProject } from "$lib/search/discovery";

    type Props = {
        project: DiscoveryProject;
        accessToken?: string | null;
        onBack: () => void;
    };

    let { project, accessToken = null, onBack }: Props = $props();

    let loading = $state(true);
    let entityCount = $state(0);
    let tableCount = $state(0);
    let hasCover = $state(false);

    function authHeaders(): HeadersInit {
        return accessToken
            ? { Authorization: `Bearer ${accessToken}` }
            : {};
    }

    $effect(() => {
        const slug = project.slug;
        let cancelled = false;
        loading = true;
        entityCount = 0;
        tableCount = 0;
        hasCover = false;

        void (async () => {
            try {
                const coverProbe = new Promise<boolean>((resolve) => {
                    const img = new Image();
                    img.onload = () => resolve(true);
                    img.onerror = () => resolve(false);
                    img.src = `/${encodeURIComponent(slug)}/cover`;
                });
                const tablesRes = await fetch(
                    `/api/v1/projects/${encodeURIComponent(slug)}/tables`,
                    { headers: authHeaders() },
                );
                if (cancelled) return;
                if (tablesRes.ok) {
                    const data = (await tablesRes.json()) as {
                        tables?: Record<string, string[]>;
                        counts?: Record<string, number>;
                    };
                    if (cancelled) return;
                    const counts = data.counts ?? {};
                    const names = Object.keys(data.tables ?? {});
                    tableCount = names.length;
                    entityCount = names.reduce(
                        (sum, name) => sum + (counts[name] ?? 0),
                        0,
                    );
                } else {
                    entityCount = project.entity_count;
                    tableCount = project.table_count;
                }
                hasCover = await coverProbe;
            } catch {
                if (cancelled) return;
                entityCount = project.entity_count;
                tableCount = project.table_count;
            }
            if (!cancelled) loading = false;
        })();

        return () => {
            cancelled = true;
        };
    });

    function datePoint(
        year: number | null | undefined,
        label: string | null | undefined,
    ): string | null {
        const l = label?.trim() || "";
        if (l && year != null) return `${l} (${formatYear(year)})`;
        if (l) return l;
        if (year != null) return formatYear(year);
        return null;
    }

    const tags = $derived(projectTags(project, 12));
    const dateStartText = $derived(
        datePoint(project.date_start, project.date_start_label),
    );
    const dateEndText = $derived(
        datePoint(project.date_end, project.date_end_label),
    );
    const hasDates = $derived(Boolean(dateStartText || dateEndText));
    const description = $derived((project.description ?? "").trim());
    const entityLabel = $derived(
        entityCount === 1 ? "entity" : "entities",
    );
    const tableLabel = $derived(tableCount === 1 ? "table" : "tables");

    const cta =
        "flex min-h-10 w-full items-center justify-center gap-2 rounded-lg px-3 py-2.5 text-sm font-medium no-underline transition-colors";
</script>

<div class="flex flex-col">
    {#if hasCover}
        <div class="relative">
            <img
                src="/{project.slug}/cover"
                alt=""
                class="aspect-[16/10] w-full object-cover"
            />
            <button
                type="button"
                onclick={onBack}
                class="absolute left-2.5 top-2.5 inline-flex items-center gap-1 rounded-md bg-background/85 px-2 py-1 text-xs text-foreground shadow-sm backdrop-blur-sm hover:bg-background"
            >
                <ArrowLeftIcon class="size-3.5" />
                Back
            </button>
        </div>
    {/if}

    <div class="flex flex-col gap-4 p-3">
        {#if !hasCover}
            <button
                type="button"
                onclick={onBack}
                class="inline-flex w-fit items-center gap-1 rounded-md text-xs text-muted-foreground hover:text-foreground"
            >
                <ArrowLeftIcon class="size-3.5" />
                Back
            </button>
        {/if}

        <div class="flex flex-col gap-1.5">
            <h2 class="text-base font-semibold leading-snug text-foreground">
                {project.title}
            </h2>
            {#if description}
                <p class="text-sm leading-relaxed text-muted-foreground">
                    {description}
                </p>
            {/if}
        </div>

        {#if hasDates}
            <div class="relative pl-3.5 text-xs">
                {#if dateStartText}
                    <div class="relative {dateEndText ? 'pb-4' : ''}">
                        {#if dateEndText}
                            <!-- Rail runs dot-center to dot-center (dots sit at top-1.5 + half of size-1.5). -->
                            <div
                                class="absolute -left-[10px] top-[9px] bottom-0 w-px bg-border"
                                aria-hidden="true"
                            ></div>
                        {/if}
                        <span
                            class="absolute -left-[12.5px] top-1.5 size-1.5 rounded-full bg-muted-foreground/70"
                            aria-hidden="true"
                        ></span>
                        <p
                            class="text-[11px] tracking-wide text-muted-foreground/75"
                        >
                            From
                        </p>
                        <p class="text-[13px] leading-snug text-foreground/90">
                            {dateStartText}
                        </p>
                    </div>
                {/if}
                {#if dateEndText}
                    <div class="relative">
                        {#if dateStartText}
                            <div
                                class="absolute -left-[10px] top-0 h-[9px] w-px bg-border"
                                aria-hidden="true"
                            ></div>
                        {/if}
                        <span
                            class="absolute -left-[12.5px] top-1.5 size-1.5 rounded-full bg-muted-foreground/70"
                            aria-hidden="true"
                        ></span>
                        <p
                            class="text-[11px] tracking-wide text-muted-foreground/75"
                        >
                            To
                        </p>
                        <p class="text-[13px] leading-snug text-foreground/90">
                            {dateEndText}
                        </p>
                    </div>
                {/if}
            </div>
        {/if}

        {#if tags.length}
            <div class="flex flex-wrap gap-x-2 gap-y-1">
                {#each tags as tag (tag)}
                    <span class="text-xs text-muted-foreground">#{tag}</span>
                {/each}
            </div>
        {/if}

        <div class="flex flex-col gap-2">
            <a
                href="/{encodeURIComponent(project.slug)}"
                class="{cta} border border-border bg-background text-foreground hover:bg-accent hover:text-accent-foreground"
            >
                <FolderKanbanIcon class="size-4" />
                Open project
            </a>
            <a
                href="/{encodeURIComponent(project.slug)}/layers?view=map"
                class="{cta} bg-foreground text-background hover:bg-primary hover:text-primary-foreground"
            >
                <MapIcon class="size-4" />
                Open map
            </a>
        </div>

        {#if !loading}
            <p class="text-xs text-muted-foreground">
                {entityCount.toLocaleString()}
                {entityLabel}
                <span class="text-muted-foreground/50">·</span>
                {tableCount.toLocaleString()}
                {tableLabel}
            </p>
        {/if}
    </div>
</div>
