<script lang="ts">
    /**
     * Generic markdown document editor.
     *
     * Rich mode is a Milkdown Crepe WYSIWYG overlay (lazy chunk — this file
     * must only ever be dynamically imported); Source mode is the plain
     * textarea fallback so power users bypass WYSIWYG normalization.
     * Either way the parent gets raw markdown via `bind:value`.
     *
     * Closing is choreographed: the parent sets `closing`, the editor plays
     * the entrance in reverse, then fires `onClosed` — the parent unmounts
     * (cancel) or submits (save) only after that.
     */
    import { Crepe, CrepeFeature } from "@milkdown/crepe";
    import "./crepe-theme.css";
    import { untrack } from "svelte";
    import { uploadConfig } from "@milkdown/plugin-upload";
    import { Fragment } from "prosemirror-model";

    type Props = {
        value?: string;
        placeholder?: string;
        /** Shown top-left next to the mode toggle. Should set `closing`. */
        onCancel?: () => void;
        /** Save submits the surrounding form unless onSave is given. */
        onSave?: () => void;
        saveLabel?: string;
        /** Parent sets true to play the reverse; `onClosed` fires after. */
        closing?: boolean;
        onClosed?: () => void;
    };

    let {
        value = $bindable(""),
        placeholder = "Write something…",
        onCancel,
        onSave,
        saveLabel = "Save",
        closing = false,
        onClosed,
    }: Props = $props();



    // Always opens in rich; the toggle is per-session only.
    let mode = $state<"rich" | "source">("rich");
    let rootEl = $state<HTMLDivElement | null>(null);
    let live: Crepe | null = null;
    /**
     * Clean entrance steps (rich mode): box draws around the text, then the
     * whole chrome unit (control row + toolbar) unfolds together above it so
     * the text yields exactly once. Each flag flips in sequence; CSS
     * transitions do the motion.
     */
    let box = $state(false);
    let chrome = $state(false);
    let settled = $state(false);

    function setMode(next: "rich" | "source") {
        if (mode === "rich" && next === "source" && live) {
            try {
                value = live.getMarkdown();
            } catch {
                /* keep last synced value */
            }
        }
        mode = next;
    }

    const timers: ReturnType<typeof setTimeout>[] = [];
    const frames: number[] = [];
    function clearTimers() {
        for (const t of timers) clearTimeout(t);
        timers.length = 0;
        for (const f of frames) cancelAnimationFrame(f);
        frames.length = 0;
    }
    function reducedMotion(): boolean {
        return (
            typeof matchMedia !== "undefined" &&
            matchMedia("(prefers-reduced-motion: reduce)").matches
        );
    }
    function playEntrance(isCancelled: () => boolean) {
        clearTimers();
        box = chrome = settled = false;
        if (reducedMotion()) {
            box = chrome = settled = true;
            return;
        }
        // Two frames before stepping: on first load the thread is still
        // busy compiling the lazy chunk, and if a flag flips before the
        // collapsed state paints, the transition has nothing to animate
        // from and the chrome just appears.
        frames.push(
            requestAnimationFrame(() =>
                frames.push(
                    requestAnimationFrame(() => {
                        if (isCancelled()) return;
                        timers.push(setTimeout(() => (box = true), 60));
                        timers.push(setTimeout(() => (chrome = true), 420));
                        timers.push(setTimeout(() => (settled = true), 900));
                    }),
                ),
            ),
        );
    }
    function playReverse(): Promise<void> {
        clearTimers();
        if (reducedMotion()) {
            box = chrome = settled = false;
            return Promise.resolve();
        }
        settled = false;
        return new Promise((resolve) => {
            timers.push(setTimeout(() => (chrome = false), 160));
            timers.push(
                setTimeout(() => {
                    box = false;
                    resolve();
                }, 420),
            );
        });
    }

    let prevClosing = false;
    $effect(() => {
        const c = closing;
        if (c === prevClosing) return;
        prevClosing = c;
        if (c) {
            if (mode !== "rich" || !live) {
                onClosed?.();
                return;
            }
            void playReverse().then(() => onClosed?.());
        } else if (mode === "rich" && live) {
            // Save failed (or close aborted): replay the entrance.
            playEntrance(() => false);
        }
    });

    $effect(() => {
        if (mode !== "rich") return;
        const el = rootEl;
        if (!el) return;
        // Untracked: the listener writes value on every keystroke, which
        // must not re-trigger editor creation. Leading blank lines would
        // show as phantom empty paragraphs above the first line (markdown
        // itself ignores them), so strip them; same for trailing
        // whitespace. The saved document is unaffected semantically.
        const initial = untrack(() => value)
            .replace(/^\s*\n/, "")
            .replace(/\s+$/, "");
        const instance = new Crepe({
            root: el,
            defaultValue: initial,
            features: {
                [CrepeFeature.TopBar]: true,
            },
            featureConfigs: {
                [CrepeFeature.Placeholder]: {
                    text: placeholder,
                    mode: "doc",
                },
            },
        });
        // READMEs have no image-upload endpoint: swallow dropped/pasted
        // files so blob: URLs never persist into saved markdown. Images by
        // URL (slash menu / pasted link) keep working.
        instance.editor.config((ctx) => {
            ctx.update(uploadConfig.key, (prev) => ({
                ...prev,
                uploader: async () => Fragment.empty,
            }));
        });
        instance.on((listener) => {
            listener.markdownUpdated((_ctx, md) => {
                value = md;
            });
        });
        live = instance;
        let cancelled = false;
        void instance
            .create()
            .then(() => {
                if (cancelled || closing) return;
                playEntrance(() => cancelled);
            })
            .catch(() => {});
        return () => {
            cancelled = true;
            clearTimers();
            live = null;
            void instance.destroy();
        };
    });
