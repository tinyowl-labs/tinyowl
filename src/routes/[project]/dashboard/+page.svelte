<script lang="ts">
    import { page } from "$app/stores";
    import LayersIcon from "@lucide/svelte/icons/layers";
    import HashIcon from "@lucide/svelte/icons/hash";
    import AlertTriangleIcon from "@lucide/svelte/icons/alert-triangle";
    import DownloadIcon from "@lucide/svelte/icons/download";
    import CopyIcon from "@lucide/svelte/icons/copy";
    import CheckIcon from "@lucide/svelte/icons/check";
    import GitCommitIcon from "@lucide/svelte/icons/git-commit";
    import TagIcon from "@lucide/svelte/icons/tag";
    import GlobeIcon from "@lucide/svelte/icons/globe";
    import LockIcon from "@lucide/svelte/icons/lock";
    import ChevronDownIcon from "@lucide/svelte/icons/chevron-down";
    import ClockIcon from "@lucide/svelte/icons/clock";
    import GaugeIcon from "@lucide/svelte/icons/gauge";
    import FileUpIcon from "@lucide/svelte/icons/file-up";
    import WaypointsIcon from "@lucide/svelte/icons/waypoints";
    import BboxMap from "$lib/components/dashboard/BboxMap.svelte";

    let { data } = $props();

    const accessToken = $derived(
        ((data as any)?.accessToken as string) ||
            (($page.data as any)?.accessToken as string) ||
            "",
    );
    const project = $derived($page.data?.project);
    const visibility = $derived(
        ((project as any)?.visibility ?? "private") as string,
    );
    const slug = $derived(project?.slug ?? "");

    const tables = $derived(
        ((data as any)?.tables as { name: string; count: number }[]) ?? [],
    );
    const tableCount = $derived(
        (tables.length || (project as any)?.table_count) ?? 0,
    );
    const entityCount = $derived(
        (tables.reduce(
            (sum: number, t: { count: number }) => sum + (t.count ?? 0),
            0,
        ) ||
            (project as any)?.entity_count) ??
            0,
    );
    const warnings = $derived(((data as any)?.warnings as any[]) ?? []);
    const diffs = $derived(((data as any)?.diffs as any[]) ?? []);
    const mappings = $derived(((data as any)?.mappings as any[]) ?? []);

    const bbox = $derived(((project as any)?.bbox as string) ?? null);
    const updatedAt = $derived(
        ((project as any)?.updated_at as string) ?? null,
    );
    const updated = $derived(
        updatedAt
            ? new Date(updatedAt).toLocaleDateString("en-GB", {
                  day: "numeric",
                  month: "long",
                  year: "numeric",
              })
            : null,
    );

    let actionsOpen = $state(false);
    let copied = $state(false);

    function formatBytes(bytes: number): string {
        if (bytes < 1024) return `${bytes} B`;
        if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
        return `${(bytes / 1048576).toFixed(1)} MB`;
    }

    function formatDate(ts: string): string {
        return new Date(ts).toLocaleDateString("en-GB", {
            day: "numeric",
            month: "short",
            year: "numeric",
        });
    }

    const vocabSummary = $derived.by(() => {
        const vocabs = new Set<string>();
        for (const m of mappings) {
            if (m.vocabulary) vocabs.add(m.vocabulary);
        }
        const mapped = mappings.filter((m: any) => m.concept_uri).length;
        return { vocabularies: [...vocabs], mapped, total: mappings.length };
    });

    async function copyClone() {
        await navigator.clipboard.writeText(`tinyowl clone ${slug}`);
        copied = true;
        setTimeout(() => (copied = false), 2000);
    }
</script>

<svelte:head>
    <title>Manage — {project?.title ?? "Project"} — TinyOwl</title>
</svelte:head>

<!-- Close dropdown on outside click -->
<svelte:window onclick={() => (actionsOpen = false)} />

