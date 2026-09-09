<script lang="ts">
    import XIcon from "@lucide/svelte/icons/x";
    import MapPinIcon from "@lucide/svelte/icons/map-pin";
    import {
        artefactMediaUrl,
        entityLabel,
        formatBytes,
        isPdf,
        linkedEntities,
        type ArtefactMediaItem,
    } from "$lib/components/artefacts/artefactMedia";
    import { entityLayersHref } from "$lib/project/entityLink";
    import MediaDeleteControls from "$lib/components/artefacts/MediaDeleteControls.svelte";

    let {
        item,
        accessToken,
        projectSlug,
        canUpload,
        onclose,
        onRemoved,
    }: {
        item: ArtefactMediaItem;
        accessToken: string;
        projectSlug: string;
        canUpload: boolean;
        onclose: () => void;
        onRemoved: () => void;
    } = $props();

    const pdf = $derived(isPdf(item));
    const links = $derived(linkedEntities(item));
    const title = $derived(
        pdf
            ? "Report"
            : links[0]
              ? entityLabel(links[0].entity_type)
              : item.media_type,
    );

    function entityLink(entityType: string, entityId: string): string {
        return entityLayersHref(projectSlug, {
            layer: entityType,
            highlight: entityId,
        });
    }
</script>

<div
    class="lg:hidden fixed inset-x-0 bottom-0 z-50 border-t border-border surface p-4 max-h-[50vh] overflow-y-auto"
>
    <div class="flex items-start justify-between gap-3 mb-3">
        <div class="min-w-0">
            <p class="text-sm font-medium text-foreground truncate">{title}</p>
            <p class="text-[11px] text-muted-foreground">
                {formatBytes(item.file_size)}
            </p>
        </div>
        <div class="flex items-center gap-1 shrink-0">
            {#if pdf}
                <a
                    href={artefactMediaUrl(item, accessToken)}
                    target="_blank"
                    rel="noopener noreferrer"
                    class="rounded-md border border-border px-2 py-1 text-[11px] text-muted-foreground no-underline hover:text-foreground"
                >
                    Open
                </a>
            {/if}
            <button
                type="button"
                onclick={onclose}
                class="rounded-md p-1 text-muted-foreground hover:text-foreground"
                aria-label="Close"
            >
                <XIcon class="size-4" />
            </button>
        </div>
    </div>
    {#if links.length > 0}
        <ul class="space-y-1">
            {#each links as entity (`${entity.entity_type}:${entity.entity_id}`)}
                <li>
                    <a
                        href={entityLink(entity.entity_type, entity.entity_id)}
                        class="flex items-center gap-2 rounded-md px-2 py-1.5 text-xs no-underline hover:bg-accent/60"
                    >
                        <MapPinIcon class="size-3.5 text-muted-foreground" />
                        <span class="truncate">{entityLabel(entity.entity_type)}</span>
                        <span
                            class="ml-auto font-mono text-[10px] text-muted-foreground"
                            >{entity.entity_id}</span
                        >
                    </a>
                </li>
            {/each}
        </ul>
    {:else}
        <p class="text-xs text-muted-foreground">Not linked to an entity</p>
    {/if}
    {#if canUpload}
        <div class="mt-3">
            <MediaDeleteControls
                {accessToken}
                {projectSlug}
                hash={item.hash}
                linked={links.length > 0}
                {onRemoved}
            />
        </div>
    {/if}
</div>
