<script lang="ts">
    import ArrowLeftIcon from "@lucide/svelte/icons/arrow-left";
    import BoxIcon from "@lucide/svelte/icons/box";
    import FolderKanbanIcon from "@lucide/svelte/icons/folder-kanban";
    import {
        projectDateLabel,
        projectTags,
        type DiscoveryProject,
    } from "$lib/search/discovery";

    type HeadDiff = {
        seq?: number;
        sha256?: string;
        created_at?: string;
        message?: string;
    };

    type Props = {
        project: DiscoveryProject;
        accessToken?: string | null;
        onBack: () => void;
    };

    let { project, accessToken = null, onBack }: Props = $props();

    let head = $state<HeadDiff | null>(null);
    let loading = $state(true);

    function authHeaders(): HeadersInit {
        return accessToken
            ? { Authorization: `Bearer ${accessToken}` }
            : {};
    }

    $effect(() => {
        const slug = project.slug;
        let cancelled = false;
        loading = true;
        head = null;

        void (async () => {
            const res = await fetch(
                `/api/v1/projects/${encodeURIComponent(slug)}/diffs`,
                { headers: authHeaders() },
            );
            if (cancelled) return;
            if (res.ok) {
                const rows = (await res.json()) as HeadDiff[];
                head = Array.isArray(rows) && rows[0] ? rows[0] : null;
            }
            loading = false;
        })();

        return () => {
            cancelled = true;
        };
    });

    const tags = $derived(projectTags(project, 12));
    const dated = $derived(projectDateLabel(project));
    const shortSha = $derived(
        head?.sha256 ? head.sha256.slice(0, 7) : null,
    );
    const commitDate = $derived(
        head?.created_at
            ? new Date(head.created_at).toLocaleDateString("en-GB", {
                  day: "numeric",
                  month: "short",
                  year: "numeric",
              })
            : null,
    );

    const cta =
        "flex min-h-10 w-full items-center justify-center gap-2 rounded-lg px-3 py-2.5 text-sm font-medium no-underline transition-colors";
</script>

<div class="flex min-h-0 flex-1 flex-col">
    <div class="flex items-center gap-2 border-b border-border px-1 pb-3">
        <button
            type="button"
            onclick={onBack}
            class="inline-flex min-h-8 items-center gap-1 rounded-md px-2 py-1.5 text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
        >
            <ArrowLeftIcon class="size-3.5" />
            Back
        </button>
        <span
            class="min-w-0 truncate font-mono text-xs text-muted-foreground"
            title={project.slug}>{project.slug}</span
        >
    </div>

    <div class="min-h-0 flex-1 overflow-y-auto px-1 py-3">
        <h2 class="text-base font-semibold leading-snug text-foreground">
            {project.title}
        </h2>
        {#if project.description}
            <p class="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                {project.description}
            </p>
        {/if}
        {#if dated}
            <p class="mt-1.5 text-xs text-muted-foreground">{dated}</p>
        {/if}

        {#if tags.length}
            <div class="mt-3 flex flex-wrap gap-1.5">
                {#each tags as tag}
                    <span class="text-[11px] text-muted-foreground">#{tag}</span>
                {/each}
            </div>
        {/if}

        <div class="mt-4 flex flex-col gap-2">
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

        <div class="mt-5 space-y-1 text-xs text-muted-foreground">
            {#if shortSha}
                <p>
                    Commit
                    <span class="font-mono text-foreground">{shortSha}</span>
                    {#if commitDate}
                        <span>({commitDate})</span>
                    {/if}
                </p>
            {:else if !loading}
                <p>No commit history (or sign in to view)</p>
            {/if}
            <p>
                {project.entity_count.toLocaleString()} entities
                <span class="text-muted-foreground/50">·</span>
                {project.table_count.toLocaleString()} tables
            </p>
        </div>
    </div>
</div>
