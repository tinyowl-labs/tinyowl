<script lang="ts">
	import MessageCircleIcon from "@lucide/svelte/icons/message-circle";
	import PlusIcon from "@lucide/svelte/icons/plus";
	import XIcon from "@lucide/svelte/icons/x";
	import UserAvatar from "$lib/components/ui/user-avatar.svelte";
	import {
		commentReplies,
		commentRoots,
		type CommentDraft,
		type CommentFilter,
		type MapComment,
	} from "$lib/map-comments";

	type Props = {
		comments?: MapComment[];
		filter?: CommentFilter;
		selectedId?: string | null;
		pending?: CommentDraft | null;
		adding?: boolean;
		canWrite?: boolean;
		busy?: boolean;
		error?: string;
		onFilter?: (next: CommentFilter) => void;
		onSelect?: (id: string | null) => void;
		onAdd?: () => void;
		onCancelAdd?: () => void;
		onCancelPending?: () => void;
		onPost?: (body: string) => void;
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
		onFilter,
		onSelect,
		onAdd,
		onCancelAdd,
		onCancelPending,
		onPost,
		onClose,
	}: Props = $props();

	let draft = $state("");

	const roots = $derived(commentRoots(comments, filter));

	const filters: { id: CommentFilter; label: string }[] = [
		{ id: "open", label: "Open" },
		{ id: "resolved", label: "Resolved" },
		{ id: "all", label: "All" },
	];

	function attachLabel(c: CommentDraft): string {
		if (c.layerName && c.featureId) return `${c.layerName} · ${c.featureId}`;
		return "";
	}

	function submitRoot() {
		const body = draft.trim();
		if (!body || !pending) return;
		onPost?.(body);
		draft = "";
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

	const itemCls =
		"flex w-full items-start gap-2 rounded-md px-2 py-1.5 text-left hover:bg-secondary/80";
</script>

<div
	class="flex max-h-[min(32rem,70vh)] w-80 flex-col overflow-hidden rounded-lg border border-border bg-background/95 text-xs shadow-lg backdrop-blur-sm"
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
						submitRoot();
					}
				}}
			></textarea>
			<button
				type="button"
				class="mt-1.5 inline-flex w-full items-center justify-center rounded-md bg-primary/15 px-2 py-1.5 font-medium text-foreground hover:bg-primary/20 disabled:opacity-40"
				disabled={busy || !draft.trim()}
				onclick={submitRoot}
			>
				Post
			</button>
		</div>
	{:else if canWrite}
		<div class="border-b border-border px-2.5 py-2">
			<button
				type="button"
				class="inline-flex w-full items-center justify-center gap-1 rounded-md border border-border px-2 py-1.5 font-medium text-foreground hover:bg-secondary {adding
					? 'bg-secondary'
					: ''}"
				onclick={() => (adding ? onCancelAdd?.() : onAdd?.())}
			>
				{#if adding}
					<XIcon class="size-3.5" />
					Cancel
				{:else}
					<PlusIcon class="size-3.5" />
					Add comment
				{/if}
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
					<li>
						<button
							type="button"
							class="{itemCls} {selectedId === root.id ? 'bg-secondary' : ''}"
							onclick={() => onSelect?.(root.id)}
						>
							<UserAvatar
								userId={root.author.id}
								name={root.author.display_name}
								class="mt-0.5 size-5"
							/>
							<span class="min-w-0 flex-1">
								<span class="flex items-baseline justify-between gap-2">
									<span class="truncate font-medium text-foreground"
										>{root.author.display_name}</span
									>
									<span class="shrink-0 tabular-nums text-[10px] text-muted-foreground"
										>{formatWhen(root.created_at)}</span
									>
								</span>
								<span class="mt-0.5 line-clamp-2 text-[11px] text-muted-foreground"
									>{root.body}</span
								>
								{#if n > 0}
									<span class="mt-0.5 block text-[10px] text-muted-foreground"
										>{n} {n === 1 ? "reply" : "replies"}</span
									>
								{/if}
							</span>
						</button>
					</li>
				{/each}
			</ul>
		{/if}
	</div>
</div>
