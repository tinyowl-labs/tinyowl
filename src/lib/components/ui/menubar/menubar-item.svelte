<script lang="ts">
	import { Menubar as MenubarPrimitive } from "bits-ui";
	import { cn } from "$lib/utils.js";

	let {
		ref = $bindable(null),
		class: className,
		inset = false,
		children,
		...restProps
	}: MenubarPrimitive.ItemProps & {
		inset?: boolean;
	} = $props();
</script>

<MenubarPrimitive.Item
	bind:ref
	class={cn(
		"data-highlighted:bg-muted data-highlighted:text-foreground relative flex cursor-default items-center gap-2 rounded-sm px-2 py-1.5 text-xs outline-none select-none data-disabled:pointer-events-none data-disabled:opacity-50 [&.selected]:bg-selected [&.selected]:text-selected-foreground [&.selected]:data-highlighted:bg-selected [&.selected]:data-highlighted:text-selected-foreground [&_svg]:pointer-events-none [&_svg]:size-3.5 [&_svg]:shrink-0",
		inset && "pl-8",
		className,
	)}
	{...restProps}
>
	{@render children?.()}
</MenubarPrimitive.Item>
