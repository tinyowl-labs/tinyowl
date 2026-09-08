<script lang="ts">
    import { Tabs as BitsTabs } from "bits-ui";
    import type { Snippet } from "svelte";
    import { cn } from "$lib/utils.js";

    let {
        value = $bindable(""),
        tabs,
        class: className = "",
        listClass = "",
        contentClass = "",
        /** When true, panels render on first visit and stay mounted (xyflow-safe). */
        lazy = false,
        leading,
        trailing,
        afterSeparator,
        children,
        onValueChange,
        orientation = "horizontal",
    }: {
        value?: string;
        tabs: { value: string; label: string; count?: number; pending?: number; separatorAfter?: boolean; keepAlive?: boolean }[];
        class?: string;
        listClass?: string;
        contentClass?: string;
        lazy?: boolean;
        /** Rendered to the left of the tab list (horizontal only). */
        leading?: Snippet;
        /** Rendered to the right of the tab list (horizontal only). */
        trailing?: Snippet;
        /** Rendered after a tab with `separatorAfter` (inside the list). */
        afterSeparator?: Snippet;
        children: Snippet<[string]>;
        onValueChange?: (value: string) => void;
        orientation?: "horizontal" | "vertical";
    } = $props();

    function handleChange(next: string) {
        value = next;
        onValueChange?.(next);
    }

    const vertical = $derived(orientation === "vertical");
    let visited = $state<Record<string, boolean>>({});

    $effect(() => {
        const v = value;
        if (!v || visited[v]) return;
        visited = { ...visited, [v]: true };
    });
</script>

<BitsTabs.Root
    {value}
    onValueChange={handleChange}
    class={cn(className, vertical && "md:flex md:items-start md:gap-8")}
>
    <div
        class={cn(
            !vertical && (leading || trailing) && "flex w-full items-center gap-2",
        )}
    >
        {#if leading && !vertical}
            {@render leading()}
        {/if}
        <BitsTabs.List
            class={cn(
                "flex w-full items-center gap-1 overflow-x-auto rounded-lg bg-muted p-1",
                (leading || trailing) && !vertical && "min-w-0 flex-1",
                vertical &&
                    "md:w-48 md:shrink-0 md:flex-col md:items-stretch md:gap-0.5 md:overflow-visible md:rounded-none md:bg-transparent md:p-0",
                listClass,
            )}
        >
            {#each tabs as tab (tab.value)}
                <BitsTabs.Trigger
                    value={tab.value}
                    class={cn(
                        "inline-flex shrink-0 items-center justify-center whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium text-muted-foreground ring-offset-background transition-all hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50",
                        vertical
                            ? [
                                  "md:w-full md:justify-start md:px-3 md:hover:bg-accent",
                                  tab.value === value && "selected",
                              ]
                            : "data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm",
                    )}
                >
                    {tab.label}
                    {#if tab.count != null}
                        <span class="ml-1.5 text-xs text-muted-foreground">
                            ({tab.count})
                        </span>
                    {/if}
                    {#if tab.pending}
                        <span
                            class="ml-1 rounded bg-primary/15 px-1 text-[10px] tabular-nums text-foreground"
                            title="{tab.pending} in session"
                            >{tab.pending}</span
                        >
                    {/if}
                </BitsTabs.Trigger>
                {#if tab.separatorAfter}
                    <span
                        class="mx-0.5 h-4 w-px shrink-0 bg-border"
                        aria-hidden="true"
                    ></span>
                    {#if afterSeparator}
                        {@render afterSeparator()}
                    {/if}
                {/if}
            {/each}
        </BitsTabs.List>
        {#if trailing && !vertical}
            {@render trailing()}
        {/if}
    </div>

    {#each tabs as tab (tab.value)}
        <BitsTabs.Content
            value={tab.value}
            class={cn(
                "mt-4 ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 data-[state=inactive]:hidden",
                vertical && "md:mt-0 md:min-w-0 md:flex-1",
                contentClass,
            )}
        >
            {#if !lazy || tab.keepAlive || tab.value === value || visited[tab.value]}
                {@render children?.(tab.value)}
            {/if}
        </BitsTabs.Content>
    {/each}
</BitsTabs.Root>
