<script lang="ts">
    type Props = {
        slug: string;
        title: string;
        tableKey: string;
        rowCount: number;
    };

    let { slug, title, tableKey, rowCount }: Props = $props();
</script>

<div class="flex flex-col gap-6">
    <div>
        <h2 class="text-base font-semibold text-foreground">Project is live</h2>
        <p class="text-sm text-muted-foreground mt-1 max-w-lg">
            {title || slug} is on the server. Browse the table, attach more
            media, or link foreign keys from Manage / Layers → Schema.
        </p>
    </div>

    {#if tableKey}
        <p
            class="rounded-lg border border-border bg-secondary/30 px-3 py-2 text-sm text-foreground"
        >
            Imported <span class="font-mono text-primary">{tableKey}</span>
            {#if rowCount}
                <span class="text-muted-foreground">· {rowCount} rows</span>
            {/if}
        </p>
    {/if}

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
            <span class="block text-sm font-medium text-foreground">Manage</span>
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
</div>
