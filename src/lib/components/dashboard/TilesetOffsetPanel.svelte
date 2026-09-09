<script lang="ts">
    import { untrack } from "svelte";
    import XIcon from "@lucide/svelte/icons/x";

    type Props = {
        label: string;
        savedOffset?: number | null;
        canEdit?: boolean;
        onClose?: () => void;
        /** Live preview (no persist) — applied straight to the Cesium primitive. */
        onPreview?: (offset: number | null) => void;
        /** Persist; return false on failure. */
        onApply?: (
            offset: number | null,
        ) => Promise<boolean | void> | boolean | void;
    };

    let {
        label,
        savedOffset = null,
        canEdit = false,
        onClose,
        onPreview,
        onApply,
    }: Props = $props();

    const SLIDER_MIN = -50;
    const SLIDER_MAX = 50;

    let draft = $state(savedOffset == null ? "" : String(savedOffset));
    let dirty = $state(false);
    let saving = $state(false);
    let error = $state("");
    let savedNote = $state("");

    // Follow the persisted value until the user edits.
    $effect(() => {
        const s = savedOffset;
        untrack(() => {
            if (!dirty) draft = s == null ? "" : String(s);
        });
    });

    function parsed(): { value: number | null; error: string } {
        const raw = draft.trim();
        if (raw === "") return { value: null, error: "" };
        const n = Number(raw);
        if (!Number.isFinite(n)) {
            return { value: null, error: "Enter a number in metres." };
        }
        if (n < -1000 || n > 1000) {
            return { value: null, error: "Range is −1000…1000 m." };
        }
        return { value: Math.round(n * 100) / 100, error: "" };
    }

    function setDraft(v: string) {
        draft = v;
        dirty = true;
        error = "";
        savedNote = "";
        const { value, error: err } = parsed();
        if (!err) onPreview?.(value);
    }

    function nudge(delta: number) {
        const cur = draft.trim() === "" ? 0 : Number(draft);
        const base = Number.isFinite(cur) ? cur : 0;
        setDraft(String(Math.round((base + delta) * 100) / 100));
    }

    function sliderValue(): number {
        const { value } = parsed();
        if (value == null) return 0;
        return Math.min(SLIDER_MAX, Math.max(SLIDER_MIN, value));
    }

    function reset() {
        draft = savedOffset == null ? "" : String(savedOffset);
        dirty = false;
        error = "";
        savedNote = "";
        onPreview?.(savedOffset);
    }

    async function apply() {
        const { value, error: err } = parsed();
        if (err) {
            error = err;
            return;
        }
        if (!onApply) return;
        saving = true;
        error = "";
        try {
            const ok = await onApply(value);
            if (ok === false) {
                error = "Save failed.";
                return;
            }
            dirty = false;
            savedNote = "Saved";
        } catch {
            error = "Save failed.";
        } finally {
            saving = false;
        }
    }

    function formatSaved(v: number | null | undefined): string {
        if (v == null || !Number.isFinite(v)) return "not set";
        const r = Math.round(v * 100) / 100;
        if (r === 0) return "0 m";
        return `${r > 0 ? "+" : ""}${r} m`;
    }

    const iconBtn =
        "rounded p-1 text-muted-foreground hover:bg-secondary hover:text-foreground";
    const fieldCls =
        "w-full rounded border border-border bg-background px-1.5 py-1 text-xs tabular-nums";
    const nudgeCls =
        "rounded border border-border px-1.5 py-1 text-[10px] tabular-nums text-muted-foreground hover:bg-secondary hover:text-foreground disabled:opacity-40";
</script>

<div
    class="surface flex max-h-[min(78vh,40rem)] w-72 flex-col overflow-hidden rounded-lg border border-border text-xs shadow-lg"
