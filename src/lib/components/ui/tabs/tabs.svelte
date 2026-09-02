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
        /** When true, inactive panels are not rendered (cheaper for heavy tables). */
        lazy = false,
        children,
        onValueChange,
        orientation = "horizontal",
    }: {
        value?: string;
        tabs: { value: string; label: string; count?: number }[];
        class?: string;
        listClass?: string;
        contentClass?: string;
        lazy?: boolean;
        children: Snippet<[string]>;
        onValueChange?: (value: string) => void;
        orientation?: "horizontal" | "vertical";
    } = $props();

    function handleChange(next: string) {
        value = next;
        onValueChange?.(next);
    }

    const vertical = $derived(orientation === "vertical");
</script>

<BitsTabs.Root
    {value}
    onValueChange={handleChange}
    class={cn(className, vertical && "md:flex md:items-start md:gap-8")}
>
    <BitsTabs.List
        class={cn(
            "flex w-full items-center gap-1 overflow-x-auto rounded-lg bg-muted p-1",
            vertical &&
                "md:w-48 md:shrink-0 md:flex-col md:items-stretch md:gap-0.5 md:overflow-visible md:rounded-none md:bg-transparent md:p-0",
            listClass,
        )}
    >
        {#each tabs as tab}
            <BitsTabs.Trigger
                value={tab.value}
                class={cn(
                    "inline-flex shrink-0 items-center justify-center whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium text-muted-foreground ring-offset-background transition-all hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm",
                    vertical &&
                        "md:w-full md:justify-start md:px-2.5 md:shadow-none md:hover:bg-accent md:hover:text-foreground md:data-[state=active]:bg-accent md:data-[state=active]:shadow-none",
                )}
            >
                {tab.label}
                {#if tab.count != null}
                    <span class="ml-1.5 text-xs text-muted-foreground">
                        ({tab.count})
                    </span>
                {/if}
            </BitsTabs.Trigger>
        {/each}
    </BitsTabs.List>

    {#each tabs as tab}
        <BitsTabs.Content
            value={tab.value}
            class={cn(
                "mt-4 ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 data-[state=inactive]:hidden",
                vertical && "md:mt-0 md:min-w-0 md:flex-1",
                contentClass,
            )}
        >
            {#if !lazy || tab.value === value}
                {@render children?.(tab.value)}
            {/if}
        </BitsTabs.Content>
    {/each}
</BitsTabs.Root>
