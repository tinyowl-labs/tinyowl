<script lang="ts">
    import { cn } from "$lib/utils.js";

    let {
        class: className = "",
        children,
        ...restProps
    }: Record<string, unknown> = $props();
</script>

<tbody
    class={cn("[&_tr:last-child]:border-0", className as string)}
    {...restProps}
>
    {@render children?.()}
</tbody>
