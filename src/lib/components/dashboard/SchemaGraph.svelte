<script lang="ts">
    import {
        SvelteFlow,
        Background,
        Controls,
        MiniMap,
        Panel,
        MarkerType,
        type Node,
        type Edge,
        type NodeTypes,
    } from "@xyflow/svelte";
    import "@xyflow/svelte/dist/style.css";
    import SchemaTableNode from "./SchemaTableNode.svelte";
    import Loader2Icon from "@lucide/svelte/icons/loader-2";
    import WaypointsIcon from "@lucide/svelte/icons/waypoints";
    import { isDark, themePrefs } from "$lib/stores/theme.svelte";

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

    const NODE_W = 280;
    const HEADER_H = 44;
    const ROW_H = 28;
    const GAP_Y = 64;
    const GAP_X = 176;

    // Follow Appearance prefs, not OS "system" preference.
    const flowColorMode = $derived.by(() => {
        themePrefs.bgBase;
        return isDark() ? "dark" : "light";
    });

    function nodeHeight(t: SchemaTable): number {
        return HEADER_H + t.columns.length * ROW_H + 4;
    }

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
        for (const list of byRank.values()) {
            list.sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
        }

        const rankHeights = new Map<number, number>();
        for (const [rank, list] of byRank) {
            let h = 0;
            for (const t of list) h += nodeHeight(t) + GAP_Y;
            rankHeights.set(rank, Math.max(0, h - GAP_Y));
        }
        const maxH = Math.max(0, ...rankHeights.values());

        const nodes: Node[] = [];
        for (const [rank, list] of [...byRank.entries()].sort(
            (a, b) => a[0] - b[0],
        )) {
            const colH = rankHeights.get(rank) ?? 0;
            let y = (maxH - colH) / 2;
            for (const t of list) {
                const h = nodeHeight(t);
                nodes.push({
                    id: t.name,
                    type: "schemaTable",
                    position: { x: rank * (NODE_W + GAP_X), y },
                    style: `width:${NODE_W}px`,
                    data: {
                        label: t.label || t.name,
                        columns: t.columns,
                        count: t.count,
                        highlighted: [...(highlighted.get(t.name) ?? [])],
                    },
                });
                y += h + GAP_Y;
            }
        }

        const tableSet = new Set(tables.map((t) => t.name));
        const colByTable = new Map(
            tables.map((t) => [t.name, t.columns] as const),
        );

        function resolveHandle(
            tableName: string,
            column: string | undefined,
            fallback: string,
        ): string {
            const cols = colByTable.get(tableName) ?? [];
            const want = column || fallback;
            if (cols.some((c) => c.name === want)) return want;
            const ci = want.toLowerCase();
            const hit = cols.find((c) => c.name.toLowerCase() === ci);
            if (hit) return hit.name;
            return (
                cols.find((c) => c.pk)?.name ??
                cols.find((c) => c.name.toLowerCase() === "source_id")?.name ??
                cols[0]?.name ??
                want
            );
        }
        const flowEdges: Edge[] = edges
            .filter((e) => tableSet.has(e.source) && tableSet.has(e.target))
            .map((e) => {
                const sourceHandle = resolveHandle(
                    e.source,
                    e.source_column,
                    e.source_column,
                );
                const targetHandle = resolveHandle(
                    e.target,
                    e.target_column,
                    "source_id",
                );
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
                    sourceHandle,
                    targetHandle,
                    label,
                    type: "smoothstep",
                    animated: e.kind === "relation",
                    class: `schema-edge schema-edge--${e.kind}`,
                    style: `stroke: ${stroke}; stroke-width: 1.75;`,
                    markerEnd: {
                        type: MarkerType.ArrowClosed,
                        width: 10,
                        height: 10,
                        color: stroke,
                    },
                    labelStyle:
                        "font-size: 10px; fill: var(--color-muted-foreground); font-weight: 500;",
                    labelBgStyle:
                        "fill: var(--color-background); fill-opacity: 0.88;",
                    labelBgPadding: [3, 5] as [number, number],
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
        class="flex h-full items-center justify-center gap-2 text-sm text-muted-foreground"
    >
        <Loader2Icon class="size-4 animate-spin" />
        Loading schema…
    </div>
{:else if tables.length === 0}
    <div
        class="flex h-full flex-col items-center justify-center gap-2 text-sm text-muted-foreground"
    >
        <WaypointsIcon class="size-8 text-muted-foreground/30" />
        No tables to graph.
    </div>
{:else}
    <div class="relative h-full min-h-0 w-full overflow-hidden bg-background">
        <SvelteFlow
            bind:nodes
            bind:edges
            {nodeTypes}
            fitView
            fitViewOptions={{ padding: 0.2, maxZoom: 1.05 }}
            minZoom={0.25}
            maxZoom={1.75}
            nodesDraggable={true}
            nodesConnectable={false}
            elementsSelectable={true}
            defaultEdgeOptions={{ type: "smoothstep" }}
            proOptions={{ hideAttribution: true }}
            colorMode={flowColorMode}
            class="schema-flow"
        >
            <Background
                gap={22}
                size={1}
                bgColor="var(--background)"
                patternColor="color-mix(in oklab, var(--border) 70%, transparent)"
            />
            <Controls
                position="bottom-left"
                orientation="horizontal"
                showLock={false}
                fitViewOptions={{ padding: 0.2, maxZoom: 1.05 }}
            />
            <Panel
                position="bottom-left"
                class="pointer-events-none !m-3 !left-[7.25rem] flex flex-col gap-1.5"
            >
                <div
                    class="pointer-events-auto flex items-center gap-3 rounded-md border border-border bg-card/90 px-2.5 py-1.5 text-[11px] text-muted-foreground shadow-sm backdrop-blur-sm"
                >
                    <span class="inline-flex items-center gap-1.5">
                        <svg
                            class="size-3.5 shrink-0"
                            viewBox="0 0 16 8"
                            aria-hidden="true"
                        >
                            <line
                                x1="0"
                                y1="4"
                                x2="16"
                                y2="4"
                                stroke="var(--color-primary)"
                                stroke-width="1.75"
                            />
                        </svg>
                        FK
                    </span>
                    <span class="inline-flex items-center gap-1.5">
                        <svg
                            class="size-3.5 shrink-0"
                            viewBox="0 0 16 8"
                            aria-hidden="true"
                        >
                            <line
                                x1="0"
                                y1="4"
                                x2="16"
                                y2="4"
                                stroke="var(--color-foreground)"
                                stroke-width="1.75"
                                stroke-dasharray="5 3"
                            />
                        </svg>
                        Relation
                    </span>
                    <span class="inline-flex items-center gap-1.5">
                        <svg
                            class="size-3.5 shrink-0"
                            viewBox="0 0 16 8"
                            aria-hidden="true"
                        >
                            <line
                                x1="0"
                                y1="4"
                                x2="16"
                                y2="4"
                                stroke="var(--color-muted-foreground)"
                                stroke-width="1.75"
                                stroke-dasharray="1.5 3"
                                opacity="0.7"
                            />
                        </svg>
                        Inferred
                    </span>
                </div>
                {#if schemaEdges.length === 0}
                    <p
                        class="max-w-xs rounded-md border border-dashed border-border bg-card/80 px-2.5 py-1.5 text-[11px] text-muted-foreground backdrop-blur-sm"
                    >
                        No FK edges yet — import with
                        <code class="font-mono">--qgs</code>
                        or add
                        <code class="font-mono">references</code>
                        in table TOML.
                    </p>
                {/if}
            </Panel>
            <MiniMap
                position="bottom-right"
                pannable
                zoomable
                width={128}
                height={80}
                bgColor="color-mix(in oklab, var(--card) 88%, transparent)"
                maskColor="color-mix(in oklab, var(--foreground) 10%, transparent)"
                nodeColor="var(--muted)"
                nodeStrokeColor="var(--border)"
                nodeBorderRadius={4}
            />
        </SvelteFlow>
    </div>
{/if}

<style>
    :global(.schema-flow) {
        width: 100%;
        height: 100%;
        background: var(--background) !important;
    }
    :global(.schema-flow .svelte-flow__pane),
    :global(.schema-flow .svelte-flow__viewport),
    :global(.schema-flow .svelte-flow__renderer),
    :global(.schema-flow .svelte-flow__background) {
        background: var(--background) !important;
    }
    :global(.schema-flow .svelte-flow__node) {
        padding: 0;
        border: none;
        background: transparent;
        box-shadow: none;
        overflow: visible !important;
    }
    :global(.schema-flow .svelte-flow__node.selected) {
        box-shadow: none;
    }
    :global(.schema-flow .svelte-flow__handle) {
        width: 8px;
        height: 8px;
        min-width: 8px;
        min-height: 8px;
        pointer-events: none;
    }
    :global(.schema-flow .svelte-flow__handle-left) {
        left: 0 !important;
        right: auto !important;
        top: 50% !important;
    }
    :global(.schema-flow .svelte-flow__handle-right) {
        right: 0 !important;
        left: auto !important;
        top: 50% !important;
    }
    :global(.schema-flow .svelte-flow__edge-path) {
        stroke-width: 1.75px !important;
        fill: none !important;
    }
    :global(.schema-flow .schema-edge--fk .svelte-flow__edge-path) {
        stroke: var(--color-primary) !important;
    }
    :global(.schema-flow .schema-edge--relation .svelte-flow__edge-path) {
        stroke: var(--color-foreground) !important;
        stroke-dasharray: 7 5;
        opacity: 0.8;
    }
    :global(.schema-flow .schema-edge--inferred .svelte-flow__edge-path) {
        stroke: var(--color-muted-foreground) !important;
        stroke-dasharray: 2 6;
        opacity: 0.5;
    }
    :global(.schema-flow .svelte-flow__edge .svelte-flow__edge-text) {
        font-size: 10px;
        fill: var(--color-muted-foreground);
    }
    :global(.schema-flow .svelte-flow__edge .svelte-flow__edge-textbg) {
        fill: var(--color-background);
        fill-opacity: 0.88;
    }
    :global(.schema-flow .svelte-flow__arrowhead polyline),
    :global(.schema-flow marker path) {
        fill: var(--color-primary);
        stroke: var(--color-primary);
    }
    :global(.schema-flow .svelte-flow__panel) {
        margin: 12px;
    }
    :global(.schema-flow .svelte-flow__controls) {
        display: flex;
        overflow: hidden;
        border: 1px solid var(--color-border);
        border-radius: var(--radius-md);
        box-shadow: none;
        background: color-mix(in oklab, var(--color-card) 92%, transparent);
    }
    :global(.schema-flow .svelte-flow__controls-button) {
        background: transparent;
        border: none;
        border-right: 1px solid var(--color-border);
        fill: var(--color-foreground);
        width: 28px;
        height: 28px;
    }
    :global(.schema-flow .svelte-flow__controls-button:last-child) {
        border-right: none;
    }
    :global(.schema-flow .svelte-flow__controls-button:hover) {
        background: var(--color-accent);
    }
    :global(.schema-flow .svelte-flow__minimap) {
        overflow: hidden;
        background: color-mix(
            in oklab,
            var(--color-card) 92%,
            transparent
        ) !important;
        border: 1px solid var(--color-border) !important;
        border-radius: var(--radius-md) !important;
        box-shadow: none !important;
    }
</style>
