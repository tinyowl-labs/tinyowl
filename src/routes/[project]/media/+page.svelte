<script lang="ts">
    import { page } from "$app/stores";
    import ImageIcon from "@lucide/svelte/icons/image";
    import ImageOffIcon from "@lucide/svelte/icons/image-off";
    import FileIcon from "@lucide/svelte/icons/file";
    import VideoIcon from "@lucide/svelte/icons/video";
    import MusicIcon from "@lucide/svelte/icons/music";
    import FileWarningIcon from "@lucide/svelte/icons/file-warning";
    import ExternalLinkIcon from "@lucide/svelte/icons/external-link";
    import { onMount } from "svelte";

    let { data } = $props();

    const accessToken = $derived(data?.accessToken ?? "");

    interface MediaItem {
        hash: string;
        media_type: string;
        file_size: number;
        url: string;
        entities: Array<{ entity_type: string; entity_id: string }>;
    }

    let items = $state<MediaItem[]>([]);
    let loading = $state(false);
    let hasMore = $state(true);
    let error = $state("");
    let offset = $state(0);
    const LIMIT = 50;

    let sentinel = $state<HTMLDivElement>();

    // Track loaded/failed images
    let loadedImages = $state<Set<string>>(new Set());
    let failedImages = $state<Set<string>>(new Set());

    function onImageLoad(hash: string) {
        loadedImages = new Set([...loadedImages, hash]);
    }
    function onImageError(hash: string) {
        failedImages = new Set([...failedImages, hash]);
    }

    async function loadMore() {
        if (loading || !hasMore) return;
        loading = true;
        error = "";
        try {
            const slug = $page.params.project;
            const res = await fetch(
                `/api/v1/projects/${slug}/media?offset=${offset}&limit=${LIMIT}`,
                accessToken
                    ? { headers: { Authorization: `Bearer ${accessToken}` } }
                    : {},
            );
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const batch: MediaItem[] = await res.json();
            items = [...items, ...batch];
            offset += batch.length;
            if (batch.length < LIMIT) hasMore = false;
        } catch (e: any) {
            error = e?.message ?? "Failed to load";
        } finally {
            loading = false;
        }
    }

    onMount(() => {
        loadMore();
    });

    $effect(() => {
        if (!sentinel || !hasMore) return;
        const observer = new IntersectionObserver(
            (entries) => {
                if (entries[0]?.isIntersecting) loadMore();
            },
            { rootMargin: "200px" },
        );
        observer.observe(sentinel);
        return () => observer.disconnect();
    });

    function typeIcon(mimeType: string) {
        const main = mimeType.split("/")[0];
        switch (main) {
            case "image":
                return ImageIcon;
            case "video":
                return VideoIcon;
            case "audio":
                return MusicIcon;
            default:
                return FileIcon;
        }
    }

    function formatBytes(bytes: number): string {
        if (bytes < 1024) return `${bytes} B`;
        if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
        return `${(bytes / 1048576).toFixed(1)} MB`;
    }

    function entityLink(entityType: string, entityId: string): string {
        const slug = $page.params.project;
        return `/${slug}/layers?layer=${encodeURIComponent(entityType)}&highlight=${encodeURIComponent(entityId)}`;
    }

    function entityLabel(entityType: string): string {
        return entityType.replace(/_/g, " ");
    }

    // Group by media type
    const byType = $derived.by(() => {
        const groups: Record<string, MediaItem[]> = {};
        for (const item of items) {
            const type = item.media_type.split("/")[0] || "other";
            if (!groups[type]) groups[type] = [];
            groups[type].push(item);
        }
        return groups;
    });

    function typeLabel(group: string): string {
        switch (group) {
            case "image":
                return "Images";
            case "video":
                return "Videos";
            case "audio":
                return "Audio";
            default:
                return "Files";
        }
    }
</script>

<svelte:head>
    <title>Media — {$page.data?.project?.title ?? "Project"} — TinyOwl</title>
</svelte:head>

