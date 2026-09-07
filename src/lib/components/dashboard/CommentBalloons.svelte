<script lang="ts">
	import EllipsisVerticalIcon from "@lucide/svelte/icons/ellipsis-vertical";
	import RotateCcwIcon from "@lucide/svelte/icons/rotate-ccw";
	import CheckIcon from "@lucide/svelte/icons/check";
	import TrashIcon from "@lucide/svelte/icons/trash-2";
	import ArrowRightIcon from "@lucide/svelte/icons/arrow-right";
	import UserAvatar from "$lib/components/ui/user-avatar.svelte";
	import * as DropdownMenu from "$lib/components/ui/dropdown-menu/index.js";
	import {
		commentPlaceLabel,
		commentReplies,
		isPendingCommentId,
		type CommentStatus,
		type MapComment,
	} from "$lib/map-comments";

	let {
		comments = [],
		selectedId = null,
		open = false,
		x = 16,
		y = 16,
		canWrite = false,
		currentUserId = "",
		isAdmin = false,
		busy = false,
		onSelect,
		onReply,
		onResolve,
		onDelete,
	}: {
		comments?: MapComment[];
		selectedId?: string | null;
		open?: boolean;
		x?: number;
		y?: number;
		canWrite?: boolean;
		currentUserId?: string;
		isAdmin?: boolean;
		busy?: boolean;
		onSelect?: (id: string) => void;
		onReply?: (body: string, parentId: string) => void | Promise<boolean>;
		onResolve?: (id: string, status: CommentStatus) => void;
		onDelete?: (id: string) => void;
	} = $props();

	let replyDraft = $state("");

	const selected = $derived.by(() => {
		if (!selectedId) return null;
		const hit = comments.find((c) => c.id === selectedId);
		if (!hit) return null;
		if (!hit.parent_id) return hit;
		return comments.find((c) => c.id === hit.parent_id) ?? hit;
	});
	const replies = $derived(selected ? commentReplies(comments, selected.id) : []);
	const place = $derived(selected ? commentPlaceLabel(selected) : "");

	let lastSelectedId = selectedId;
	$effect(() => {
		if (selectedId === lastSelectedId) return;
		lastSelectedId = selectedId;
		replyDraft = "";
	});

	function canMutate(c: MapComment) {
		return c.created_by === currentUserId || isAdmin;
	}

	function formatWhen(iso: string): string {
		const t = Date.parse(iso);
		if (!Number.isFinite(t)) return "";
		const s = (Date.now() - t) / 1000;
		if (s < 45) return "Just now";
		if (s < 3600) return `${Math.max(1, Math.floor(s / 60))}m`;
		if (s < 86400) return `${Math.floor(s / 3600)}h`;
		return `${Math.floor(s / 86400)}d`;
	}

	async function submitReply() {
		const body = replyDraft.trim();
		if (!body || !selected) return;
		replyDraft = "";
		try {
			const ok = await onReply?.(body, selected.id);
			if (ok === false) replyDraft = body;
		} catch {
			replyDraft = body;
		}
	}
</script>

