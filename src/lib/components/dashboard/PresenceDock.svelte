<script lang="ts">
	import UserAvatar from "$lib/components/ui/user-avatar.svelte";
	import { peerCursorColor, type PresencePeer } from "$lib/map-presence";
	import { MAX_GLOBE_EDITORS, globeEditorsCapped } from "$lib/map-presence-send";

	let {
		peers = [],
	}: {
		peers?: PresencePeer[];
	} = $props();

	const shown = $derived(peers.slice(0, 5));
	const extra = $derived(Math.max(0, peers.length - shown.length));
	const capped = $derived(globeEditorsCapped(peers.length + 1));

	function ringStyle(peer: PresencePeer): string {
		if (peer.overlayStale) return "";
		if (peer.editing) return `box-shadow: 0 0 0 2px ${peerCursorColor(peer.userId)}`;
		return "";
	}
</script>

{#if shown.length > 0}
	<div class="flex h-7 items-center">
		<div class="flex items-center -space-x-1.5">
			{#each shown as peer, i (peer.userId)}
				<span
					class="relative inline-flex size-7 items-center justify-center"
					style="z-index: {shown.length - i}"
					title={peer.overlayStale
						? `${peer.displayName} (edits on an older develop tip)`
						: peer.editing
							? `${peer.displayName} (editing ${peer.editing.table}/${peer.editing.entityId})`
							: peer.displayName}
				>
					<span
						class="inline-flex rounded-full {peer.overlayStale
							? 'ring-2 ring-amber-400'
							: peer.editing
								? ''
								: 'ring-2 ring-background'}"
						style={ringStyle(peer)}
					>
						<UserAvatar
							userId={peer.userId}
							name={peer.displayName}
							class="size-5"
						/>
					</span>
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
		{#if capped}
			<span
				class="ml-1 text-[11px] tabular-nums text-muted-foreground"
				title="Live globe cursors are limited to {MAX_GLOBE_EDITORS} people"
			>
				{MAX_GLOBE_EDITORS} live
			</span>
		{/if}
	</div>
{/if}
