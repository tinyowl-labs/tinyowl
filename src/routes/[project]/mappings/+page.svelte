<script lang="ts">
    import { page } from "$app/stores";
    import WaypointsIcon from "@lucide/svelte/icons/waypoints";
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
    const samples = $derived(
        ((data as any)?.samples as Record<string, string[]>) ?? {},
    );

    function isDumpColumn(name: string): boolean {
        const n = name.toLowerCase();
        return (
            n === "geom" ||
            n === "geometry" ||
            n === "fid" ||
            n === "pk" ||
            n === "photo" ||
            n === "photomodel" ||
            n === "scan_3d" ||
            n === "media" ||
            n.endsWith("_photo") ||
            n.endsWith("_geom")
        );
    }

    const columnRows = $derived.by(() => {
        const byKey = new Map(
            annotations.map((a: any) => [
                `${a.entity_type}|${a.column_name}`.toLowerCase(),
                a,
            ]),
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
                if (isDumpColumn(col)) continue;
                const key = `${table}|${col}`.toLowerCase();
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
            const key = `${a.entity_type}|${a.column_name}`.toLowerCase();
            if (seen.has(key) || isDumpColumn(String(a.column_name ?? ""))) {
                continue;
            }
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
                Opt a column into PeriodO, AAT, or CRM, then link its local
                labels to a shared concept URI. Other projects can use different
                wording if they share the URI.
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

    <MappingWorkbench
        columns={columnRows}
        values={mappings}
        {samples}
        {form}
    />
</article>
