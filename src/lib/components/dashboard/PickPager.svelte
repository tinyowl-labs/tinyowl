<script lang="ts">
    import ChevronLeftIcon from "@lucide/svelte/icons/chevron-left";
    import ChevronRightIcon from "@lucide/svelte/icons/chevron-right";
    import XIcon from "@lucide/svelte/icons/x";
    import type { PickCandidate } from "./pickCandidates";

    type Props = {
        open?: boolean;
        candidates?: PickCandidate[];
        index?: number;
        rows?: Record<string, Record<string, unknown>[]>;
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
    };

    let {
        open = false,
        candidates = [],
        index = $bindable(0),
        rows = {},
        placement = "floating",
        x = 16,
        y = 16,
        flipBelow = false,
        onIndexChange,
        onClose,
    }: Props = $props();

    const current = $derived(
        candidates.length > 0
            ? candidates[Math.min(Math.max(index, 0), candidates.length - 1)]
            : null,
    );

    const fields = $derived.by(() => {
        if (!current) return [] as Array<{ key: string; value: string }>;
        const table = rows[current.layerName] ?? [];
        const entity = table.find((r) => {
            const id = String(r.source_id ?? r.SOURCE_ID ?? "");
            return id.trim() === current.entityId.trim();
        });
        if (!entity) return [];
        return Object.entries(entity)
            .filter(
                ([k]) =>
                    !k.startsWith("_") && k !== "geom" && k !== "entity_type",
            )
            .map(([key, val]) => ({
                key: key.replace(/_/g, " "),
                value:
                    val === null || val === undefined || val === ""
                        ? ""
                        : String(val),
            }));
    });

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
        class="pointer-events-auto z-1000 w-64 max-w-[min(16rem,calc(100%-1.5rem))] overflow-hidden rounded-lg border border-border bg-background/98 text-xs shadow-lg backdrop-blur-sm {placement ===
        'pinned'
            ? 'absolute bottom-12 left-3'
            : 'absolute'}"
        style={placement === "floating"
            ? `left: ${x}px; top: ${y}px; transform: translate(-50%, ${flipBelow ? "12px" : "calc(-100% - 12px)"});`
            : undefined}
        role="dialog"
        aria-label="Picked entity"
    >
        <div
            class="flex items-start gap-2 border-b border-border px-2.5 py-2"
        >
            <div class="min-w-0 flex-1">
                <div class="truncate text-[11px] font-medium text-foreground">
                    {current.label}
                </div>
                <div
                    class="truncate text-[10px] uppercase tracking-wide text-muted-foreground"
                >
                    {current.layerName.replace(/_/g, " ")}
                </div>
                <div class="truncate font-mono text-[10px] text-muted-foreground">
                    {current.entityId}
                </div>
            </div>
            <button
                type="button"
                class="shrink-0 rounded p-0.5 text-muted-foreground hover:bg-secondary hover:text-foreground"
                title="Close"
                onclick={() => onClose?.()}
            >
                <XIcon class="size-3.5" />
            </button>
        </div>

        <div class="max-h-52 space-y-1.5 overflow-y-auto px-2.5 py-2">
            {#if fields.length === 0}
                <p class="text-[11px] text-muted-foreground">No attributes</p>
            {:else}
                {#each fields as field}
                    <div>
                        <div
                            class="text-[10px] font-medium uppercase tracking-wide text-muted-foreground"
                        >
                            {field.key}
                        </div>
                        <div class="break-words text-[11px] text-foreground">
                            {#if field.value}
                                {field.value}
                            {:else}
                                <span class="italic text-muted-foreground"
                                    >—</span
                                >
                            {/if}
                        </div>
                    </div>
                {/each}
            {/if}
        </div>

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
