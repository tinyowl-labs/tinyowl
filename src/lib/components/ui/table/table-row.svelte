<script lang="ts">
    import { cn } from "$lib/utils.js";

    let {
        class: className = "",
        children,
        ...restProps
    }: Record<string, unknown> = $props();
</script>

<tr
    class={cn(
        "border-b transition-colors hover:bg-muted/50 data-[state=selected]:bg-muted",
        className as string,
    )}
    {...restProps}
>
    {@render children?.()}
</tr>
