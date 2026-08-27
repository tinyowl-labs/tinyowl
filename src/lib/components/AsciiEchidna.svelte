<script lang="ts">
    import { onMount } from "svelte";

    type AsciiVideo = {
        format: string;
        frameRate: number;
        frameCount: number;
        frames: { index: number; time: number; rows: string[] }[];
    };

    let {
        src = "/brand/ascii-echidna.json",
        class: klass = "",
        loop = true,
        /** Crop empty margins and fit smaller so search stays optical center. */
        compact = false,
    }: {
        src?: string;
        class?: string;
        loop?: boolean;
        compact?: boolean;
    } = $props();

    let wrapEl = $state<HTMLDivElement | null>(null);
    let preEl = $state<HTMLPreElement | null>(null);
    let frameText = $state("");
    let ready = $state(false);
    let failed = $state(false);

    function isSparseRow(row: string): boolean {
        const trimmed = row.replace(/\s/g, "");
        if (!trimmed) return true;
        return /^[.\-_|\\/=]+$/.test(trimmed) && trimmed.length < 12;
    }

    /** Shared crop bounds so every frame has the same row count (no layout bounce). */
    function fixedTrimBounds(all: string[][]): { start: number; end: number } {
        let start = Infinity;
        let end = 0;
        for (const rows of all) {
            let s = 0;
            let e = rows.length;
            while (s < e && isSparseRow(rows[s] ?? "")) s++;
            while (e > s && isSparseRow(rows[e - 1] ?? "")) e--;
            start = Math.min(start, s);
            end = Math.max(end, e);
        }
        if (!Number.isFinite(start) || end <= start) {
            return { start: 0, end: all[0]?.length ?? 0 };
        }
        if (compact && start + 1 < end) start += 1;
        return { start, end };
    }

    onMount(() => {
        const reduceMotion = window.matchMedia(
            "(prefers-reduced-motion: reduce)",
        ).matches;

        let frames: string[] = [];
        let fps = 24;
        let raf = 0;
        let startMs = 0;
        let alive = true;
        let fittedPx = 0;
        let ro: ResizeObserver | undefined;

        const fit = () => {
            if (!wrapEl || !preEl || !frameText) return;
            // Stable geometry: size from column count, not per-frame scrollWidth.
            const cols = frameText.split("\n")[0]?.length || 100;
            const avail = wrapEl.clientWidth || 1;
            const target = compact ? avail * 0.78 : avail;
            const maxPx = compact ? 8 : 10.5;
            const minPx = compact ? 4 : 4.5;
            // ~0.6em average advance for monospace at 10px reference.
            const px = Math.max(
                minPx,
                Math.min(maxPx, target / Math.max(cols * 0.62, 1)),
            );
            if (Math.abs(px - fittedPx) < 0.05) return;
            fittedPx = px;
            preEl.style.fontSize = `${px}px`;
            // Lock wrap height so first paint / font swaps can't shove the page.
            const rows = frameText.split("\n").length;
            wrapEl.style.minHeight = `${Math.ceil(rows * px * 1.02)}px`;
        };

        const paint = (t: number) => {
            if (!alive || frames.length === 0) return;
            const elapsed = (t - startMs) / 1000;
            let idx = Math.floor(elapsed * fps);
            if (loop) {
                idx = idx % frames.length;
            } else {
                idx = Math.min(idx, frames.length - 1);
            }
            const next = frames[idx] ?? "";
            if (next !== frameText) frameText = next;
            if (!reduceMotion && (loop || idx < frames.length - 1)) {
                raf = requestAnimationFrame(paint);
            }
        };

        const boot = async () => {
            try {
                const res = await fetch(src);
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                const data = (await res.json()) as AsciiVideo;
                fps = data.frameRate || 24;
                const raw = data.frames.map((f) => f.rows);
                const { start, end } = fixedTrimBounds(raw);
                const width = Math.max(
                    ...raw.flatMap((rows) => rows.map((r) => r.length)),
                    1,
                );
                frames = raw.map((rows) =>
                    rows
                        .slice(start, end)
                        .map((r) => r.padEnd(width).slice(0, width))
                        .join("\n"),
                );
                if (frames.length === 0) throw new Error("no frames");
                // Guarantee identical string lengths (pad missing rows if any).
                const rowCount = end - start;
                frames = frames.map((f) => {
                    const lines = f.split("\n");
                    while (lines.length < rowCount) {
                        lines.push(" ".repeat(width));
                    }
                    return lines.slice(0, rowCount).join("\n");
                });
                frameText = frames[0] ?? "";
                ready = true;
                requestAnimationFrame(() => {
                    fit();
                    startMs = performance.now();
                    if (!reduceMotion) raf = requestAnimationFrame(paint);
                });
            } catch {
                failed = true;
                frameText = "echidna";
            }
        };

        void boot();

        if (wrapEl) {
            ro = new ResizeObserver(() => fit());
            ro.observe(wrapEl);
        }

        return () => {
            alive = false;
            cancelAnimationFrame(raf);
            ro?.disconnect();
        };
    });
</script>

<div bind:this={wrapEl} class="ascii-echidna-wrap w-full {klass}">
    <pre
        bind:this={preEl}
        class="ascii-echidna m-0 mx-auto w-max max-w-none select-none overflow-hidden font-mono text-foreground/85"
        class:opacity-0={!ready && !failed}
        aria-hidden="true"
    >{frameText}</pre>
</div>

<style>
    .ascii-echidna {
        white-space: pre;
        line-height: 1.02;
        letter-spacing: 0;
        tab-size: 1;
        font-variant-ligatures: none;
        font-feature-settings: "liga" 0, "calt" 0;
        transition: opacity 180ms ease;
        font-family:
            "JetBrains Mono", "Cascadia Code", "Fira Code", ui-monospace,
            SFMono-Regular, Menlo, Monaco, Consolas, monospace;
    }
</style>
