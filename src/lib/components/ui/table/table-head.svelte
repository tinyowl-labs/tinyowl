<script lang="ts">
    import { cn } from "$lib/utils.js";

    let {
        class: className = "",
        children,
        ...restProps
    }: Record<string, unknown> = $props();
</script>

<th
    class={cn(
        "h-12 px-4 text-left align-middle font-medium text-muted-foreground [&:has([role=checkbox])]:pr-0",
        className as string,
    )}
    {...restProps}
>
    {@render children?.()}
</th>
