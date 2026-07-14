<script lang="ts">
    import { onMount } from "svelte";
    import type * as LType from "leaflet";
    import "leaflet/dist/leaflet.css";
    import {
        isDark,
        mapLayerPalette,
        themePrefs,
    } from "$lib/stores/theme.svelte";
    import {
        layerSelection,
        parseSelectionKey,
        toSelectionKey,
        type SelectionOp,
        type SelectionToolMode,
    } from "$lib/stores/layerSelection.svelte";
    import { SELECTION_PRIMARY, SELECTION_SECONDARY } from "./selectionStyle";
    import { featureEntityId } from "./mapEntityPopup";
    import MapToolsRail from "./MapToolsRail.svelte";
    import EntityContextMenu from "./EntityContextMenu.svelte";
    import SceneGraphPanel from "./SceneGraphPanel.svelte";
    import PickPager from "./PickPager.svelte";
    import {
        collectLeafletKeysInBounds,
        collectLeafletKeysInLonLatRing,
    } from "./mapSelection";
    import { mapToolShortcut } from "./mapShortcuts";
    import {
        dedupePickCandidates,
        pickCandidateLabel,
        type PickCandidate,
    } from "./pickCandidates";
    import {
        computeMeasureValue,
        formatMeasureValue,
        measureHint,
        minVertices,
        newMeasureId,
        type MeasureMode,
        type MeasureRecord,
        type MeasureVertex,
    } from "$lib/measure";

    type LayerData = {
        name: string;
        geojson: GeoJSON.FeatureCollection;
        visible: boolean;
    };

    type Props = {
        layers?: LayerData[];
        loading?: boolean;
        rows?: Record<string, Record<string, unknown>[]>;
        fullscreen?: boolean;
        onToggleFullscreen?: () => void;
    };

    let {
        layers = [],
        loading = false,
        rows = {},
        fullscreen = false,
        onToggleFullscreen,
    }: Props = $props();

    let mapContainer = $state<HTMLDivElement>();
    let map: import("leaflet").Map | null = $state(null);
    let L: typeof LType | null = $state(null);
    let geoLayers: import("leaflet").GeoJSON[] = [];
    /** Feature layers keyed by `toSelectionKey(layer, id)`. */
    let featureLayers = new Map<string, LType.Layer>();
    /** Base path style snapshots for restore after selection paint. */
    let styleSnapshots = new Map<string, LType.PathOptions>();
    /** Frame to layer bounds only once — never again on selection / rebuild. */
    let hasFramed = false;
    /** Last selection we flew the camera to (skip re-fly on same keys). */
    let lastFlownKey = "";
    let filterToView = $state(false);
    let inViewEntityKeys = $state<string[]>([]);
    let pickCandidates = $state<PickCandidate[]>([]);
    let pickIndex = $state(0);
    let pickOpen = $state(false);
    let pickPanelX = $state(16);
    let pickPanelY = $state(56);
    let pickFlipBelow = $state(false);

    let ctxOpen = $state(false);
    let ctxX = $state(0);
    let ctxY = $state(0);
    let ctxLayerName = $state("");
    let ctxEntityId = $state("");
    let ctxLeafletLayer: LType.Layer | null = null;

    let measureEnabled = $state(false);
    let measureMode = $state<MeasureMode>("length");
    let measureStatus = $state("");
    let measureRecords = $state<MeasureRecord[]>([]);
    let draftVertices: MeasureVertex[] = [];
    let measureGroup: LType.LayerGroup | null = null;
    let draftLayer: LType.LayerGroup | null = null;
    const committedLayers = new Map<string, LType.LayerGroup>();
    /** Pending single-click timer — cancelled by dblclick finish. */
    let clickTimer: ReturnType<typeof setTimeout> | null = null;
    const CLICK_DELAY_MS = 280;

    const MEASURE_COLOR = "#ca8a04";

    let selectionToolLocal = $state<SelectionToolMode>("click");
    $effect(() => {
        layerSelection.setToolMode(selectionToolLocal);
    });

    let boxVisible = $state(false);
    let boxGeometry = $state({ left: 0, top: 0, width: 0, height: 0 });
    let lassoPoints = $state<Array<{ x: number; y: number }>>([]);
    let suppressNextClick = false;

    let dragActive = false;
    let dragMoved = false;
    let dragStart = { x: 0, y: 0 };
    let dragOp: SelectionOp = "replace";
    const DRAG_THRESHOLD_PX = 6;

    const canFinish = $derived(
        measureEnabled &&
            measureMode !== "point" &&
            draftVertices.length >= minVertices(measureMode),
    );

    const palette = $derived(mapLayerPalette(8));

    const selectionCount = $derived(layerSelection.size);
    const hiddenCount = $derived(layerSelection.hiddenCount);
    const isolating = $derived(layerSelection.isIsolating);
    const selectionSig = $derived(
        `${[...layerSelection.selected].sort().join("|")}::${layerSelection.primaryKey ?? ""}`,
    );
    const hiddenSig = $derived([...layerSelection.hidden].sort().join("|"));

    function colorForIndex(idx: number): string {
        return palette[idx % palette.length]!;
    }

    function selectionFlownKey(): string {
        return layerSelection.keys().sort().join("|");
    }

    function clearDragOverlay() {
        boxVisible = false;
        boxGeometry = { left: 0, top: 0, width: 0, height: 0 };
        lassoPoints = [];
        dragActive = false;
        dragMoved = false;
    }

    function containerPointFromEvent(e: MouseEvent): { x: number; y: number } {
        const el = map!.getContainer();
        const rect = el.getBoundingClientRect();
        return { x: e.clientX - rect.left, y: e.clientY - rect.top };
    }

    function opFromModifiers(e: MouseEvent): SelectionOp {
        if (e.shiftKey) return "add";
        if (e.ctrlKey || e.metaKey) return "remove";
        return "replace";
    }

    function featureLayerEntries() {
        return [...featureLayers.entries()].map(([key, layer]) => ({
            key,
            layer,
        }));
    }

    function finishBoxSelection(end: { x: number; y: number }) {
        if (!map || !L) return;
        const x1 = Math.min(dragStart.x, end.x);
        const y1 = Math.min(dragStart.y, end.y);
        const x2 = Math.max(dragStart.x, end.x);
        const y2 = Math.max(dragStart.y, end.y);
        const sw = map.containerPointToLatLng(L.point(x1, y2));
        const ne = map.containerPointToLatLng(L.point(x2, y1));
        const bounds = L.latLngBounds(sw, ne);
        const keys = collectLeafletKeysInBounds(featureLayerEntries(), bounds);
        layerSelection.applyOp(keys, dragOp);
        lastFlownKey = selectionFlownKey();
        suppressNextClick = true;
    }

    function finishLassoSelection() {
        if (!map || !L) return;
        if (lassoPoints.length < 3) return;
        const ring = lassoPoints.map((p) => {
            const ll = map!.containerPointToLatLng(L!.point(p.x, p.y));
            return { lon: ll.lng, lat: ll.lat };
        });
        const keys = collectLeafletKeysInLonLatRing(
            featureLayerEntries(),
            ring,
        );
        layerSelection.applyOp(keys, dragOp);
        lastFlownKey = selectionFlownKey();
        suppressNextClick = true;
    }

    function finishDragSelection(end: { x: number; y: number }) {
        if (!dragActive) return;
        const moved =
            dragMoved ||
            Math.hypot(end.x - dragStart.x, end.y - dragStart.y) >=
                DRAG_THRESHOLD_PX;
        const tool = selectionToolLocal;
        dragActive = false;
        if (moved) {
            if (tool === "box") finishBoxSelection(end);
            else if (tool === "lasso") finishLassoSelection();
        }
        clearDragOverlay();
    }

    function snapshotPathStyle(layer: LType.Layer): LType.PathOptions | null {
        const path = layer as LType.Path & { options?: Record<string, unknown> };
        if (!path.options) return null;
        return {
            radius: path.options.radius,
            fillColor: path.options.fillColor,
            color: path.options.color,
            weight: path.options.weight,
            opacity: path.options.opacity,
            fillOpacity: path.options.fillOpacity,
        } as LType.PathOptions;
    }

    function basePointStyle(color: string): LType.PathOptions {
        return {
            radius: 4,
            fillColor: color,
            color,
            weight: 1.5,
            opacity: 1,
            fillOpacity: 0.7,
        } as LType.PathOptions;
    }

    function basePathStyle(color: string): LType.PathOptions {
        return {
            color,
            weight: 1.5,
            fillOpacity: 0.15,
        };
    }

    function selectionPaint(
        base: LType.PathOptions,
        selColor: string,
        isPoint: boolean,
    ): LType.PathOptions {
        return {
            ...base,
            color: isPoint ? "#fff" : selColor,
            weight: 3,
            fillOpacity: isPoint ? 1 : 0.35,
            ...(isPoint ? { radius: 9, fillColor: selColor } : {}),
        } as LType.PathOptions;
    }

    function syncHighlightStyles() {
        for (const [key, snap] of styleSnapshots) {
            const layer = featureLayers.get(key);
            if (!layer) continue;
            try {
                (layer as LType.Path).setStyle?.(snap);
            } catch {
                /* ignore */
            }
        }

        for (const key of layerSelection.keys()) {
            const layer = featureLayers.get(key);
            if (!layer) continue;
            let snap = styleSnapshots.get(key);
            if (!snap) {
                snap = snapshotPathStyle(layer) ?? undefined;
                if (snap) styleSnapshots.set(key, snap);
            }
            if (!snap) continue;
            const isPrimary = layerSelection.primaryKey === key;
            const selColor = isPrimary
                ? SELECTION_PRIMARY
                : SELECTION_SECONDARY;
            const isPoint = typeof (layer as any).getLatLng === "function";
            try {
                (layer as LType.Path).setStyle?.(
                    selectionPaint(snap, selColor, isPoint),
                );
                (layer as any).bringToFront?.();
            } catch {
                /* ignore */
            }
        }
    }

    function flyToSelection(force = true) {
        if (!map || !L) return;
        const keys = layerSelection.keys().sort();
        if (keys.length === 0) return;
        const flown = keys.join("|");
        if (!force && flown === lastFlownKey) return;
        lastFlownKey = flown;

        const bounds = L.latLngBounds([]);
        let any = false;
        for (const key of keys) {
            const layer = featureLayers.get(key);
            if (!layer) continue;
            const anyLayer = layer as any;
            if (typeof anyLayer.getLatLng === "function") {
                bounds.extend(anyLayer.getLatLng());
                any = true;
            } else if (typeof anyLayer.getBounds === "function") {
                const b = anyLayer.getBounds() as LType.LatLngBounds;
                if (b?.isValid?.()) {
                    bounds.extend(b);
                    any = true;
                }
            }
        }
        if (!any || !bounds.isValid()) return;

        if (keys.length === 1) {
            const layer = featureLayers.get(keys[0]!);
            const anyLayer = layer as any;
            if (layer && typeof anyLayer.getLatLng === "function") {
                map.flyTo(anyLayer.getLatLng(), Math.max(map.getZoom(), 18), {
                    duration: 0.85,
                });
                (layer as any).bringToFront?.();
                return;
            }
        }

        map.fitBounds(bounds, {
            padding: [60, 60],
            maxZoom: 20,
            animate: true,
            duration: 0.85,
        } as any);

        const primary = layerSelection.primaryKey;
        if (primary) {
            (featureLayers.get(primary) as any)?.bringToFront?.();
        }
    }

    function flyHome() {
        if (!map || !L) return;
        const bounds = L.latLngBounds([]);
        let any = false;
        for (const gl of geoLayers) {
            try {
                const b = gl.getBounds();
                if (b?.isValid?.()) {
                    bounds.extend(b);
                    any = true;
                }
            } catch {
                /* ignore */
            }
        }
        if (!any || !bounds.isValid()) return;
        map.fitBounds(bounds, {
            padding: [40, 40],
            maxZoom: 20,
            animate: true,
            duration: 0.85,
        } as any);
    }

    function flyToLayerExtent(layerName: string) {
        if (!map || !L) return;
        const bounds = L.latLngBounds([]);
        let any = false;
        for (const [key, layer] of featureLayers) {
            if (!key.startsWith(`${layerName}:`)) continue;
            const anyLayer = layer as any;
            if (typeof anyLayer.getLatLng === "function") {
                bounds.extend(anyLayer.getLatLng());
                any = true;
            } else if (typeof anyLayer.getBounds === "function") {
                const b = anyLayer.getBounds() as LType.LatLngBounds;
                if (b?.isValid?.()) {
                    bounds.extend(b);
                    any = true;
                }
            }
        }
        if (!any || !bounds.isValid()) return;
        map.fitBounds(bounds, {
            padding: [60, 60],
            maxZoom: 20,
            animate: true,
            duration: 0.85,
        } as any);
    }

    function applyVisibilityRefresh() {
        if (map && L) updateLayers();
    }

    function applyExternalSelection() {
        if (!map || !L) return;
        syncHighlightStyles();
        if (layerSelection.size === 0) {
            lastFlownKey = "";
            return;
        }
        if (selectionFlownKey() !== lastFlownKey) {
            flyToSelection(true);
        }
    }

    function openContextMenu(
        ev: MouseEvent,
        layerName: string,
        entityId: string,
        layer: LType.Layer,
    ) {
        ev.preventDefault();
        ev.stopPropagation();
        if (measureEnabled) return;
        ctxLayerName = layerName;
        ctxEntityId = entityId;
        ctxLeafletLayer = layer;
        ctxX = Math.min(ev.clientX, window.innerWidth - 220);
        ctxY = Math.min(ev.clientY, window.innerHeight - 160);
        ctxOpen = true;
        (layer as any).bringToFront?.();
        (layer as any).closePopup?.();
    }

    function closeContextMenu() {
        ctxOpen = false;
        ctxLeafletLayer = null;
    }

    function hideContextEntity() {
        if (!ctxLeafletLayer || !map) return;
        const key = toSelectionKey(ctxLayerName, ctxEntityId);
        layerSelection.hideEntity(ctxLayerName, ctxEntityId);
        try {
            map.removeLayer(ctxLeafletLayer);
        } catch {
            /* ignore */
        }
        featureLayers.delete(key);
        styleSnapshots.delete(key);
        closeContextMenu();
    }

    function showAllHiddenEntities() {
        layerSelection.showAllHidden();
        if (map && L && layers.length > 0) updateLayers();
    }

    function ensureMeasureGroup() {
        if (!map || !L) return null;
        if (!measureGroup) {
            measureGroup = L.layerGroup().addTo(map);
        }
        return measureGroup;
    }

    function clearDraftDrawing() {
        if (draftLayer && measureGroup) {
            measureGroup.removeLayer(draftLayer);
        }
        draftLayer = null;
        draftVertices = [];
    }

    function redrawDraft() {
        if (!map || !L) return;
        const group = ensureMeasureGroup();
        if (!group) return;
        if (draftLayer) group.removeLayer(draftLayer);
        draftLayer = L.layerGroup();
        const latlngs = draftVertices.map((v) => L!.latLng(v.lat, v.lon));
        for (const ll of latlngs) {
            L.circleMarker(ll, {
                radius: 5,
                color: "#000",
                weight: 1,
                fillColor: MEASURE_COLOR,
                fillOpacity: 1,
            }).addTo(draftLayer);
        }
        if (latlngs.length >= 2) {
            const line = L.polyline(latlngs, {
                color: MEASURE_COLOR,
                weight: 3,
                dashArray: "6 4",
            });
            line.addTo(draftLayer);
        }
        if (measureMode === "area" && latlngs.length >= 3) {
            L.polygon(latlngs, {
                color: MEASURE_COLOR,
                weight: 2,
                fillColor: MEASURE_COLOR,
                fillOpacity: 0.15,
                dashArray: "6 4",
            }).addTo(draftLayer);
        }
        if (latlngs.length >= minVertices(measureMode)) {
            const value = computeMeasureValue(measureMode, draftVertices);
            const mid =
                latlngs[Math.floor(latlngs.length / 2)] ?? latlngs[0]!;
            L.marker(mid, {
                interactive: false,
                icon: L.divIcon({
                    className: "tinyowl-measure-label",
                    html: `<span>${formatMeasureValue(measureMode, value, draftVertices)}</span>`,
                    iconSize: undefined,
                }),
            }).addTo(draftLayer);
        }
        draftLayer.addTo(group);
    }

    function commitMeasure() {
        if (!map || !L) return;
        const need = minVertices(measureMode);
        if (draftVertices.length < need) return;
        const value = computeMeasureValue(measureMode, draftVertices);
        const record: MeasureRecord = {
            id: newMeasureId(),
            mode: measureMode,
            label: formatMeasureValue(measureMode, value, draftVertices),
            value,
            vertices: [...draftVertices],
        };
        const group = ensureMeasureGroup();
        if (!group) return;
        if (draftLayer) group.removeLayer(draftLayer);
        draftLayer = null;

        const latlngs = record.vertices.map((v) => L!.latLng(v.lat, v.lon));
        const committed = L.layerGroup();
        for (const ll of latlngs) {
            L.circleMarker(ll, {
                radius: record.mode === "point" ? 6 : 4,
                color: "#000",
                weight: 1,
                fillColor: MEASURE_COLOR,
                fillOpacity: 1,
            }).addTo(committed);
        }
        if (record.mode === "area") {
            L.polygon(latlngs, {
                color: MEASURE_COLOR,
                weight: 2,
                fillColor: MEASURE_COLOR,
                fillOpacity: 0.2,
            }).addTo(committed);
        } else if (record.mode === "length") {
            L.polyline(latlngs, {
                color: MEASURE_COLOR,
                weight: 3,
            }).addTo(committed);
        }
        const mid = latlngs[Math.floor(latlngs.length / 2)] ?? latlngs[0]!;
        L.marker(mid, {
            interactive: false,
            icon: L.divIcon({
                className: "tinyowl-measure-label",
                html: `<span>${record.label}</span>`,
                iconSize: undefined,
            }),
        }).addTo(committed);
        committed.addTo(group);
        committedLayers.set(record.id, committed);

        measureRecords = [...measureRecords, record];
        draftVertices = [];
        measureStatus = `${record.label} saved · ${measureHint(measureMode, "2d")}`;
    }

    function removeMeasurement(id: string) {
        const lyr = committedLayers.get(id);
        if (lyr && measureGroup) {
            measureGroup.removeLayer(lyr);
        }
        committedLayers.delete(id);
        measureRecords = measureRecords.filter((r) => r.id !== id);
        if (measureRecords.length === 0 && !draftVertices.length) {
            measureStatus = measureHint(measureMode, "2d");
        }
    }

    function queueMeasureClick(latlng: LType.LatLng) {
        if (clickTimer) clearTimeout(clickTimer);
        // Point commits immediately; path/area defer so dblclick can finish.
        if (measureMode === "point") {
            onMeasureClick(latlng);
            return;
        }
        clickTimer = setTimeout(() => {
            clickTimer = null;
            onMeasureClick(latlng);
        }, CLICK_DELAY_MS);
    }

    function onMeasureClick(latlng: LType.LatLng) {
        const v: MeasureVertex = { lon: latlng.lng, lat: latlng.lat };
        draftVertices = [...draftVertices, v];
        if (measureMode === "point") {
            redrawDraft();
            commitMeasure();
            return;
        }
        redrawDraft();
        const n = draftVertices.length;
        measureStatus =
            n < minVertices(measureMode)
                ? `${n} point${n === 1 ? "" : "s"} · ${measureHint(measureMode, "2d")}`
                : `${formatMeasureValue(measureMode, computeMeasureValue(measureMode, draftVertices), draftVertices)} · Finish, double-click, or Enter`;
    }

    function clearMeasurements() {
        if (clickTimer) {
            clearTimeout(clickTimer);
            clickTimer = null;
        }
        clearDraftDrawing();
        committedLayers.clear();
        if (measureGroup && map) {
            map.removeLayer(measureGroup);
        }
        measureGroup = null;
        measureRecords = [];
        measureStatus = measureHint(measureMode, "2d");
    }

    function finishDraft() {
        if (clickTimer) {
            clearTimeout(clickTimer);
            clickTimer = null;
        }
        if (draftVertices.length >= minVertices(measureMode)) {
            commitMeasure();
        }
    }

    function onMapDblClick(e: LType.LeafletMouseEvent) {
        if (!measureEnabled || !L) return;
        if (measureMode === "point") return;
        L.DomEvent.stopPropagation(e.originalEvent);
        L.DomEvent.preventDefault(e.originalEvent);
        // Cancel the deferred second click — do not add that vertex.
        if (clickTimer) {
            clearTimeout(clickTimer);
            clickTimer = null;
        }
        finishDraft();
    }

    function zoomIn() {
        map?.zoomIn();
    }

    function zoomOut() {
        map?.zoomOut();
    }

    function closePickPager() {
        pickOpen = false;
        pickCandidates = [];
        pickIndex = 0;
    }

    /** Leaflet `_containsPoint` expects a layer point, not container point. */
    function layerPointFromEvent(e: LType.LeafletMouseEvent): LType.Point | null {
        if (!map || !L) return null;
        if (e.layerPoint) return e.layerPoint;
        const oe = e.originalEvent as MouseEvent | undefined;
        if (oe) return map.mouseEventToLayerPoint(oe);
        if (e.containerPoint) {
            return map.containerPointToLayerPoint(e.containerPoint);
        }
        return null;
    }

    function layerHitsPoint(
        layer: LType.Layer,
        layerPoint: LType.Point,
        latlng: LType.LatLng,
    ): boolean {
        const anyLayer = layer as any;
        try {
            if (typeof anyLayer._containsPoint === "function") {
                if (anyLayer._containsPoint(layerPoint)) return true;
            }
        } catch {
            /* fall through */
        }
        // Fallbacks when renderer internals are unavailable / flaky.
        try {
            if (typeof anyLayer.getLatLng === "function") {
                const p = map!.latLngToLayerPoint(anyLayer.getLatLng());
                const dx = p.x - layerPoint.x;
                const dy = p.y - layerPoint.y;
                const r = Math.max(Number(anyLayer.options?.radius) || 6, 8) + 4;
                return dx * dx + dy * dy <= r * r;
            }
            if (typeof anyLayer.getBounds === "function") {
                const b = anyLayer.getBounds();
                if (b?.isValid?.() && b.contains(latlng)) {
                    const geom = anyLayer.feature?.geometry;
                    if (geom?.type === "Polygon" && Array.isArray(geom.coordinates?.[0])) {
                        return pointInPolygonLngLat(
                            latlng.lng,
                            latlng.lat,
                            geom.coordinates[0],
                        );
                    }
                    if (geom?.type === "MultiPolygon") {
                        for (const poly of geom.coordinates ?? []) {
                            const ring = poly?.[0];
                            if (
                                Array.isArray(ring) &&
                                pointInPolygonLngLat(
                                    latlng.lng,
                                    latlng.lat,
                                    ring,
                                )
                            ) {
                                return true;
                            }
                        }
                        return false;
                    }
                    // Lines / unknown: bounds hit is good enough for pick.
                    return true;
                }
            }
        } catch {
            /* ignore */
        }
        return false;
    }

    function pointInPolygonLngLat(
        lng: number,
        lat: number,
        ring: number[][],
    ): boolean {
        // Ray cast in lon/lat (fine for local extents).
        let inside = false;
        for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
            const xi = ring[i]![0]!;
            const yi = ring[i]![1]!;
            const xj = ring[j]![0]!;
            const yj = ring[j]![1]!;
            const intersect =
                yi > lat !== yj > lat &&
                lng < ((xj - xi) * (lat - yi)) / (yj - yi + 0.0) + xi;
            if (intersect) inside = !inside;
        }
        return inside;
    }

    function collectLeafletHits(
        layerPoint: LType.Point,
        latlng: LType.LatLng,
    ): PickCandidate[] {
        if (!map || !L) return [];
        const out: PickCandidate[] = [];
        // Reverse insertion order so top-drawn features appear first.
        const entries = [...featureLayers.entries()].reverse();
        for (const [key, layer] of entries) {
            if (!layerHitsPoint(layer, layerPoint, latlng)) continue;
            const { layer: layerName, id } = parseSelectionKey(key);
            if (!id || layerSelection.isHidden(layerName, id)) continue;
            out.push({
                key,
                layerName,
                entityId: id,
                label: pickCandidateLabel(layerName, id, rows),
            });
        }
        return dedupePickCandidates(out);
    }

    /** Prevent map `click` from clearing a pick opened by a feature click. */
    let suppressMapClickClear = false;

    function openPickFromHits(
        hits: PickCandidate[],
        clientX: number,
        clientY: number,
    ) {
        if (hits.length === 0) {
            closePickPager();
            return;
        }
        const el = map?.getContainer();
        const rect = el?.getBoundingClientRect();
        if (rect) {
            pickPanelX = Math.max(
                8,
                Math.min(clientX - rect.left, rect.width - 8),
            );
            pickPanelY = Math.max(
                8,
                Math.min(clientY - rect.top, rect.height - 8),
            );
            pickFlipBelow = pickPanelY < 200;
        }
        pickCandidates = hits;
        pickIndex = 0;
        pickOpen = true;
        const top = hits[0]!;
        layerSelection.selectSingle(top.layerName, top.entityId);
        lastFlownKey = selectionFlownKey();
        suppressMapClickClear = true;
        queueMicrotask(() => {
            suppressMapClickClear = false;
        });
    }

    function applyPickIndex(i: number) {
        const c = pickCandidates[i];
        if (!c) return;
        pickIndex = i;
        layerSelection.selectSingle(c.layerName, c.entityId);
        lastFlownKey = selectionFlownKey();
        syncHighlightStyles();
    }

    function onFeatureClick(
        e: LType.LeafletMouseEvent,
        name: string,
        id: string,
        _layer: LType.Layer,
    ) {
        if (!L || !map) return;
        if (suppressNextClick) {
            suppressNextClick = false;
            L.DomEvent.stop(e);
            return;
        }
        if (measureEnabled) {
            L.DomEvent.stop(e);
            queueMeasureClick(e.latlng);
            return;
        }
        if (selectionToolLocal === "box" || selectionToolLocal === "lasso") {
            L.DomEvent.stop(e);
            return;
        }
        // Stop Leaflet bubbling to map click (which would clear the pager).
        L.DomEvent.stop(e);
        closeContextMenu();
        const oe = e.originalEvent as MouseEvent;
        const lp = layerPointFromEvent(e);
        const hits = lp
            ? collectLeafletHits(lp, e.latlng)
            : [];
        const list =
            hits.length > 0
                ? hits
                : [
                      {
                          key: toSelectionKey(name, id),
                          layerName: name,
                          entityId: id,
                          label: pickCandidateLabel(name, id, rows),
                      },
                  ];
        if (oe.shiftKey) {
            layerSelection.addSelection(list[0]!.layerName, list[0]!.entityId);
            lastFlownKey = selectionFlownKey();
            return;
        }
        if (oe.ctrlKey || oe.metaKey) {
            layerSelection.removeSelection(
                list[0]!.layerName,
                list[0]!.entityId,
            );
            lastFlownKey = selectionFlownKey();
            return;
        }
        openPickFromHits(list, oe.clientX, oe.clientY);
    }

    onMount(() => {
        let cancelled = false;
        const onKey = (ev: KeyboardEvent) => {
            const action = mapToolShortcut(ev);
            if (!action) return;

            if (action.type === "escape") {
                if (measureEnabled) {
                    clearDraftDrawing();
                    measureStatus = measureHint(measureMode, "2d");
                } else if (!ctxOpen) {
                    if (pickOpen) {
                        closePickPager();
                    } else if (layerSelection.isIsolating) {
                        layerSelection.exitIsolate();
                        applyVisibilityRefresh();
                    } else {
                        layerSelection.clearSelection();
                    }
                }
                return;
            }
            if (action.type === "enter") {
                if (measureEnabled) {
                    ev.preventDefault();
                    finishDraft();
                }
                return;
            }
            if (action.type === "fly-to") {
                ev.preventDefault();
                flyToSelection(true);
                return;
            }
            if (action.type === "home") {
                ev.preventDefault();
                flyHome();
                return;
            }
            if (action.type === "isolate") {
                ev.preventDefault();
                layerSelection.isolateSelected();
                applyVisibilityRefresh();
                return;
            }
            if (action.type === "exit-isolate") {
                ev.preventDefault();
                layerSelection.exitIsolate();
                applyVisibilityRefresh();
                return;
            }
            if (action.type === "select-tool") {
                ev.preventDefault();
                selectionToolLocal = action.mode;
                return;
            }
            if (action.type === "measure-toggle") {
                ev.preventDefault();
                measureEnabled = !measureEnabled;
                return;
            }
            if (action.type === "measure-mode") {
                ev.preventDefault();
                measureMode = action.mode;
                measureEnabled = true;
            }
        };
        window.addEventListener("keydown", onKey);

        (async () => {
            if (!mapContainer) return;

            const leaflet = await import("leaflet");
            if (cancelled || !mapContainer) return;
            L = leaflet;

            map = L.map(mapContainer, {
                center: [20, 0],
                zoom: 2,
                zoomControl: false,
                maxZoom: 22,
            });

            mapContainer.classList.toggle("leaflet-dark", isDark());

            L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
                attribution: "&copy; OpenStreetMap contributors",
                maxZoom: 22,
                maxNativeZoom: 19,
            }).addTo(map);

            map.on("click", (e: LType.LeafletMouseEvent) => {
                if (suppressNextClick) {
                    suppressNextClick = false;
                    return;
                }
                if (suppressMapClickClear) return;
                if (!measureEnabled) {
                    closeContextMenu();
                    if (selectionToolLocal === "click" && !dragActive) {
                        const lp = layerPointFromEvent(e);
                        const hits = lp
                            ? collectLeafletHits(lp, e.latlng)
                            : [];
                        if (hits.length > 0) {
                            const oe = e.originalEvent as MouseEvent;
                            openPickFromHits(hits, oe.clientX, oe.clientY);
                            return;
                        }
                        layerSelection.clearSelection();
                        closePickPager();
                    }
                    return;
                }
                queueMeasureClick(e.latlng);
            });
            map.on("dblclick", (e: LType.LeafletMouseEvent) => {
                onMapDblClick(e);
            });
            map.getContainer().addEventListener("contextmenu", (ev) => {
                // Allow feature contextmenu; block empty-map browser menu.
                if (!(ev.target as HTMLElement)?.closest?.(".leaflet-interactive")) {
                    ev.preventDefault();
                    closeContextMenu();
                }
            });

            requestAnimationFrame(() => map?.invalidateSize());

            const refreshInView = () => {
                if (!map || !filterToView) return;
                const bounds = map.getBounds();
                const entries = [...featureLayers.entries()].map(
                    ([key, layer]) => ({ key, layer }),
                );
                const next = collectLeafletKeysInBounds(entries, bounds).sort();
                if (
                    next.length !== inViewEntityKeys.length ||
                    next.some((k, i) => k !== inViewEntityKeys[i])
                ) {
                    inViewEntityKeys = next;
                }
            };
            map.on("moveend", refreshInView);
            map.on("zoomend", refreshInView);
            // Keep a reference so we can re-run when filter toggles / layers update.
            (map as any)._tinyowlRefreshInView = refreshInView;

            if (layers.length > 0) updateLayers();
        })();

        return () => {
            cancelled = true;
            window.removeEventListener("keydown", onKey);
            map?.remove();
            map = null;
        };
    });

    $effect(() => {
        if (!filterToView || !map) return;
        const refresh = (map as any)._tinyowlRefreshInView as
            | (() => void)
            | undefined;
        refresh?.();
    });

    $effect(() => {
        if (measureEnabled) {
            measureStatus = measureHint(measureMode, "2d");
            if (clickTimer) {
                clearTimeout(clickTimer);
                clickTimer = null;
            }
            clearDraftDrawing();
            map?.doubleClickZoom.disable();
            if (mapContainer) mapContainer.style.cursor = "crosshair";
        } else {
            if (clickTimer) {
                clearTimeout(clickTimer);
                clickTimer = null;
            }
            clearDraftDrawing();
            measureStatus = "";
            map?.doubleClickZoom.enable();
            if (mapContainer) {
                mapContainer.style.cursor = "";
            }
        }
    });

    /** Box / lasso: only Shift/Ctrl+drag select; plain drag keeps map pan. */
    $effect(() => {
        const tool = selectionToolLocal;
        const active =
            (tool === "box" || tool === "lasso") &&
            !!map &&
            !!L &&
            !measureEnabled;

        if (!active || !map) {
            clearDragOverlay();
            return;
        }

        const container = map.getContainer();
        let panWasEnabled = true;

        const onDown = (e: MouseEvent) => {
            if (e.button !== 0) return;
            if (!e.shiftKey && !e.ctrlKey && !e.metaKey) return;
            e.preventDefault();
            e.stopPropagation();
            panWasEnabled = map!.dragging.enabled();
            map!.dragging.disable();
            const pt = containerPointFromEvent(e);
            dragActive = true;
            dragMoved = false;
            dragStart = pt;
            dragOp = e.ctrlKey || e.metaKey ? "remove" : "add";
            if (tool === "box") {
                boxVisible = true;
                boxGeometry = { left: pt.x, top: pt.y, width: 0, height: 0 };
                lassoPoints = [];
            } else {
                boxVisible = false;
                lassoPoints = [pt];
            }
        };

        const onMove = (e: MouseEvent) => {
            if (!dragActive) return;
            const pt = containerPointFromEvent(e);
            const dist = Math.hypot(pt.x - dragStart.x, pt.y - dragStart.y);
            if (dist >= DRAG_THRESHOLD_PX) dragMoved = true;
            if (tool === "box") {
                const left = Math.min(dragStart.x, pt.x);
                const top = Math.min(dragStart.y, pt.y);
                boxGeometry = {
                    left,
                    top,
                    width: Math.abs(pt.x - dragStart.x),
                    height: Math.abs(pt.y - dragStart.y),
                };
                boxVisible = true;
            } else {
                const last = lassoPoints[lassoPoints.length - 1];
                if (
                    !last ||
                    Math.hypot(pt.x - last.x, pt.y - last.y) >= 3
                ) {
                    lassoPoints = [...lassoPoints, pt];
                }
            }
        };

        const onUp = (e: MouseEvent) => {
            if (!dragActive) return;
            finishDragSelection(containerPointFromEvent(e));
            if (panWasEnabled) map?.dragging.enable();
        };

        container.addEventListener("mousedown", onDown, true);
        window.addEventListener("mousemove", onMove);
        window.addEventListener("mouseup", onUp);

        return () => {
            container.removeEventListener("mousedown", onDown, true);
            window.removeEventListener("mousemove", onMove);
            window.removeEventListener("mouseup", onUp);
            map?.dragging.enable();
            clearDragOverlay();
        };
    });

    $effect(() => {
        measureMode;
        if (!measureEnabled) return;
        if (clickTimer) {
            clearTimeout(clickTimer);
            clickTimer = null;
        }
        clearDraftDrawing();
        measureStatus = measureHint(measureMode, "2d");
    });

    function updateLayers() {
        if (!map || !L) return;

        for (const gl of geoLayers) map.removeLayer(gl);
        geoLayers = [];
        featureLayers = new Map();
        styleSnapshots = new Map();

        const allBounds = L.latLngBounds([]);

        for (let i = 0; i < layers.length; i++) {
            const { name, geojson, visible } = layers[i];
            const color = colorForIndex(i);

            const visibleFc: GeoJSON.FeatureCollection = {
                type: "FeatureCollection",
                features: (geojson.features ?? []).filter(
                    (f) => !layerSelection.isHidden(name, featureEntityId(f)),
                ),
            };

            const gl = L.geoJSON(visibleFc, {
                pointToLayer: (
                    feature: GeoJSON.Feature,
                    latlng: LType.LatLng,
                ) => {
                    const id = featureEntityId(feature);
                    const selected = layerSelection.isSelected(name, id);
                    const primary = layerSelection.isPrimary(name, id);
                    const selColor = primary
                        ? SELECTION_PRIMARY
                        : selected
                          ? SELECTION_SECONDARY
                          : null;
                    const base = basePointStyle(color);
                    const opts = selColor
                        ? selectionPaint(base, selColor, true)
                        : base;
                    return L!.circleMarker(latlng, opts);
                },
                style: (feature) => {
                    const id = featureEntityId(
                        feature ?? ({ properties: {} } as GeoJSON.Feature),
                    );
                    const selected = layerSelection.isSelected(name, id);
                    const primary = layerSelection.isPrimary(name, id);
                    const selColor = primary
                        ? SELECTION_PRIMARY
                        : selected
                          ? SELECTION_SECONDARY
                          : null;
                    const base = basePathStyle(color);
                    return selColor
                        ? selectionPaint(base, selColor, false)
                        : base;
                },
                onEachFeature: (
                    feature: GeoJSON.Feature,
                    layer: LType.Layer,
                ) => {
                    const id = featureEntityId(feature);
                    const key = toSelectionKey(name, id);
                    featureLayers.set(key, layer);
                    const isPoint =
                        typeof (layer as any).getLatLng === "function";
                    styleSnapshots.set(
                        key,
                        isPoint ? basePointStyle(color) : basePathStyle(color),
                    );
                    layer.on("click", (e: LType.LeafletMouseEvent) => {
                        onFeatureClick(e, name, id, layer);
                    });
                    layer.on("contextmenu", (e: LType.LeafletMouseEvent) => {
                        L!.DomEvent.preventDefault(e.originalEvent);
                        L!.DomEvent.stopPropagation(e.originalEvent);
                        openContextMenu(
                            e.originalEvent as MouseEvent,
                            name,
                            id,
                            layer,
                        );
                    });
                },
            });

            if (visible) gl.addTo(map);
            geoLayers.push(gl);

            const b = gl.getBounds();
            if (b.isValid()) allBounds.extend(b);
        }

        map.invalidateSize();

        // Default framing once only — selection must not move the camera.
        if (!hasFramed && allBounds.isValid()) {
            map.fitBounds(allBounds, { padding: [40, 40], maxZoom: 20 });
            hasFramed = true;
        }

        syncHighlightStyles();
        if (
            layerSelection.size > 0 &&
            selectionFlownKey() !== lastFlownKey
        ) {
            flyToSelection(true);
        }
        (map as any)._tinyowlRefreshInView?.();
    }

    function toggleLayer(idx: number) {
        if (!map) return;
        layers[idx].visible = !layers[idx].visible;
        const gl = geoLayers[idx];
        if (!gl) return;
        if (layers[idx].visible) {
            gl.addTo(map);
        } else {
            map.removeLayer(gl);
        }
    }

    /** Rebuild only when layer data / theme changes — not on selection. */
    let layersDataKey = $derived(
        layers
            .map(
                (l) =>
                    `${l.name}:${l.visible}:${l.geojson?.features?.length ?? 0}`,
            )
            .join("|"),
    );

    $effect(() => {
        themePrefs.accentHue;
        themePrefs.bgBase;
        layersDataKey;
        if (mapContainer) {
            mapContainer.classList.toggle("leaflet-dark", isDark());
        }
        if (layers.length > 0 && map && L) {
            updateLayers();
        }
    });

    /** Selection sync from store without tearing down GeoJSON. */
    $effect(() => {
        selectionSig;
        if (!map || !L) return;
        applyExternalSelection();
    });

    /** Rebuild when hidden set changes. */
    $effect(() => {
        hiddenSig;
        if (!map || !L) return;
        if (layers.length > 0) updateLayers();
    });
