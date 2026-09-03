/**
 * Opt-in ESM Cesium loader (@cesium/engine + CesiumWidget).
 * Kept off the default path: prebundling the IIFE/atlas has broken WebGL before.
 */

const LOADER_KEY = "tinyowl:cesium-loader";

export function preferCesiumEngine(): boolean {
    if (typeof window === "undefined") return false;
    try {
        const q = new URLSearchParams(window.location.search);
        const flag = q.get("cesium");
        if (flag === "engine") {
            window.localStorage.setItem(LOADER_KEY, "engine");
            return true;
        }
        if (flag === "iife") {
            window.localStorage.removeItem(LOADER_KEY);
            return false;
        }
        return window.localStorage.getItem(LOADER_KEY) === "engine";
    } catch {
        return false;
    }
}

/**
 * Named engine namespace that looks like `window.Cesium`.
 * `Viewer` is aliased to `CesiumWidget` (chrome-free; dataSources/flyTo exist in 1.138).
 */
export async function loadCesiumEngine(): Promise<any> {
    if (typeof window === "undefined") {
        throw new Error("Cesium requires a browser");
    }
    (window as any).CESIUM_BASE_URL = "/cesium/";
    await import("@cesium/engine/Source/Widget/CesiumWidget.css");
    const mod: any = await import("@cesium/engine");
    const Engine = typeof mod?.CesiumWidget === "function" ? mod : mod?.default;
    const Widget = Engine?.CesiumWidget;
    if (typeof Widget !== "function") {
        const keys = Engine ? Object.keys(Engine).slice(0, 24) : [];
        throw new Error(
            `@cesium/engine loaded but CesiumWidget missing (keys: ${keys.join(",")})`,
        );
    }
    return Object.assign(Object.create(null), Engine, { Viewer: Widget });
}
