<script lang="ts">
	import { Menubar as MenubarPrimitive } from "bits-ui";
	import { cn } from "$lib/utils.js";

	let {
		ref = $bindable(null),
		class: className,
		sideOffset = 4,
		align = "start",
		children,
		...restProps
	}: MenubarPrimitive.ContentProps & {
		align?: "start" | "center" | "end";
	} = $props();
</script>

<MenubarPrimitive.Portal>
	<MenubarPrimitive.Content
		bind:ref
		{sideOffset}
		{align}
		class={cn(
			"surface text-foreground data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 z-50 min-w-40 rounded-md border border-border p-1 shadow-md outline-none select-none",
			className,
		)}
		{...restProps}
	>
		{@render children?.()}
	</MenubarPrimitive.Content>
</MenubarPrimitive.Portal>
