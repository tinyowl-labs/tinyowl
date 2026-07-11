<script lang="ts">
    import { Handle, Position } from "@xyflow/svelte";

    type Col = { name: string; type: string; pk?: boolean };
    type Data = {
        label: string;
        columns: Col[];
        count: number;
        highlighted?: string[];
    };

    let { data }: { data: Data } = $props();

    const highlighted = $derived(new Set(data.highlighted ?? []));
</script>

<div
    class="min-w-[200px] max-w-[260px] rounded-md border border-border bg-card shadow-sm overflow-hidden text-foreground"
>
    <div
        class="flex items-center justify-between gap-2 border-b border-border bg-secondary/60 px-3 py-1.5"
    >
        <span class="text-xs font-semibold truncate">{data.label}</span>
        <span class="text-[10px] text-muted-foreground tabular-nums shrink-0"
            >{data.count}</span
        >
    </div>
    <ul class="divide-y divide-border/60 max-h-64 overflow-y-auto">
        {#each data.columns as col}
            <li
                class="relative flex items-center justify-between gap-2 px-3 py-1 text-[11px] font-mono
                    {highlighted.has(col.name)
                    ? 'bg-primary/10 text-foreground'
                    : 'text-muted-foreground'}"
            >
                <Handle
                    type="target"
                    id={col.name}
                    position={Position.Left}
                    class="!size-2 !bg-muted-foreground/50 !border-border"
                />
                <span class="truncate flex items-center gap-1.5 min-w-0">
                    {#if col.pk}
                        <span
                            class="text-[9px] uppercase tracking-wide text-primary font-sans"
                            >PK</span
                        >
                    {/if}
                    {col.name}
                </span>
                <span class="text-[10px] text-muted-foreground/70 shrink-0"
                    >{col.type}</span
                >
                <Handle
                    type="source"
                    id={col.name}
                    position={Position.Right}
                    class="!size-2 !bg-primary/70 !border-border"
                />
            </li>
        {/each}
    </ul>
</div>
