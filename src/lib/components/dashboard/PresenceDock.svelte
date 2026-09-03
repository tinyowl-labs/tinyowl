<script lang="ts">
	import EyeOffIcon from "@lucide/svelte/icons/eye-off";
	import EyeIcon from "@lucide/svelte/icons/eye";
	import UserAvatar from "$lib/components/ui/user-avatar.svelte";
	import type { PresencePeer } from "$lib/map-presence";

	let {
		peers = [],
		hidden = false,
		onToggleHidden,
	}: {
		peers?: PresencePeer[];
		hidden?: boolean;
		onToggleHidden?: () => void;
	} = $props();
</script>

<div
	class="pointer-events-auto flex items-center gap-1 rounded bg-background/90 py-0.5 pl-1 pr-0.5 shadow-sm ring-1 ring-border/60 backdrop-blur-sm"
>
	{#if hidden}
		<span class="px-1 text-[11px] text-muted-foreground">Hidden</span>
	{:else if peers.length === 0}
		<span class="px-1 text-[11px] text-muted-foreground">Just you</span>
	{:else}
		<div class="flex -space-x-1.5 pl-0.5">
			{#each peers.slice(0, 6) as peer (peer.userId)}
				<UserAvatar
					userId={peer.userId}
					name={peer.displayName}
					class="size-5 ring-2 ring-background"
				/>
			{/each}
		</div>
		{#if peers.length > 6}
			<span class="pr-1 text-[11px] tabular-nums text-muted-foreground"
				>+{peers.length - 6}</span
			>
		{/if}
	{/if}
	<button
		type="button"
		class="flex size-6 items-center justify-center rounded-md text-muted-foreground hover:bg-secondary hover:text-foreground"
		title={hidden
			? "Show my cursor to collaborators"
			: "Hide me from collaborators"}
		aria-label={hidden ? "Show presence" : "Hide presence"}
		aria-pressed={hidden}
		onclick={() => onToggleHidden?.()}
	>
		{#if hidden}
			<EyeOffIcon class="size-3.5" />
		{:else}
			<EyeIcon class="size-3.5" />
		{/if}
	</button>
</div>