<div class="p-6">
    {#if items.length === 0 && !loading}
        <div class="flex items-center justify-center h-64">
            <div class="text-center max-w-sm">
                <div
                    class="mx-auto mb-4 flex size-14 items-center justify-center rounded-full bg-secondary"
                >
                    <ImageIcon class="size-6 text-muted-foreground" />
                </div>
                <h2 class="text-lg font-semibold text-foreground mb-2">
                    No media yet
                </h2>
                <p class="text-sm text-muted-foreground">
                    Push data with media attachments to see them here. Each
                    media item will show which entities it's linked to.
                </p>
            </div>
        </div>
    {:else}
        {#each Object.entries(byType) as [group, groupItems]}
            <div class="mb-8">
                <h2
                    class="text-sm font-semibold tracking-wider uppercase text-muted-foreground mb-4"
                >
                    {typeLabel(group)}
                    <span class="ml-1.5 font-normal text-muted-foreground/60">
                        ({groupItems.length})
                    </span>
                </h2>

                <div
                    class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3"
                >
                    {#each groupItems as item}
                        {@const isImage = item.media_type.startsWith("image/")}
                        {@const isVideo = item.media_type.startsWith("video/")}
                        {@const isAudio = item.media_type.startsWith("audio/")}
                        {@const imgLoaded = loadedImages.has(item.hash)}
                        {@const imgFailed = failedImages.has(item.hash)}
                        <div
                            class="rounded-lg border bg-card overflow-hidden group"
                        >
                            <!-- Preview area -->
                            <div class="aspect-square bg-secondary relative">
                                {#if isImage}
                                    <!-- Pulsing skeleton while loading -->
                                    {#if !imgLoaded && !imgFailed}
                                        <div
                                            class="absolute inset-0 animate-pulse bg-secondary"
                                        ></div>
                                    {/if}
                                    <!-- Failed placeholder -->
                                    {#if imgFailed}
                                        <div
                                            class="absolute inset-0 flex flex-col items-center justify-center gap-1"
                                        >
                                            <ImageOffIcon
                                                class="size-8 text-muted-foreground/40"
                                            />
                                            <span
                                                class="text-[10px] text-muted-foreground/40"
                                                >Missing</span
                                            >
                                        </div>
                                    {/if}
                                    <img
                                        src={item.url +
                                            (accessToken
                                                ? `?token=${encodeURIComponent(accessToken)}`
                                                : "")}
                                        alt="Media"
                                        class="w-full h-full object-cover {imgLoaded
                                            ? 'opacity-100'
                                            : 'opacity-0'} transition-opacity duration-200"
                                        loading="lazy"
                                        onload={() => onImageLoad(item.hash)}
                                        onerror={() => onImageError(item.hash)}
                                    />
                                {:else if isVideo}
                                    <div
                                        class="w-full h-full flex flex-col items-center justify-center gap-1.5"
                                    >
                                        <VideoIcon
                                            class="size-8 text-muted-foreground"
                                        />
                                        <span
                                            class="text-[10px] text-muted-foreground/60"
                                            >Video</span
                                        >
                                    </div>
                                {:else if isAudio}
                                    <div
                                        class="w-full h-full flex flex-col items-center justify-center gap-1.5"
                                    >
                                        <MusicIcon
                                            class="size-8 text-muted-foreground"
                                        />
                                        <span
                                            class="text-[10px] text-muted-foreground/60"
                                            >Audio</span
                                        >
                                    </div>
                                {:else}
                                    <div
                                        class="w-full h-full flex flex-col items-center justify-center gap-1.5"
                                    >
                                        <FileWarningIcon
                                            class="size-8 text-muted-foreground"
                                        />
                                        <span
                                            class="text-[10px] text-muted-foreground/60 uppercase"
                                        >
                                            {item.media_type.split("/")[1] ??
                                                "file"}
                                        </span>
                                    </div>
                                {/if}
                            </div>

                            <div class="p-3">
                                <div
                                    class="flex items-center justify-between gap-2 mb-2"
                                >
                                    <span
                                        class="text-[10px] font-mono text-muted-foreground select-all"
                                    >
                                        {item.hash.slice(0, 10)}
                                    </span>
                                    <span
                                        class="text-[10px] text-muted-foreground"
                                    >
                                        {formatBytes(item.file_size)}
                                    </span>
                                </div>

                                {#if item.entities.length > 0}
                                    <div class="flex flex-col gap-1">
                                        <span
                                            class="text-[10px] font-medium text-muted-foreground uppercase tracking-wider"
                                        >
                                            Linked entities
                                        </span>
                                        {#each item.entities as entity}
                                            <a
                                                href={entityLink(
                                                    entity.entity_type,
                                                    entity.entity_id,
                                                )}
                                                class="flex items-center gap-1 text-xs text-primary hover:underline underline-offset-2 no-underline group/link"
                                            >
                                                <span class="truncate">
                                                    {entityLabel(
                                                        entity.entity_type,
                                                    )}
                                                </span>
                                                <span
                                                    class="font-mono text-[10px] text-muted-foreground shrink-0"
                                                >
                                                    {entity.entity_id}
                                                </span>
                                                <ExternalLinkIcon
                                                    class="size-2.5 shrink-0 text-muted-foreground opacity-0 group-hover/link:opacity-100 transition-opacity"
                                                />
                                            </a>
                                        {/each}
                                    </div>
                                {:else}
                                    <p
                                        class="text-[10px] italic text-muted-foreground"
                                    >
                                        No entities linked
                                    </p>
                                {/if}
                            </div>
                        </div>
                    {/each}
                </div>
            </div>
        {/each}

        <!-- Sentinel for infinite scroll -->
        {#if hasMore}
            <div
                bind:this={sentinel}
                class="py-8 flex items-center justify-center"
            >
                {#if loading}
                    <div class="text-sm text-muted-foreground animate-pulse">
                        Loading…
                    </div>
                {/if}
            </div>
        {:else if items.length > 0}
            <div class="py-8 flex items-center justify-center">
                <p class="text-xs text-muted-foreground">
                    {items.length} item{items.length !== 1 ? "s" : ""}
                </p>
            </div>
        {/if}
    {/if}

    {#if error}
        <div class="py-4 text-center">
            <p class="text-sm text-destructive">{error}</p>
        </div>
    {/if}
</div>
