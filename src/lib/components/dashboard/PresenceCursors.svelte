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
		>
			<svg
				width="24"
				height="36"
				viewBox="0 0 24 36"
				fill="none"
				class="drop-shadow-sm"
				aria-hidden="true"
			>
				<path
					fill={c.color}
					stroke="#fff"
					stroke-width="1.25"
					stroke-linejoin="round"
					d="M5.66 12.37H5.46L5.32 12.5.5 16.88V1.2L11.78 12.37H5.66Z"
				/>
			</svg>
			<div
				class="absolute left-[12px] top-[14px] flex w-max max-w-[min(28rem,75vw)] items-center gap-1 rounded-full py-0.5 pl-0.5 pr-2 shadow-sm"
				style="background:{c.color}"
				title={c.displayName}
			>
				<UserAvatar
					userId={c.userId}
					name={c.displayName}
					class="size-4 shrink-0 rounded-full"
				/>
				<span
					class="whitespace-nowrap text-[11px] font-semibold leading-none text-white"
				>
					{c.displayName}
				</span>
			</div>
		</div>
	{/each}
</div>
