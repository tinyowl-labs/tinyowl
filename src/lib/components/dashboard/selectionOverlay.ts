/** Selection highlight as a separate Cesium data source — do not mutate CZML entities. */

import { getOrAttachOverlayDs } from "$lib/geoDiff";
import { cesiumPropValue } from "./czmlLoad";
import { SELECTION_PRIMARY, SELECTION_SECONDARY } from "./selectionStyle";

const SELECTION_DS_NAME = "tinyowl-selection";

export type SelectionOverlayItem = {
	entity: any;
	kind: "primary" | "secondary";
};

function cloneColor(Cesium: any, css: string) {
	return (
		Cesium.Color.fromCssColorString(css) ??
		Cesium.Color.fromBytes(234, 179, 8, 255)
	);
}

function cloneHierarchy(Cesium: any, hierarchy: any): any {
	if (!hierarchy) return null;
	const pts = hierarchy.positions ?? hierarchy;
	if (!Array.isArray(pts) || pts.length < 3) return null;
	const holes = (hierarchy.holes ?? [])
		.map((h: any) => {
			const hp = h?.positions ?? h;
			if (!Array.isArray(hp) || hp.length < 3) return null;
			return new Cesium.PolygonHierarchy(hp.slice());
		})
		.filter(Boolean);
	return new Cesium.PolygonHierarchy(pts.slice(), holes);
}

function addPointHighlight(
	Cesium: any,
	ds: any,
	id: string,
	entity: any,
	time: unknown,
	color: any,
	primary: boolean,
) {
	const pos = cesiumPropValue(entity.position, time);
	if (!pos) return;
	const base =
		Number(cesiumPropValue(entity.point?.pixelSize, time)) || 8;
	ds.entities.add({
		id,
		position: Cesium.Cartesian3.clone(pos),
		point: {
			pixelSize: primary ? Math.max(base + 6, 14) : Math.max(base + 3, 11),
			color,
			outlineColor: Cesium.Color.WHITE,
			outlineWidth: 2,
			heightReference: cesiumPropValue(entity.point?.heightReference, time),
			disableDepthTestDistance: Number.POSITIVE_INFINITY,
		},
		allowPicking: false,
	});
}

function addLineHighlight(
	Cesium: any,
	ds: any,
	id: string,
	entity: any,
	time: unknown,
	color: any,
	primary: boolean,
) {
	const pts = cesiumPropValue(entity.polyline?.positions, time);
	if (!Array.isArray(pts) || pts.length < 2) return;
	const base = Number(cesiumPropValue(entity.polyline?.width, time)) || 2;
	const clamp = cesiumPropValue(entity.polyline?.clampToGround, time);
	ds.entities.add({
		id,
		polyline: {
			positions: pts.slice(),
			width: primary ? Math.max(base + 3, 5) : Math.max(base + 1.5, 3.5),
			material: color,
			clampToGround: clamp === true,
		},
		allowPicking: false,
	});
}

function addPolygonHighlight(
	Cesium: any,
	ds: any,
	id: string,
	entity: any,
	time: unknown,
	color: any,
	primary: boolean,
) {
	const raw = cesiumPropValue(entity.polygon?.hierarchy, time);
	const hierarchy = cloneHierarchy(Cesium, raw);
	if (!hierarchy) return;
	const alpha = primary ? 0.45 : 0.32;
	const classification = cesiumPropValue(
		entity.polygon?.classificationType,
		time,
	);
	const perPosition = cesiumPropValue(
		entity.polygon?.perPositionHeight,
		time,
	);
	const heightRef = cesiumPropValue(entity.polygon?.heightReference, time);
	const extruded = cesiumPropValue(entity.polygon?.extrudedHeight, time);
	const height = cesiumPropValue(entity.polygon?.height, time);
	ds.entities.add({
		id,
		polygon: {
			hierarchy,
			material: color.withAlpha(alpha),
			outline: true,
			outlineColor: Cesium.Color.WHITE,
			outlineWidth: primary ? 3 : 2,
			...(perPosition ? { perPositionHeight: true } : {}),
			...(classification != null ? { classificationType: classification } : {}),
			...(heightRef != null ? { heightReference: heightRef } : {}),
			...(height != null ? { height } : {}),
			...(extruded != null ? { extrudedHeight: extruded } : {}),
		},
		allowPicking: false,
	});
}

/** Replace highlight entities. Canonical CZML graphics stay untouched. */
export async function syncSelectionOverlay(
	Cesium: any,
	viewer: any,
	items: SelectionOverlayItem[],
): Promise<any | null> {
	if (!Cesium || !viewer) return null;
	const ds = await getOrAttachOverlayDs(Cesium, viewer, SELECTION_DS_NAME);
	ds.entities.removeAll();
	const time = viewer.clock?.currentTime;
	let n = 0;
	for (const { entity, kind } of items) {
		if (!entity) continue;
		try {
			if (entity.show === false) continue;
		} catch {
			/* ignore */
		}
		const primary = kind === "primary";
		const color = cloneColor(
			Cesium,
			primary ? SELECTION_PRIMARY : SELECTION_SECONDARY,
		);
		const id = `sel:${n++}:${String(entity.id ?? "")}`;
		if (entity.point) {
			addPointHighlight(Cesium, ds, id, entity, time, color, primary);
		} else if (entity.polyline) {
			addLineHighlight(Cesium, ds, id, entity, time, color, primary);
		} else if (entity.polygon) {
			addPolygonHighlight(Cesium, ds, id, entity, time, color, primary);
		}
	}
	return ds;
}
