<script lang="ts">
    import { page } from "$app/stores";
    import ImageIcon from "@lucide/svelte/icons/image";
    import FileIcon from "@lucide/svelte/icons/file";
    import VideoIcon from "@lucide/svelte/icons/video";
    import MusicIcon from "@lucide/svelte/icons/music";
    import ExternalLinkIcon from "@lucide/svelte/icons/external-link";

    let { data } = $props();

    const media = $derived(data?.media ?? []);
    const byType = $derived(data?.byType ?? {});

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

    function formatBytes(bytes: number): string {
        if (bytes < 1024) return `${bytes} B`;
        if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
        return `${(bytes / 1048576).toFixed(1)} MB`;
    }

    function entityLink(entityType: string, entityId: string): string {
        const projectSlug = $page.params.project;
        return `/${projectSlug}/layers?layer=${encodeURIComponent(entityType)}&highlight=${encodeURIComponent(entityId)}`;
    }

    function entityLabel(entityType: string): string {
        return entityType.replace(/_/g, " ");
    }
</script>

<svelte:head>
    <title>Media — {$page.data?.project?.title ?? "Project"} — TinyOwl</title>
</svelte:head>

<div class="p-6">
    {#if media.length === 0}
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
        {#each Object.entries(byType) as [group, items]}
            <div class="mb-8">
                <h2
                    class="text-sm font-semibold tracking-wider uppercase text-muted-foreground mb-4"
                >
                    {typeLabel(group)}
                    <span class="ml-1.5 font-normal text-muted-foreground/60"
                        >({items.length})</span
                    >
                </h2>

                <div
                    class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3"
                >
                    {#each items as item}
                        <div
                            class="rounded-lg border bg-card overflow-hidden group"
                        >
                            <!-- Preview -->
                            {#if item.media_type.startsWith("image/")}
                                <div class="aspect-square bg-secondary">
                                    <img
                                        src={item.url}
                                        alt="Media"
                                        class="w-full h-full object-cover"
                                        loading="lazy"
                                    />
                                </div>
                            {:else}
                                <div
                                    class="aspect-square bg-secondary flex items-center justify-center"
                                >
                                    {#each [typeIcon(item.media_type)] as Icon}
                                        <Icon
                                            class="size-8 text-muted-foreground"
                                        />
                                    {/each}
                                </div>
                            {/if}

                            <!-- Metadata -->
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

                                <!-- Entity links -->
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
    {/if}
</div>