</script>

<div
    class="markdown-editor space-y-2"
    data-mode={mode}
    data-box={box}
    data-chrome={chrome}
    data-settled={settled}
>
    <div class="ctrl-row">
        <div
            class="ctrl-row-inner flex items-center justify-between gap-2"
        >
            <div class="flex items-center gap-2">
                {#if onCancel}
                    <button
                        type="button"
                        onclick={() => {
                            console.log(
                                "DBG cancel click",
                                typeof onCancel,
                                typeof onClosed,
                            );
                            mode = "source";
                            onCancel?.();
                        }}
                        class="inline-flex items-center rounded-md border border-input bg-background px-3 py-1.5 text-sm hover:bg-secondary transition-colors"
                        >Cancel</button
                    >
                {/if}
                {#if onSave || onCancel}
                    <button
                        type={onSave ? "button" : "submit"}
                        onclick={onSave}
                        class="inline-flex items-center rounded-md bg-primary text-primary-foreground px-3 py-1.5 text-sm font-medium hover:bg-primary/90 transition-colors"
                        >{saveLabel}</button
                    >
                {/if}
            </div>
            <div
                class="grid shrink-0 grid-cols-2 gap-1 rounded-md bg-muted p-1"
                role="tablist"
                aria-label="Editor mode"
            >
                {#each [{ id: "rich", label: "Rich" }, { id: "source", label: "Source" }] as tab (tab.id)}
                    <button
                        type="button"
                        role="tab"
                        aria-selected={mode === tab.id}
                        class="rounded px-2.5 py-1 text-xs font-medium transition-colors {mode ===
                        tab.id
                            ? 'bg-background text-foreground shadow-sm'
                            : 'text-muted-foreground hover:text-foreground'}"
                        onclick={() => setMode(tab.id as "rich" | "source")}
                    >
                        {tab.label}
                    </button>
                {/each}
            </div>
        </div>
    </div>
    {#if mode === "rich"}
        <div bind:this={rootEl} class="readme-content"></div>
    {:else}
        <textarea
            bind:value
            rows={16}
            class="w-full resize-y rounded-lg border border-input bg-background px-3.5 py-3 font-mono text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            placeholder={placeholder}
        ></textarea>
    {/if}
</div>

<style>
    /* Map Crepe tokens onto app theme vars so light/dark follow for free.
       :global — the .milkdown tree is injected at runtime by Crepe.
       Vendor CSS lives in a cascade layer (see crepe-theme.css), so the
       page's .readme-content render rules win on the editable text. */
    /* Control row (Save/Cancel left, Rich/Source right) unfolds together
       with the toolbar in rich mode — one chrome unit, one text motion.
       Always visible in source mode. */
    .ctrl-row {
        display: grid;
        grid-template-rows: 0fr;
        opacity: 0;
        transition:
            grid-template-rows 0.3s ease,
            opacity 0.2s ease 0.08s;
    }
    .ctrl-row-inner {
        overflow: hidden;
        min-height: 0;
    }
    .markdown-editor[data-mode="source"] .ctrl-row,
    .markdown-editor[data-chrome="true"] .ctrl-row {
        grid-template-rows: 1fr;
        opacity: 1;
    }
    /* Wrapper is a transparent layout box — the toolbar line and the text
       box below are visually separate elements. */
    .markdown-editor :global(.milkdown) {
        --crepe-color-background: var(--background);
        --crepe-color-on-background: var(--foreground);
        --crepe-color-surface: var(--card);
        --crepe-color-surface-low: var(--muted);
        --crepe-color-on-surface: var(--foreground);
        --crepe-color-on-surface-variant: var(--muted-foreground);
        --crepe-color-outline: var(--border);
        --crepe-color-primary: var(--primary);
        --crepe-color-secondary: var(--secondary);
        --crepe-color-on-secondary: var(--secondary-foreground);
        --crepe-color-inverse: var(--foreground);
        --crepe-color-on-inverse: var(--background);
        --crepe-color-hover: var(--accent);
        --crepe-color-selected: var(--accent);
        --crepe-color-inline-area: var(--muted);
        --crepe-base-font-size: 14px;
        --crepe-font-default: var(--font-sans);
        --crepe-font-title: var(--font-sans);
        --crepe-font-code: var(--font-mono);
        display: flex;
        flex-direction: column;
        background: transparent;
        max-width: none;
        margin: 0;
        padding: 0;
    }
    /* Toolbar: its own single line above the text. It unfolds in the same
       step as the control row; afterwards overflow releases so the heading
       dropdown can open. */
    .markdown-editor :global(.milkdown .milkdown-top-bar) {
        position: static;
        display: grid;
        grid-template-rows: 0fr;
        opacity: 0;
        min-height: 0;
        margin: 0;
        padding: 0 8px;
        border: 0 solid transparent;
        border-radius: 0.5rem;
        overflow: hidden;
        background: var(--card);
        transition:
            grid-template-rows 0.3s ease,
            opacity 0.2s ease 0.08s,
            margin 0.3s ease,
            padding 0.3s ease,
            border-width 0.3s ease;
    }
    .markdown-editor :global(.milkdown .milkdown-top-bar .top-bar-inner) {
        overflow: hidden;
        min-height: 0;
        flex-wrap: nowrap;
        width: max-content;
        min-width: 100%;
        align-items: center;
    }
    /* Step 2: the bar unfolds together with the control row above. */
    .markdown-editor[data-chrome="true"]
        :global(.milkdown .milkdown-top-bar) {
        grid-template-rows: 1fr;
        opacity: 1;
        margin-bottom: 0.5rem;
        padding: 2px 8px;
        border-width: 1px;
        border-color: var(--border);
    }
    .markdown-editor[data-settled="true"]
        :global(.milkdown .milkdown-top-bar) {
        overflow-x: clip;
        overflow-y: visible;
    }
    .markdown-editor[data-settled="true"]
        :global(.milkdown .milkdown-top-bar .top-bar-inner) {
        overflow: visible;
    }
    /* Single-line density (~630px total) so the bar fits the column
       without wrapping. Buttons stay full-size and vivid. */
    .markdown-editor :global(.milkdown .milkdown-top-bar .top-bar-item) {
        margin: 1px;
        color: var(--foreground);
    }
    /* Icon paths carry an explicit dim fill — repaint them bright, with a
       vivid active state. */
    .markdown-editor :global(.milkdown .milkdown-top-bar .top-bar-item svg),
    .markdown-editor
        :global(.milkdown .milkdown-top-bar .top-bar-heading-button svg) {
        color: var(--foreground);
        fill: var(--foreground);
    }
    .markdown-editor
        :global(.milkdown .milkdown-top-bar .top-bar-item.active svg) {
        color: var(--selected);
        fill: var(--selected);
    }
    .markdown-editor
        :global(.milkdown .milkdown-top-bar .top-bar-item:hover) {
        background: var(--accent);
        color: var(--foreground);
    }
    .markdown-editor
        :global(.milkdown .milkdown-top-bar .top-bar-heading-label) {
        color: var(--foreground);
    }
    .markdown-editor :global(.milkdown .milkdown-top-bar .top-bar-divider) {
        margin: 3px;
    }
    .markdown-editor
        :global(.milkdown .milkdown-top-bar .top-bar-heading-selector) {
        padding: 0 2px;
    }
    /* Narrow columns: wrap so every tool stays reachable (and dropdowns
       keep working) instead of clipping. */
    .markdown-editor {
        container-type: inline-size;
    }
    @container (max-width: 640px) {
        .markdown-editor
            :global(.milkdown .milkdown-top-bar .top-bar-inner) {
            flex-wrap: wrap;
            width: 100%;
        }
    }
    /* ProseMirror/Crepe inject non-content nodes (empty widget anchor,
       virtual cursor on first edit, block handle) ahead of the opening
       block, stealing :first-child so it keeps a full top margin. Flush
       the first content block however many widgets precede it. */
    .markdown-editor :global(.milkdown .ProseMirror > div:first-child + *),
    .markdown-editor
        :global(.milkdown .ProseMirror > div:first-child + div + *) {
        margin-top: 0;
    }
    /* Step 1: box draws around the text. The bordered box is the
       "you are editing" surface; type flows exactly like the render
       (page .readme-content rules win via cascade layer). */
    .markdown-editor :global(.milkdown .ProseMirror) {
        max-width: none;
        margin: 0;
        padding: 0.75rem 1rem;
        min-height: 14rem;
        outline: none;
        border: 1px solid transparent;
        border-radius: 0.5rem;
        background: var(--background);
        caret-color: var(--selected);
        transition: border-color 0.3s ease;
    }
    .markdown-editor[data-box="true"]
        :global(.milkdown .ProseMirror) {
        border-color: var(--border);
        box-shadow: var(--shadow-sm, 0 1px 2px rgb(0 0 0 / 0.08));
    }
    .markdown-editor :global(.milkdown .ProseMirror:focus) {
        border-color: var(--ring);
        box-shadow:
            0 0 0 2px var(--background),
            0 0 0 4px var(--ring);
    }
    /* Every other caret in the tree (code blocks, captions) equally vivid. */
    .markdown-editor :global(.milkdown .cm-content),
    .markdown-editor :global(.milkdown input),
    .markdown-editor :global(.milkdown textarea) {
        caret-color: var(--selected);
    }
    .markdown-editor :global(.milkdown .crepe-drop-cursor) {
        background-color: var(--selected);
        opacity: 0.8;
    }
    .markdown-editor :global(.milkdown.ProseMirror-focused),
    .markdown-editor :global(.milkdown .ProseMirror-focused) {
        --prosemirror-virtual-cursor-color: var(--selected);
    }
</style>
