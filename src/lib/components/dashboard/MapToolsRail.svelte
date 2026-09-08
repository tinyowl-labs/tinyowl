<script lang="ts">
    import RulerIcon from "@lucide/svelte/icons/ruler";
    import MessageCircleIcon from "@lucide/svelte/icons/message-circle";
    import PencilIcon from "@lucide/svelte/icons/pencil";
    import CheckIcon from "@lucide/svelte/icons/check";
    import XIcon from "@lucide/svelte/icons/x";
    import CrosshairIcon from "@lucide/svelte/icons/crosshair";
    import MousePointer2Icon from "@lucide/svelte/icons/mouse-pointer-2";
    import SquareDashedIcon from "@lucide/svelte/icons/square-dashed";
    import LassoIcon from "@lucide/svelte/icons/lasso";
    import EyeOffIcon from "@lucide/svelte/icons/eye-off";
    import EyeIcon from "@lucide/svelte/icons/eye";
    import FocusIcon from "@lucide/svelte/icons/focus";
    import CopyIcon from "@lucide/svelte/icons/copy";
    import type { MeasureMode, MeasureRecord } from "$lib/measure";
    import {
        elevationProfile,
        formatAreaSubtext,
        formatLengthSubtext,
        formatVolumeSubtext,
        measureHint,
    } from "$lib/measure";
    import ElevationProfile from "$lib/measure/ElevationProfile.svelte";
    import type { SelectionToolMode } from "$lib/stores/layerSelection.svelte";
    import {
        currentChord,
        formatChord,
        keyboardPrefs,
        type ShortcutId,
    } from "$lib/shortcuts";
    import { viewportMenu } from "./viewportMenu.svelte";

    type Props = {
        enabled?: boolean;
        mode?: MeasureMode;
        status?: string;
        records?: MeasureRecord[];
        canFinish?: boolean;
        dim?: "2d" | "3d";
        selectionCount?: number;
        selectionTool?: SelectionToolMode;
        isolating?: boolean;
        onFlyToSelection?: () => void;
        onClearSelection?: () => void;
        onHideSelected?: () => void;
        onShowSelected?: () => void;
        onIsolateSelected?: () => void;
        onExitIsolate?: () => void;
        onClear?: () => void;
        onFinish?: () => void;
        onRemove?: (id: string) => void;
        onVolumeKind?: (id: string, kind: "cut" | "fill") => void;
        /** Members-only comments toggle. */
        showComments?: boolean;
        commentsEnabled?: boolean;
        /** Writers: draw / edit mode on the tools rail. */
        showEdit?: boolean;
        editEnabled?: boolean;
        canEnterEdit?: boolean;
        onEnterEdit?: () => void;
        onExitEdit?: () => void;
    };

    let {
        enabled = $bindable(false),
        mode = $bindable<MeasureMode>("length"),
        status = "",
        records = [],
        canFinish = false,
        dim = "2d",
        selectionCount = 0,
        selectionTool = $bindable<SelectionToolMode>("click"),
        isolating = false,
        onFlyToSelection,
        onClearSelection,
        onHideSelected,
        onShowSelected,
        onIsolateSelected,
        onExitIsolate,
        onClear,
        onFinish,
        onRemove,
        onVolumeKind,
        showComments = false,
        commentsEnabled = $bindable(false),
        showEdit = false,
        editEnabled = $bindable(false),
        canEnterEdit = false,
        onEnterEdit,
        onExitEdit,
    }: Props = $props();

    let selectionOpen = $state(false);
    let copiedId = $state<string | null>(null);

    const chordLabel = $derived.by(() => {
        void keyboardPrefs.chords;
        return (id: ShortcutId) => formatChord(currentChord(id));
    });

    const measureModes = $derived.by(() => {
        const modes: { id: MeasureMode; label: string; shortcut: string }[] = [
            { id: "point", label: "Point", shortcut: chordLabel("map-measure-point") },
            { id: "length", label: "Length", shortcut: chordLabel("map-measure-length") },
            { id: "area", label: "Area", shortcut: chordLabel("map-measure-area") },
        ];
        if (dim === "3d") {
            modes.push({
                id: "volume",
                label: "Vol",
                shortcut: chordLabel("map-measure-volume"),
            });
        }
        return modes;
    });

    const modeLabel: Record<MeasureMode, string> = {
        point: "Point",
        length: "Length",
        area: "Area",
        volume: "Vol",
    };

    const selectTools = $derived([
        {
            id: "click" as const,
            label: "Click",
            hint: "Click · Shift add · Ctrl remove",
            shortcut: chordLabel("map-select-click"),
            icon: MousePointer2Icon,
        },
        {
            id: "box" as const,
            label: "Box",
            hint: "Shift+drag add · Ctrl+drag remove",
            shortcut: chordLabel("map-select-box"),
            icon: SquareDashedIcon,
        },
        {
            id: "lasso" as const,
            label: "Lasso",
            hint: "Shift+drag add · Ctrl+drag remove",
            shortcut: chordLabel("map-select-lasso"),
            icon: LassoIcon,
        },
    ]);

    const hasSelection = $derived(selectionCount > 0);
    const inSelectMode = $derived(
        !enabled && !commentsEnabled && !editEnabled,
    );

    const editTitle = $derived(
        editEnabled
            ? `Stop editing (${chordLabel("map-edit-toggle")})`
            : canEnterEdit
              ? `Edit (${chordLabel("map-edit-toggle")})`
              : `Select a layer to edit (${chordLabel("map-edit-toggle")})`,
    );

    const activeSelect = $derived(
        selectTools.find((t) => t.id === selectionTool) ?? selectTools[0]!,
    );

    function closePanels() {
        selectionOpen = false;
        viewportMenu.release("rail:select");
        enabled = false;
        commentsEnabled = false;
        if (editEnabled) {
            editEnabled = false;
            onExitEdit?.();
        }
    }

    function openSelectionPanel() {
        viewportMenu.claim("rail:select");
        selectionOpen = true;
    }

    function toggleSelection() {
        if (!inSelectMode) {
            closePanels();
            return;
        }
        if (selectionOpen) {
            selectionOpen = false;
            viewportMenu.release("rail:select");
        } else {
            openSelectionPanel();
        }
    }

    function toggleMeasure() {
        const next = !enabled;
        closePanels();
        enabled = next;
    }

    function toggleComments() {
        const next = !commentsEnabled;
        closePanels();
        commentsEnabled = next;
    }

    function toggleEdit() {
        if (editEnabled) {
            closePanels();
            return;
        }
        if (!canEnterEdit) return;
        closePanels();
        onEnterEdit?.();
    }

    function setMeasureMode(next: MeasureMode) {
        if (next === "volume" && dim !== "3d") return;
        mode = next;
        selectionOpen = false;
        viewportMenu.release("rail:select");
        if (!enabled) enabled = true;
    }

    $effect(() => {
        if (viewportMenu.id !== "rail:select" && selectionOpen) {
            selectionOpen = false;
        }
    });

    function recordSub(rec: MeasureRecord): string | null {
        if (rec.mode === "length") return formatLengthSubtext(rec.vertices);
        if (rec.mode === "area") {
            return formatAreaSubtext(rec.vertices, rec.surface3d);
        }
        if (rec.mode === "volume" && rec.volume) {
            return formatVolumeSubtext(rec.volume);
        }
        return null;
    }

    function setSelectTool(id: SelectionToolMode) {
        selectionTool = id;
    }

    async function copyRecord(rec: MeasureRecord) {
        const sub = recordSub(rec);
        const text =
            rec.mode === "point"
                ? rec.label
                : sub
                  ? `${modeLabel[rec.mode]}: ${rec.label} (${sub})`
                  : `${modeLabel[rec.mode]}: ${rec.label}`;
        try {
            await navigator.clipboard.writeText(text);
            copiedId = rec.id;
            setTimeout(() => {
                if (copiedId === rec.id) copiedId = null;
            }, 900);
        } catch {
            /* ignore */
        }
    }

    const railBtn =
        "flex size-8 items-center justify-center text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground disabled:opacity-40";

    const menuItem =
        "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs text-foreground hover:bg-secondary disabled:pointer-events-none disabled:opacity-40";

    const kbd =
        "text-[10px] tabular-nums text-muted-foreground";
