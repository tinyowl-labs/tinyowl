<script lang="ts">
    /**
     * Local-space 3D preview (no globe).
     * Assets are reoriented so +Z is up, then navigated with simple
     * OrbitControls-style turntable (left orbit, right pan, scroll zoom).
     */
    import { onDestroy, onMount } from "svelte";
    import {
        destroyCesiumViewer,
        loadCesiumGlobal,
    } from "$lib/components/cesiumBoot";
    import {
        axisGizmoLengthForView,
        createAxisGizmo,
        type AxisGizmoHandle,
    } from "$lib/components/axisGizmo";
    import {
        applyRotate,
        defaultSpherical,
        dollyRadius,
        makeSphericalSafe,
        offsetFromSpherical,
        panDelta,
        sphericalFromOffset,
        type OrbitSpherical,
    } from "$lib/components/artefacts/modelOrbitControls";
    import CesiumLoading from "$lib/components/CesiumLoading.svelte";

    type Props = {
        url: string;
        accessToken?: string;
        kind?: "tileset" | "gltf";
        class?: string;
        interactive?: boolean;
    };

    let {
        url,
        accessToken = "",
        kind = "tileset",
        class: klass = "",
        interactive = true,
    }: Props = $props();

    let host = $state<HTMLDivElement | undefined>();
    let creditSink = $state<HTMLDivElement | undefined>();
    let loading = $state(true);
    let error = $state("");
    let pickHint = $state(
        "Left-drag orbit · right-drag pan · scroll zoom · double-click sets pivot",
    );

    let viewer: any = null;
    let Cesium: any = null;
    let viewerReady = $state(false);
    let loadGen = 0;
    let removeTileListener: (() => void) | null = null;
    let removeInput: (() => void) | null = null;
    let axisGizmo: AxisGizmoHandle | null = null;
    let loadedPrim: any = null;
    let homeTarget: any = null;
    let orbitTarget: any = null;

    let orbit = {
        minRange: 1e-4,
        gizmoLength: 1,
    };
    /** Z-up spherical orbit (GIS / ENU convention). */
    let spherical: OrbitSpherical = defaultSpherical(10);

    function authResource(CesiumLib: any, href: string) {
        return new CesiumLib.Resource({
            url: href,
            queryParameters: accessToken ? { token: accessToken } : {},
            headers: accessToken
                ? { Authorization: `Bearer ${accessToken}` }
                : {},
        });
    }

    function disableDefaultControls(v: any) {
        const ctrl = v.scene.screenSpaceCameraController;
        ctrl.enableInputs = false;
        ctrl.enableRotate = false;
        ctrl.enableTranslate = false;
        ctrl.enableZoom = false;
        ctrl.enableTilt = false;
        ctrl.enableLook = false;
        ctrl.enableCollisionDetection = false;
        ctrl.minimumZoomDistance = 0;
        ctrl.maximumZoomDistance = Number.POSITIVE_INFINITY;
    }

    function stripEarthChrome(v: any, CesiumLib: any) {
        if (v.scene.globe) v.scene.globe.show = false;
        if (v.scene.skyAtmosphere) v.scene.skyAtmosphere.show = false;
        if (v.scene.fog) v.scene.fog.enabled = false;
        if (v.scene.sun) v.scene.sun.show = false;
        if (v.scene.moon) v.scene.moon.show = false;
        if (v.scene.skyBox) v.scene.skyBox.show = false;
        try {
            v.imageryLayers?.removeAll?.();
        } catch {
            /* ignore */
        }
        v.scene.backgroundColor =
            CesiumLib.Color.fromCssColorString("#141414");
        v.scene.pickTranslucentDepth = true;
        disableDefaultControls(v);
    }

    function primitiveBoundingSphere(prim: any): any | null {
        if (!prim || !Cesium) return null;
        try {
            const bs = prim.boundingSphere ?? prim.boundingSphere3D ?? null;
            if (
                bs &&
                Cesium.defined(bs.radius) &&
                Number.isFinite(bs.radius) &&
                bs.radius > 0 &&
                Number.isFinite(bs.center?.x)
            ) {
                return Cesium.BoundingSphere.clone(bs);
            }
        } catch {
            /* ignore */
        }
        return null;
    }

    /**
     * Put the asset at the origin with +Z up.
     * - ECEF tilesets → inverse ENU (X east, Y north, Z up)
     * - glTF → translate then RotX(-90°) so Y-up becomes Z-up
     * - local tilesets → translate only (assumed Z-up)
     */
    function placeInLocalZUp(prim: any, sphere: any) {
        if (!Cesium || !prim || !sphere) return;
        const center = sphere.center;
        const mag = Cesium.Cartesian3.magnitude(center);

        if (mag > 1e5) {
            const enu = Cesium.Transforms.eastNorthUpToFixedFrame(center);
            prim.modelMatrix = Cesium.Matrix4.inverseTransformation(
                enu,
                new Cesium.Matrix4(),
            );
            return;
        }

        const toOrigin = Cesium.Matrix4.fromTranslation(
            Cesium.Cartesian3.negate(center, new Cesium.Cartesian3()),
        );
        if (kind === "gltf") {
            const yUpToZUp = Cesium.Matrix4.fromRotationTranslation(
                Cesium.Matrix3.fromRotationX(-Math.PI / 2),
                Cesium.Cartesian3.ZERO,
            );
            prim.modelMatrix = Cesium.Matrix4.multiply(
                yUpToZUp,
                toOrigin,
                new Cesium.Matrix4(),
            );
            return;
        }
        prim.modelMatrix = toOrigin;
    }

    function destroyGizmo() {
        axisGizmo?.destroy();
        axisGizmo = null;
    }

    function updateGizmo() {
        if (!viewer || !Cesium || !orbitTarget) return;
        if (!axisGizmo) {
            axisGizmo = createAxisGizmo(Cesium, viewer.scene);
        }
        const frustum = viewer.camera?.frustum;
        const fov =
            typeof frustum?.fovy === "number"
                ? frustum.fovy
                : Cesium.Math.toRadians(60);
        orbit.gizmoLength = axisGizmoLengthForView(
            spherical.radius,
            fov,
            0.12,
        );
        axisGizmo.update({
            center: orbitTarget,
            length: orbit.gizmoLength,
            show: true,
        });
    }

    function currentOffset(): any {
        const o = offsetFromSpherical(spherical);
        return new Cesium.Cartesian3(o.x, o.y, o.z);
    }

    function syncSphericalFromEye(eye: any, target: any) {
        if (!Cesium) return;
        const off = Cesium.Cartesian3.subtract(
            eye,
            target,
            new Cesium.Cartesian3(),
        );
        spherical = makeSphericalSafe(
            sphericalFromOffset(off.x, off.y, off.z),
        );
        if (spherical.radius < orbit.minRange) {
            spherical = { ...spherical, radius: orbit.minRange };
        }
    }

    function setOrbitTarget(worldPos: any, preserveView: boolean) {
        if (!viewer || !Cesium || !worldPos) return;
        if (preserveView) {
            syncSphericalFromEye(viewer.camera.positionWC, worldPos);
        }
        orbitTarget = Cesium.Cartesian3.clone(worldPos);
        updateGizmo();
        applyOrbitCamera();
    }

    /** Fixed world +Z turntable basis. */
    function cameraBasis(offset: any): {
        direction: any;
        right: any;
        up: any;
    } | null {
        if (!Cesium || !orbitTarget) return null;
        const eye = Cesium.Cartesian3.add(
            orbitTarget,
            offset,
            new Cesium.Cartesian3(),
        );
        const direction = Cesium.Cartesian3.normalize(
            Cesium.Cartesian3.subtract(
                orbitTarget,
                eye,
                new Cesium.Cartesian3(),
            ),
            new Cesium.Cartesian3(),
        );
        let right = Cesium.Cartesian3.cross(
            direction,
            Cesium.Cartesian3.UNIT_Z,
            new Cesium.Cartesian3(),
        );
        if (Cesium.Cartesian3.magnitudeSquared(right) < 1e-10) {
            Cesium.Cartesian3.cross(
                direction,
                Cesium.Cartesian3.UNIT_X,
                right,
            );
        }
        Cesium.Cartesian3.normalize(right, right);
        const up = Cesium.Cartesian3.normalize(
            Cesium.Cartesian3.cross(right, direction, new Cesium.Cartesian3()),
            new Cesium.Cartesian3(),
        );
        return { direction, right, up };
    }

    function applyOrbitCamera() {
        if (!viewer || !Cesium || !orbitTarget) return;
        try {
            viewer.camera.lookAtTransform(Cesium.Matrix4.IDENTITY);
        } catch {
            /* ignore */
        }

        spherical = makeSphericalSafe({
            ...spherical,
            radius: Math.max(spherical.radius, orbit.minRange),
        });
        const offset = currentOffset();
        const range = spherical.radius;

        try {
            const frustum = viewer.camera.frustum;
            if (frustum && typeof frustum.near === "number") {
                frustum.near = Math.min(0.1, range * 0.01);
                frustum.far = Math.max(frustum.far ?? 1e7, range * 100);
            }
        } catch {
            /* ignore */
        }

        const basis = cameraBasis(offset);
        if (!basis) return;
        const eye = Cesium.Cartesian3.add(
            orbitTarget,
            offset,
            new Cesium.Cartesian3(),
        );
        viewer.camera.setView({
            destination: eye,
            orientation: {
                direction: basis.direction,
                up: basis.up,
            },
        });
        updateGizmo();
        viewer.scene.requestRender?.();
    }

    function rotateOrbit(dx: number, dy: number, canvas: HTMLCanvasElement) {
        spherical = applyRotate(spherical, dx, dy, canvas.clientHeight, 1);
        applyOrbitCamera();
    }

    function panOrbitTarget(
        dxPx: number,
        dyPx: number,
        canvas: HTMLCanvasElement,
    ) {
        if (!Cesium || !orbitTarget) return;
        const offset = currentOffset();
        const basis = cameraBasis(offset);
        if (!basis) return;
        const { right: dr, up: du } = panDelta(
            dxPx,
            dyPx,
            spherical.radius,
            canvas.clientHeight,
        );
        const move = new Cesium.Cartesian3();
        Cesium.Cartesian3.multiplyByScalar(basis.right, dr, move);
        const upMove = Cesium.Cartesian3.multiplyByScalar(
            basis.up,
            du,
            new Cesium.Cartesian3(),
        );
        Cesium.Cartesian3.add(move, upMove, move);
        Cesium.Cartesian3.add(orbitTarget, move, orbitTarget);
        applyOrbitCamera();
    }

    function pickWorldPosition(
        canvasX: number,
        canvasY: number,
    ): any | null {
        if (!viewer || !Cesium) return null;
        try {
            viewer.scene.render?.();
        } catch {
            /* ignore */
        }
        const pos = new Cesium.Cartesian2(canvasX, canvasY);
        try {
            if (viewer.scene.pickPositionSupported) {
                const hit = viewer.scene.pickPosition(pos);
                if (Cesium.defined(hit)) return hit;
            }
        } catch {
            /* ignore */
        }
        return null;
    }

    function canvasLocalXY(
        e: { clientX: number; clientY: number },
        canvas: HTMLCanvasElement,
    ) {
        const rect = canvas.getBoundingClientRect();
        const scaleX = canvas.clientWidth / Math.max(rect.width, 1);
        const scaleY = canvas.clientHeight / Math.max(rect.height, 1);
        return {
            x: (e.clientX - rect.left) * scaleX,
            y: (e.clientY - rect.top) * scaleY,
        };
    }

    function resetPivotHome() {
        if (!homeTarget) return;
        orbitTarget = Cesium.Cartesian3.clone(homeTarget);
        const r =
            loadedPrim != null
                ? Math.max(
                      primitiveBoundingSphere(loadedPrim)?.radius ?? 1,
                      0.01,
                  )
                : spherical.radius / 2.4;
        spherical = defaultSpherical(r * 2.4);
        updateGizmo();
        applyOrbitCamera();
        pickHint =
            "Left-drag orbit · right-drag pan · scroll zoom · double-click sets pivot";
    }

    function setupOrbitInput() {
        removeInput?.();
        removeInput = null;
        if (!viewer || !interactive) return;

        const canvas: HTMLCanvasElement | null =
            viewer.scene?.canvas ?? null;
        if (!canvas) return;

        let dragging = false;
        let dragButton = -1;
        let moved = false;
        let lastX = 0;
        let lastY = 0;
        let downX = 0;
        let downY = 0;
        const zoomSens = 1;
        const clickSlop = 5;

        const onPointerDown = (e: PointerEvent) => {
            if (e.button !== 0 && e.button !== 2) return;
            dragging = true;
            dragButton = e.button;
            moved = false;
            lastX = e.clientX;
            lastY = e.clientY;
            downX = e.clientX;
            downY = e.clientY;
            try {
                canvas.setPointerCapture(e.pointerId);
            } catch {
                /* ignore */
            }
            canvas.style.cursor = e.button === 2 ? "move" : "grabbing";
            e.preventDefault();
            e.stopPropagation();
        };
        const onPointerMove = (e: PointerEvent) => {
            let button = dragButton;
            if (!dragging) {
                if ((e.buttons & 2) !== 0) {
                    dragging = true;
                    button = 2;
                    dragButton = 2;
                    lastX = e.clientX;
                    lastY = e.clientY;
                    downX = e.clientX;
                    downY = e.clientY;
                } else if ((e.buttons & 1) !== 0) {
                    dragging = true;
                    button = 0;
                    dragButton = 0;
                    lastX = e.clientX;
                    lastY = e.clientY;
                    downX = e.clientX;
                    downY = e.clientY;
                } else {
                    return;
                }
            }
            const dx = e.clientX - lastX;
            const dy = e.clientY - lastY;
            lastX = e.clientX;
            lastY = e.clientY;
            if (Math.hypot(e.clientX - downX, e.clientY - downY) > clickSlop) {
                moved = true;
            }
            if (button === 2) panOrbitTarget(dx, dy, canvas);
            else rotateOrbit(dx, dy, canvas);
        };
        const onPointerUp = (e: PointerEvent) => {
            if (!dragging && e.button !== dragButton) return;
            dragging = false;
            dragButton = -1;
            canvas.style.cursor = "grab";
            try {
                canvas.releasePointerCapture(e.pointerId);
            } catch {
                /* ignore */
            }
            void moved;
        };
        const onDblClick = (e: MouseEvent) => {
            e.preventDefault();
            const { x, y } = canvasLocalXY(e, canvas);
            const hit = pickWorldPosition(x, y);
            if (hit) {
                setOrbitTarget(hit, true);
                pickHint = "Pivot set · double-click another point to retarget";
            }
        };
        const onWheel = (e: WheelEvent) => {
            e.preventDefault();
            spherical = {
                ...spherical,
                radius: dollyRadius(
                    spherical.radius,
                    e.deltaY,
                    zoomSens,
                    orbit.minRange,
                ),
            };
            applyOrbitCamera();
        };
        const onContextMenu = (e: Event) => {
            e.preventDefault();
            e.stopPropagation();
        };

        canvas.addEventListener("pointerdown", onPointerDown, true);
        canvas.addEventListener("pointermove", onPointerMove, true);
        canvas.addEventListener("pointerup", onPointerUp, true);
        canvas.addEventListener("pointercancel", onPointerUp, true);
        canvas.addEventListener("dblclick", onDblClick);
        canvas.addEventListener("wheel", onWheel, { passive: false });
        canvas.addEventListener("contextmenu", onContextMenu, true);
        canvas.style.touchAction = "none";
        canvas.style.cursor = "grab";

        removeInput = () => {
            canvas.removeEventListener("pointerdown", onPointerDown, true);
            canvas.removeEventListener("pointermove", onPointerMove, true);
            canvas.removeEventListener("pointerup", onPointerUp, true);
            canvas.removeEventListener("pointercancel", onPointerUp, true);
            canvas.removeEventListener("dblclick", onDblClick);
            canvas.removeEventListener("wheel", onWheel);
            canvas.removeEventListener("contextmenu", onContextMenu, true);
            canvas.style.touchAction = "";
            canvas.style.cursor = "";
        };
    }

    function frameAroundOrigin(prim: any) {
        if (!viewer || !Cesium || !prim) return;
        // World BS after Z-up placement — centre should be near origin.
        let sphere = primitiveBoundingSphere(prim);
        if (!sphere) return;

        const dist = Cesium.Cartesian3.magnitude(sphere.center);
        if (dist > Math.max(sphere.radius * 0.05, 0.5)) {
            // Fine-correct residual offset without changing orientation.
            const fix = Cesium.Matrix4.fromTranslation(
                Cesium.Cartesian3.negate(
                    sphere.center,
                    new Cesium.Cartesian3(),
                ),
            );
            prim.modelMatrix = Cesium.Matrix4.multiply(
                fix,
                prim.modelMatrix,
                new Cesium.Matrix4(),
            );
            sphere = primitiveBoundingSphere(prim) ?? sphere;
        }

        const r = Math.max(sphere.radius, 0.01);
        orbit.minRange = 1e-4;
        spherical = defaultSpherical(r * 2.4);

        homeTarget = Cesium.Cartesian3.clone(
            sphere.center ?? Cesium.Cartesian3.ZERO,
        );
        // Prefer true origin as home when nearly centred.
        if (Cesium.Cartesian3.magnitude(homeTarget) < r * 0.02) {
            homeTarget = Cesium.Cartesian3.ZERO.clone
                ? Cesium.Cartesian3.clone(Cesium.Cartesian3.ZERO)
                : new Cesium.Cartesian3(0, 0, 0);
        }
        orbitTarget = Cesium.Cartesian3.clone(homeTarget);
        updateGizmo();
        applyOrbitCamera();
    }

    async function waitForSphere(prim: any, gen: number): Promise<any | null> {
        for (let i = 0; i < 60; i++) {
            if (gen !== loadGen) return null;
            const s = primitiveBoundingSphere(prim);
            if (s) return s;
            await new Promise<void>((r) => requestAnimationFrame(() => r()));
        }
        return primitiveBoundingSphere(prim);
    }

    async function framePrimitive(prim: any, gen: number) {
        if (!viewer || !Cesium) return;
        loadedPrim = prim;
        const sphere = await waitForSphere(prim, gen);
        if (gen !== loadGen || !sphere) return;
        placeInLocalZUp(prim, sphere);
        await new Promise<void>((r) => requestAnimationFrame(() => r()));
        if (gen !== loadGen) return;
        frameAroundOrigin(prim);
    }

    async function loadContent() {
        const gen = ++loadGen;
        loading = true;
        error = "";
        pickHint =
            "Left-drag orbit · right-drag pan · scroll zoom · double-click sets pivot";
        if (!viewer || !Cesium || !url) {
            loading = false;
            if (!url) error = "No preview URL";
            return;
        }

        if (removeTileListener) {
            removeTileListener();
            removeTileListener = null;
        }
        destroyGizmo();
        if (loadedPrim) {
            try {
                viewer.scene.primitives.remove(loadedPrim);
            } catch {
                /* ignore */
            }
            try {
                loadedPrim.destroy?.();
            } catch {
                /* ignore */
            }
        }
        loadedPrim = null;
        orbitTarget = null;
        homeTarget = null;
        spherical = defaultSpherical(10);

        try {
            const resource = authResource(Cesium, url);
            if (kind === "gltf") {
                const model = await Cesium.Model.fromGltfAsync({
                    url: resource,
                    scale: 1,
                });
                if (gen !== loadGen) {
                    model.destroy?.();
                    return;
                }
                viewer.scene.primitives.add(model);
                if (gen !== loadGen) return;
                await framePrimitive(model, gen);
            } else {
                const tileset = await Cesium.Cesium3DTileset.fromUrl(resource, {
                    enableCollision: false,
                    maximumScreenSpaceError: 8,
                });
                if (gen !== loadGen) {
                    tileset.destroy?.();
                    return;
                }
                viewer.scene.primitives.add(tileset);
                if (gen !== loadGen) return;
                await framePrimitive(tileset, gen);
                const onTiles = () => {
                    if (gen !== loadGen) return;
                    const bs = primitiveBoundingSphere(tileset);
                    if (!bs) return;
                    // Only re-place if still clearly earth-fixed / off-origin.
                    if (Cesium.Cartesian3.magnitude(bs.center) > 1e5) {
                        placeInLocalZUp(tileset, bs);
                    }
                    frameAroundOrigin(tileset);
                };
                tileset.initialTilesLoaded?.addEventListener?.(onTiles);
                removeTileListener = () => {
                    try {
                        tileset.initialTilesLoaded?.removeEventListener?.(
                            onTiles,
                        );
                    } catch {
                        /* ignore */
                    }
                };
            }
            if (gen === loadGen) loading = false;
        } catch (e) {
            if (gen !== loadGen) return;
            loading = false;
            error =
                e instanceof Error ? e.message : "Failed to load 3D preview";
        }
    }

    onMount(() => {
        let cancelled = false;
        (async () => {
            if (!host || !creditSink) return;
            try {
                Cesium = await loadCesiumGlobal();
                if (cancelled || !host || !creditSink) return;
                viewer = new Cesium.Viewer(host, {
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
                    requestRenderMode: true,
                    maximumRenderTimeChange: Infinity,
                    baseLayer: false,
                    skyBox: false,
                    skyAtmosphere: false,
                    globe: false,
                });
                stripEarthChrome(viewer, Cesium);
                viewer.scene.mode = Cesium.SceneMode.SCENE3D;
                setupOrbitInput();
                queueMicrotask(() => {
                    try {
                        viewer?.resize();
                        viewer?.scene?.requestRender?.();
                    } catch {
                        /* ignore */
                    }
                });
                viewerReady = true;
            } catch (e) {
                if (!cancelled) {
                    loading = false;
                    error =
                        e instanceof Error
                            ? e.message
                            : "Failed to start 3D preview";
                }
            }
        })();
        return () => {
            cancelled = true;
        };
    });

    onDestroy(() => {
        loadGen++;
        viewerReady = false;
        removeTileListener?.();
        removeTileListener = null;
        removeInput?.();
        removeInput = null;
        destroyGizmo();
        const v = viewer;
        viewer = null;
        Cesium = null;
        queueMicrotask(() => destroyCesiumViewer(v));
    });

    $effect(() => {
        void url;
        void kind;
        void accessToken;
        if (!viewerReady || !viewer || !Cesium) return;
        void loadContent();
    });
</script>

<div class="relative h-full w-full overflow-hidden bg-neutral-950 {klass}">
    <div bind:this={host} class="absolute inset-0"></div>
    <div bind:this={creditSink} class="hidden" aria-hidden="true"></div>
    {#if loading}
        <CesiumLoading />
    {/if}
    {#if error}
        <div
            class="absolute inset-0 z-40 flex flex-col items-center justify-center gap-2 bg-neutral-950/90 px-4 text-center"
        >
            <p class="text-xs text-muted-foreground">{error}</p>
        </div>
    {:else if interactive && !loading}
        <div
            class="pointer-events-none absolute bottom-2 left-2 right-2 z-20 flex items-end justify-between gap-2"
        >
            <p class="text-[10px] text-white/55 drop-shadow-sm">{pickHint}</p>
            <button
                type="button"
                class="pointer-events-auto rounded-md border border-white/15 bg-black/50 px-2 py-1 text-[10px] text-white/80 hover:bg-black/70 hover:text-white"
                onclick={resetPivotHome}
            >
                Reset view
            </button>
        </div>
    {/if}
</div>
