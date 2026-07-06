<script lang="ts">
	import ImageIcon from "@lucide/svelte/icons/image";
	import FileIcon from "@lucide/svelte/icons/file";
	import VideoIcon from "@lucide/svelte/icons/video";

	let {
		url,
		type,
		count,
	}: { url: string; type: string; count: number } = $props();

	const Icon = $derived(
		type.startsWith("image")
			? ImageIcon
			: type.startsWith("video")
				? VideoIcon
				: FileIcon,
	);
</script>

<a
	href={url}
	target="_blank"
	class="inline-flex items-center gap-1 text-muted-foreground hover:text-primary no-underline"
	title={type}
>
	<Icon class="size-3.5" />
	{#if count > 1}
		<span class="text-[10px]">+{count - 1}</span>
	{/if}
</a>
