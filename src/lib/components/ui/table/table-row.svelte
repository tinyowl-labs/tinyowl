<script lang="ts">
    import type { HTMLAttributes } from "svelte/elements";
    import type { Snippet } from "svelte";
    import { cn } from "$lib/utils.js";

    let {
        class: className = "",
        children,
        ...restProps
    }: HTMLAttributes<HTMLTableRowElement> & { children?: Snippet } = $props();
</script>

<tr
    class={cn(
        "border-b transition-colors hover:bg-muted/50 data-[state=selected]:bg-muted",
        className,
    )}
    {...restProps}
>
    {@render children?.()}
</tr>
