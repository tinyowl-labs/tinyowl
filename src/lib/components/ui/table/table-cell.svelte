<script lang="ts">
    import { cn } from "$lib/utils.js";

    let {
        class: className = "",
        children,
        ...restProps
    }: Record<string, unknown> = $props();
</script>

<td
    class={cn(
        "p-4 align-middle [&:has([role=checkbox])]:pr-0",
        className as string,
    )}
    {...restProps}
>
    {@render children?.()}
</td>
