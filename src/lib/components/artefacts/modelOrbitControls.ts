/**
 * Z-up OrbitControls-style navigation for local model preview.
 * Azimuth around +Z; polar angle from +Z (0 = above looking down).
 * Matches ENU / GIS convention after we reorient assets so +Z is up.
 */

const EPS = 1e-6;
const TWO_PI = Math.PI * 2;

export type OrbitSpherical = {
    radius: number;
    /** Polar angle from +Z (0 = top-down, π/2 = horizontal). */
    phi: number;
    /** Azimuth in the XY plane from +X toward +Y. */
    theta: number;
};

export function defaultSpherical(radius: number): OrbitSpherical {
    // Slightly elevated oblique view.
    return {
        radius: Math.max(radius, EPS),
        phi: Math.PI / 2 - 0.44,
        theta: Math.PI / 6,
    };
}

export function sphericalFromOffset(
    x: number,
    y: number,
    z: number,
): OrbitSpherical {
    const radius = Math.hypot(x, y, z);
    if (radius < EPS) return defaultSpherical(1);
    return {
        radius,
        phi: Math.acos(Math.min(1, Math.max(-1, z / radius))),
        theta: Math.atan2(y, x),
    };
}

export function offsetFromSpherical(s: OrbitSpherical): {
    x: number;
    y: number;
    z: number;
} {
    const sinPhi = Math.sin(s.phi);
    return {
        x: s.radius * sinPhi * Math.cos(s.theta),
        y: s.radius * sinPhi * Math.sin(s.theta),
        z: s.radius * Math.cos(s.phi),
    };
}

export function makeSphericalSafe(s: OrbitSpherical): OrbitSpherical {
    return {
        radius: Math.max(s.radius, EPS),
        phi: Math.min(Math.PI - EPS, Math.max(EPS, s.phi)),
        theta: s.theta,
    };
}

export function applyRotate(
    s: OrbitSpherical,
    dxPx: number,
    dyPx: number,
    clientHeight: number,
    rotateSpeed = 1,
): OrbitSpherical {
    const h = Math.max(clientHeight, 1);
    const dTheta = (-TWO_PI * dxPx * rotateSpeed) / h;
    const dPhi = (-TWO_PI * dyPx * rotateSpeed) / h;
    return makeSphericalSafe({
        radius: s.radius,
        theta: s.theta + dTheta,
        phi: s.phi + dPhi,
    });
}

export function panDelta(
    dxPx: number,
    dyPx: number,
    radius: number,
    clientHeight: number,
): { right: number; up: number } {
    const h = Math.max(clientHeight, 1);
    const k = (2 * radius) / h;
    return {
        right: -dxPx * k,
        up: dyPx * k,
    };
}

export function dollyRadius(
    radius: number,
    deltaY: number,
    zoomSpeed = 1,
    minRadius = EPS,
): number {
    const normalized = Math.abs(deltaY) * 0.01;
    const dollyScale = Math.pow(0.95, zoomSpeed * normalized);
    const next = deltaY < 0 ? radius * dollyScale : radius / dollyScale;
    return Math.max(minRadius, next);
}