</script>

<div class="pointer-events-auto flex items-start gap-2">
    <div class="flex flex-col gap-2">
        <div
            class="surface flex flex-col divide-y divide-border overflow-hidden rounded-lg border border-border shadow-lg"
        >
            <button
                type="button"
                class="{railBtn} {inSelectMode
                    ? 'selected hover:text-selected-foreground'
                    : ''}"
                title="Select ({activeSelect.label}, {activeSelect.shortcut})"
                aria-label="Select"
                aria-pressed={inSelectMode}
                onclick={toggleSelection}
            >
                <activeSelect.icon class="size-3.5" />
            </button>

            <button
                type="button"
                class="{railBtn} {enabled
                    ? 'selected hover:text-selected-foreground'
                    : ''}"
                title={enabled
                    ? `Stop measuring (${chordLabel("map-measure-toggle")})`
                    : `Measure (${chordLabel("map-measure-toggle")})`}
                aria-label="Measure"
                aria-pressed={enabled}
                onclick={toggleMeasure}
            >
                <RulerIcon class="size-3.5" />
            </button>

            {#if showEdit}
                <button
                    type="button"
                    class="{railBtn} {editEnabled
                        ? 'selected hover:text-selected-foreground'
                        : ''}"
                    title={editTitle}
                    aria-label="Edit"
                    aria-pressed={editEnabled}
                    disabled={!editEnabled && !canEnterEdit}
                    onclick={toggleEdit}
                >
                    <PencilIcon class="size-3.5" />
                </button>
            {/if}

            {#if showComments}
                <button
                    type="button"
                    class="{railBtn} {commentsEnabled
                        ? 'selected hover:text-selected-foreground'
                        : ''}"
                    title={commentsEnabled
                        ? `Hide comments (${chordLabel("map-comments-toggle")})`
                        : `Comments (${chordLabel("map-comments-toggle")})`}
                    aria-label="Comments"
                    aria-pressed={commentsEnabled}
                    onclick={toggleComments}
                >
                    <MessageCircleIcon class="size-3.5" />
                </button>
            {/if}
        </div>
    </div>

    {#if selectionOpen}
        <div
            class="surface flex w-48 flex-col gap-0.5 rounded-lg border border-border p-1 text-xs shadow-lg"
        >
            <div
                class="px-2 py-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground"
            >
                Select
            </div>
            {#each selectTools as tool (tool.id)}
                <button
                    type="button"
                    class="{menuItem} {selectionTool === tool.id
                        ? 'selected'
                        : ''}"
                    onclick={() => setSelectTool(tool.id)}
                >
                    <tool.icon class="size-3.5 shrink-0 text-muted-foreground" />
                    <span class="flex-1">{tool.label}</span>
                    <span class={kbd}>{tool.shortcut}</span>
                    {#if selectionTool === tool.id}
                        <CheckIcon class="size-3 shrink-0 text-foreground" />
                    {/if}
                </button>
            {/each}
            <p class="px-2 py-1 text-[11px] leading-snug text-muted-foreground">
                {activeSelect.hint}
            </p>
            {#if hasSelection}
                <div class="mx-1 border-t border-border pt-1">
                    <div
                        class="mb-0.5 px-2 py-0.5 text-[11px] tabular-nums text-muted-foreground"
                    >
                        {isolating
                            ? `${selectionCount} isolated`
                            : `${selectionCount} selected`}
                    </div>
                    {#if onFlyToSelection}
                        <button
                            type="button"
                            class={menuItem}
                            onclick={() => onFlyToSelection()}
                        >
                            <CrosshairIcon
                                class="size-3.5 shrink-0 text-muted-foreground"
                            />
                            <span class="flex-1">Fly to</span>
                            <span class={kbd}>{chordLabel("map-fly-to")}</span>
                        </button>
                    {/if}
                    <button
                        type="button"
                        class={menuItem}
                        onclick={() => onClearSelection?.()}
                    >
                        <XIcon class="size-3.5 shrink-0 text-muted-foreground" />
                        Clear
                    </button>
                    {#if onHideSelected}
                        <button
                            type="button"
                            class={menuItem}
                            onclick={() => onHideSelected()}
                        >
                            <EyeOffIcon
                                class="size-3.5 shrink-0 text-muted-foreground"
                            />
                            Hide selected
                        </button>
                    {/if}
                    {#if onShowSelected}
                        <button
                            type="button"
                            class={menuItem}
                            onclick={() => onShowSelected()}
                        >
                            <EyeIcon
                                class="size-3.5 shrink-0 text-muted-foreground"
                            />
                            Show selected
                        </button>
                    {/if}
                    {#if onIsolateSelected}
                        <button
                            type="button"
                            class={menuItem}
                            onclick={() => onIsolateSelected()}
                        >
                            <FocusIcon
                                class="size-3.5 shrink-0 text-muted-foreground"
                            />
                            <span class="flex-1">Isolate selected</span>
                            <span class={kbd}>{chordLabel("map-isolate")}</span>
                        </button>
                    {/if}
                </div>
            {/if}
            {#if isolating && onExitIsolate}
                <div class="mx-1 border-t border-border pt-1">
                    <button
                        type="button"
                        class={menuItem}
                        onclick={() => onExitIsolate()}
                    >
                        <XIcon
                            class="size-3.5 shrink-0 text-muted-foreground"
                        />
                        <span class="flex-1">Clear isolate</span>
                        <span class={kbd}>{chordLabel("map-exit-isolate")}</span>
                    </button>
                </div>
            {/if}
        </div>
    {:else if isolating || selectionCount > 1}
        <div
            class="flex overflow-hidden rounded-md border shadow-sm {isolating
                ? 'selected'
                : 'surface border-border'}"
        >
            <button
                type="button"
                class="px-2 py-1 text-[11px] {isolating
                    ? 'text-primary hover:text-primary'
                    : 'text-muted-foreground hover:text-foreground'}"
                title={isolating ? "Show isolate options" : "Show selection"}
                onclick={() => {
                    closePanels();
                    openSelectionPanel();
                }}
            >
                {isolating
                    ? `${selectionCount} isolated`
                    : `${selectionCount} selected`}
            </button>
            {#if isolating && onExitIsolate}
                <button
                    type="button"
                    class="border-l border-primary/20 px-1.5 text-primary/70 hover:bg-primary/15 hover:text-primary"
                    title="Clear isolate and search (U)"
                    aria-label="Clear isolate and search"
                    onclick={() => onExitIsolate()}
                >
                    <XIcon class="size-3" />
                </button>
            {/if}
        </div>
    {/if}

    {#if enabled}
        <div
            class="surface flex w-72 flex-col gap-1.5 rounded-lg border border-border p-2 text-xs shadow-lg"
        >
            <div
                class="flex items-center overflow-hidden rounded-md border border-border"
            >
                {#each measureModes as m, i (m.id)}
                    <button
                        type="button"
                        class="flex-1 px-1.5 py-1 transition-colors {i > 0
                            ? 'border-l border-border'
                            : ''} {mode === m.id
                            ? 'bg-secondary text-foreground font-medium'
                            : 'text-muted-foreground hover:text-foreground'}"
                        title="{m.label} ({m.shortcut})"
                        onclick={() => setMeasureMode(m.id)}
                    >
                        {m.label}
                    </button>
                {/each}
            </div>

            {#if canFinish}
                <button
                    type="button"
                    class="inline-flex items-center justify-center gap-1 rounded-md bg-primary/15 px-2 py-1.5 font-medium text-foreground hover:bg-primary/20"
                    title="Finish measurement (Enter)"
                    onclick={() => onFinish?.()}
                >
                    <CheckIcon class="size-3.5" />
                    Finish
                </button>
            {/if}

            <p class="px-0.5 text-[11px] leading-snug text-muted-foreground">
                {status || measureHint(mode, dim)}
            </p>

            {#if records.length > 0}
                <div class="border-t border-border pt-1.5">
                    <div
                        class="mb-1 flex items-center justify-between gap-2 px-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground"
                    >
                        <span>Results · {records.length}</span>
                        <button
                            type="button"
                            class="inline-flex items-center gap-0.5 normal-case tracking-normal hover:text-foreground"
                            title="Clear all measurements"
                            onclick={() => onClear?.()}
                        >
                            <XIcon class="size-3" />
                            Clear
                        </button>
                    </div>
                    <ul class="max-h-72 space-y-1 overflow-y-auto">
                        {#each records as rec, i (rec.id)}
                            {@const sub = recordSub(rec)}
                            {@const profile =
                                rec.mode === "length"
                                    ? (rec.profile ??
                                          elevationProfile(rec.vertices))
                                    : null}
                            <li
                                class="rounded-md px-1 py-1 hover:bg-secondary/80"
                            >
                                <div class="flex items-center gap-1.5">
                                    <span
                                        class="w-3.5 shrink-0 tabular-nums text-[10px] text-muted-foreground"
                                        >{i + 1}</span
                                    >
                                    <span class="min-w-0 flex-1 truncate">
                                        <span class="text-muted-foreground"
                                            >{modeLabel[rec.mode]} ·</span
                                        >
                                        <span
                                            class="font-medium tabular-nums text-foreground"
                                            >{rec.label}</span
                                        >
                                    </span>
                                    <button
                                        type="button"
                                        class="shrink-0 rounded p-0.5 text-muted-foreground hover:bg-background hover:text-foreground"
                                        title={copiedId === rec.id
                                            ? "Copied"
                                            : "Copy"}
                                        onclick={() => void copyRecord(rec)}
                                    >
                                        <CopyIcon class="size-3" />
                                    </button>
                                    <button
                                        type="button"
                                        class="shrink-0 rounded p-0.5 text-muted-foreground hover:bg-background hover:text-foreground"
                                        title="Remove"
                                        onclick={() => onRemove?.(rec.id)}
                                    >
                                        <XIcon class="size-3" />
                                    </button>
                                </div>
                                {#if sub}
                                    <p
                                        class="pl-5 text-[10px] tabular-nums text-muted-foreground"
                                    >
                                        {sub}
                                    </p>
                                {/if}
                                {#if rec.mode === "volume" && rec.volume && onVolumeKind}
                                    <div
                                        class="mt-0.5 flex gap-0.5 pl-5"
                                    >
                                        <button
                                            type="button"
                                            class="rounded px-1.5 py-0.5 text-[10px] {rec.volume.kind === 'cut'
                                                ? 'bg-[#3b82f6]/25 font-medium text-foreground'
                                                : 'text-muted-foreground hover:text-foreground'}"
                                            title="Cut — below the ring"
                                            onclick={() =>
                                                onVolumeKind(rec.id, "cut")}
                                            >Cut</button
                                        >
                                        <button
                                            type="button"
                                            class="rounded px-1.5 py-0.5 text-[10px] {rec.volume.kind === 'fill'
                                                ? 'bg-[#22c55e]/25 font-medium text-foreground'
                                                : 'text-muted-foreground hover:text-foreground'}"
                                            title="Fill — above the ring"
                                            onclick={() =>
                                                onVolumeKind(rec.id, "fill")}
                                            >Fill</button
                                        >
                                    </div>
                                {/if}
                                {#if profile}
                                    <div class="pl-5">
                                        <ElevationProfile points={profile} />
                                    </div>
                                {/if}
                            </li>
                        {/each}
                    </ul>
                </div>
            {/if}
        </div>
    {:else if records.length > 0 && !selectionOpen && !editEnabled && !commentsEnabled}
        <button
            type="button"
            class="surface rounded-md border border-border px-2 py-1 text-[11px] text-muted-foreground shadow-sm hover:text-foreground"
            title="Show measurements"
            onclick={() => {
                closePanels();
                enabled = true;
            }}
        >
            {records.length} measure{records.length === 1 ? "" : "s"}
        </button>
    {/if}
</div>