>
    <div class="flex items-center gap-1 border-b border-border px-2 py-1.5">
        <span class="min-w-0 flex-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground"
            >Model height</span
        >
        <span class="max-w-[9rem] truncate text-[10px] text-muted-foreground">
            {label}
        </span>
        <button
            type="button"
            class={iconBtn}
            title="Close"
            onclick={() => onClose?.()}
        >
            <XIcon class="size-3.5" />
        </button>
    </div>

    <div class="min-h-0 flex-1 space-y-3 overflow-y-auto px-2.5 py-2.5">
        <p class="text-[11px] leading-relaxed text-muted-foreground">
            Shift the mesh along the ellipsoid normal so it meets entity
            heights. Saved offset: <span class="tabular-nums text-foreground"
                >{formatSaved(savedOffset)}</span
            >
        </p>

        <div class="space-y-1">
            <label
                class="text-[10px] font-medium uppercase tracking-wide text-muted-foreground"
                for="tileset-offset-input">Offset (m)</label
            >
            <div class="flex items-center gap-1">
                <button
                    type="button"
                    class={nudgeCls}
                    title="Shift down 1 m"
                    disabled={!canEdit || saving}
                    onclick={() => nudge(-1)}>−1</button
                >
                <button
                    type="button"
                    class={nudgeCls}
                    title="Shift down 0.1 m"
                    disabled={!canEdit || saving}
                    onclick={() => nudge(-0.1)}>−0.1</button
                >
                <input
                    id="tileset-offset-input"
                    type="number"
                    step="0.1"
                    min="-1000"
                    max="1000"
                    placeholder="0"
                    aria-label="Height offset in metres"
                    class="{fieldCls} min-w-0 flex-1"
                    value={draft}
                    disabled={!canEdit || saving}
                    oninput={(e) =>
                        setDraft((e.currentTarget as HTMLInputElement).value)}
                    onkeydown={(e) => {
                        if (e.key === "Enter") void apply();
                        if (e.key === "Escape") {
                            e.preventDefault();
                            e.stopImmediatePropagation();
                            onClose?.();
                        }
                    }}
                />
                <button
                    type="button"
                    class={nudgeCls}
                    title="Shift up 0.1 m"
                    disabled={!canEdit || saving}
                    onclick={() => nudge(0.1)}>+0.1</button
                >
                <button
                    type="button"
                    class={nudgeCls}
                    title="Shift up 1 m"
                    disabled={!canEdit || saving}
                    onclick={() => nudge(1)}>+1</button
                >
            </div>
            <input
                type="range"
                min={SLIDER_MIN}
                max={SLIDER_MAX}
                step="0.1"
                aria-label="Height offset slider"
                class="w-full"
                value={sliderValue()}
                disabled={!canEdit || saving}
                oninput={(e) =>
                    setDraft((e.currentTarget as HTMLInputElement).value)}
            />
            <div
                class="flex justify-between text-[9px] tabular-nums text-muted-foreground"
            >
                <span>{SLIDER_MIN} m</span>
                <span>{SLIDER_MAX} m</span>
            </div>
        </div>

        {#if error}
            <p class="text-[10px] text-destructive">{error}</p>
        {:else if savedNote && !dirty}
            <p class="text-[10px] text-muted-foreground">{savedNote}</p>
        {:else if dirty}
            <p class="text-[10px] text-muted-foreground">
                Previewing — Apply to save.
            </p>
        {/if}
    </div>

    {#if canEdit}
        <div class="flex items-center gap-1 border-t border-border px-2 py-1.5">
            <button
                type="button"
                class="flex-1 rounded bg-primary px-2 py-1 text-[11px] font-medium text-primary-foreground disabled:opacity-50"
                disabled={saving || !dirty}
                onclick={() => void apply()}
            >
                {saving ? "Saving…" : "Apply"}
            </button>
            <button
                type="button"
                class="rounded border border-border px-2 py-1 text-[11px] text-muted-foreground hover:bg-secondary hover:text-foreground disabled:opacity-50"
                disabled={saving || !dirty}
                onclick={reset}
            >
                Reset
            </button>
            <button
                type="button"
                class="rounded border border-border px-2 py-1 text-[11px] text-muted-foreground hover:bg-secondary hover:text-foreground disabled:opacity-50"
                title="Remove the saved offset"
                disabled={saving}
                onclick={() => setDraft("")}
            >
                Clear
            </button>
        </div>
    {/if}
</div>
