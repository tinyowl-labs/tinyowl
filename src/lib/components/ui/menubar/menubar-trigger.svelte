<script lang="ts">
	import { Menubar as MenubarPrimitive } from "bits-ui";
	import { cn } from "$lib/utils.js";

	let {
		ref = $bindable(null),
		class: className,
		children,
		...restProps
	}: MenubarPrimitive.TriggerProps = $props();

	function preventRepeatSelect(e: PointerEvent) {
		if (e.detail > 1) e.preventDefault();
	}
</script>

<MenubarPrimitive.Trigger
	bind:ref
	class={cn(
		"select-none outline-none",
		"hover:bg-muted hover:text-foreground",
		"data-highlighted:bg-muted data-highlighted:text-foreground",
		"data-[state=open]:bg-selected data-[state=open]:text-selected-foreground",
		"data-[state=open]:hover:bg-selected data-[state=open]:hover:text-selected-foreground",
		"data-[state=open]:data-highlighted:bg-selected data-[state=open]:data-highlighted:text-selected-foreground",
		"aria-expanded:bg-selected aria-expanded:text-selected-foreground",
		className,
	)}
	{...restProps}
	onpointerdown={preventRepeatSelect}
	ondblclick={(e) => {
		e.preventDefault();
	}}
>
	{@render children?.()}
</MenubarPrimitive.Trigger>
