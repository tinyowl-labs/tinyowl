<script lang="ts">
    import { page } from "$app/stores";
    import WaypointsIcon from "@lucide/svelte/icons/waypoints";
    import { Tabs } from "$lib/components/ui/tabs/index.js";
    import MappingWorkbench from "$lib/components/settings/MappingWorkbench.svelte";

    let { data, form: rawForm } = $props();
    const form = $derived(rawForm as any);

    const slug = $derived(
        ((data as any)?.slug as string) || ($page.params.project ?? ""),
    );
    const mappings = $derived(((data as any)?.mappings as any[]) ?? []);
    const annotations = $derived(((data as any)?.annotations as any[]) ?? []);
    const tables = $derived(
        ((data as any)?.tables as Record<string, string[]>) ?? {},
    );

    let activeTab = $state("values");

    const columnRows = $derived.by(() => {
        const byKey = new Map(
            annotations.map((a: any) => [`${a.entity_type}|${a.column_name}`, a]),
        );
        const rows: {
            entity_type: string;
            column_name: string;
            vocabulary: string | null;
            crm_property: string | null;
            crm_range: string | null;
        }[] = [];
        const seen = new Set<string>();

        for (const [table, cols] of Object.entries(tables)) {
            for (const col of cols ?? []) {
                const key = `${table}|${col}`;
                seen.add(key);
                const a = byKey.get(key) as any;
                rows.push({
                    entity_type: table,
                    column_name: col,
                    vocabulary: a?.vocabulary ?? null,
                    crm_property: a?.crm_property ?? null,
                    crm_range: a?.crm_range ?? null,
                });
            }
        }
        for (const a of annotations) {
            const key = `${a.entity_type}|${a.column_name}`;
            if (seen.has(key)) continue;
            rows.push({
                entity_type: a.entity_type,
                column_name: a.column_name,
                vocabulary: a.vocabulary ?? null,
                crm_property: a.crm_property ?? null,
                crm_range: a.crm_range ?? null,
            });
        }
        return rows.sort(
            (a, b) =>
                a.entity_type.localeCompare(b.entity_type) ||
                a.column_name.localeCompare(b.column_name),
        );
    });

    const tabs = $derived([
        { value: "values", label: "Values", count: mappings.length },
        { value: "columns", label: "Columns", count: columnRows.length },
    ]);
</script>

<svelte:head>
    <title>Mappings — {slug} — echidna</title>
</svelte:head>

<article class="mx-auto max-w-4xl px-6 py-12">
    <div class="mb-8 flex flex-wrap items-start justify-between gap-4">
        <div>
            <div class="flex items-center gap-3">
                <WaypointsIcon class="size-6 text-muted-foreground" />
                <h1 class="text-2xl font-bold tracking-tight text-foreground">
                    Mappings
                </h1>
            </div>
            <p class="mt-1 text-sm text-muted-foreground">
                Link project columns and values to shared vocabularies and CRM
                properties
            </p>
        </div>
        <a
            href="/{slug}/mappings.toml"
            class="text-xs font-medium text-primary hover:underline shrink-0 mt-2"
            download="{slug}-mappings.toml"
        >
            Export mappings.toml
        </a>
    </div>

    <Tabs bind:value={activeTab} {tabs}>
        {#snippet children(tabValue: string)}
            {#if tabValue === "values"}
                <MappingWorkbench
                    mode="values"
                    rows={mappings}
                    {form}
                    description="Map distinct values to external concepts. Multi-value (array) cells are exploded into one row per element — FK lists show the related label when available. Manual UI mappings are preserved on TOML push."
                />
            {:else if tabValue === "columns"}
                <MappingWorkbench
                    mode="columns"
                    rows={columnRows}
                    {form}
                    description="Assign a CRM property to each column (e.g. crm:P2_has_type). Vocabulary is separate — usually set from TOML."
                />
            {/if}
        {/snippet}
    </Tabs>
</article>
