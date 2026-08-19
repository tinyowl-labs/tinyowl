<script lang="ts">
    import GitBranchIcon from "@lucide/svelte/icons/git-branch";
    import PlusIcon from "@lucide/svelte/icons/plus";
    import TrashIcon from "@lucide/svelte/icons/trash-2";
    import { entityLayersHref } from "$lib/project/entityLink";

    export type EntityRelation = {
        source_type: string;
        source_id: string;
        predicate: string;
        target_type: string;
        target_id: string;
        revision?: number;
    };

    type Props = {
        slug: string;
        accessToken?: string | null;
        canWrite?: boolean;
        /** Optional predicate registry hints from project.toml */
        predicateHints?: string[];
        /** Optional graph.bands labels */
        bands?: { membership?: string; order?: string } | null;
    };

    let {
        slug,
        accessToken = null,
        canWrite = false,
        predicateHints = [],
        bands = null,
    }: Props = $props();

    let relations = $state<EntityRelation[]>([]);
    let loading = $state(false);
    let error = $state("");
    let predicateFilter = $state("");
    let sourceTypeFilter = $state("");

    let form = $state({
        source_type: "",
        source_id: "",
        predicate: "",
        target_type: "",
        target_id: "",
    });
    let saving = $state(false);

    function authHeaders(): HeadersInit {
        return accessToken ? { Authorization: `Bearer ${accessToken}` } : {};
    }

    async function loadRelations() {
        if (!slug) return;
        loading = true;
        error = "";
        try {
            const params = new URLSearchParams();
            params.set("limit", "500");
            if (predicateFilter.trim())
                params.set("predicate", predicateFilter.trim());
            if (sourceTypeFilter.trim())
                params.set("source_type", sourceTypeFilter.trim());
            const res = await fetch(
                `/api/v1/projects/${encodeURIComponent(slug)}/relations?${params}`,
                { headers: authHeaders() },
            );
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const body = await res.json();
            relations = body.relations ?? [];
        } catch (e) {
            error = e instanceof Error ? e.message : "Failed to load relations";
            relations = [];
        } finally {
            loading = false;
        }
    }

    async function createRelation() {
        if (!canWrite || !accessToken) return;
        const rel = {
            source_type: form.source_type.trim(),
            source_id: form.source_id.trim(),
            predicate: form.predicate.trim(),
            target_type: form.target_type.trim(),
            target_id: form.target_id.trim(),
        };
        if (
            !rel.source_type ||
            !rel.source_id ||
            !rel.predicate ||
            !rel.target_type ||
            !rel.target_id
        ) {
            error = "All fields required";
            return;
        }
        saving = true;
        error = "";
        try {
            const res = await fetch(
                `/api/v1/projects/${encodeURIComponent(slug)}/relations`,
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        ...authHeaders(),
                    },
                    body: JSON.stringify(rel),
                },
            );
            if (!res.ok) {
                const t = await res.text();
                throw new Error(t || `HTTP ${res.status}`);
            }
            form = {
                source_type: "",
                source_id: "",
                predicate: "",
                target_type: "",
                target_id: "",
            };
            await loadRelations();
        } catch (e) {
            error = e instanceof Error ? e.message : "Create failed";
        } finally {
            saving = false;
        }
    }

    async function deleteRelation(rel: EntityRelation) {
        if (!canWrite || !accessToken) return;
        saving = true;
        error = "";
        try {
            const res = await fetch(
                `/api/v1/projects/${encodeURIComponent(slug)}/relations`,
                {
                    method: "DELETE",
                    headers: {
                        "Content-Type": "application/json",
                        ...authHeaders(),
                    },
                    body: JSON.stringify(rel),
                },
            );
            if (!res.ok) {
                const t = await res.text();
                throw new Error(t || `HTTP ${res.status}`);
            }
            await loadRelations();
        } catch (e) {
            error = e instanceof Error ? e.message : "Delete failed";
        } finally {
            saving = false;
        }
    }

    function entityHref(type: string, id: string): string {
        return entityLayersHref(slug, { layer: type, highlight: id });
    }

    $effect(() => {
        void slug;
        void predicateFilter;
        void sourceTypeFilter;
        void loadRelations();
    });
