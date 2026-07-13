<script lang="ts">
    import type { HTMLAttributes } from "svelte/elements";
    import type { Snippet } from "svelte";
    import { cn } from "$lib/utils.js";

    let {
        class: className = "",
        children,
        ...restProps
    }: HTMLAttributes<HTMLDivElement> & { children?: Snippet } = $props();
</script>

<div
    class={cn("relative w-full overflow-auto", className)}
    {...restProps}
>
    <table class="w-full caption-bottom text-sm">
        {@render children?.()}
    </table>
</div>
