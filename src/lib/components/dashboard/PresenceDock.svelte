<script lang="ts">
	import EyeOffIcon from "@lucide/svelte/icons/eye-off";
	import EyeIcon from "@lucide/svelte/icons/eye";
	import UserAvatar from "$lib/components/ui/user-avatar.svelte";
	import { peerCursorColor, type PresencePeer } from "$lib/map-presence";

	let {
		peers = [],
		hidden = false,
		onToggleHidden,
	}: {
		peers?: PresencePeer[];
		hidden?: boolean;
		onToggleHidden?: () => void;
	} = $props();

	const shown = $derived(peers.slice(0, 5));
	const extra = $derived(Math.max(0, peers.length - shown.length));
</script>

<div class="flex items-center gap-0.5">
	{#if !hidden && shown.length > 0}
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
	<button
		type="button"
		class="flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
		title={hidden
			? "Show my cursor and edits to collaborators"
			: "Hide my cursor and edits from collaborators"}
		aria-label={hidden ? "Show presence" : "Hide presence"}
		aria-pressed={hidden}
		onclick={() => onToggleHidden?.()}
	>
		{#if hidden}
			<EyeOffIcon class="size-4" />
		{:else}
			<EyeIcon class="size-4" />
		{/if}
	</button>
</div>
