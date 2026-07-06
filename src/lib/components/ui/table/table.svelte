<script lang="ts">
    import { cn } from "$lib/utils.js";

    let {
        class: className = "",
        children,
        ...restProps
    }: Record<string, unknown> = $props();
</script>

<div
    class={cn("relative w-full overflow-auto", className as string)}
    {...restProps}
>
    <table class="w-full caption-bottom text-sm">
        {@render children?.()}
    </table>
</div>
