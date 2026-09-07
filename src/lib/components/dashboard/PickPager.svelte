<script lang="ts">
    import CheckIcon from "@lucide/svelte/icons/check";
    import ChevronLeftIcon from "@lucide/svelte/icons/chevron-left";
    import ChevronRightIcon from "@lucide/svelte/icons/chevron-right";
    import CopyIcon from "@lucide/svelte/icons/copy";
    import PencilIcon from "@lucide/svelte/icons/pencil";
    import XIcon from "@lucide/svelte/icons/x";
    import { popupAttrFields, type PickCandidate } from "./pickCandidates";
    import PickRelations from "./PickRelations.svelte";
    import PickMediaCarousel from "./PickMediaCarousel.svelte";
    import {
        fkEdgeForColumn,
        hopsForEntity,
        resolveFkDisplay,
        type SchemaFieldEdge,
        type SchemaTableKind,
    } from "$lib/project/schemaFields";
    import { browserMediaUrl } from "$lib/project/mediaUrl";

    type EntityMedia = { url: string; media_type: string };

    type Props = {
        open?: boolean;
        candidates?: PickCandidate[];
        index?: number;
        /**
         * `pinned` — fixed UI chrome (3D).
         * `floating` — click-relative overlay (2D map).
         */
        placement?: "pinned" | "floating";
        /** Used when placement is floating — screen point of the click/anchor. */
        x?: number;
        y?: number;
        /** When true, panel opens below the anchor instead of fully above. */
        flipBelow?: boolean;
        onIndexChange?: (index: number) => void;
        onClose?: () => void;
        /** Writers: open attribute editor into the session buffer. */
        canEdit?: boolean;
        onEdit?: (candidate: PickCandidate) => void;
        schemaEdges?: SchemaFieldEdge[];
        schemaTables?: SchemaTableKind[];
        rows?: Record<string, Record<string, unknown>[]>;
        mediaByEntity?: Record<string, EntityMedia[]>;
        accessToken?: string;
        onSelectRelated?: (table: string, id: string) => void;
    };

    let {
        open = false,
        candidates = [],
        index = $bindable(0),
        placement = "floating",
        x = 16,
        y = 16,
        flipBelow = false,
        onIndexChange,
        onClose,
        canEdit = false,
        onEdit,
        schemaEdges = [],
        schemaTables = [],
        rows = {},
        mediaByEntity = {},
        accessToken = "",
        onSelectRelated,
    }: Props = $props();

    let copied = $state(false);
    let copyTimer: ReturnType<typeof setTimeout> | undefined;

    const current = $derived(
        candidates.length > 0
            ? candidates[Math.min(Math.max(index, 0), candidates.length - 1)]
            : null,
    );

    const fields = $derived(
        popupAttrFields(current?.attributes, {
            label: current?.label ?? "",
            entityId: current?.entityId ?? "",
        }),
    );

    const hops = $derived.by(() => {
        const c = current;
        if (!c) return [];
        return hopsForEntity({
            table: c.layerName,
            entityId: c.entityId,
            attributes: c.attributes,
            schemaEdges,
            schemaTables,
            rowsByTable: rows,
        });
    });

    const media = $derived.by(() => {
        const c = current;
        if (!c) return [];
        const token = accessToken;
        return (mediaByEntity[`${c.layerName}:${c.entityId}`] ?? []).map(
            (m) => ({
                url: browserMediaUrl(m.url, { accessToken: token }),
                media_type: m.media_type,
            }),
        );
    });

    let expanded = $state<EntityMedia | null>(null);
    let expandedI = $state(0);

    $effect(() => {
        if (!open) expanded = null;
    });

    const idDistinct = $derived(
        Boolean(
            current?.entityId &&
                current.entityId.trim() !== (current.label ?? "").trim(),
        ),
    );

    let lastCopyId = "";
    $effect(() => {
        const id = current?.entityId ?? "";
        if (id === lastCopyId) return;
        lastCopyId = id;
        copied = false;
        if (copyTimer) {
            clearTimeout(copyTimer);
            copyTimer = undefined;
        }
    });

    async function copyId() {
        const id = current?.entityId?.trim();
        if (!id) return;
        try {
            await navigator.clipboard.writeText(id);
            copied = true;
            if (copyTimer) clearTimeout(copyTimer);
            copyTimer = setTimeout(() => {
                copied = false;
                copyTimer = undefined;
            }, 1500);
        } catch {
            /* ignore */
        }
    }

    function setIndex(next: number) {
        if (candidates.length === 0) return;
        const wrapped =
            ((next % candidates.length) + candidates.length) %
            candidates.length;
        index = wrapped;
        onIndexChange?.(wrapped);
    }

    function prev() {
        setIndex(index - 1);
    }

    function next() {
        setIndex(index + 1);
    }

    $effect(() => {
        if (!open || candidates.length === 0) return;
        const onKey = (ev: KeyboardEvent) => {
            const t = ev.target as HTMLElement | null;
            if (
                t?.closest?.(
                    "input, textarea, select, [contenteditable=true]",
                )
            ) {
                return;
            }
            if (ev.key === "Escape") {
                onClose?.();
                return;
            }
            if (candidates.length < 2) return;
            if (ev.key === "ArrowLeft" || ev.key === "[") {
                ev.preventDefault();
                prev();
            } else if (ev.key === "ArrowRight" || ev.key === "]") {
                ev.preventDefault();
                next();
            }
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    });
</script>

{#if open && current}
    <div
        class="pointer-events-auto z-[1100] w-72 max-w-[min(18rem,calc(100%-1.5rem))] overflow-hidden rounded-lg border border-border bg-background/98 text-xs shadow-lg backdrop-blur-sm {placement ===
        'pinned'
            ? 'absolute bottom-12 left-3'
            : 'absolute'}"
        style={placement === "floating"
            ? `left: ${x}px; top: ${y}px; transform: translate(-50%, ${flipBelow ? "12px" : "calc(-100% - 12px)"});`
            : undefined}
        role="dialog"
        aria-label="Picked entity"
        tabindex="-1"
        onpointerdown={(e) => e.stopPropagation()}
        onclick={(e) => e.stopPropagation()}
        onkeydown={(e) => {
            if (e.key === "Escape") onClose?.();
        }}
    >
        <div
            class="flex items-start gap-1 border-b border-border px-2.5 py-2"
        >
            <div class="min-w-0 flex-1">
                <div class="flex min-w-0 items-center gap-1">
                    <div
                        class="min-w-0 truncate text-[11px] font-medium text-foreground"
                    >
                        {current.label}
                    </div>
                    {#if !idDistinct && current.entityId}
                        <button
                            type="button"
                            class="shrink-0 rounded p-0.5 text-muted-foreground hover:bg-secondary hover:text-foreground"
                            title={copied ? "Copied" : "Copy id"}
                            onclick={copyId}
                        >
                            {#if copied}
                                <CheckIcon class="size-3" />
                            {:else}
                                <CopyIcon class="size-3" />
                            {/if}
                        </button>
                    {/if}
                </div>
                <div
                    class="truncate text-[10px] uppercase tracking-wide text-muted-foreground"
                >
                    {current.layerName.replace(/_/g, " ")}
                    {#if current.bufferOp}
                        <span class="normal-case text-foreground"
                            >· in session buffer ({current.bufferOp})</span
                        >
                    {/if}
                </div>
                {#if idDistinct}
                    <button
                        type="button"
                        class="-ml-1 mt-0.5 flex max-w-full items-center gap-1 rounded px-1 py-0.5 text-left text-muted-foreground hover:bg-secondary hover:text-foreground"
                        title={copied ? "Copied" : "Copy id"}
                        onclick={copyId}
                    >
                        <span
                            class="truncate font-mono text-[10px]"
                            >{current.entityId}</span
                        >
                        {#if copied}
                            <CheckIcon class="size-3 shrink-0" />
                        {:else}
                            <CopyIcon class="size-3 shrink-0" />
                        {/if}
                    </button>
                {/if}
            </div>
            <div class="flex shrink-0 items-center gap-0.5">
                {#if canEdit && onEdit}
                    <button
                        type="button"
                        class="rounded p-0.5 text-muted-foreground hover:bg-secondary hover:text-foreground"
                        title="Edit attributes"
                        onclick={() => onEdit(current)}
                    >
                        <PencilIcon class="size-3.5" />
                    </button>
                {/if}
                <button
                    type="button"
                    class="rounded p-0.5 text-muted-foreground hover:bg-secondary hover:text-foreground"
                    title="Close"
                    onclick={() => onClose?.()}
                >
                    <XIcon class="size-3.5" />
                </button>
            </div>
        </div>

        {#if media.length > 0}
            <div class="border-b border-border px-2.5 py-1.5">
                {#key current.entityId}
                    <PickMediaCarousel
                        items={media}
                        onOpen={(item, i) => {
                            expanded = item;
                            expandedI = i;
                        }}
                    />
                {/key}
            </div>
        {/if}

        {#if fields.length > 0}
            <div class="max-h-40 space-y-1.5 overflow-y-auto px-2.5 py-2">
                {#each fields as field (field.column)}
                    {@const edge = current
                        ? fkEdgeForColumn(
                              schemaEdges,
                              current.layerName,
                              field.column,
                          )
                        : undefined}
                    {@const related = edge
                        ? resolveFkDisplay(field.value, edge, rows)
                        : null}
                    <div>
                        <div
                            class="text-[10px] font-medium uppercase tracking-wide text-muted-foreground"
                        >
                            {field.key}
                        </div>
                        {#if related}
                            <button
                                type="button"
                                class="break-words text-left text-[11px] text-primary underline-offset-2 hover:underline"
                                onclick={() =>
                                    onSelectRelated?.(related.table, related.id)}
                            >
                                {related.label}
                            </button>
                        {:else}
                            <div class="break-words text-[11px] text-foreground">
                                {field.value}
                            </div>
                        {/if}
                    </div>
                {/each}
            </div>
        {/if}

        {#key current.entityId}
            <PickRelations
                {hops}
                centerLabel={current.label}
                onSelect={onSelectRelated}
            />
        {/key}

        {#if candidates.length > 1}
            <div
                class="flex items-center gap-2 border-t border-border px-2 py-1.5"
            >
                <span class="tabular-nums text-[11px] text-muted-foreground">
                    {index + 1} of {candidates.length}
                </span>
                <div class="ml-auto flex items-center gap-0.5">
                    <button
                        type="button"
                        class="rounded p-1 text-muted-foreground hover:bg-secondary hover:text-foreground"
                        title="Previous (←)"
                        onclick={prev}
                    >
                        <ChevronLeftIcon class="size-3.5" />
                    </button>
                    <button
                        type="button"
                        class="rounded p-1 text-muted-foreground hover:bg-secondary hover:text-foreground"
                        title="Next (→)"
                        onclick={next}
                    >
                        <ChevronRightIcon class="size-3.5" />
                    </button>
                </div>
            </div>
        {/if}
    </div>
{/if}

{#if expanded}
    <div
        class="pointer-events-auto fixed inset-0 z-[1200] flex items-center justify-center bg-black/70 p-4"
        onclick={() => (expanded = null)}
        onkeydown={(e) => {
            if (e.key === "Escape") expanded = null;
            if (media.length < 2) return;
            if (e.key === "ArrowLeft" || e.key === "[") {
                e.preventDefault();
                e.stopPropagation();
                const n = (expandedI - 1 + media.length) % media.length;
                expandedI = n;
                expanded = media[n] ?? null;
            } else if (e.key === "ArrowRight" || e.key === "]") {
                e.preventDefault();
                e.stopPropagation();
                const n = (expandedI + 1) % media.length;
                expandedI = n;
                expanded = media[n] ?? null;
            }
        }}
        role="dialog"
        aria-label="Media"
        tabindex="-1"
    >
        <button
            type="button"
            class="absolute right-3 top-3 rounded-md p-1 text-white/80 hover:bg-white/10"
            onclick={() => (expanded = null)}
            aria-label="Close"
        >
            <XIcon class="size-5" />
        </button>
        {#if media.length > 1}
            <button
                type="button"
                class="absolute left-3 top-1/2 -translate-y-1/2 rounded-md p-1 text-white/80 hover:bg-white/10"
                aria-label="Previous"
                onclick={(e) => {
                    e.stopPropagation();
                    const n = (expandedI - 1 + media.length) % media.length;
                    expandedI = n;
                    expanded = media[n] ?? null;
                }}
            >
                <ChevronLeftIcon class="size-6" />
            </button>
            <button
                type="button"
                class="absolute right-3 top-1/2 -translate-y-1/2 rounded-md p-1 text-white/80 hover:bg-white/10"
                aria-label="Next"
                onclick={(e) => {
                    e.stopPropagation();
                    const n = (expandedI + 1) % media.length;
                    expandedI = n;
                    expanded = media[n] ?? null;
                }}
            >
                <ChevronRightIcon class="size-6" />
            </button>
        {/if}
        {#if expanded.media_type.startsWith("image")}
            <img
                src={expanded.url}
                alt=""
                class="max-h-full max-w-full object-contain"
                onpointerdown={(e) => e.stopPropagation()}
            />
        {:else if expanded.media_type.startsWith("video")}
            <!-- svelte-ignore a11y_media_has_caption -->
            <video
                src={expanded.url}
                class="max-h-full max-w-full"
                controls
                autoplay
                onpointerdown={(e) => e.stopPropagation()}
            ></video>
        {/if}
        {#if media.length > 1}
            <p
                class="absolute bottom-4 left-0 right-0 text-center text-xs tabular-nums text-white/80"
            >
                {expandedI + 1} of {media.length}
            </p>
        {/if}
    </div>
{/if}
