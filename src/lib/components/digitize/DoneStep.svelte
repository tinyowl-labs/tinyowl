<script lang="ts">
    import { mediaKindLabel, type MediaKind } from "$lib/project/uploadMedia";

    type Props = {
        slug: string;
        title: string;
        tableKey: string;
        rowCount: number;
        pending?: boolean;
        changesetId?: string;
        importKind?: "table" | "media";
        mediaStored?: number;
        mediaQueued?: number;
        mediaNames?: string[];
        mediaKinds?: MediaKind[];
    };

    let {
        slug,
        title,
        tableKey,
        rowCount,
        pending = false,
        changesetId = "",
        importKind = "table",
        mediaStored = 0,
        mediaQueued = 0,
        mediaNames = [],
        mediaKinds = [],
    }: Props = $props();

    const media = $derived(importKind === "media");
    const coverageLike = $derived(
        mediaKinds.some(
            (k) => k === "ortho" || k === "tileset" || k === "model",
        ),
    );
    const kindBits = $derived(
        [...new Set(mediaKinds.map(mediaKindLabel))].join(", "),
    );
</script>

<div class="flex flex-col gap-6">
    <div>
        <h2 class="text-base font-semibold text-foreground">
            {#if media}
                Media landed
            {:else if pending}
                Import submitted for review
            {:else}
                Committed to develop
            {/if}
        </h2>
        <p class="text-sm text-muted-foreground mt-1 max-w-lg">
            {#if media}
                {title || slug} has {mediaStored + mediaQueued} file{mediaStored +
                    mediaQueued ===
                1
                    ? ""
                    : "s"} on the catalogue
                {#if kindBits}({kindBits}){/if}. Members see stored files on
                Artefacts now. {#if mediaQueued}
                    {mediaQueued} still queued for ingest (ortho / 3D).
                {/if}
                Linking a photo column to rows is Schema → Media when you have a
                table. Publishing to viewers is promote to main from Publish.
            {:else if pending}
                {title || slug} did not change yet. This leftover pending row
                still needs approve — new imports land on develop without that
                gate.
            {:else}
                {title || slug} is on develop. Members see it on Layers now.
                Publishing to viewers is promote to main from Publish.
            {/if}
        </p>
    </div>

    {#if media && mediaNames.length}
        <p
            class="rounded-lg border border-border bg-secondary/30 px-3 py-2 text-sm text-foreground"
        >
            {#if mediaStored}
                {mediaStored} stored
            {/if}
            {#if mediaStored && mediaQueued}
                <span class="text-muted-foreground"> · </span>
            {/if}
            {#if mediaQueued}
                {mediaQueued} queued
            {/if}
            <span class="block mt-1 font-mono text-xs text-muted-foreground truncate"
                >{mediaNames.join(", ")}</span
            >
        </p>
    {:else if tableKey}
        <p
            class="rounded-lg border border-border bg-secondary/30 px-3 py-2 text-sm text-foreground"
        >
            {pending ? "Pending" : "On develop"}
            <span class="font-mono text-primary">{tableKey}</span>
            {#if rowCount}
                <span class="text-muted-foreground">· {rowCount} rows</span>
            {/if}
        </p>
    {/if}

    {#if pending && changesetId}
        <a
            href="/{slug}/review/{changesetId}"
            class="self-start rounded-md bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground no-underline"
        >
            Open leftover review
        </a>
    {:else if !pending && !media}
        <a
            href="/{slug}/review"
            class="self-start rounded-md bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground no-underline"
        >
            Publish to viewers
        </a>
    {/if}

    {#if pending}
        <a
            href="/{slug}/dashboard"
            class="self-start text-sm text-muted-foreground hover:text-foreground"
        >
            Back to manage
        </a>
    {:else}
        <div class="grid gap-2 sm:grid-cols-2">
            {#if media}
                <a
                    href="/{slug}/artefacts"
                    class="rounded-lg border border-border bg-card px-4 py-3 no-underline hover:bg-accent/40 transition-colors"
                >
                    <span class="block text-sm font-medium text-foreground"
                        >Open Artefacts</span
                    >
                    <span class="block text-xs text-muted-foreground mt-0.5"
                        >Photos, PDFs, and models on the shelf</span
                    >
                </a>
                <a
                    href="/{slug}/layers"
                    class="rounded-lg border border-border bg-card px-4 py-3 no-underline hover:bg-accent/40 transition-colors"
                >
                    <span class="block text-sm font-medium text-foreground"
                        >Open Layers</span
                    >
                    <span class="block text-xs text-muted-foreground mt-0.5"
                        >{coverageLike
                            ? "Ortho and tilesets appear after ingest"
                            : "Map and tables"}</span
                    >
                </a>
            {:else}
                <a
                    href="/{slug}/layers?view=table"
                    class="rounded-lg border border-border bg-card px-4 py-3 no-underline hover:bg-accent/40 transition-colors"
                >
                    <span class="block text-sm font-medium text-foreground"
                        >Open table</span
                    >
                    <span class="block text-xs text-muted-foreground mt-0.5"
                        >Browse rows on Layers</span
                    >
                </a>
                <a
                    href="/{slug}/layers?view=schema"
                    class="rounded-lg border border-border bg-card px-4 py-3 no-underline hover:bg-accent/40 transition-colors"
                >
                    <span class="block text-sm font-medium text-foreground"
                        >Schema & FKs</span
                    >
                    <span class="block text-xs text-muted-foreground mt-0.5"
                        >Link columns between tables</span
                    >
                </a>
            {/if}
            <a
                href="/{slug}/dashboard"
                class="rounded-lg border border-border bg-card px-4 py-3 no-underline hover:bg-accent/40 transition-colors"
            >
                <span class="block text-sm font-medium text-foreground"
                    >Manage</span
                >
                <span class="block text-xs text-muted-foreground mt-0.5"
                    >Tables, import, clone</span
                >
            </a>
            <a
                href="/{slug}/import"
                class="rounded-lg border border-border bg-card px-4 py-3 no-underline hover:bg-accent/40 transition-colors"
            >
                <span class="block text-sm font-medium text-foreground"
                    >Import more</span
                >
                <span class="block text-xs text-muted-foreground mt-0.5"
                    >Table or media</span
                >
            </a>
        </div>
    {/if}
</div>