<article class="mx-auto max-w-4xl px-6 py-12">
    <div class="flex flex-wrap items-center justify-between gap-4 mb-8">
        <div>
            <div class="flex items-center gap-3">
                <GaugeIcon class="size-6 text-muted-foreground" />
                <h1 class="text-2xl font-bold tracking-tight text-foreground">
                    Manage
                </h1>
            </div>
            <p class="mt-1 text-sm text-muted-foreground">
                Tables, import, foreign keys, and clone for {project?.title ??
                    ""}
            </p>
            {#if updated}
                <div
                    class="mt-2 flex items-center gap-1 text-xs text-muted-foreground"
                >
                    <ClockIcon class="size-3" />
                    Updated {updated}
                </div>
            {/if}
        </div>

        <!-- GitHub-style Code dropdown -->
        <div class="relative">
            <button
                onclick={(e: MouseEvent) => {
                    e.stopPropagation();
                    actionsOpen = !actionsOpen;
                }}
                class="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-4 py-2 text-sm font-medium text-foreground hover:bg-accent transition-colors"
            >
                <DownloadIcon class="size-4" />
                Code
                <ChevronDownIcon
                    class="size-3.5 text-muted-foreground transition-transform {actionsOpen
                        ? 'rotate-180'
                        : ''}"
                />
            </button>
            {#if actionsOpen}
                <!-- svelte-ignore a11y_click_events_have_key_events -->
                <!-- svelte-ignore a11y_no_static_element_interactions -->
                <div
                    class="absolute right-0 mt-2 w-80 rounded-lg border border-border bg-card shadow-lg z-50 p-2"
                    onclick={(e: MouseEvent) => e.stopPropagation()}
                >
                    <div class="px-3 py-2">
                        <p
                            class="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2"
                        >
                            Clone
                        </p>
                        <div class="flex items-center gap-2">
                            <code
                                class="flex-1 rounded-md bg-secondary px-3 py-1.5 text-xs font-mono text-foreground select-all break-all"
                                >tinyowl clone {slug}</code
                            >
                            <button
                                onclick={copyClone}
                                class="shrink-0 flex items-center justify-center size-8 rounded-md border border-border hover:bg-accent transition-colors text-muted-foreground"
                                title="Copy"
                            >
                                {#if copied}
                                    <CheckIcon class="size-4 text-primary" />
                                {:else}
                                    <CopyIcon class="size-4" />
                                {/if}
                            </button>
                        </div>
                    </div>
                    <div class="border-t border-border my-1"></div>
                    <a
                        href={`/api/v1/projects/${slug}/gpkg${accessToken ? `?token=${encodeURIComponent(accessToken)}` : ""}`}
                        class="flex items-center gap-2 rounded-md px-3 py-2 text-sm text-foreground hover:bg-accent transition-colors no-underline"
                    >
                        <DownloadIcon class="size-4" />
                        Download GPKG
                    </a>
                </div>
            {/if}
        </div>
    </div>

    <!-- Quick actions -->
    <div class="grid gap-2 sm:grid-cols-3 mb-8">
        <a
            href={`/${slug}/import`}
            class="flex items-start gap-3 rounded-lg border border-border bg-card px-4 py-3 no-underline hover:bg-accent/40 transition-colors"
        >
            <FileUpIcon class="size-4 mt-0.5 text-primary shrink-0" />
            <span>
                <span class="block text-sm font-medium text-foreground"
                    >Import table</span
                >
                <span class="block text-xs text-muted-foreground"
                    >CSV or GeoJSON</span
                >
            </span>
        </a>
        <a
            href={`/${slug}/layers?view=schema`}
            class="flex items-start gap-3 rounded-lg border border-border bg-card px-4 py-3 no-underline hover:bg-accent/40 transition-colors"
        >
            <WaypointsIcon class="size-4 mt-0.5 text-primary shrink-0" />
            <span>
                <span class="block text-sm font-medium text-foreground"
                    >Schema &amp; FKs</span
                >
                <span class="block text-xs text-muted-foreground"
                    >Graph + link tables</span
                >
            </span>
        </a>
        <a
            href={`/${slug}/layers?view=table`}
            class="flex items-start gap-3 rounded-lg border border-border bg-card px-4 py-3 no-underline hover:bg-accent/40 transition-colors"
        >
            <LayersIcon class="size-4 mt-0.5 text-primary shrink-0" />
            <span>
                <span class="block text-sm font-medium text-foreground"
                    >Table view</span
                >
                <span class="block text-xs text-muted-foreground"
                    >Browse entity rows</span
                >
            </span>
        </a>
    </div>

    <!-- Summary bar -->
    <div class="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-8">
        <div class="rounded-lg border border-border bg-card p-4">
            <div
                class="flex items-center gap-2 text-sm text-muted-foreground mb-1"
            >
                <LayersIcon class="size-3.5" /> Tables
            </div>
            <p class="text-2xl font-semibold text-foreground">{tableCount}</p>
        </div>
        <div class="rounded-lg border border-border bg-card p-4">
            <div
                class="flex items-center gap-2 text-sm text-muted-foreground mb-1"
            >
                <HashIcon class="size-3.5" /> Entities
            </div>
            <p class="text-2xl font-semibold text-foreground">
                {entityCount.toLocaleString()}
            </p>
        </div>
        <div class="rounded-lg border border-border bg-card p-4">
            <div
                class="flex items-center gap-2 text-sm text-muted-foreground mb-1"
            >
                {#if visibility === "public"}<GlobeIcon
                        class="size-3.5"
                    />{:else}<LockIcon class="size-3.5" />{/if}
                Visibility
            </div>
            <p class="text-lg font-semibold text-foreground capitalize">
                {visibility}
            </p>
        </div>
    </div>

    <!-- Bbox map -->
    {#if bbox}
        <BboxMap {bbox} href={`/${slug}/layers`} class="h-64 mb-8" />
    {/if}

    <!-- Entity breakdown -->
    {#if tables.length > 0}
        <h2
            class="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3"
        >
            Tables
        </h2>
        <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 mb-8">
            {#each tables as tbl}
                <a
                    href={`/${slug}/layers?layer=${encodeURIComponent(tbl.name)}&view=table`}
                    class="flex items-center justify-between rounded-lg border border-border bg-card px-3 py-2.5 hover:bg-accent/50 transition-colors no-underline"
                >
                    <span class="text-sm font-medium text-foreground truncate"
                        >{tbl.name.replace(/_/g, " ")}</span
                    >
                    <span
                        class="text-xs text-muted-foreground font-mono tabular-nums shrink-0 ml-2"
                        >{tbl.count.toLocaleString()}</span
                    >
                </a>
            {/each}
        </div>
    {:else}
        <div
            class="mb-8 rounded-xl border border-dashed border-border px-6 py-10 text-center"
        >
            <p class="text-sm text-foreground font-medium">No tables yet</p>
            <p class="text-xs text-muted-foreground mt-1 mb-4">
                Import a CSV or GeoJSON to create this project’s schema.
            </p>
            <a
                href={`/${slug}/import`}
                class="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground no-underline"
            >
                <FileUpIcon class="size-4" />
                Import data
            </a>
        </div>
    {/if}

    <!-- Warnings + Activity -->
    <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
        <div class="rounded-lg border border-border overflow-hidden">
            <div
                class="flex items-center gap-2 px-4 py-3 border-b border-border"
            >
                {#if warnings.length > 0}
                    <AlertTriangleIcon class="size-4 shrink-0 text-destructive" />
                {:else}
                    <AlertTriangleIcon class="size-4 shrink-0 text-primary" />
                {/if}
                <span class="text-sm font-medium text-foreground"
                    >Validation warnings</span
                >
                {#if warnings.length > 0}
                    <span
                        class="text-xs px-1.5 py-0.5 rounded-full bg-destructive/10 text-destructive font-medium"
                        >{warnings.length}</span
                    >
                {/if}
            </div>
            {#if warnings.length === 0}
                <div
                    class="px-4 py-6 text-center text-sm text-muted-foreground"
                >
                    No warnings
                </div>
            {:else}
                <div class="divide-y divide-border max-h-80 overflow-y-auto">
                    {#each warnings as w}
                        <div class="px-4 py-2.5 text-xs">
                            <div class="flex items-center gap-2 mb-0.5">
                                <span class="font-mono text-muted-foreground"
                                    >{w.entity_type}</span
                                >
                                <span class="text-foreground font-medium"
                                    >{w.entity_id}</span
                                >
                                <span class="text-muted-foreground"
                                    >— {w.warning_type}</span
                                >
                            </div>
                            <p class="text-muted-foreground">{w.message}</p>
                        </div>
                    {/each}
                </div>
            {/if}
        </div>

        <div class="rounded-lg border border-border overflow-hidden">
            <div
                class="flex items-center gap-2 px-4 py-3 border-b border-border"
            >
                <GitCommitIcon class="size-4 shrink-0 text-muted-foreground" />
                <span class="text-sm font-medium text-foreground"
                    >Recent activity</span
                >
                {#if diffs.length > 0}
                    <span class="text-xs text-muted-foreground"
                        >({diffs.length})</span
                    >
                {/if}
            </div>
            {#if diffs.length === 0}
                <div
                    class="px-4 py-6 text-center text-sm text-muted-foreground"
                >
                    No pushes yet
                </div>
            {:else}
                <div class="divide-y divide-border max-h-80 overflow-y-auto">
                    {#each diffs as diff}
                        <div
                            class="px-4 py-2.5 flex items-center justify-between gap-3 text-xs"
                        >
                            <div class="flex items-center gap-2 min-w-0">
                                <span
                                    class="font-mono text-muted-foreground shrink-0"
                                    >{diff.sha256?.slice(0, 7) ?? ""}</span
                                >
                                <span class="text-muted-foreground"
                                    >{formatDate(diff.created_at)}</span
                                >
                            </div>
                            <div
                                class="flex items-center gap-3 text-muted-foreground shrink-0"
                            >
                                <span
                                    >{diff.entity_count?.toLocaleString() ?? 0} entities</span
                                >
                                <span>{formatBytes(diff.byte_size ?? 0)}</span>
                            </div>
                        </div>
                    {/each}
                </div>
            {/if}
        </div>
    </div>

    <!-- Mappings summary -->
    {#if mappings.length > 0}
        <div class="rounded-lg border border-border bg-card px-4 py-3 mb-8">
            <div class="flex items-center justify-between gap-2">
                <div class="flex items-center gap-2 min-w-0">
                    <TagIcon class="size-4 shrink-0 text-muted-foreground" />
                    <span class="text-sm font-medium text-foreground"
                        >Vocabulary mappings</span
                    >
                </div>
                <div
                    class="flex items-center gap-3 text-xs text-muted-foreground"
                >
                    <span>{vocabSummary.vocabularies.join(", ") || "none"}</span
                    >
                    <span class="text-foreground font-medium"
                        >{vocabSummary.mapped}/{vocabSummary.total} mapped</span
                    >
                </div>
            </div>
        </div>
    {/if}
</article>
