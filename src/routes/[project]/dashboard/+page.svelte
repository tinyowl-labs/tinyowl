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
    import { browser } from "$app/environment";
    import { isDark } from "$lib/stores/theme.svelte";

    let { data } = $props();

    const project = $derived($page.data?.project);
    const entityCount = $derived((project as any)?.entity_count ?? 0);
    const tableCount = $derived((project as any)?.table_count ?? 0);
    const visibility = $derived(
        ((project as any)?.visibility ?? "private") as string,
    );
    const slug = $derived(project?.slug ?? "");

    const tables = $derived(
        ((data as any)?.tables as { name: string }[]) ?? [],
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

    // Leaflet bbox map (client-side only)
    function renderMap(node: HTMLElement, bboxStr: string) {
        if (!browser) return;
        let cleanup: (() => void) | undefined;
        import("leaflet").then(async ({ default: L }) => {
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
            cleanup = () => map.remove();
        });
        return {
            destroy() {
                cleanup?.();
            },
        };
    }

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
    <title>Dashboard — {project?.title ?? "Project"} — TinyOwl</title>
</svelte:head>

<!-- Close dropdown on outside click -->
<svelte:window onclick={() => (actionsOpen = false)} />

<article class="mx-auto max-w-4xl px-6 py-12">
    <div class="flex flex-wrap items-center justify-between gap-4 mb-8">
        <div>
            <div class="flex items-center gap-3">
                <GaugeIcon class="size-6 text-muted-foreground" />
                <h1 class="text-2xl font-bold tracking-tight text-foreground">
                    Dashboard
                </h1>
            </div>
            <p class="mt-1 text-sm text-muted-foreground">
                {project?.title ?? ""}
            </p>
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
                                    <CheckIcon class="size-4 text-green-500" />
                                {:else}
                                    <CopyIcon class="size-4" />
                                {/if}
                            </button>
                        </div>
                    </div>
                    <div class="border-t border-border my-1"></div>
                    <a
                        href={`/api/v1/projects/${slug}/gpkg`}
                        class="flex items-center gap-2 rounded-md px-3 py-2 text-sm text-foreground hover:bg-accent transition-colors no-underline"
                    >
                        <DownloadIcon class="size-4" />
                        Download GPKG
                    </a>
                </div>
            {/if}
        </div>
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
        <a
            href={`/${slug}/layers`}
            class="block rounded-lg border border-border overflow-hidden hover:border-primary/50 transition-colors mb-8"
        >
            <div class="w-full h-64 bg-secondary/20" use:renderMap={bbox}></div>
        </a>
    {/if}

    <!-- Entity breakdown -->
    {#if tables.length > 0}
        <h2
            class="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3"
        >
            Entity types
        </h2>
        <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 mb-8">
            {#each tables as tbl}
                <a
                    href={`/${slug}/layers?layer=${encodeURIComponent(tbl.name)}`}
                    class="flex items-center justify-between rounded-lg border border-border bg-card px-3 py-2.5 hover:bg-accent/50 transition-colors no-underline"
                >
                    <span class="text-sm font-medium text-foreground truncate"
                        >{tbl.name.replace(/_/g, " ")}</span
                    >
                </a>
            {/each}
        </div>
    {/if}

    <!-- Warnings + Activity -->
    <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
        <div class="rounded-lg border border-border overflow-hidden">
            <div
                class="flex items-center gap-2 px-4 py-3 border-b border-border"
            >
                {#if warnings.length > 0}
                    <AlertTriangleIcon class="size-4 shrink-0 text-amber-500" />
                {:else}
                    <AlertTriangleIcon class="size-4 shrink-0 text-green-500" />
                {/if}
                <span class="text-sm font-medium text-foreground"
                    >Validation warnings</span
                >
                {#if warnings.length > 0}
                    <span
                        class="text-xs px-1.5 py-0.5 rounded-full bg-amber-500/10 text-amber-600 font-medium"
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
