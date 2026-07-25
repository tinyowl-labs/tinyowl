<script lang="ts">
    /**
     * Screen-space East / North / Up widget (bottom-left).
     * Tracks camera orientation only — not a world primitive.
     */
    import { onDestroy } from "svelte";

    type Props = {
        Cesium: any;
        viewer: any;
        show?: boolean;
        class?: string;
    };

    let {
        Cesium,
        viewer,
        show = true,
        class: klass = "",
    }: Props = $props();

    const size = 72;
    const cx = size / 2;
    const cy = size / 2;
    const arm = 26;

    let lineE = $state<SVGLineElement | undefined>();
    let lineN = $state<SVGLineElement | undefined>();
    let lineU = $state<SVGLineElement | undefined>();
    let textE = $state<SVGTextElement | undefined>();
    let textN = $state<SVGTextElement | undefined>();
    let textU = $state<SVGTextElement | undefined>();

    let removeListener: (() => void) | null = null;

    function setAxis(
        line: SVGLineElement | undefined,
        text: SVGTextElement | undefined,
        x: number,
        y: number,
        into: number,
    ) {
        if (!line || !text) return;
        const tx = cx + x * arm;
        const ty = cy - y * arm;
        const opacity = String(
            0.4 + 0.6 * Math.min(1, Math.hypot(x, y) * 0.9 + Math.max(0, into) * 0.1),
        );
        line.setAttribute("x2", String(tx));
        line.setAttribute("y2", String(ty));
        line.setAttribute("opacity", opacity);
        text.setAttribute("x", String(tx));
        text.setAttribute("y", String(ty));
        text.setAttribute("opacity", opacity);
    }

    function refresh() {
        if (!show || !viewer || !Cesium || viewer.isDestroyed?.()) return;
        try {
            const camera = viewer.camera;
            const enu = Cesium.Transforms.eastNorthUpToFixedFrame(
                camera.positionWC,
            );
            const scratch = new Cesium.Cartesian3();
            const axes: Array<[number, SVGLineElement | undefined, SVGTextElement | undefined]> = [
                [0, lineE, textE],
                [1, lineN, textN],
                [2, lineU, textU],
            ];
            for (const [col, line, text] of axes) {
                const local =
                    col === 0
                        ? Cesium.Cartesian3.UNIT_X
                        : col === 1
                          ? Cesium.Cartesian3.UNIT_Y
                          : Cesium.Cartesian3.UNIT_Z;
                const world = Cesium.Matrix4.multiplyByPointAsVector(
                    enu,
                    local,
                    scratch,
                );
                Cesium.Cartesian3.normalize(world, world);
                setAxis(
                    line,
                    text,
                    Cesium.Cartesian3.dot(world, camera.right),
                    Cesium.Cartesian3.dot(world, camera.up),
                    Cesium.Cartesian3.dot(world, camera.direction),
                );
            }
        } catch {
            /* ignore */
        }
    }

    function bind() {
        removeListener?.();
        removeListener = null;
        if (!viewer?.scene || !show) return;
        refresh();
        removeListener = viewer.scene.postRender.addEventListener(() => {
            refresh();
        });
    }

    $effect(() => {
        void viewer;
        void Cesium;
        void show;
        void lineE;
        void lineN;
        void lineU;
        bind();
    });

    onDestroy(() => {
        removeListener?.();
        removeListener = null;
    });
</script>

{#if show}
    <div
        class="pointer-events-none absolute bottom-3 left-3 z-20 select-none {klass}"
        aria-hidden="true"
        title="East / North / Up"
    >
        <svg
            width={size}
            height={size}
            viewBox="0 0 {size} {size}"
            class="drop-shadow-md"
        >
            <circle
                cx={cx}
                cy={cy}
                r="30"
                fill="rgba(0,0,0,0.35)"
                stroke="rgba(255,255,255,0.12)"
                stroke-width="1"
            />
            <line
                bind:this={lineE}
                x1={cx}
                y1={cy}
                x2={cx + arm}
                y2={cy}
                stroke="#ef4444"
                stroke-width="2"
                stroke-linecap="round"
            />
            <text
                bind:this={textE}
                x={cx + arm}
                y={cy}
                fill="#ef4444"
                font-size="10"
                font-weight="600"
                text-anchor="middle"
                dominant-baseline="central">E</text
            >
            <line
                bind:this={lineN}
                x1={cx}
                y1={cy}
                x2={cx}
                y2={cy - arm}
                stroke="#22c55e"
                stroke-width="2"
                stroke-linecap="round"
            />
            <text
                bind:this={textN}
                x={cx}
                y={cy - arm}
                fill="#22c55e"
                font-size="10"
                font-weight="600"
                text-anchor="middle"
                dominant-baseline="central">N</text
            >
            <line
                bind:this={lineU}
                x1={cx}
                y1={cy}
                x2={cx}
                y2={cy + arm}
                stroke="#3b82f6"
                stroke-width="2"
                stroke-linecap="round"
            />
            <text
                bind:this={textU}
                x={cx}
                y={cy + arm}
                fill="#3b82f6"
                font-size="9"
                font-weight="600"
                text-anchor="middle"
                dominant-baseline="central">Up</text
            >
        </svg>
    </div>
{/if}
