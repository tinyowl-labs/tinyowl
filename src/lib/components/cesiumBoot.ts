/** Shared Cesium.js global loader for secondary 2D maps. */

let loadPromise: Promise<any> | null = null;

export function loadCesiumGlobal(): Promise<any> {
    if (typeof window === "undefined") {
        return Promise.reject(new Error("Cesium requires a browser"));
    }
    if ((window as any).Cesium) return Promise.resolve((window as any).Cesium);
    if (loadPromise) return loadPromise;

    loadPromise = (async () => {
        try {
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
            return (window as any).Cesium;
        } catch (e) {
            // Allow a later caller to retry after a transient failure.
            loadPromise = null;
            throw e;
        }
    })();

    return loadPromise;
}

export type CesiumViewerOpts = {
    interactive?: boolean;
    scene2D?: boolean;
    /** When false, keep continuous render (better for small marker maps). */
    requestRenderMode?: boolean;
};

/** Cesium fromCssColorString misses modern `rgb(r g b)` — parse safely. */
export function cesiumColorFromCss(
    Cesium: any,
    css: string | undefined,
    fallbackHex = "#3b82f6",
): any {
    const tryOne = (raw: string) => {
        if (!raw || !Cesium) return null;
        const via = Cesium.Color.fromCssColorString(raw);
        if (via) return via;
        const m = raw.match(
            /rgba?\(\s*([\d.]+)[%]?\s*[, ]\s*([\d.]+)[%]?\s*[, ]\s*([\d.]+)[%]?(?:\s*[,/]\s*([\d.]+%?))?\s*\)/i,
        );
        if (!m) return null;
        const to01 = (v: string, isAlpha = false) => {
            const n = parseFloat(v);
            if (isAlpha) return v.endsWith("%") ? n / 100 : n > 1 ? n / 255 : n;
            return n > 1 ? n / 255 : n;
        };
        return new Cesium.Color(
            to01(m[1]!),
            to01(m[2]!),
            to01(m[3]!),
            m[4] != null ? to01(m[4], true) : 1,
        );
    };
    return (
        tryOne((css ?? "").trim()) ??
        tryOne(fallbackHex) ??
        Cesium?.Color?.fromCssColorString?.(fallbackHex) ??
        Cesium?.Color?.DODGERBLUE ??
        null
    );
}

/** Minimal Cesium Viewer for secondary maps (home / search / bbox thumb). */
export function createCesiumMap(
    Cesium: any,
    el: HTMLElement,
    creditSink: HTMLElement,
    opts: CesiumViewerOpts = {},
): any {
    const interactive = opts.interactive !== false;
    const requestRenderMode = opts.requestRenderMode !== false;
    const viewer = new Cesium.Viewer(el, {
        animation: false,
        timeline: false,
        baseLayerPicker: false,
        geocoder: false,
        homeButton: false,
        sceneModePicker: false,
        selectionIndicator: false,
        navigationHelpButton: false,
        fullscreenButton: false,
        infoBox: false,
        creditContainer: creditSink,
        requestRenderMode,
        maximumRenderTimeChange: Infinity,
        baseLayer: new Cesium.ImageryLayer(
            new Cesium.UrlTemplateImageryProvider({
                // CARTO light (no labels) — cleaner than OSM for map chrome.
                url: "https://basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}.png",
                maximumLevel: 19,
                credit: "",
            }),
        ),
    });
    if (opts.scene2D !== false) {
        viewer.scene.mode = Cesium.SceneMode.SCENE2D;
    }
    viewer.scene.globe.depthTestAgainstTerrain = false;
    viewer.scene.globe.showGroundAtmosphere = false;
    viewer.scene.skyAtmosphere.show = false;
    if (viewer.scene.sun) viewer.scene.sun.show = false;
    if (viewer.scene.moon) viewer.scene.moon.show = false;
    if (viewer.scene.skyBox) viewer.scene.skyBox.show = false;
    // Flat map controls — no tilt/roll in 2D shells.
    const ctrl = viewer.scene.screenSpaceCameraController;
    ctrl.enableTilt = false;
    ctrl.enableLook = false;
    ctrl.minimumZoomDistance = 100;
    ctrl.maximumZoomDistance = 40_000_000;

    if (!interactive) {
        ctrl.enableRotate = false;
        ctrl.enableTranslate = false;
        ctrl.enableZoom = false;
    }

    // Ensure canvas picks up container size (esp. requestRenderMode).
    queueMicrotask(() => {
        try {
            viewer.resize();
            viewer.scene.requestRender();
        } catch {
            /* ignore */
        }
    });

    return viewer;
}

