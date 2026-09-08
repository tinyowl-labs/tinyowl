<script lang="ts">
	import MessageCircleIcon from "@lucide/svelte/icons/message-circle";
	import PlusIcon from "@lucide/svelte/icons/plus";
	import XIcon from "@lucide/svelte/icons/x";
	import CircleIcon from "@lucide/svelte/icons/circle";
	import MinusIcon from "@lucide/svelte/icons/minus";
	import HexagonIcon from "@lucide/svelte/icons/hexagon";
	import CheckIcon from "@lucide/svelte/icons/check";
	import {
		commentPlaceLabel,
		commentReplies,
		commentRoots,
		type CommentDraft,
		type CommentFilter,
		type MapComment,
	} from "$lib/map-comments";
	import type { DrawGeomMode } from "$lib/stores/editBuffer.svelte";
	import UserAvatar from "$lib/components/ui/user-avatar.svelte";

	type Props = {
		comments?: MapComment[];
		filter?: CommentFilter;
		selectedId?: string | null;
		pending?: CommentDraft | null;
		adding?: boolean;
		canWrite?: boolean;
		busy?: boolean;
		error?: string;
		drawMode?: DrawGeomMode;
		sketchCount?: number;
		canFinish?: boolean;
		onFilter?: (next: CommentFilter) => void;
		onSelect?: (id: string | null) => void;
		onHover?: (id: string | null) => void;
		onAdd?: () => void;
		onCancelAdd?: () => void;
		onCancelPending?: () => void;
		onPost?: (body: string) => void | Promise<boolean>;
		onDrawMode?: (mode: DrawGeomMode) => void;
		onFinish?: () => void;
		onClose?: () => void;
	};

	let {
		comments = [],
		filter = "open",
		selectedId = null,
		pending = null,
		adding = false,
		canWrite = false,
		busy = false,
		error = "",
		drawMode = "Point",
		sketchCount = 0,
		canFinish = false,
		onFilter,
		onSelect,
		onHover,
		onAdd,
		onCancelAdd,
		onCancelPending,
		onPost,
		onDrawMode,
		onFinish,
		onClose,
	}: Props = $props();

	let draft = $state("");

	const roots = $derived(commentRoots(comments, filter));

	const filters: { id: CommentFilter; label: string }[] = [
		{ id: "open", label: "Open" },
		{ id: "resolved", label: "Resolved" },
		{ id: "all", label: "All" },
	];

	const drawTools: { id: DrawGeomMode; label: string; icon: typeof CircleIcon }[] = [
		{ id: "Point", label: "Point", icon: CircleIcon },
		{ id: "LineString", label: "Line", icon: MinusIcon },
		{ id: "Polygon", label: "Area", icon: HexagonIcon },
	];

	function attachLabel(c: CommentDraft): string {
		if (c.layerName && c.featureId) return `${c.layerName} · ${c.featureId}`;
		return "";
	}

	async function submitRoot() {
		const body = draft.trim();
		if (!body || !pending) return;
		draft = "";
		const ok = await onPost?.(body);
		if (ok === false) draft = body;
	}

	function formatWhen(iso: string): string {
		const t = Date.parse(iso);
		if (!Number.isFinite(t)) return "";
		const s = (Date.now() - t) / 1000;
		if (s < 45) return "just now";
		if (s < 3600) return `${Math.max(1, Math.floor(s / 60))}m`;
		if (s < 86400) return `${Math.floor(s / 3600)}h`;
		if (s < 86400 * 7) return `${Math.floor(s / 86400)}d`;
		return new Date(t).toLocaleDateString();
	}

	const placeHint = $derived(
		drawMode === "Point"
			? "Click the map to place a comment."
			: drawMode === "LineString"
				? "Click to draw a line. Finish when done."
				: "Click to draw an area. Finish when done.",
	);
</script>

<div
	class="surface flex max-h-[min(32rem,70vh)] w-80 flex-col overflow-hidden rounded-lg border border-border text-xs shadow-lg"
