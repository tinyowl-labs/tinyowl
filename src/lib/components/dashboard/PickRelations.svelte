<script lang="ts">
	import ChevronDownIcon from "@lucide/svelte/icons/chevron-down";
	import ListIcon from "@lucide/svelte/icons/list";
	import WaypointsIcon from "@lucide/svelte/icons/waypoints";
	import {
		hopsByDir,
		type EntityHop,
	} from "$lib/project/schemaFields";

	const STAR_CAP = 10;
	const CX = 116;
	const CY = 78;
	const R = 54;

	let {
		hops = [],
		centerLabel = "",
		onSelect,
	}: {
		hops?: EntityHop[];
		centerLabel?: string;
		onSelect?: (table: string, id: string) => void;
	} = $props();

	let open = $state(true);
	let userMode = $state<"" | "list" | "star">("");

	const grouped = $derived(hopsByDir(hops));
	const mode = $derived(
		userMode || (hops.length > STAR_CAP ? "list" : "star"),
	);
	const starHops = $derived(hops.slice(0, STAR_CAP));
	const starMore = $derived(Math.max(0, hops.length - starHops.length));

	const starNodes = $derived.by(() => {
		const n = starHops.length;
		if (n === 0) return [];
		return starHops.map((h, i) => {
			const a = -Math.PI / 2 + (2 * Math.PI * i) / n;
			return {
				...h,
				x: CX + R * Math.cos(a),
				y: CY + R * Math.sin(a),
			};
		});
	});

	function prettyTable(name: string): string {
		return name.replace(/_/g, " ");
	}

	function viaLabel(hop: EntityHop): string {
		if (hop.kind === "junction") return prettyTable(hop.via);
		return hop.via.replace(/_/g, " ");
	}
</script>

{#if hops.length > 0}
	<div class="border-t border-border">
		<div class="flex items-center gap-0.5 px-1.5 py-1">
			<button
				type="button"
				class="flex min-w-0 flex-1 items-center gap-1 rounded px-1 py-0.5 text-left text-[10px] font-medium uppercase tracking-wide text-muted-foreground hover:bg-secondary hover:text-foreground"
				aria-expanded={open}
				onclick={() => (open = !open)}
			>
				<ChevronDownIcon
					class="size-3 shrink-0 transition-transform {open
						? ''
						: '-rotate-90'}"
				/>
				<span class="truncate">Relationships</span>
				<span class="ml-auto tabular-nums opacity-60">{hops.length}</span>
			</button>
			{#if open}
				<button
					type="button"
					class="rounded p-0.5 {mode === 'list'
						? 'bg-secondary text-foreground'
						: 'text-muted-foreground hover:text-foreground'}"
					title="List"
					aria-pressed={mode === "list"}
					onclick={() => (userMode = "list")}
				>
					<ListIcon class="size-3" />
				</button>
				<button
					type="button"
					class="rounded p-0.5 {mode === 'star'
						? 'bg-secondary text-foreground'
						: 'text-muted-foreground hover:text-foreground'}"
					title="Graph"
					aria-pressed={mode === "star"}
					onclick={() => (userMode = "star")}
				>
					<WaypointsIcon class="size-3" />
				</button>
			{/if}
		</div>

		{#if open}
			{#if mode === "star"}
				<svg
					class="mx-auto block h-[10.5rem] w-full max-w-[15rem] text-foreground"
					viewBox="0 0 232 156"
					aria-label="One-hop relationships"
				>
					{#each starNodes as node (node.key)}
						<line
							x1={CX}
							y1={CY}
							x2={node.x}
							y2={node.y}
							class={node.dir === "out"
								? "stroke-primary/50"
								: "stroke-muted-foreground/40"}
							stroke-width="1"
							stroke-dasharray={node.kind === "junction"
								? "3 2"
								: undefined}
						/>
					{/each}
					<circle
						cx={CX}
						cy={CY}
						r="16"
						class="fill-primary/15 stroke-primary"
						stroke-width="1.25"
					/>
					<text
						x={CX}
						y={CY + 1}
						text-anchor="middle"
						dominant-baseline="middle"
						class="fill-foreground"
						font-size="8"
					>
						{centerLabel.length > 12
							? `${centerLabel.slice(0, 11)}…`
							: centerLabel}
					</text>
					{#each starNodes as node (node.key)}
						<g
							role="button"
							tabindex="0"
							transform="translate({node.x} {node.y})"
							style="cursor: pointer"
							onclick={() => onSelect?.(node.table, node.id)}
							onkeydown={(e) => {
								if (e.key === "Enter" || e.key === " ") {
									e.preventDefault();
									onSelect?.(node.table, node.id);
								}
							}}
						>
							<title>{node.label} · {prettyTable(node.table)}</title>
							<circle
								r="13"
								class={node.dir === "out"
									? "fill-background stroke-primary"
									: "fill-background stroke-muted-foreground"}
								stroke-width="1.25"
							/>
							<text
								y="1"
								text-anchor="middle"
								dominant-baseline="middle"
								class="fill-foreground"
								font-size="7"
							>
								{node.label.length > 8
									? `${node.label.slice(0, 7)}…`
									: node.label}
							</text>
						</g>
					{/each}
				</svg>
				{#if starMore > 0}
					<button
						type="button"
						class="px-2.5 pb-1.5 text-center text-[9px] text-muted-foreground hover:text-foreground"
						onclick={() => (userMode = "list")}
					>
						+{starMore} more in list
					</button>
				{/if}
			{:else}
				<div class="max-h-40 space-y-1.5 overflow-y-auto px-2.5 pb-2">
					{#if grouped.out.length > 0}
						<p
							class="text-[10px] font-medium uppercase tracking-wide text-muted-foreground"
						>
							Looks up
						</p>
						{#each grouped.out as hop (hop.key)}
							<button
								type="button"
								class="flex w-full min-w-0 items-baseline gap-1 rounded px-0.5 py-0.5 text-left hover:bg-secondary"
								onclick={() => onSelect?.(hop.table, hop.id)}
							>
								<span
									class="min-w-0 truncate text-[11px] text-primary underline-offset-2 hover:underline"
									>{hop.label}</span
								>
								<span
									class="shrink-0 text-[9px] text-muted-foreground"
									>{viaLabel(hop)}</span
								>
							</button>
						{/each}
					{/if}
					{#if grouped.in.length > 0}
						<p
							class="pt-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground"
						>
							Referenced by
						</p>
						{#each grouped.in as hop (hop.key)}
							<button
								type="button"
								class="flex w-full min-w-0 items-baseline gap-1 rounded px-0.5 py-0.5 text-left hover:bg-secondary"
								onclick={() => onSelect?.(hop.table, hop.id)}
							>
								<span
									class="min-w-0 truncate text-[11px] text-primary underline-offset-2 hover:underline"
									>{hop.label}</span
								>
								<span
									class="shrink-0 text-[9px] text-muted-foreground"
									>{prettyTable(hop.table)}</span
								>
							</button>
						{/each}
					{/if}
				</div>
			{/if}
		{/if}
	</div>
{/if}
