<script lang="ts">
	import UserAvatar from "$lib/components/ui/user-avatar.svelte";
	import type { PresenceRosterCursor } from "./layerScenePresence";

	let {
		roster = [],
		nodes,
	}: {
		roster?: PresenceRosterCursor[];
		nodes: Map<string, HTMLElement>;
	} = $props();

	function register(node: HTMLElement, id: string) {
		nodes.set(id, node);
		return {
			update(next: string) {
				if (nodes.get(id) === node) nodes.delete(id);
				id = next;
				nodes.set(id, node);
			},
			destroy() {
				if (nodes.get(id) === node) nodes.delete(id);
			},
		};
	}
</script>

<div class="pointer-events-none absolute inset-0 z-[15] overflow-hidden">
	{#each roster as c (c.userId)}
		<div
			use:register={c.userId}
			class="absolute left-0 top-0 will-change-transform"
			style="visibility:hidden;transform:translate3d(-9999px,-9999px,0)"
			title={c.displayName}
		>
			<div
				class="absolute left-[11px] top-[22px] size-6 overflow-hidden rounded-full shadow-sm ring-[1.5px] ring-white"
			>
				<UserAvatar
					userId={c.userId}
					name={c.displayName}
					class="size-6 rounded-full"
				/>
			</div>
			<svg
				width="25"
				height="35"
				viewBox="0 0 12.5 17.5"
				class="relative z-10 drop-shadow-md"
				aria-hidden="true"
			>
				<path
					fill={c.color}
					stroke="#fff"
					stroke-width="1.1"
					stroke-linejoin="round"
					d="M5.66 12.37H5.46L5.32 12.5.5 16.88V1.2L11.78 12.37H5.66Z"
				/>
			</svg>
		</div>
	{/each}
</div>
