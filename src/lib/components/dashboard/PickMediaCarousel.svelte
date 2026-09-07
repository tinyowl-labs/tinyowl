<script lang="ts">
	import ChevronLeftIcon from "@lucide/svelte/icons/chevron-left";
	import ChevronRightIcon from "@lucide/svelte/icons/chevron-right";
	import ImageIcon from "@lucide/svelte/icons/image";

	type EntityMedia = { url: string; media_type: string };

	let {
		items = [],
		onOpen,
	}: {
		items?: EntityMedia[];
		onOpen?: (item: EntityMedia, index: number) => void;
	} = $props();

	let slide = $state(0);
	let brokenSrc = $state<Record<string, boolean>>({});

	const i = $derived(
		items.length === 0 ? 0 : Math.min(slide, items.length - 1),
	);
	const current = $derived(items[i] ?? null);
	const many = $derived(items.length > 1);

	function wrap(delta: number) {
		if (items.length === 0) return;
		slide = (i + delta + items.length) % items.length;
	}

	function openCurrent() {
		if (!current) return;
		if (
			current.media_type.startsWith("image") ||
			current.media_type.startsWith("video")
		) {
			onOpen?.(current, i);
		} else {
			window.open(current.url, "_blank");
		}
	}
</script>

{#if current}
	<div>
		<div class="relative">
			<button
				type="button"
				class="block w-full overflow-hidden rounded border border-border bg-secondary/40"
				title={current.media_type}
				onclick={openCurrent}
			>
				{#if current.media_type.startsWith("image") && !brokenSrc[current.url]}
					<img
						src={current.url}
						alt=""
						class="h-auto max-h-36 w-full object-contain"
						onerror={() => {
							brokenSrc = { ...brokenSrc, [current.url]: true };
						}}
					/>
				{:else if current.media_type.startsWith("image")}
					<span
						class="flex h-16 w-full items-center justify-center text-muted-foreground"
					>
						<ImageIcon class="size-5" />
					</span>
				{:else}
					<span
						class="flex h-16 w-full items-center justify-center text-[9px] uppercase text-muted-foreground"
						>{current.media_type.split("/")[0] ?? "file"}</span
					>
				{/if}
			</button>
			{#if many}
				<button
					type="button"
					class="absolute left-0.5 top-1/2 -translate-y-1/2 rounded bg-background/80 p-0.5 text-foreground shadow-sm ring-1 ring-border/60 hover:bg-background"
					title="Previous"
					aria-label="Previous media"
					onclick={(e) => {
						e.stopPropagation();
						wrap(-1);
					}}
				>
					<ChevronLeftIcon class="size-3.5" />
				</button>
				<button
					type="button"
					class="absolute right-0.5 top-1/2 -translate-y-1/2 rounded bg-background/80 p-0.5 text-foreground shadow-sm ring-1 ring-border/60 hover:bg-background"
					title="Next"
					aria-label="Next media"
					onclick={(e) => {
						e.stopPropagation();
						wrap(1);
					}}
				>
					<ChevronRightIcon class="size-3.5" />
				</button>
				<div
					class="absolute bottom-1 left-0 right-0 flex justify-center gap-0.5"
				>
					{#each items as item, di (item.url + di)}
						<button
							type="button"
							class="size-1.5 rounded-full ring-1 ring-background/80 {di ===
							i
								? 'bg-foreground'
								: 'bg-foreground/40 hover:bg-foreground/70'}"
							title="Media {di + 1}"
							aria-label="Media {di + 1}"
							aria-current={di === i}
							onclick={(e) => {
								e.stopPropagation();
								slide = di;
							}}
						></button>
					{/each}
				</div>
			{/if}
		</div>
		{#if many}
			<p
				class="mt-1 text-center text-[9px] tabular-nums text-muted-foreground"
			>
				{i + 1} of {items.length}
			</p>
		{/if}
	</div>
{/if}
