<script lang="ts">
    import { Tabs as BitsTabs } from "bits-ui";
    import type { Snippet } from "svelte";

    let {
        value = $bindable(""),
        tabs,
        class: className = "",
        children,
        onValueChange,
    }: {
        value?: string;
        tabs: { value: string; label: string; count?: number }[];
        class?: string;
        children: Snippet<[string]>;
        onValueChange?: (value: string) => void;
    } = $props();

    $effect(() => {
        if (value) onValueChange?.(value);
    });
</script>

<BitsTabs.Root bind:value class={className}>
    <BitsTabs.List
        class="flex w-full items-center gap-1 overflow-x-auto rounded-lg bg-muted p-1"
    >
        {#each tabs as tab}
            <BitsTabs.Trigger
                value={tab.value}
                class="inline-flex shrink-0 items-center justify-center whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm text-muted-foreground hover:text-foreground"
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
            class="mt-4 ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
            {@render children?.(tab.value)}
        </BitsTabs.Content>
    {/each}
</BitsTabs.Root>
