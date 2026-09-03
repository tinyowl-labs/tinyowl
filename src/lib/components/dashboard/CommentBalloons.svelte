<script lang="ts">
	import EllipsisVerticalIcon from "@lucide/svelte/icons/ellipsis-vertical";
	import ReplyIcon from "@lucide/svelte/icons/reply";
	import RotateCcwIcon from "@lucide/svelte/icons/rotate-ccw";
	import CheckIcon from "@lucide/svelte/icons/check";
	import TrashIcon from "@lucide/svelte/icons/trash-2";
	import UserAvatar from "$lib/components/ui/user-avatar.svelte";
	import * as DropdownMenu from "$lib/components/ui/dropdown-menu/index.js";
	import {
		commentReplies,
		type CommentStatus,
		type MapComment,
	} from "$lib/map-comments";
	import { COMMENT_OPEN, COMMENT_RESOLVED } from "./layerSceneComments";

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
		onReply?: (body: string, parentId: string) => void;
		onResolve?: (id: string, status: CommentStatus) => void;
		onDelete?: (id: string) => void;
	} = $props();

	let replyDraft = $state("");
	let replyOpen = $state(false);

	const selected = $derived.by(() => {
		if (!selectedId) return null;
		const hit = comments.find((c) => c.id === selectedId);
		if (!hit) return null;
		if (!hit.parent_id) return hit;
		return comments.find((c) => c.id === hit.parent_id) ?? hit;
	});
	const replies = $derived(selected ? commentReplies(comments, selected.id) : []);

	$effect(() => {
		selectedId;
		replyDraft = "";
		replyOpen = false;
	});

	function canMutate(c: MapComment) {
		return c.created_by === currentUserId || isAdmin;
	}

	function formatWhen(iso: string): string {
		const t = Date.parse(iso);
		if (!Number.isFinite(t)) return "";
		const s = (Date.now() - t) / 1000;
		if (s < 45) return "just now";
		if (s < 3600) return `${Math.max(1, Math.floor(s / 60))}m`;
		if (s < 86400) return `${Math.floor(s / 3600)}h`;
		return `${Math.floor(s / 86400)}d`;
	}

	function submitReply() {
		const body = replyDraft.trim();
		if (!body || !selected) return;
		onReply?.(body, selected.id);
		replyDraft = "";
		replyOpen = false;
	}
</script>

{#if open && selected}
	{@const accent = selected.status === "resolved" ? COMMENT_RESOLVED : COMMENT_OPEN}
	<div
		class="absolute z-[1100]"
		style="left: {x}px; top: {y}px;"
		role="dialog"
		aria-label="Comment"
		onpointerdown={(e) => e.stopPropagation()}
	>
		<svg
			class="pointer-events-none absolute left-0 top-0 overflow-visible"
			width="1"
			height="1"
			aria-hidden="true"
		>
			<line
				x1="0"
				y1="0"
				x2="12"
				y2="-16"
				stroke={accent}
				stroke-width="1.75"
				stroke-linecap="round"
			/>
		</svg>
		<div
			class="pointer-events-none absolute left-0 top-0 size-2 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-background"
			style="background:{accent}"
		></div>
		<div
			class="pointer-events-auto absolute bottom-4 left-3 w-[min(16.5rem,calc(100vw-2rem))] overflow-visible rounded-md border border-border bg-background/95 text-left shadow-md ring-1 ring-foreground/20 backdrop-blur-sm {selected.status ===
			'resolved'
				? 'opacity-80'
				: ''}"
			onclick={() => onSelect?.(selected.id)}
		>
			<div class="flex overflow-hidden rounded-md">
				<div class="w-1 shrink-0" style="background:{accent}"></div>
				<div class="min-w-0 flex-1 px-2 py-1.5">
				<div class="flex items-center gap-1">
					<UserAvatar
						userId={selected.author.id}
						name={selected.author.display_name}
						class="size-4 shrink-0"
					/>
					<span class="min-w-0 flex-1 truncate text-[11px] font-semibold text-foreground"
						>{selected.author.display_name}</span
					>
					<span class="shrink-0 tabular-nums text-[10px] text-muted-foreground"
						>{formatWhen(selected.created_at)}</span
					>
					{#if canWrite && selected.status === "open"}
						{#if replyOpen}
							<button
								type="button"
								class="shrink-0 rounded px-1.5 py-0.5 text-[11px] font-medium text-foreground hover:bg-secondary disabled:opacity-40"
								disabled={busy || !replyDraft.trim()}
								onclick={(e) => {
									e.stopPropagation();
									submitReply();
								}}
							>
								Send
							</button>
						{/if}
						<button
							type="button"
							class="shrink-0 rounded p-0.5 text-muted-foreground hover:bg-secondary hover:text-foreground {replyOpen
								? 'bg-secondary text-foreground'
								: ''}"
							title="Reply"
							onclick={(e) => {
								e.stopPropagation();
								replyOpen = !replyOpen;
							}}
						>
							<ReplyIcon class="size-3.5" />
						</button>
					{/if}
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
				<p class="mt-0.5 whitespace-pre-wrap break-words text-[12px] leading-snug text-foreground">
					{selected.body}
				</p>

				{#if replies.length > 0}
					<div class="mt-1.5 max-h-28 space-y-1.5 overflow-y-auto border-t border-border pt-1.5">
						{#each replies as reply (reply.id)}
							<div class="flex items-start gap-1.5">
								<UserAvatar
									userId={reply.author.id}
									name={reply.author.display_name}
									class="mt-0.5 size-3.5"
								/>
								<div class="min-w-0 flex-1">
									<div class="flex items-baseline justify-between gap-2">
										<span class="truncate text-[10px] font-medium text-foreground"
											>{reply.author.display_name}</span
										>
										<span class="shrink-0 tabular-nums text-[10px] text-muted-foreground"
											>{formatWhen(reply.created_at)}</span
										>
									</div>
									<p class="whitespace-pre-wrap break-words text-[11px] leading-snug text-foreground">
										{reply.body}
									</p>
								</div>
							</div>
						{/each}
					</div>
				{/if}

				{#if replyOpen && canWrite && selected.status === "open"}
					<textarea
						class="mt-1.5 min-h-[2.75rem] w-full resize-none rounded-md border border-border bg-background px-1.5 py-1 text-[11px] text-foreground outline-none focus:ring-1 focus:ring-ring"
						placeholder="Reply…"
						bind:value={replyDraft}
						maxlength={8000}
						onclick={(e) => e.stopPropagation()}
						onkeydown={(ev) => {
							if (ev.key === "Enter" && (ev.metaKey || ev.ctrlKey)) {
								ev.preventDefault();
								submitReply();
							}
						}}
					></textarea>
				{/if}
			</div>
		</div>
		</div>
	</div>
{/if}