export function tuneCesiumBasemap(viewer: any, Cesium: any, dark: boolean) {
    const bg = dark
        ? Cesium.Color.fromCssColorString("#1a1a1a")
        : Cesium.Color.fromCssColorString("#f5f5f5");
    viewer.scene.backgroundColor = bg;
    viewer.scene.globe.baseColor = bg;
    const layer = viewer.imageryLayers.length
        ? viewer.imageryLayers.get(0)
        : null;
    if (!layer) return;
    // Skip mipmaps — cuts generateMipmap lazy-init stutter in Firefox.
    if (Cesium.TextureMinificationFilter) {
        layer.minificationFilter = Cesium.TextureMinificationFilter.LINEAR;
        layer.magnificationFilter = Cesium.TextureMagnificationFilter.LINEAR;
    }
    if (dark) {
        layer.brightness = 0.84;
        layer.saturation = 0.92;
        layer.contrast = 1.04;
        layer.gamma = 0.96;
    } else {
        layer.brightness = 1;
        layer.saturation = 1.08;
        layer.contrast = 1;
        layer.gamma = 1;
    }
}

export function destroyCesiumViewer(viewer: any) {
    try {
        viewer?.destroy?.();
    } catch {
        /* ignore */
    }
}

/** Haversine distance in metres. */
export function haversineMetres(
    lat1: number,
    lng1: number,
    lat2: number,
    lng2: number,
): number {
    const R = 6371000;
    const toRad = (d: number) => (d * Math.PI) / 180;
    const dLat = toRad(lat2 - lat1);
    const dLng = toRad(lng2 - lng1);
    const a =
        Math.sin(dLat / 2) ** 2 +
        Math.cos(toRad(lat1)) *
            Math.cos(toRad(lat2)) *
            Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}

/** Approximate circle as a polygon (degrees). */
export function circlePositions(
    Cesium: any,
    lat: number,
    lng: number,
    radiusM: number,
    steps = 64,
): any[] {
    const out: any[] = [];
    const R = 6371000;
    const angDist = radiusM / R;
    const lat1 = (lat * Math.PI) / 180;
    const lng1 = (lng * Math.PI) / 180;
    for (let i = 0; i <= steps; i++) {
        const brng = (2 * Math.PI * i) / steps;
        const lat2 = Math.asin(
            Math.sin(lat1) * Math.cos(angDist) +
                Math.cos(lat1) * Math.sin(angDist) * Math.cos(brng),
        );
        const lng2 =
            lng1 +
            Math.atan2(
                Math.sin(brng) * Math.sin(angDist) * Math.cos(lat1),
                Math.cos(angDist) - Math.sin(lat1) * Math.sin(lat2),
            );
        out.push(
            Cesium.Cartesian3.fromDegrees(
                (lng2 * 180) / Math.PI,
                (lat2 * 180) / Math.PI,
                0,
            ),
        );
    }
    return out;
}

export function pickLatLng(
    viewer: any,
    Cesium: any,
    screenPosition: { x: number; y: number },
): { lat: number; lng: number } | null {
    const ray = viewer.camera.getPickRay(screenPosition);
    if (!ray) return null;
    const cartesian = viewer.scene.globe.pick(ray, viewer.scene);
    if (!cartesian) return null;
    const carto = Cesium.Cartographic.fromCartesian(cartesian);
    return {
        lat: Cesium.Math.toDegrees(carto.latitude),
        lng: Cesium.Math.toDegrees(carto.longitude),
    };
}

export function viewRectangle(viewer: any, Cesium: any) {
    const rect = viewer.camera.computeViewRectangle();
    if (!rect) return null;
    return {
        west: Cesium.Math.toDegrees(rect.west),
        south: Cesium.Math.toDegrees(rect.south),
        east: Cesium.Math.toDegrees(rect.east),
        north: Cesium.Math.toDegrees(rect.north),
    };
}
