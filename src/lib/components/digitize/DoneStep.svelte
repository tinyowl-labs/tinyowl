<script lang="ts">
    type Props = {
        slug: string;
        title: string;
        tableKey: string;
        rowCount: number;
        pending?: boolean;
        changesetId?: string;
    };

    let {
        slug,
        title,
        tableKey,
        rowCount,
        pending = false,
        changesetId = "",
    }: Props = $props();
</script>

<div class="flex flex-col gap-6">
    <div>
        <h2 class="text-base font-semibold text-foreground">
            {pending ? "Import submitted for review" : "Project is live"}
        </h2>
        <p class="text-sm text-muted-foreground mt-1 max-w-lg">
            {#if pending}
                {title || slug} did not change yet. Approve the changeset to add
                the table to canonical — same gate as map edits.
            {:else}
                {title || slug} is on the server. Browse the table, attach more
                media, or link foreign keys from Manage / Layers → Schema.
            {/if}
        </p>
    </div>

    {#if tableKey}
        <p
            class="rounded-lg border border-border bg-secondary/30 px-3 py-2 text-sm text-foreground"
        >
            {pending ? "Pending" : "Imported"}
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
            Open review
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
                    >Import another table</span
                >
                <span class="block text-xs text-muted-foreground mt-0.5"
                    >CSV or GeoJSON</span
                >
            </a>
        </div>
    {/if}
</div>