>
	<div class="flex items-center gap-1 border-b border-border px-2 py-1.5">
		<MessageCircleIcon class="size-3.5 text-muted-foreground" />
		<span class="flex-1 font-medium text-foreground">Comments</span>
		<span class="tabular-nums text-[10px] text-muted-foreground">{roots.length}</span>
		<button
			type="button"
			class="rounded p-0.5 text-muted-foreground hover:bg-secondary hover:text-foreground"
			title="Close comments"
			onclick={() => onClose?.()}
		>
			<XIcon class="size-3.5" />
		</button>
	</div>

	<div class="flex items-center overflow-hidden border-b border-border">
		{#each filters as f, i}
			<button
				type="button"
				class="flex-1 px-1.5 py-1.5 transition-colors {i > 0
					? 'border-l border-border'
					: ''} {filter === f.id
					? 'bg-secondary font-medium text-foreground'
					: 'text-muted-foreground hover:text-foreground'}"
				onclick={() => onFilter?.(f.id)}
			>
				{f.label}
			</button>
		{/each}
	</div>

	{#if error}
		<p class="px-2.5 py-1.5 text-[11px] text-destructive">{error}</p>
	{/if}

	{#if pending && canWrite}
		<div class="border-b border-border bg-secondary/40 px-2.5 py-2">
			<div class="mb-1 flex items-center justify-between gap-2">
				<span class="font-medium text-foreground">New comment</span>
				<button
					type="button"
					class="rounded p-0.5 text-muted-foreground hover:bg-background hover:text-foreground"
					title="Cancel"
					onclick={() => onCancelPending?.()}
				>
					<XIcon class="size-3" />
				</button>
			</div>
			{#if attachLabel(pending)}
				<p class="mb-1 truncate text-[11px] text-muted-foreground">
					{attachLabel(pending)}
				</p>
			{/if}
			<textarea
				class="min-h-[4.5rem] w-full resize-none rounded-md border border-border bg-background px-2 py-1.5 text-xs text-foreground outline-none focus:ring-1 focus:ring-ring"
				placeholder="Write a comment…"
				bind:value={draft}
				maxlength={8000}
				onkeydown={(ev) => {
					if (ev.key === "Enter" && (ev.metaKey || ev.ctrlKey)) {
						ev.preventDefault();
						void submitRoot();
					}
				}}
			></textarea>
			<button
				type="button"
				class="mt-1.5 inline-flex w-full items-center justify-center rounded-md bg-primary/15 px-2 py-1.5 font-medium text-foreground hover:bg-primary/20 disabled:opacity-40"
				disabled={busy || !draft.trim()}
				onclick={() => void submitRoot()}
			>
				Post
			</button>
		</div>
	{:else if canWrite && adding}
		<div class="border-b border-border px-2.5 py-2">
			<div class="mb-1.5 flex items-start justify-between gap-2">
				<p class="text-[11px] leading-snug text-muted-foreground">{placeHint}</p>
				<button
					type="button"
					class="shrink-0 rounded p-0.5 text-muted-foreground hover:bg-secondary hover:text-foreground"
					title="Cancel"
					onclick={() => onCancelAdd?.()}
				>
					<XIcon class="size-3.5" />
				</button>
			</div>
			<div class="flex items-center gap-1">
				{#each drawTools as tool}
					{@const Icon = tool.icon}
					<button
						type="button"
						class="inline-flex items-center gap-1 rounded-md border px-1.5 py-1 {drawMode ===
						tool.id
							? 'border-border bg-secondary font-medium text-foreground'
							: 'border-transparent text-muted-foreground hover:bg-secondary hover:text-foreground'}"
						onclick={() => onDrawMode?.(tool.id)}
					>
						<Icon class="size-3" />
						{tool.label}
					</button>
				{/each}
				{#if canFinish}
					<button
						type="button"
						class="ml-auto inline-flex items-center gap-1 rounded-md bg-primary/15 px-1.5 py-1 font-medium text-foreground hover:bg-primary/20"
						onclick={() => onFinish?.()}
					>
						<CheckIcon class="size-3" />
						Finish
					</button>
				{:else if sketchCount > 0}
					<span class="ml-auto tabular-nums text-[10px] text-muted-foreground"
						>{sketchCount}</span
					>
				{/if}
			</div>
		</div>
	{:else if canWrite}
		<div class="border-b border-border px-2.5 py-2">
			<button
				type="button"
				class="inline-flex w-full items-center justify-center gap-1 rounded-md border border-border px-2 py-1.5 font-medium text-foreground hover:bg-secondary"
				onclick={() => onAdd?.()}
			>
				<PlusIcon class="size-3.5" />
				Add comment
			</button>
		</div>
	{/if}

	<div class="min-h-0 flex-1 overflow-y-auto">
		{#if roots.length === 0}
			<p class="px-2.5 py-6 text-center text-[11px] text-muted-foreground">
				{filter === "open" ? "No open comments." : "Nothing here yet."}
			</p>
		{:else}
			<ul class="p-1">
				{#each roots as root (root.id)}
					{@const n = commentReplies(comments, root.id).length}
					{@const place = commentPlaceLabel(root)}
					<li>
						<button
							type="button"
							class="flex w-full items-start gap-2 rounded-md px-2 py-1.5 text-left hover:bg-secondary/80 {selectedId ===
							root.id
								? 'bg-secondary'
								: ''}"
							onclick={() => onSelect?.(root.id)}
							onmouseenter={() => onHover?.(root.id)}
							onmouseleave={() => onHover?.(null)}
							onfocus={() => onHover?.(root.id)}
							onblur={() => onHover?.(null)}
						>
							<UserAvatar
								userId={root.author.id}
								name={root.author.display_name}
								class="mt-0.5 size-5 shrink-0"
							/>
							<span class="min-w-0 flex-1">
								<span class="line-clamp-2 text-[11px] text-foreground">{root.body}</span>
								<span class="mt-0.5 block truncate text-[10px] text-muted-foreground"
									>{root.author.display_name} · {formatWhen(root.created_at)} · {place}{#if filter ===
										"all"}
										· {root.status === "resolved" ? "Resolved" : "Open"}{/if}{#if n > 0}
										· {n} {n === 1 ? "reply" : "replies"}{/if}</span
								>
							</span>
						</button>
					</li>
				{/each}
			</ul>
		{/if}
	</div>
</div>
