<script lang="ts">
    import {
        formatDistanceMeters,
        type ProfilePoint,
    } from "$lib/measure";

    let { points }: { points: ProfilePoint[] } = $props();

    const padL = 28;
    const padR = 4;
    const padT = 6;
    const W = 208;
    const H = 52;

    function formatRel(m: number): string {
        if (Math.abs(m) < 0.0005) return "0";
        const sign = m > 0 ? "+" : "−";
        return `${sign}${formatDistanceMeters(Math.abs(m))}`;
    }

    const layout = $derived.by(() => {
        if (points.length < 2) return null;
        let minX = points[0]!.x;
        let maxX = points[0]!.x;
        let minY = points[0]!.y;
        let maxY = points[0]!.y;
        for (const p of points) {
            if (p.x < minX) minX = p.x;
            if (p.x > maxX) maxX = p.x;
            if (p.y < minY) minY = p.y;
            if (p.y > maxY) maxY = p.y;
        }
        const dx = maxX - minX || 1;
        const dy = maxY - minY || 1;
        const innerW = W - padL - padR;
        const innerH = H - padT - 4;
        const d = points
            .map((p, i) => {
                const x = padL + ((p.x - minX) / dx) * innerW;
                const y = padT + (1 - (p.y - minY) / dy) * innerH;
                return `${i === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`;
            })
            .join(" ");
        const zeroY = padT + (1 - (0 - minY) / dy) * innerH;
        return { d, zeroY, minY, maxY, maxX };
    });
</script>

{#if layout}
    <svg
        class="mt-0.5 block w-full text-foreground"
        viewBox="0 0 {W} {H}"
        role="img"
        aria-label="Elevation profile, {formatDistanceMeters(layout.maxX)} along, {formatRel(layout.maxY - layout.minY)} relief"
    >
        <line
            x1={padL}
            x2={W - padR}
            y1={layout.zeroY}
            y2={layout.zeroY}
            class="stroke-muted-foreground/35"
            stroke-dasharray="2 2"
            stroke-width="1"
        />
        <path
            d={layout.d}
            fill="none"
            class="stroke-foreground"
            stroke-width="1.5"
            stroke-linejoin="round"
            stroke-linecap="round"
        />
        <text
            x="1"
            y={padT + 7}
            class="fill-muted-foreground"
            font-size="8">{formatRel(layout.maxY)}</text
        >
        <text
            x="1"
            y={H - 2}
            class="fill-muted-foreground"
            font-size="8">{formatRel(layout.minY)}</text
        >
    </svg>
{/if}
