<script lang="ts">
    import {
        SvelteFlow,
        Background,
        Controls,
        MiniMap,
        MarkerType,
        type Node,
        type Edge,
        type NodeTypes,
    } from "@xyflow/svelte";
    import "@xyflow/svelte/dist/style.css";
    import SchemaTableNode from "./SchemaTableNode.svelte";
    import Loader2Icon from "@lucide/svelte/icons/loader-2";
    import WaypointsIcon from "@lucide/svelte/icons/waypoints";

    export type SchemaColumn = { name: string; type: string; pk?: boolean };
    export type SchemaTable = {
        name: string;
        label?: string;
        columns: SchemaColumn[];
        count: number;
    };
    export type SchemaEdge = {
        id: string;
        source: string;
        target: string;
        source_column: string;
        target_column?: string;
        label?: string;
        kind: string;
        allow_multi?: boolean;
        count?: number;
    };

    let {
        tables = [],
        edges: schemaEdges = [],
        loading = false,
    }: {
        tables?: SchemaTable[];
        edges?: SchemaEdge[];
        loading?: boolean;
    } = $props();

    const nodeTypes: NodeTypes = {
        schemaTable: SchemaTableNode,
    };

    function layout(
        tables: SchemaTable[],
        edges: SchemaEdge[],
    ): { nodes: Node[]; flowEdges: Edge[] } {
        const highlighted = new Map<string, Set<string>>();
        for (const e of edges) {
            if (!highlighted.has(e.source)) highlighted.set(e.source, new Set());
            if (!highlighted.has(e.target)) highlighted.set(e.target, new Set());
            highlighted.get(e.source)!.add(e.source_column);
            if (e.target_column) {
                highlighted.get(e.target)!.add(e.target_column);
            } else {
                highlighted.get(e.target)!.add("source_id");
            }
        }

        // Rank: roots (no incoming) left, dependents right
        const incoming = new Map<string, number>();
        for (const t of tables) incoming.set(t.name, 0);
        for (const e of edges) {
            if (incoming.has(e.target)) {
                incoming.set(e.target, (incoming.get(e.target) ?? 0) + 1);
            }
        }
        const ranks = new Map<string, number>();
        const queue = tables
            .filter((t) => (incoming.get(t.name) ?? 0) === 0)
            .map((t) => t.name);
        for (const name of queue) ranks.set(name, 0);
        // BFS-ish propagation
        let changed = true;
        let guard = 0;
        while (changed && guard++ < tables.length + 2) {
            changed = false;
            for (const e of edges) {
                const sr = ranks.get(e.source);
                if (sr == null) continue;
                const next = sr + 1;
                const cur = ranks.get(e.target);
                if (cur == null || next > cur) {
                    ranks.set(e.target, next);
                    changed = true;
                }
            }
        }
        for (const t of tables) {
            if (!ranks.has(t.name)) ranks.set(t.name, 0);
        }

        const byRank = new Map<number, SchemaTable[]>();
        for (const t of tables) {
            const r = ranks.get(t.name) ?? 0;
            if (!byRank.has(r)) byRank.set(r, []);
            byRank.get(r)!.push(t);
        }

        const nodes: Node[] = [];
        const colWidth = 300;
        const rowHeight = 28;
        const headerH = 36;
        const gapY = 40;
        const gapX = 80;

        for (const [rank, list] of [...byRank.entries()].sort(
            (a, b) => a[0] - b[0],
        )) {
            let y = 0;
            for (const t of list) {
                const h = headerH + Math.min(t.columns.length, 12) * rowHeight;
                nodes.push({
                    id: t.name,
                    type: "schemaTable",
                    position: { x: rank * (colWidth + gapX), y },
                    data: {
                        label: t.label || t.name,
                        columns: t.columns,
                        count: t.count,
                        highlighted: [...(highlighted.get(t.name) ?? [])],
                    },
                });
                y += h + gapY;
            }
        }

        const tableSet = new Set(tables.map((t) => t.name));
        const flowEdges: Edge[] = edges
            .filter((e) => tableSet.has(e.source) && tableSet.has(e.target))
            .map((e) => {
                const targetHandle = e.target_column || "source_id";
                const label =
                    e.label ||
                    (e.count
                        ? `${e.source_column} (${e.count})`
                        : e.source_column);
                const stroke =
                    e.kind === "fk"
                        ? "var(--color-primary)"
                        : e.kind === "inferred"
                          ? "var(--color-muted-foreground)"
                          : "var(--color-foreground)";
                return {
                    id: e.id,
                    source: e.source,
                    target: e.target,
                    sourceHandle: e.source_column,
                    targetHandle,
                    label,
                    type: "smoothstep",
                    animated: e.kind === "relation",
                    class: `schema-edge schema-edge--${e.kind}`,
                    style: `stroke: ${stroke}; stroke-width: 2.5;`,
                    markerEnd: {
                        type: MarkerType.ArrowClosed,
                        width: 18,
                        height: 18,
                        color: stroke,
                    },
                    labelStyle:
                        "font-size: 11px; fill: var(--color-foreground); font-weight: 500;",
                    labelBgStyle:
                        "fill: var(--color-card); fill-opacity: 0.92;",
                    labelBgPadding: [4, 6] as [number, number],
                    labelBgBorderRadius: 4,
                } as Edge;
            });

        return { nodes, flowEdges };
    }

    let nodes = $state.raw<Node[]>([]);
    let edges = $state.raw<Edge[]>([]);

    $effect(() => {
        const built = layout(tables, schemaEdges);
        nodes = built.nodes;
        edges = built.flowEdges;
    });
