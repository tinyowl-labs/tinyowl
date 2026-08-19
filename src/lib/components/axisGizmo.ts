/**
 * Local RGB axis triad for model / pivot preview.
 * Uses PolylineCollection (stable) instead of DebugModelMatrixPrimitive,
 * which can throw mid-frame when length/modelMatrix thrash (_va destroy).
 */
export type AxisGizmoUpdate = {
    center: { x: number; y: number; z: number };
    length: number;
    show?: boolean;
};

export type AxisGizmoHandle = {
    update(opts: AxisGizmoUpdate): void;
    setShow(show: boolean): void;
    destroy(): void;
};

export function createAxisGizmo(Cesium: any, scene: any): AxisGizmoHandle {
    let collection: any = null;
    let lineX: any = null;
    let lineY: any = null;
    let lineZ: any = null;
    let visible = true;
    let lastLen = -1;
    let lastCx = NaN;
    let lastCy = NaN;
    let lastCz = NaN;

    function ensure() {
        if (collection) return;
        collection = scene.primitives.add(new Cesium.PolylineCollection());
        const arcType = Cesium.ArcType?.NONE;
        const common: Record<string, unknown> = {
            width: 2,
        };
        if (arcType != null) common.arcType = arcType;
        lineX = collection.add({
            ...common,
            positions: [Cesium.Cartesian3.ZERO, Cesium.Cartesian3.UNIT_X],
            material: Cesium.Material.fromType("Color", {
                color: Cesium.Color.RED,
            }),
        });
        lineY = collection.add({
            ...common,
            positions: [Cesium.Cartesian3.ZERO, Cesium.Cartesian3.UNIT_Y],
            material: Cesium.Material.fromType("Color", {
                color: Cesium.Color.LIME,
            }),
        });
        lineZ = collection.add({
            ...common,
            positions: [Cesium.Cartesian3.ZERO, Cesium.Cartesian3.UNIT_Z],
            material: Cesium.Material.fromType("Color", {
                color: Cesium.Color.DODGERBLUE,
            }),
        });
    }

    function setAxis(
        line: any,
        origin: any,
        axis: "x" | "y" | "z",
        length: number,
    ) {
        const tip = Cesium.Cartesian3.clone(origin);
        if (axis === "x") tip.x += length;
        else if (axis === "y") tip.y += length;
        else tip.z += length;
        line.positions = [origin, tip];
    }

    function update(opts: AxisGizmoUpdate) {
        ensure();
        const length = Math.max(opts.length, 0.02);
        const show = opts.show !== false && visible;
        const c = opts.center;
        const unchanged =
            length === lastLen &&
            c.x === lastCx &&
            c.y === lastCy &&
            c.z === lastCz &&
            collection.show === show;
        if (unchanged) return;

        lastLen = length;
        lastCx = c.x;
        lastCy = c.y;
        lastCz = c.z;

        const origin = new Cesium.Cartesian3(c.x, c.y, c.z);
        setAxis(lineX, origin, "x", length);
        setAxis(lineY, origin, "y", length);
        setAxis(lineZ, origin, "z", length);
        collection.show = show;
        scene.requestRender?.();
    }

    function setShow(show: boolean) {
        visible = show;
        if (collection) {
            collection.show = show;
            scene.requestRender?.();
        }
    }

    function destroy() {
        const col = collection;
        collection = null;
        lineX = lineY = lineZ = null;
        lastLen = -1;
        if (!col) return;
        try {
            col.show = false;
        } catch {
            /* ignore */
        }
        // Defer remove so we don't yank GPU resources mid-draw command.
        queueMicrotask(() => {
            try {
                if (!col.isDestroyed?.()) scene.primitives.remove(col);
            } catch {
                /* ignore */
            }
        });
    }

    return { update, setShow, destroy };
}

/** World length so the triad spans ~`screenFrac` of the view height at `distance`. */
export function axisGizmoLengthForView(
    distance: number,
    fovYRadians: number,
    screenFrac = 0.12,
): number {
    const d = Math.max(distance, 1e-4);
    const halfH = Math.tan(Math.max(fovYRadians, 0.05) * 0.5) * d;
    return Math.max(halfH * 2 * screenFrac, 1e-4);
}

/** Sensible triad length from a bounding radius (local units). */
export function axisGizmoLengthFromRadius(radius: number): number {
    const r = Math.max(radius, 0.01);
    return Math.min(Math.max(r * 0.08, 0.05), r * 0.25);
}
