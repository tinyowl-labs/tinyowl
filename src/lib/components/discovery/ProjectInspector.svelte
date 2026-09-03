<script lang="ts">
    import ArrowLeftIcon from "@lucide/svelte/icons/arrow-left";
    import BoxIcon from "@lucide/svelte/icons/box";
    import GitPullRequestIcon from "@lucide/svelte/icons/git-pull-request";
    import CloudIcon from "@lucide/svelte/icons/cloud";
    import LayersIcon from "@lucide/svelte/icons/layers";
    import HashIcon from "@lucide/svelte/icons/hash";
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
    let pendingCount = $state(0);
    let qfieldLinked = $state(false);
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
        pendingCount = 0;
        qfieldLinked = false;

        void (async () => {
            const headers = authHeaders();
            const [diffsRes, pendingRes, qfcRes] = await Promise.all([
                fetch(`/api/v1/projects/${encodeURIComponent(slug)}/diffs`, {
                    headers,
                }),
                fetch(
                    `/api/v1/projects/${encodeURIComponent(slug)}/changesets?status=pending`,
                    { headers },
                ),
                fetch(
                    `/api/v1/projects/${encodeURIComponent(slug)}/qfieldcloud-link`,
                    { headers },
                ),
            ]);
            if (cancelled) return;
            if (diffsRes.ok) {
                const rows = (await diffsRes.json()) as HeadDiff[];
                head = Array.isArray(rows) && rows[0] ? rows[0] : null;
            }
            if (pendingRes.ok) {
                const rows = (await pendingRes.json()) as unknown[];
                pendingCount = Array.isArray(rows) ? rows.length : 0;
            }
            if (qfcRes.ok) {
                const body = await qfcRes.json();
                qfieldLinked = Boolean(body);
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
        "flex w-full items-center justify-center gap-2 rounded-lg border border-border/80 bg-background/40 px-3 py-2 text-sm font-medium text-foreground no-underline transition-colors hover:bg-accent hover:text-accent-foreground";
</script>

<div class="flex min-h-0 flex-1 flex-col">
    <div class="flex items-center gap-2 border-b border-border/60 px-1 pb-3">
        <button
            type="button"
            onclick={onBack}
            class="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
        >
            <ArrowLeftIcon class="size-3.5" />
            Back to results
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
            <p class="mt-2 text-xs text-muted-foreground">{dated}</p>
        {/if}

        <div class="mt-4 space-y-1 text-xs text-muted-foreground">
            {#if shortSha}
                <p>
                    Commit:
                    <span class="font-mono text-foreground">{shortSha}</span>
                    {#if commitDate}
                        <span class="text-muted-foreground">({commitDate})</span>
                    {/if}
                </p>
            {:else if !loading}
                <p>No commit history (or sign in to view)</p>
            {/if}
            <p>
                Entities: {project.entity_count.toLocaleString()}
                <span class="text-muted-foreground/50">|</span>
                Tables: {project.table_count.toLocaleString()}
            </p>
        </div>

        <div class="mt-4 flex flex-col gap-2">
            <a href="/{project.slug}/layers" class="{cta} bg-foreground text-background hover:bg-primary hover:text-primary-foreground border-transparent">
                <BoxIcon class="size-4" />
                Open 3D Workspace
            </a>
            <a href="/{project.slug}/review" class={cta}>
                <GitPullRequestIcon class="size-4" />
                Review Geometry Diffs{pendingCount > 0 ? ` (${pendingCount})` : ""}
            </a>
            {#if qfieldLinked}
                <a href="/{project.slug}/settings/qfieldcloud" class={cta}>
                    <CloudIcon class="size-4" />
                    Sync with QFieldCloud
                </a>
            {/if}
            <a
                href="/{project.slug}"
                class="text-center text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
            >
                Project overview
            </a>
        </div>

        {#if tags.length}
            <div class="mt-5">
                <p
                    class="mb-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground"
                >
                    Tags
                </p>
                <div class="flex flex-wrap gap-1.5">
                    {#each tags as tag}
                        <span class="text-[11px] text-muted-foreground"
                            >#{tag}</span
                        >
                    {/each}
                </div>
            </div>
        {/if}

        <div class="mt-4 flex flex-wrap gap-3 text-[11px] text-muted-foreground">
            <span class="inline-flex items-center gap-1">
                <HashIcon class="size-3" />
                {project.entity_count.toLocaleString()} entities
            </span>
            <span class="inline-flex items-center gap-1">
                <LayersIcon class="size-3" />
                {project.table_count} tables
            </span>
        </div>
    </div>
</div>
