<script lang="ts">
    import { cn } from "$lib/utils.js";

    let {
        class: className = "",
        children,
        ...restProps
    }: Record<string, unknown> = $props();
</script>

<thead class={cn("[&_tr]:border-b", className as string)} {...restProps}>
    {@render children?.()}
</thead>