{#if open && selected}
	<div
		class="absolute z-[1100]"
		style="left: {x}px; top: {y}px;"
		role="dialog"
		aria-label="Comment"
		onpointerdown={(e) => e.stopPropagation()}
	>
		<div
			class="pointer-events-auto absolute bottom-[48px] left-[-8px] w-[min(280px,calc(100vw-2rem))] rounded-lg border border-border bg-background/95 p-2.5 text-xs shadow-lg backdrop-blur-sm {selected.status ===
			'resolved'
				? 'opacity-80'
				: ''}"
			onclick={() => onSelect?.(selected.id)}
		>
			<div class="flex items-start gap-2">
				<UserAvatar
					userId={selected.author.id}
					name={selected.author.display_name}
					class="size-6 shrink-0"
				/>
				<div class="min-w-0 flex-1">
					<div class="flex items-start gap-2">
						<div class="min-w-0 flex-1">
							<div class="truncate font-medium text-foreground">
								{selected.author.display_name}
							</div>
							<div class="text-[10px] text-muted-foreground">
								{formatWhen(selected.created_at)}{#if place}<span> · {place}</span>{/if}
							</div>
						</div>
						{#if canMutate(selected)}
							<DropdownMenu.Root>
								<DropdownMenu.Trigger
									class="shrink-0 rounded p-0.5 text-muted-foreground hover:bg-secondary hover:text-foreground"
									title="More"
									onclick={(e) => e.stopPropagation()}
								>
									<EllipsisVerticalIcon class="size-3.5" />
								</DropdownMenu.Trigger>
								<DropdownMenu.Content align="end" class="z-[1200] min-w-44">
									<DropdownMenu.Item
										class="px-3 py-2.5 text-sm font-medium hover:bg-primary/20 data-highlighted:bg-primary/20"
										onclick={() =>
											onResolve?.(
												selected.id,
												selected.status === "resolved" ? "open" : "resolved",
											)}
									>
										{#if selected.status === "resolved"}
											<RotateCcwIcon class="size-4" />
											Reopen
										{:else}
											<CheckIcon class="size-4" />
											Resolve
										{/if}
									</DropdownMenu.Item>
									<DropdownMenu.Separator />
									<DropdownMenu.Item
										class="text-destructive hover:bg-destructive/10 data-highlighted:bg-destructive/10 data-highlighted:text-destructive"
										onclick={() => onDelete?.(selected.id)}
									>
										<TrashIcon class="size-3.5" />
										Delete
									</DropdownMenu.Item>
								</DropdownMenu.Content>
							</DropdownMenu.Root>
						{/if}
					</div>
					<p class="mt-1 whitespace-pre-wrap break-words text-[12px] leading-snug text-foreground">
						{selected.body}
					</p>
				</div>
			</div>

			{#if replies.length > 0}
				<div class="mt-2 max-h-40 space-y-2 overflow-y-auto border-t border-border pt-2">
					{#each replies as reply (reply.id)}
						<div
							class="flex items-start gap-2 {isPendingCommentId(reply.id) ? 'opacity-70' : ''}"
						>
							<UserAvatar
								userId={reply.author.id}
								name={reply.author.display_name}
								class="size-6 shrink-0"
							/>
							<div class="min-w-0 flex-1">
								<div class="flex items-baseline gap-2">
									<span class="min-w-0 truncate font-medium text-foreground"
										>{reply.author.display_name}</span
									>
									<span class="shrink-0 tabular-nums text-[10px] text-muted-foreground"
										>{formatWhen(reply.created_at)}</span
									>
								</div>
								<p class="whitespace-pre-wrap break-words text-[12px] leading-snug text-foreground">
									{reply.body}
								</p>
							</div>
						</div>
					{/each}
				</div>
			{/if}

			{#if canWrite && selected.status === "open"}
				<div
					class="mt-2 flex items-center gap-2 border-t border-border pt-2"
					onpointerdown={(e) => e.stopPropagation()}
					onclick={(e) => e.stopPropagation()}
				>
					<UserAvatar userId={currentUserId} name="" class="size-6 shrink-0" />
					<input
						class="min-w-0 flex-1 bg-transparent text-[12px] text-foreground outline-none placeholder:text-muted-foreground"
						placeholder="Reply…"
						bind:value={replyDraft}
						maxlength={8000}
						onkeydown={(ev) => {
							if (ev.key === "Enter" && !ev.shiftKey) {
								ev.preventDefault();
								ev.stopPropagation();
								void submitReply();
							}
						}}
					/>
					<button
						type="button"
						class="flex size-6 shrink-0 items-center justify-center rounded-md bg-primary/15 text-foreground hover:bg-primary/20 disabled:opacity-40"
						disabled={busy || !replyDraft.trim()}
						title="Send"
						onclick={(e) => {
							e.preventDefault();
							e.stopPropagation();
							void submitReply();
						}}
					>
						<ArrowRightIcon class="size-3.5" />
					</button>
				</div>
			{/if}
		</div>
	</div>
{/if}
