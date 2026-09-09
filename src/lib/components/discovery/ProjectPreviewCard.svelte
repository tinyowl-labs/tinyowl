<script lang="ts">
    type Props = {
        slug: string;
        title: string;
        description?: string;
        tags?: string[];
        hasCover?: boolean;
        coverBust?: string;
        /** When set, the whole card is a link (settings mock). */
        href?: string;
    };

    let {
        slug,
        title,
        description = "",
        tags = [],
        hasCover = false,
        coverBust = "",
        href = "",
    }: Props = $props();

    let coverFailed = $state(false);
    const showCover = $derived(hasCover && !coverFailed);
    const blurb = $derived(description.trim());
    const shownTags = $derived(tags.slice(0, 8));

    $effect(() => {
        hasCover;
        coverBust;
        coverFailed = false;
    });
</script>

<div
    class="relative w-full overflow-hidden rounded-lg border border-border bg-background"
>
    <div class="grid grid-cols-[minmax(0,1fr)_minmax(6.5rem,9rem)]">
        <div class="min-w-0 border-r border-border">
            {#if showCover}
                <img
                    src="/{slug}/cover{coverBust ? `?v=${coverBust}` : ""}"
                    alt=""
                    class="h-40 w-full object-cover sm:h-48"
                    onerror={() => (coverFailed = true)}
                />
            {:else}
                <div
                    class="flex h-40 items-center justify-center bg-secondary/40 text-xs text-muted-foreground sm:h-48"
                >
                    No cover
                </div>
            {/if}
            <div class="space-y-1.5 px-4 py-3">
                <p class="truncate text-sm font-semibold text-foreground">
                    {title.trim() || "Untitled"}
                </p>
                {#if blurb}
                    <p
                        class="line-clamp-3 text-xs leading-relaxed text-muted-foreground"
                    >
                        {blurb}
                    </p>
                {/if}
            </div>
        </div>
        <div
            class="flex min-h-[10rem] flex-col gap-2 bg-muted/30 px-3 py-3 text-xs text-muted-foreground"
        >
            <div
                class="h-20 shrink-0 rounded border border-border bg-secondary/30"
            ></div>
            {#if shownTags.length > 0}
                <div class="flex flex-wrap gap-1.5">
                    {#each shownTags as tag (tag)}
                        <span
                            class="rounded bg-secondary px-1.5 py-0.5 text-[10px] leading-snug text-foreground/80"
                            >{tag}</span
                        >
                    {/each}
                </div>
            {/if}
        </div>
    </div>
    {#if href}
        <a {href} class="absolute inset-0 z-10" aria-label="View project"></a>
    {/if}
</div>
