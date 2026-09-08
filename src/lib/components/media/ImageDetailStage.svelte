<script lang="ts">
    import MinusIcon from "@lucide/svelte/icons/minus";
    import PlusIcon from "@lucide/svelte/icons/plus";
    import RotateCcwIcon from "@lucide/svelte/icons/rotate-ccw";
    import { on } from "svelte/events";

    const MIN_SCALE = 1;
    const MAX_SCALE = 8;

    let {
        previewSrc,
        fullSrc = "",
        class: className = "",
    }: {
        previewSrc: string;
        fullSrc?: string;
        class?: string;
    } = $props();

    let scale = $state(1);
    let tx = $state(0);
    let ty = $state(0);
    let previewOk = $state(false);
    let fullOk = $state(false);
    let dragging = $state(false);
    let surface: HTMLElement | undefined;
    const pointers = new Map<number, { x: number; y: number }>();
    let pinchStartDist = 0;
    let pinchStartScale = 1;

    const wantFull = $derived(Boolean(fullSrc) && fullSrc !== previewSrc);
    const showFull = $derived(wantFull && fullOk);

    function clamp(n: number, lo: number, hi: number) {
        return Math.min(hi, Math.max(lo, n));
    }

    function resetView() {
        scale = 1;
        tx = 0;
        ty = 0;
    }

    function zoomAt(clientX: number, clientY: number, factor: number) {
        const el = surface;
        if (!el) return;
        const next = clamp(scale * factor, MIN_SCALE, MAX_SCALE);
        if (next === scale) return;
        const rect = el.getBoundingClientRect();
        const mx = clientX - rect.left - rect.width / 2;
        const my = clientY - rect.top - rect.height / 2;
        const ratio = next / scale;
        tx = mx - (mx - tx) * ratio;
        ty = my - (my - ty) * ratio;
        scale = next;
        if (scale === MIN_SCALE) {
            tx = 0;
            ty = 0;
        }
    }

    function zoomSurface(node: HTMLElement) {
        surface = node;
        const off = on(
            node,
            "wheel",
            (e: WheelEvent) => {
                e.preventDefault();
                e.stopPropagation();
                zoomAt(e.clientX, e.clientY, e.deltaY < 0 ? 1.12 : 1 / 1.12);
            },
            { passive: false },
        );
        return () => {
            off();
            if (surface === node) surface = undefined;
        };
    }

    function onPointerDown(e: PointerEvent) {
        if (e.button !== 0 && e.pointerType === "mouse") return;
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
        if (pointers.size === 2) {
            const [a, b] = [...pointers.values()];
            pinchStartDist = Math.hypot(a.x - b.x, a.y - b.y);
            pinchStartScale = scale;
            dragging = false;
        } else if (scale > MIN_SCALE) {
            dragging = true;
        }
    }

    function onPointerMove(e: PointerEvent) {
        if (!pointers.has(e.pointerId)) return;
        const prev = pointers.get(e.pointerId)!;
        pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
        if (pointers.size === 2 && pinchStartDist > 0) {
            const [a, b] = [...pointers.values()];
            const dist = Math.hypot(a.x - b.x, a.y - b.y);
            scale = clamp(
                pinchStartScale * (dist / pinchStartDist),
                MIN_SCALE,
                MAX_SCALE,
            );
            if (scale === MIN_SCALE) {
                tx = 0;
                ty = 0;
            }
            return;
        }
        if (!dragging) return;
        const dx = e.clientX - prev.x;
        const dy = e.clientY - prev.y;
        tx += dx;
        ty += dy;
    }

    function onPointerUp(e: PointerEvent) {
        pointers.delete(e.pointerId);
        if (pointers.size < 2) {
            pinchStartDist = 0;
        }
        if (pointers.size === 0) dragging = false;
    }

    function onDblClick(e: MouseEvent) {
        if (scale > MIN_SCALE) resetView();
        else zoomAt(e.clientX, e.clientY, 2.5);
    }

    function zoomButton(factor: number) {
        const el = surface;
        if (!el) {
            scale = clamp(scale * factor, MIN_SCALE, MAX_SCALE);
            if (scale === MIN_SCALE) {
                tx = 0;
                ty = 0;
            }
            return;
        }
        const r = el.getBoundingClientRect();
        zoomAt(r.left + r.width / 2, r.top + r.height / 2, factor);
    }
</script>

<div
    class="relative h-full min-h-0 w-full overflow-hidden bg-transparent select-none {className}"
    {@attach zoomSurface}
    onpointerdown={onPointerDown}
    onpointermove={onPointerMove}
    onpointerup={onPointerUp}
    onpointercancel={onPointerUp}
    onclick={(e) => e.stopPropagation()}
    onkeydown={(e) => {
        if (e.key === "+" || e.key === "=") {
            e.preventDefault();
            zoomButton(1.25);
        } else if (e.key === "-" || e.key === "_") {
            e.preventDefault();
            zoomButton(1 / 1.25);
        } else if (e.key === "0") {
            e.preventDefault();
            resetView();
        }
    }}
    ondblclick={onDblClick}
    role="application"
    aria-label="Image detail"
    tabindex="-1"
    style:touch-action="none"
    style:cursor={scale > MIN_SCALE
        ? dragging
            ? "grabbing"
            : "grab"
        : "zoom-in"}
>
    <div
        class="absolute inset-0 will-change-transform"
        style:transform="translate({tx}px, {ty}px) scale({scale})"
        style:transform-origin="center center"
    >
        <img
            src={previewSrc}
            alt=""
            draggable="false"
            class="absolute inset-0 h-full w-full object-contain transition-opacity duration-200 {showFull
                ? 'opacity-0'
                : previewOk
                  ? 'opacity-100'
                  : 'opacity-70'}"
            onload={() => (previewOk = true)}
            onerror={() => (previewOk = false)}
        />
        {#if wantFull}
            <img
                src={fullSrc}
                alt=""
                draggable="false"
                class="absolute inset-0 h-full w-full object-contain transition-opacity duration-200 {showFull
                    ? 'opacity-100'
                    : 'opacity-0'}"
                onload={() => (fullOk = true)}
            />
        {/if}
    </div>

    <div
        class="absolute bottom-3 left-1/2 z-10 flex -translate-x-1/2 items-center gap-0.5 rounded-md border border-border bg-background/90 p-0.5 shadow-sm"
        role="toolbar"
        aria-label="Zoom"
        tabindex="-1"
        onpointerdown={(e) => e.stopPropagation()}
        onclick={(e) => e.stopPropagation()}
        ondblclick={(e) => e.stopPropagation()}
    >
        <button
            type="button"
            class="rounded p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground"
            aria-label="Zoom out"
            onclick={() => zoomButton(1 / 1.25)}
        >
            <MinusIcon class="size-3.5" />
        </button>
        <button
            type="button"
            class="min-w-10 rounded px-1.5 py-1 text-[11px] tabular-nums text-muted-foreground hover:bg-secondary hover:text-foreground"
            aria-label="Reset zoom"
            onclick={resetView}
        >
            {Math.round(scale * 100)}%
        </button>
        <button
            type="button"
            class="rounded p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground"
            aria-label="Zoom in"
            onclick={() => zoomButton(1.25)}
        >
            <PlusIcon class="size-3.5" />
        </button>
        <button
            type="button"
            class="rounded p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground"
            aria-label="Fit"
            onclick={resetView}
        >
            <RotateCcwIcon class="size-3.5" />
        </button>
    </div>
</div>
