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

	/**
	 * On-map layout from docs/.scratch/collaboration/presence-cursor.svg
	 * (Inkscape group matrices). Artboard is 5× CSS pixels.
	 */
	const S = 0.2;
	const tipX = 1.0138296 * 45 - 1.1586075;
	const tipY = 1.00663 * 42 - 4.0000742;
	const avCx = 1.1116976 * 155 - 60.608581;
	const avCy = 1.1102257 * 200 - 23.311381;
	const avR = 60 * ((1.1116976 + 1.1102257) / 2);
	const avLeft = (avCx - avR - tipX) * S;
	const avTop = (avCy - avR - tipY) * S;
	const avSize = avR * 2 * S;

	function nodeKey(c: PresenceRosterCursor): string {
		return c.kind === "field" ? `field:${c.userId}` : c.userId;
	}

	function register(c: PresenceRosterCursor) {
		return (node: HTMLElement) => {
			const id = nodeKey(c);
			nodes.set(id, node);
			return () => {
				if (nodes.get(id) === node) nodes.delete(id);
			};
		};
	}
</script>

<div class="pointer-events-none absolute inset-0 z-[15] overflow-hidden">
	{#each roster as c (`${c.kind}:${c.userId}`)}
		<div
			{@attach register(c)}
			class="absolute left-0 top-0 will-change-transform"
			style="visibility:hidden;transform:translate3d(-9999px,-9999px,0)"
			title={c.kind === "field" ? `${c.displayName} (in the field)` : c.displayName}
		>
			{#if c.kind === "field"}
				<div
					class="overflow-hidden rounded-full"
					style="width:14px;height:14px;margin-left:-7px;margin-top:-7px;background:{c.color};box-shadow:0 0 0 2px #fff"
				>
					<UserAvatar
						userId={c.userId}
						name={c.displayName}
						class="size-full rounded-full"
					/>
				</div>
			{:else}
				<svg
					class="relative z-0 overflow-visible drop-shadow-md"
					width="1"
					height="1"
					viewBox="0 0 1 1"
					aria-hidden="true"
				>
					<g transform="scale({S}) translate({-tipX} {-tipY})">
						<g transform="matrix(1.0138296,0,0,1.00663,-1.1586075,-4.0000742)">
							<path
								fill={c.color}
								stroke="#fff"
								stroke-width="2.2"
								stroke-linejoin="round"
								vector-effect="non-scaling-stroke"
								d="M96.6 153.7H94.6L93.2 155 45 198.8V42L157.8 153.7H96.6Z"
							/>
						</g>
					</g>
				</svg>
				<div
					class="absolute z-10 rounded-full"
					style="left:{avLeft}px;top:{avTop}px;width:{avSize}px;height:{avSize}px;box-shadow:0 0 0 2.2px #fff"
				>
					<div class="size-full overflow-hidden rounded-full">
						<UserAvatar
							userId={c.userId}
							name={c.displayName}
							class="size-full rounded-full"
						/>
					</div>
				</div>
			{/if}
		</div>
	{/each}
</div>
