<script lang="ts">
    import CheckIcon from "@lucide/svelte/icons/check";
    import ChevronLeftIcon from "@lucide/svelte/icons/chevron-left";
    import ChevronRightIcon from "@lucide/svelte/icons/chevron-right";
    import CopyIcon from "@lucide/svelte/icons/copy";
    import EllipsisVerticalIcon from "@lucide/svelte/icons/ellipsis-vertical";
    import MapPinIcon from "@lucide/svelte/icons/map-pin";
    import PanelBottomIcon from "@lucide/svelte/icons/panel-bottom";
    import TrashIcon from "@lucide/svelte/icons/trash-2";
    import XIcon from "@lucide/svelte/icons/x";
    import * as DropdownMenu from "$lib/components/ui/dropdown-menu/index.js";
    import {
        editAttrFields,
        overlayBufferAttrs,
        popupAttrFields,
        type PickCandidate,
    } from "./pickCandidates";
    import PickRelations from "./PickRelations.svelte";
    import PickMediaCarousel from "./PickMediaCarousel.svelte";
    import SchemaField from "./SchemaField.svelte";
    import JunctionRelated from "./JunctionRelated.svelte";
    import { viewportMenu } from "./viewportMenu.svelte";
    import { editBuffer } from "$lib/stores/editBuffer.svelte";
    import {
        readInfoboxDocked,
        writeInfoboxDocked,
    } from "./infoboxDock";
    import {
        fkEdgeForColumn,
        hopsForEntity,
        loadFkLookups,
        resolveFkDisplay,
        type LookupOpt,
        type SchemaFieldEdge,
        type SchemaTableKind,
    } from "$lib/project/schemaFields";
    import { browserMediaUrl } from "$lib/project/mediaUrl";
    import { imageDetailSrcs } from "$lib/project/imageDetailSrcs";
    import ImageDetailStage from "$lib/components/media/ImageDetailStage.svelte";

    type EntityMedia = { url: string; media_type: string };

    type Props = {
        open?: boolean;
        candidates?: PickCandidate[];
        index?: number;
        /**
         * `pinned` — fixed UI chrome (legacy bottom-left).
         * `floating` — click-relative overlay (on-map).
         * `docked` is owned internally (bottom-right, flush) and persisted.
         */
        placement?: "pinned" | "floating";
        /** Used when placement is floating — screen point of the click/anchor. */
        x?: number;
        y?: number;
        /** When true, panel opens below the anchor instead of fully above. */
        flipBelow?: boolean;
        onIndexChange?: (index: number) => void;
        onClose?: () => void;
        /** Writers on develop: infobox fields write the session. */
        canEdit?: boolean;
        canDelete?: boolean;
        onDelete?: (candidate: PickCandidate) => void;
        schemaEdges?: SchemaFieldEdge[];
        schemaTables?: SchemaTableKind[];
        rows?: Record<string, Record<string, unknown>[]>;
        tables?: Record<string, string[]>;
        slug?: string;
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
        canDelete = false,
        onDelete,
        schemaEdges = [],
        schemaTables = [],
        rows = {},
        tables = {},
        slug = "",
        mediaByEntity = {},
        accessToken = "",
        onSelectRelated,
    }: Props = $props();

    let docked = $state(readInfoboxDocked());

    function setDocked(next: boolean) {
        docked = next;
        writeInfoboxDocked(next);
    }

    const layout = $derived(docked ? "docked" : placement);

    let copied = $state(false);
    let copyTimer: ReturnType<typeof setTimeout> | undefined;

    const current = $derived(
        candidates.length > 0
            ? candidates[Math.min(Math.max(index, 0), candidates.length - 1)]
            : null,
    );

    const bufEntry = $derived.by(() => {
        const c = current;
        void editBuffer.entries;
        if (!c) return undefined;
        return editBuffer.entryFor(c.layerName, c.entityId);
    });
    const liveOp = $derived(bufEntry?.op ?? current?.bufferOp);
    const liveAttrs = $derived(
        overlayBufferAttrs(current?.attributes, bufEntry?.attributes),
    );
    const editing = $derived(canEdit && liveOp !== "delete");
    const columnNames = $derived(tables[current?.layerName ?? ""] ?? []);

    const fields = $derived.by(() => {
        const c = current;
        if (!c) return [];
        if (editing) return editAttrFields(columnNames, liveAttrs);
        return popupAttrFields(liveAttrs, {
            label: c.label,
            entityId: c.entityId,
        });
    });

    let lookups = $state<Record<string, LookupOpt[]>>({});
    $effect(() => {
        if (!editing || !slug) {
            lookups = {};
            return;
        }
        const table = current?.layerName ?? "";
        if (!table) {
            lookups = {};
            return;
        }
        const cols = editAttrFields(columnNames, {}).map((f) => f.column);
        const token = accessToken;
        void loadFkLookups({
            slug,
            table,
            columns: cols,
            accessToken: token,
        }).then((next) => {
            if (current?.layerName === table) lookups = next;
        });
    });

    function commitField(column: string, value: string) {
        const c = current;
        if (!c || !editing) return;
        editBuffer.setTargetLayer(c.layerName);
        editBuffer.upsertAttributes(c.layerName, c.entityId, { [column]: value });
    }

    const hops = $derived.by(() => {
        const c = current;
        if (!c) return [];
        return hopsForEntity({
            table: c.layerName,
            entityId: c.entityId,
            attributes: liveAttrs,
            schemaEdges,
            schemaTables,
            rowsByTable: rows,
        });
    });

    const media = $derived.by(() => {
        const c = current;
        if (!c) return [];
        const token = accessToken;
        // Info-box carousel is visual only — skip audio/octet stubs (e.g. QField
        // Audio cells with no extension → application/octet-stream → "application").
        return (mediaByEntity[`${c.layerName}:${c.entityId}`] ?? [])
            .filter((m) => {
                const t = (m.media_type ?? "").toLowerCase();
                return t.startsWith("image/") || t.startsWith("video/");
            })
            .map((m) => ({
                url: browserMediaUrl(m.url, { accessToken: token }),
                media_type: m.media_type,
            }));
    });

    let expanded = $state<EntityMedia | null>(null);
    let expandedI = $state(0);
    const expandedSrcs = $derived(
        expanded
            ? imageDetailSrcs(expanded.url, {
                  tiff: expanded.media_type.toLowerCase().includes("tiff"),
              })
            : null,
    );

    $effect(() => {
        if (!open) {
            expanded = null;
            viewportMenu.release("pick");
        }
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
                if (expanded) {
                    expanded = null;
                    ev.preventDefault();
                    return;
                }
                onClose?.();
                return;
            }
            if (expanded) {
                if (media.length < 2) return;
                if (ev.key === "ArrowLeft" || ev.key === "[") {
                    ev.preventDefault();
                    const n = (expandedI - 1 + media.length) % media.length;
                    expandedI = n;
                    expanded = media[n] ?? null;
                } else if (ev.key === "ArrowRight" || ev.key === "]") {
                    ev.preventDefault();
                    const n = (expandedI + 1) % media.length;
                    expandedI = n;
                    expanded = media[n] ?? null;
                }
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
        class="surface pointer-events-auto z-[1100] overflow-hidden rounded-lg border border-border text-xs shadow-lg {editing
            ? 'w-80 max-w-[min(22rem,calc(100%-1.5rem))]'
            : 'w-72 max-w-[min(18rem,calc(100%-1.5rem))]'} {layout ===
        'docked'
            ? 'absolute bottom-3 right-3'
            : layout === 'pinned'
              ? 'absolute bottom-12 left-3'
              : 'absolute'}"
        style={layout === "floating"
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
                    {#if liveOp === "insert" || liveOp === "update"}
                        <span class="normal-case text-foreground"
                            >· in session</span
                        >
                    {:else if liveOp === "delete"}
                        <span class="normal-case text-foreground"
                            >· deleted in session</span
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
                <DropdownMenu.Root
                    open={viewportMenu.is("pick")}
                    onOpenChange={(next) => {
                        if (next) viewportMenu.claim("pick");
                        else viewportMenu.release("pick");
                    }}
                >
                    <DropdownMenu.Trigger
                        class="shrink-0 select-none rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                        title="More"
                        aria-label="Infobox menu"
                    >
                        <EllipsisVerticalIcon class="size-3.5" />
                    </DropdownMenu.Trigger>
                    <DropdownMenu.Content align="end" class="z-[1200] min-w-44">
                        {#if canDelete && onDelete}
                            <DropdownMenu.Item
                                class="text-destructive data-highlighted:bg-destructive/10 data-highlighted:text-destructive"
                                onclick={() => onDelete(current)}
                            >
                                <TrashIcon class="size-3.5" />
                                Delete
                            </DropdownMenu.Item>
                            <DropdownMenu.Separator />
                        {/if}
                        <DropdownMenu.Item
                            onclick={() => setDocked(!docked)}
                        >
                            {#if docked}
                                <MapPinIcon class="size-3.5" />
                                Show on map
                            {:else}
                                <PanelBottomIcon class="size-3.5" />
                                Dock to bottom right
                            {/if}
                        </DropdownMenu.Item>
                    </DropdownMenu.Content>
                </DropdownMenu.Root>
                <button
                    type="button"
                    class="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
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

        {#if fields.length > 0 || editing}
            <div
                class="overflow-y-auto {editing
                    ? 'max-h-[min(24rem,55vh)] py-0.5'
                    : 'max-h-40 space-y-1.5 px-2.5 py-2'}"
            >
                {#key `${current.layerName}:${current.entityId}`}
                    {#each fields as field (field.column)}
                    {@const edge = current
                        ? fkEdgeForColumn(
                              schemaEdges,
                              current.layerName,
                              field.column,
                          )
                        : undefined}
                    {@const related = !editing && edge
                        ? resolveFkDisplay(field.value, edge, rows)
                        : null}
                    {#if editing}
                        <div
                            class="grid grid-cols-[5.75rem_minmax(0,1fr)] items-center gap-x-2 border-b border-border/60 px-2.5 py-1 last:border-b-0"
                        >
                            <span
                                class="truncate text-[11px] leading-none text-muted-foreground"
                                title={field.column}
                            >
                                {field.key}
                            </span>
                            <SchemaField
                                value={field.value}
                                options={lookups[field.column]}
                                compact
                                onInput={(v) => commitField(field.column, v)}
                                onCommit={(v) => commitField(field.column, v)}
                            />
                        </div>
                    {:else}
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
                    {/if}
                {/each}
                {#if editing && current}
                    <div class="px-2.5 pb-2">
                    <JunctionRelated
                        table={current.layerName}
                        entityId={current.entityId}
                        {schemaTables}
                        {rows}
                        onOpenRelated={onSelectRelated}
                    />
                    </div>
                {/if}
                {/key}
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
        class="pointer-events-auto fixed top-11 inset-x-0 bottom-0 z-[1200] flex items-center justify-center bg-black/40 p-4 md:p-8"
        onclick={(e) => {
            if (e.target === e.currentTarget) expanded = null;
        }}
        onkeydown={(e) => {
            if (e.key === "Escape") {
                e.stopPropagation();
                expanded = null;
            }
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
            class="absolute right-3 top-3 z-20 rounded-md border border-border bg-background/90 p-1.5 text-muted-foreground hover:text-foreground"
            onclick={() => (expanded = null)}
            aria-label="Close"
        >
            <XIcon class="size-5" />
        </button>
        {#if media.length > 1}
            <button
                type="button"
                class="absolute left-3 top-1/2 z-20 -translate-y-1/2 rounded-md border border-border bg-background/90 p-1 text-muted-foreground hover:text-foreground"
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
                class="absolute right-3 top-1/2 z-20 -translate-y-1/2 rounded-md border border-border bg-background/90 p-1 text-muted-foreground hover:text-foreground"
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
        {#if expanded.media_type.startsWith("image") && expandedSrcs}
            <div class="relative h-full w-full min-h-0">
                {#key `${expandedSrcs.preview}:${expandedSrcs.full}`}
                    <ImageDetailStage
                        previewSrc={expandedSrcs.preview}
                        fullSrc={expandedSrcs.full}
                        class="h-full w-full"
                    />
                {/key}
            </div>
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
                class="absolute top-3 left-1/2 z-20 -translate-x-1/2 rounded-md bg-background/90 px-2 py-0.5 text-xs tabular-nums text-muted-foreground"
            >
                {expandedI + 1} of {media.length}
            </p>
        {/if}
    </div>
{/if}
