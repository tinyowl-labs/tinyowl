/** Shared Cesium loader. Default is the IIFE `/cesium/Cesium.js`; ESM engine is opt-in. */

let loadPromise: Promise<any> | null = null;

export function loadCesiumGlobal(): Promise<any> {
    if (typeof window === "undefined") {
        return Promise.reject(new Error("Cesium requires a browser"));
    }
    if ((window as any).Cesium) return Promise.resolve((window as any).Cesium);
    if (loadPromise) return loadPromise;

    loadPromise = (async () => {
        try {
            const { preferCesiumEngine, loadCesiumEngine } = await import(
                "./cesiumEngine"
            );
            if (preferCesiumEngine()) {
                try {
                    const ns = await loadCesiumEngine();
                    (window as any).Cesium = ns;
                    (window as any).__tinyowlCesiumLoader = "engine";
                    return ns;
                } catch (e) {
                    console.warn(
                        "Cesium engine ESM failed; falling back to Cesium.js",
                        e,
                    );
                }
            }
            (window as any).CESIUM_BASE_URL = "/cesium/";
            if (
                !document.querySelector(
                    'link[href="/cesium/Widgets/widgets.css"]',
                )
            ) {
                const link = document.createElement("link");
                link.rel = "stylesheet";
                link.href = "/cesium/Widgets/widgets.css";
                document.head.appendChild(link);
            }
            await new Promise<void>((resolve, reject) => {
                if ((window as any).Cesium) {
                    resolve();
                    return;
                }
                const existing = document.querySelector(
                    'script[src="/cesium/Cesium.js"]',
                ) as HTMLScriptElement | null;

                const settle = (ok: boolean, err?: Error) => {
                    if (ok) resolve();
                    else reject(err ?? new Error("Failed to load Cesium.js"));
                };

                const watch = (el: HTMLScriptElement) => {
                    let done = false;
                    let poll: ReturnType<typeof setInterval> | undefined;
                    const finish = (ok: boolean, err?: Error) => {
                        if (done) return;
                        done = true;
                        if (poll != null) clearInterval(poll);
                        el.removeEventListener("load", onLoad);
                        el.removeEventListener("error", onError);
                        settle(ok, err);
                    };
                    const onLoad = () => {
                        if ((window as any).Cesium) finish(true);
                        else
                            finish(
                                false,
                                new Error(
                                    "Cesium.js loaded but Cesium global missing",
                                ),
                            );
                    };
                    const onError = () =>
                        finish(false, new Error("Failed to load Cesium.js"));
                    el.addEventListener("load", onLoad);
                    el.addEventListener("error", onError);
                    // load may have already fired before listeners attached.
                    poll = setInterval(() => {
                        if ((window as any).Cesium) finish(true);
                    }, 50);
                    setTimeout(() => {
                        if ((window as any).Cesium) finish(true);
                        else if (!done)
                            finish(
                                false,
                                new Error("Timed out loading Cesium.js"),
                            );
                    }, 15_000);
                };

                if (existing) {
                    watch(existing);
                    return;
                }
                const s = document.createElement("script");
                s.src = "/cesium/Cesium.js";
                s.onload = () => {
                    if ((window as any).Cesium) settle(true);
                    else
                        settle(
                            false,
                            new Error(
                                "Cesium.js loaded but Cesium global missing",
                            ),
                        );
                };
                s.onerror = () =>
                    settle(false, new Error("Failed to load Cesium.js"));
                document.head.appendChild(s);
            });
            (window as any).__tinyowlCesiumLoader = "iife";
            return (window as any).Cesium;
        } catch (e) {
            // Allow a later caller to retry after a transient failure.
            loadPromise = null;
            throw e;
        }
    })();

    return loadPromise;
}

export function destroyCesiumViewer(viewer: any) {
    try {
        viewer?.destroy?.();
    } catch {
        /* ignore */
    }
}

/**
 * High-contrast entity/measure labels for light (and dimmed-light) basemaps.
 * Outline alone washes out on OSM — use a dark pill background.
 */
export function cesiumMapLabel(
    Cesium: any,
    text: string,
    opts: {
        font?: string;
        pixelOffsetY?: number;
        verticalOrigin?: unknown;
    } = {},
) {
    return {
        text,
        font: opts.font ?? "600 13px ui-sans-serif, system-ui, sans-serif",
        fillColor: Cesium.Color.WHITE,
        outlineColor: Cesium.Color.BLACK,
        outlineWidth: 2,
        style: Cesium.LabelStyle.FILL_AND_OUTLINE,
        showBackground: true,
        backgroundColor: Cesium.Color.fromCssColorString("#0b0b0b").withAlpha(
            0.78,
        ),
        backgroundPadding: new Cesium.Cartesian2(8, 5),
        verticalOrigin:
            opts.verticalOrigin ?? Cesium.VerticalOrigin.BOTTOM,
        pixelOffset: new Cesium.Cartesian2(0, opts.pixelOffsetY ?? -14),
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
    };
}