</script>

<div class="flex flex-col gap-3 text-xs">
    <div class="flex items-center gap-2">
        <GitBranchIcon class="size-3.5 text-muted-foreground" />
        <h2 class="text-sm font-medium text-foreground">Entity relations</h2>
        {#if relations.length}
            <span class="text-muted-foreground tabular-nums"
                >{relations.length}</span
            >
        {/if}
    </div>

    {#if bands?.membership || bands?.order}
        <p class="text-muted-foreground">
            Bands:
            {#if bands.membership}
                membership=<code class="font-mono">{bands.membership}</code>
            {/if}
            {#if bands.order}
                order=<code class="font-mono">{bands.order}</code>
            {/if}
        </p>
    {/if}

    <div class="flex flex-wrap gap-2">
        <input
            class="rounded-md border border-border bg-background px-2 py-1 min-w-[8rem]"
            placeholder="Filter predicate"
            bind:value={predicateFilter}
            list="predicate-hints"
        />
        <input
            class="rounded-md border border-border bg-background px-2 py-1 min-w-[8rem]"
            placeholder="Filter source type"
            bind:value={sourceTypeFilter}
        />
        {#if predicateHints.length}
            <datalist id="predicate-hints">
                {#each predicateHints as p}
                    <option value={p}></option>
                {/each}
            </datalist>
        {/if}
    </div>

    {#if error}
        <p class="text-destructive">{error}</p>
    {/if}

    {#if loading && !relations.length}
        <p class="text-muted-foreground">Loading…</p>
    {:else if !relations.length}
        <div
            class="rounded-md border border-dashed border-border px-3 py-6 text-center text-muted-foreground"
        >
            No entity edges yet. Seed via GPKG <code class="font-mono"
                >_relations</code
            >
            or add below.
        </div>
    {:else}
        <ul class="divide-y divide-border rounded-md border border-border max-h-64 overflow-y-auto">
            {#each relations as rel}
                <li
                    class="flex items-center gap-2 px-2 py-1.5 hover:bg-secondary/50"
                >
                    <a
                        class="text-primary hover:underline truncate"
                        href={entityHref(rel.source_type, rel.source_id)}
                        >{rel.source_type}:{rel.source_id}</a
                    >
                    <span class="shrink-0 font-mono text-muted-foreground"
                        >{rel.predicate}</span
                    >
                    <a
                        class="text-primary hover:underline truncate"
                        href={entityHref(rel.target_type, rel.target_id)}
                        >{rel.target_type}:{rel.target_id}</a
                    >
                    {#if canWrite}
                        <button
                            type="button"
                            class="ml-auto shrink-0 p-1 rounded hover:bg-secondary text-muted-foreground"
                            title="Delete"
                            disabled={saving}
                            onclick={() => deleteRelation(rel)}
                        >
                            <TrashIcon class="size-3" />
                        </button>
                    {/if}
                </li>
            {/each}
        </ul>
    {/if}

    {#if canWrite}
        <div class="rounded-md border border-border p-2 space-y-2">
            <p class="text-muted-foreground font-medium">Add edge</p>
            <div class="grid grid-cols-2 sm:grid-cols-5 gap-1.5">
                <input
                    class="rounded border border-border bg-background px-1.5 py-1"
                    placeholder="source_type"
                    bind:value={form.source_type}
                />
                <input
                    class="rounded border border-border bg-background px-1.5 py-1"
                    placeholder="source_id"
                    bind:value={form.source_id}
                />
                <input
                    class="rounded border border-border bg-background px-1.5 py-1"
                    placeholder="predicate"
                    bind:value={form.predicate}
                    list="predicate-hints"
                />
                <input
                    class="rounded border border-border bg-background px-1.5 py-1"
                    placeholder="target_type"
                    bind:value={form.target_type}
                />
                <input
                    class="rounded border border-border bg-background px-1.5 py-1"
                    placeholder="target_id"
                    bind:value={form.target_id}
                />
            </div>
            <button
                type="button"
                class="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 hover:bg-secondary disabled:opacity-50"
                disabled={saving}
                onclick={createRelation}
            >
                <PlusIcon class="size-3" />
                Add
            </button>
        </div>
    {/if}
</div>
