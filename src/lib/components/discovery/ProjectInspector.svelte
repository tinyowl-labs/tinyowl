<script lang="ts">
    import ArrowLeftIcon from "@lucide/svelte/icons/arrow-left";
    import BoxIcon from "@lucide/svelte/icons/box";
    import FolderKanbanIcon from "@lucide/svelte/icons/folder-kanban";
    import {
        projectDateLabel,
        projectTags,
        type DiscoveryProject,
    } from "$lib/search/discovery";

    type Props = {
        project: DiscoveryProject;
        accessToken?: string | null;
        onBack: () => void;
    };

    let { project, accessToken = null, onBack }: Props = $props();

    let loading = $state(true);
    let entityCount = $state(0);
    let tableCount = $state(0);

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

        void (async () => {
            try {
                const res = await fetch(
                    `/api/v1/projects/${encodeURIComponent(slug)}/tables`,
                    { headers: authHeaders() },
                );
                if (cancelled) return;
                if (res.ok) {
                    const data = (await res.json()) as {
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

    const tags = $derived(projectTags(project, 12));
    const dated = $derived(projectDateLabel(project));
    const entityLabel = $derived(
        entityCount === 1 ? "entity" : "entities",
    );
    const tableLabel = $derived(tableCount === 1 ? "table" : "tables");

    const cta =
        "flex min-h-10 w-full items-center justify-center gap-2 rounded-lg px-3 py-2.5 text-sm font-medium no-underline transition-colors";
</script>

<div class="flex flex-col">
    <div class="flex items-center gap-2 border-b border-border px-1 pb-3">
        <button
            type="button"
            onclick={onBack}
            class="inline-flex min-h-8 items-center gap-1 rounded-md px-2 py-1.5 text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
        >
            <ArrowLeftIcon class="size-3.5" />
            Back
        </button>
    </div>

    <div class="flex flex-col gap-5 px-1 pt-3 pb-2">
        <div>
            <h2 class="text-base font-semibold leading-snug text-foreground">
                {project.title}
            </h2>
            {#if project.description}
                <p
                    class="mt-1.5 text-sm leading-relaxed text-muted-foreground"
                >
                    {project.description}
                </p>
            {/if}
            {#if dated}
                <p class="mt-1.5 text-xs text-muted-foreground">{dated}</p>
            {/if}
        </div>

        {#if tags.length}
            <div class="flex flex-wrap gap-1.5">
                {#each tags as tag (tag)}
                    <span class="text-[11px] text-muted-foreground">#{tag}</span>
                {/each}
            </div>
        {/if}

        <div class="flex flex-col gap-2">
            <a
                href="/{project.slug}"
                class="{cta} border border-border bg-background text-foreground hover:bg-accent hover:text-accent-foreground"
            >
                <FolderKanbanIcon class="size-4" />
                View project
            </a>
            <a
                href="/{project.slug}/layers"
                class="{cta} bg-foreground text-background hover:bg-primary hover:text-primary-foreground"
            >
                <BoxIcon class="size-4" />
                View 3D
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
