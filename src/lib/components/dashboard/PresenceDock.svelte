<script lang="ts">
	import UserAvatar from "$lib/components/ui/user-avatar.svelte";
	import { peerCursorColor, type PresencePeer } from "$lib/map-presence";

	let {
		peers = [],
	}: {
		peers?: PresencePeer[];
	} = $props();

	const shown = $derived(peers.slice(0, 5));
	const extra = $derived(Math.max(0, peers.length - shown.length));
</script>

{#if shown.length > 0}
	<div class="flex items-center pl-1">
		<div class="flex -space-x-2">
			{#each shown as peer, i (peer.userId)}
				<span
					class="relative rounded-full"
					style="z-index: {shown.length - i}; {peer.editing &&
					!peer.overlayStale
						? `box-shadow: 0 0 0 2px ${peerCursorColor(peer.userId)}`
						: ""}"
					title={peer.overlayStale
						? `${peer.displayName} (edits on an older develop tip)`
						: peer.editing
							? `${peer.displayName} (editing ${peer.editing.table}/${peer.editing.entityId})`
							: peer.displayName}
				>
					<UserAvatar
						userId={peer.userId}
						name={peer.displayName}
						class="size-6 ring-2 {peer.overlayStale
							? 'ring-amber-400'
							: 'ring-background'}"
					/>
				</span>
			{/each}
		</div>
		{#if extra > 0}
			<span
				class="ml-1 text-[11px] tabular-nums text-muted-foreground"
				title="{extra} more"
			>
				+{extra}
			</span>
		{/if}
	</div>
{/if}
