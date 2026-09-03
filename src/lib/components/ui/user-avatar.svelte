<script lang="ts">
	import { avatarPreview } from "$lib/stores/avatar-preview.svelte";

	let {
		userId,
		name = "",
		class: className = "size-8",
		href,
		bust = "",
	}: {
		userId: string;
		name?: string;
		class?: string;
		href?: string;
		bust?: string;
	} = $props();

	const src = $derived(
		avatarPreview.src(userId) ??
			`/users/${encodeURIComponent(userId)}/avatar${bust ? `?v=${encodeURIComponent(bust)}` : ""}`,
	);
	const imgClass = $derived(
		`${className} shrink-0 rounded-full object-cover bg-secondary`.trim(),
	);
</script>

{#if href}
	<a {href} class="inline-flex shrink-0 no-underline" title={name || undefined}>
		<img src={src} alt={name} class={imgClass} />
	</a>
{:else}
	<img src={src} alt={name} title={name || undefined} class={imgClass} />
{/if}