</script>

<div class="relative w-full h-full">
    {#if loading}
        <div
            class="absolute inset-0 z-1000 flex items-center justify-center glass-overlay"
        >
            <div class="text-sm text-muted-foreground animate-pulse">
                Loading map data…
            </div>
        </div>
    {/if}
    <div
        bind:this={mapContainer}
        class="w-full h-full rounded-lg border border-border"
        class:cursor-crosshair={
            !measureEnabled &&
            (selectionToolLocal === "box" || selectionToolLocal === "lasso")
        }
    ></div>

    {#if boxVisible}
        <div
            class="pointer-events-none absolute z-500 border border-dashed border-sky-400 bg-sky-400/15"
            style="left: {boxGeometry.left}px; top: {boxGeometry.top}px; width: {boxGeometry.width}px; height: {boxGeometry.height}px;"
        ></div>
    {/if}

    {#if lassoPoints.length >= 2}
        <svg
            class="pointer-events-none absolute inset-0 z-500 h-full w-full overflow-visible"
            aria-hidden="true"
        >
            <polygon
                points={lassoPoints.map((p) => `${p.x},${p.y}`).join(" ")}
                fill="rgb(56 189 248 / 0.12)"
                stroke="rgb(14 165 233)"
                stroke-dasharray="5 4"
                stroke-width="1.5"
            />
        </svg>
    {/if}

    <div class="absolute top-2 left-2 z-999">
        <MapToolsRail
            bind:enabled={measureEnabled}
            bind:mode={measureMode}
            bind:selectionTool={selectionToolLocal}
            status={measureStatus}
            records={measureRecords}
            {canFinish}
            dim="2d"
            {fullscreen}
            selectionCount={selectionCount}
            {isolating}
            onZoomIn={zoomIn}
            onZoomOut={zoomOut}
            onToggleFullscreen={onToggleFullscreen}
            onFlyToSelection={() => flyToSelection(true)}
            onFlyHome={flyHome}
            onClearSelection={() => {
                layerSelection.clearSelection();
                closePickPager();
            }}
            onHideSelected={() => {
                layerSelection.hideSelected();
                updateLayers();
            }}
            onShowSelected={() => {
                layerSelection.showSelected();
                updateLayers();
            }}
            onIsolateSelected={() => {
                layerSelection.isolateSelected();
                updateLayers();
            }}
            onExitIsolate={() => {
                layerSelection.exitIsolate();
                updateLayers();
            }}
            onClear={clearMeasurements}
            onFinish={finishDraft}
            onRemove={removeMeasurement}
        />
    </div>

    <EntityContextMenu
        open={ctxOpen}
        x={ctxX}
        y={ctxY}
        layerName={ctxLayerName}
        entityId={ctxEntityId}
        selectionCount={selectionCount}
        targetInSelection={layerSelection.isSelected(ctxLayerName, ctxEntityId)}
        {isolating}
        onFlyTo={() => {
            if (!layerSelection.isSelected(ctxLayerName, ctxEntityId)) {
                layerSelection.selectSingle(ctxLayerName, ctxEntityId);
            }
            lastFlownKey = "";
            flyToSelection(true);
        }}
        onHide={hideContextEntity}
        onHideAll={() => {
            layerSelection.hideSelected();
            updateLayers();
        }}
        onShowSelected={() => {
            layerSelection.showSelected();
            updateLayers();
        }}
        onIsolate={() => {
            if (!layerSelection.isSelected(ctxLayerName, ctxEntityId)) {
                layerSelection.selectSingle(ctxLayerName, ctxEntityId);
            }
            layerSelection.isolateSelected();
            updateLayers();
        }}
        onExitIsolate={() => {
            layerSelection.exitIsolate();
            updateLayers();
        }}
        onClear={() => {
            layerSelection.clearSelection();
            closePickPager();
        }}
        onClose={closeContextMenu}
    />

    {#if pickOpen}
        <PickPager
            open={pickOpen}
            candidates={pickCandidates}
            bind:index={pickIndex}
            {rows}
            x={pickPanelX}
            y={pickPanelY}
            flipBelow={pickFlipBelow}
            onIndexChange={applyPickIndex}
            onClose={closePickPager}
        />
    {/if}

    {#if isolating}
        <button
            type="button"
            class="absolute bottom-3 left-3 z-999 rounded-md border border-border glass-panel px-2.5 py-1.5 text-xs text-muted-foreground shadow-sm hover:text-foreground"
            onclick={() => {
                layerSelection.exitIsolate();
                updateLayers();
            }}
        >
            Isolating · Exit
        </button>
    {:else if hiddenCount > 0}
        <button
            type="button"
            class="absolute bottom-3 left-3 z-999 rounded-md border border-border glass-panel px-2.5 py-1.5 text-xs text-muted-foreground shadow-sm hover:text-foreground"
            onclick={showAllHiddenEntities}
        >
            {hiddenCount} hidden · Show all
        </button>
    {/if}

    {#if layers.length > 0}
        <div class="absolute top-2 right-2 z-999">
            <SceneGraphPanel
                {layers}
                {rows}
                palette={palette}
                onToggleLayer={toggleLayer}
                onApplyHidden={() => {
                    if (map && L) updateLayers();
                }}
                onFlyTo={() => flyToSelection(true)}
                onFlyToLayer={flyToLayerExtent}
                bind:filterToView
                {inViewEntityKeys}
            />
        </div>
    {/if}
</div>

<style>
    :global(.tinyowl-measure-label) {
        background: transparent;
        border: none;
    }
    :global(.tinyowl-measure-label span) {
        display: inline-block;
        border-radius: 4px;
        background: color-mix(in oklab, var(--background) 92%, transparent);
        border: 1px solid var(--border);
        padding: 2px 6px;
        font-size: 11px;
        font-weight: 500;
        color: var(--foreground);
        white-space: nowrap;
        box-shadow: 0 1px 2px rgb(0 0 0 / 0.08);
    }
</style>