</script>

{#if loading}
    <div
        class="flex h-full min-h-[320px] items-center justify-center gap-2 text-sm text-muted-foreground rounded-lg border border-border"
    >
        <Loader2Icon class="size-4 animate-spin" />
        Loading schema…
    </div>
{:else if tables.length === 0}
    <div
        class="flex h-full min-h-[320px] flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border text-sm text-muted-foreground"
    >
        <WaypointsIcon class="size-8 text-muted-foreground/30" />
        No tables to graph.
    </div>
{:else}
    <div
        class="h-full min-h-[420px] rounded-lg border border-border overflow-hidden bg-background"
    >
        <SvelteFlow
            bind:nodes
            bind:edges
            {nodeTypes}
            fitView
            nodesDraggable={true}
            nodesConnectable={false}
            elementsSelectable={true}
            proOptions={{ hideAttribution: true }}
            colorMode="system"
            class="schema-flow"
        >
            <Background gap={18} size={1} />
            <Controls />
            <MiniMap pannable zoomable />
        </SvelteFlow>
    </div>
    <p class="mt-2 text-[11px] text-muted-foreground">
        Solid edges = QGIS ValueRelation / TOML
        <code class="font-mono">references</code> / SQLite FKs. Dashed =
        <code class="font-mono">[[relations]]</code> or
        <code class="font-mono">_relations</code>. Faint dotted = name guess
        only (confirm in table TOML or QGS).
        {#if schemaEdges.length === 0}
            No FK edges yet — import with
            <code class="font-mono">--qgs</code> or add
            <code class="font-mono">references = "OtherTable.col"</code> and
            push.
        {/if}
    </p>
{/if}

<style>
    :global(.schema-flow) {
        width: 100%;
        height: 100%;
    }
    :global(.schema-flow .svelte-flow__edge-path) {
        stroke-width: 2.5px !important;
        fill: none !important;
    }
    :global(.schema-flow .schema-edge--fk .svelte-flow__edge-path) {
        stroke: var(--color-primary) !important;
    }
    :global(.schema-flow .schema-edge--relation .svelte-flow__edge-path) {
        stroke: var(--color-foreground) !important;
        stroke-dasharray: 6 4;
        opacity: 0.85;
    }
    :global(.schema-flow .schema-edge--inferred .svelte-flow__edge-path) {
        stroke: var(--color-muted-foreground) !important;
        stroke-dasharray: 2 5;
        opacity: 0.55;
    }
    :global(.schema-flow .svelte-flow__edge .svelte-flow__edge-text) {
        font-size: 11px;
        fill: var(--color-foreground);
    }
    :global(.schema-flow .svelte-flow__edge .svelte-flow__edge-textbg) {
        fill: var(--color-card);
        fill-opacity: 0.92;
    }
    :global(.schema-flow .svelte-flow__arrowhead polyline),
    :global(.schema-flow marker path) {
        fill: var(--color-primary);
        stroke: var(--color-primary);
    }
    :global(.schema-flow .svelte-flow__minimap) {
        background: hsl(from var(--color-secondary) h s l / 0.8);
    }
    :global(.schema-flow .svelte-flow__controls) {
        border: 1px solid var(--color-border);
        border-radius: 6px;
        overflow: hidden;
        box-shadow: none;
    }
    :global(.schema-flow .svelte-flow__controls-button) {
        background: var(--color-card);
        border-bottom: 1px solid var(--color-border);
        fill: var(--color-foreground);
    }
</style>
