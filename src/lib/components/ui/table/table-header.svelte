<script lang="ts">
    import type { HTMLAttributes } from "svelte/elements";
    import type { Snippet } from "svelte";
    import { cn } from "$lib/utils.js";

    let {
        class: className = "",
        children,
        ...restProps
    }: HTMLAttributes<HTMLTableSectionElement> & { children?: Snippet } =
        $props();
</script>

<thead class={cn("[&_tr]:border-b", className)} {...restProps}>
    {@render children?.()}
</thead>
