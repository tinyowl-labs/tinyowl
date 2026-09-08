/**
 * Named 3D mouse navigation for LayerScene.
 * Globe = Cesium default. Pivot = artefact-style orbit around a picked point
 * (ENU via HeadingPitchRange; globe is ECEF, not world-Z).
 * 2D always pan/zoom. Do not use DCC/library names in UI copy.
 */
import { keyboardPrefs, type CameraScheme } from "$lib/shortcuts";
import { dollyRadius, panDelta } from "$lib/components/artefacts/modelOrbitControls";

export type CameraSchemeCtx = {
	Cesium: any;
	viewer: any;
	/** Mesh → terrain → ellipsoid. LayerScene passes pickSnapCartesian. */
	pickWorld?: (position: { x: number; y: number }) => any | null;
};

type SavedCtrl = {
	rotate: unknown;
	zoom: unknown;
	tilt: unknown;
	look: unknown;
	translate: unknown;
	enableInputs: boolean;
	enableCollision: boolean;
	enableRotate: boolean;
	enableTilt: boolean;
	enableLook: boolean;
	enableTranslate: boolean;
	enableZoom: boolean;
};

const TWO_PI = Math.PI * 2;
const PITCH_LIM = Math.PI / 2 - 0.02;

function saveCtrl(ctrl: any): SavedCtrl {
	return {
		rotate: ctrl.rotateEventTypes,
		zoom: ctrl.zoomEventTypes,
		tilt: ctrl.tiltEventTypes,
		look: ctrl.lookEventTypes,
		translate: ctrl.translateEventTypes,
		enableInputs: ctrl.enableInputs !== false,
		enableCollision: ctrl.enableCollisionDetection !== false,
		enableRotate: ctrl.enableRotate !== false,
		enableTilt: ctrl.enableTilt !== false,
		enableLook: ctrl.enableLook !== false,
		enableTranslate: ctrl.enableTranslate !== false,
		enableZoom: ctrl.enableZoom !== false,
	};
}

function restoreCtrl(ctrl: any, saved: SavedCtrl): void {
	ctrl.rotateEventTypes = saved.rotate;
	ctrl.zoomEventTypes = saved.zoom;
	ctrl.tiltEventTypes = saved.tilt;
	ctrl.lookEventTypes = saved.look;
	ctrl.translateEventTypes = saved.translate;
	ctrl.enableInputs = saved.enableInputs;
	ctrl.enableCollisionDetection = saved.enableCollision;
	ctrl.enableRotate = saved.enableRotate;
	ctrl.enableTilt = saved.enableTilt;
	ctrl.enableLook = saved.enableLook;
	ctrl.enableTranslate = saved.enableTranslate;
	ctrl.enableZoom = saved.enableZoom;
}

function asC2(Cesium: any, p: { x: number; y: number } | undefined) {
	if (!p) return null;
	return new Cesium.Cartesian2(p.x, p.y);
}

function canvasLocalXY(
	e: { clientX: number; clientY: number },
	canvas: HTMLCanvasElement,
): { x: number; y: number } {
	const rect = canvas.getBoundingClientRect();
	const scaleX = canvas.clientWidth / Math.max(rect.width, 1);
	const scaleY = canvas.clientHeight / Math.max(rect.height, 1);
	return {
		x: (e.clientX - rect.left) * scaleX,
		y: (e.clientY - rect.top) * scaleY,
	};
}

function defaultPickWorld(Cesium: any, viewer: any, position: { x: number; y: number }) {
	const c2 = asC2(Cesium, position);
	if (!c2) return null;
	try {
		const ray = viewer.camera.getPickRay(c2);
		if (ray) {
			const exclude = viewer.scene.globe ? [viewer.scene.globe] : [];
			const hits = viewer.scene.drillPickFromRay
				? viewer.scene.drillPickFromRay(ray, 8, exclude)
				: [];
			for (const hit of hits ?? []) {
				if (!hit || hit.exclude) continue;
				if (!Cesium.defined(hit.position)) continue;
				const prim = hit.object?.primitive ?? hit.object;
				if (prim === viewer.scene.globe) continue;
				return hit.position;
			}
			const globe = viewer.scene.globe?.pick?.(ray, viewer.scene);
			if (globe && Cesium.defined(globe)) return globe;
		}
	} catch {
		/* ignore */
	}
	try {
		const picked = viewer.scene.pickPosition(c2);
		if (picked && Cesium.defined(picked)) return picked;
	} catch {
		/* ignore */
	}
	try {
		const ellip = viewer.camera.pickEllipsoid(c2, viewer.scene.globe?.ellipsoid);
		if (ellip && Cesium.defined(ellip)) return ellip;
	} catch {
		/* ignore */
	}
	return null;
}

/** Two-finger trackpad pans arrive as wheel events (pixel deltas, often with X). */
function wheelIsTwoFinger(e: WheelEvent): boolean {
	if (e.ctrlKey || e.metaKey) return false;
	if (Math.abs(e.deltaX) > 0.5) return true;
	if (e.deltaMode === WheelEvent.DOM_DELTA_LINE) return false;
	if (e.deltaMode === WheelEvent.DOM_DELTA_PAGE) return false;
	const y = Math.abs(e.deltaY);
	// Notch mice report ~100–120px; trackpads send small high-frequency pixels.
	if (y >= 80 && Math.abs(e.deltaX) < 0.5) return false;
	return e.deltaMode === WheelEvent.DOM_DELTA_PIXEL;
}

function alongLook(Cesium: any, viewer: any, dist: number) {
	try {
		return Cesium.Cartesian3.add(
			viewer.camera.positionWC,
			Cesium.Cartesian3.multiplyByScalar(
				viewer.camera.directionWC,
				Math.max(dist, 50),
				new Cesium.Cartesian3(),
			),
			new Cesium.Cartesian3(),
		);
	} catch {
		return null;
	}
}

function bakeLookAt(Cesium: any, viewer: any): void {
	try {
		viewer.camera.lookAtTransform(Cesium.Matrix4.IDENTITY);
	} catch {
		/* ignore */
	}
}

export type CameraSchemeHandle = {
	apply: (
		scheme: CameraScheme,
		dim: "2d" | "3d",
		opts?: { suspend?: boolean },
	) => void;
	dispose: () => void;
};

/**
 * Wire named schemes onto a Viewer. Call apply() when prefs or dim change.
 */
export function attachCameraSchemes(ctx: CameraSchemeCtx): CameraSchemeHandle {
	const { Cesium, viewer } = ctx;
	const ctrl = viewer.scene.screenSpaceCameraController;
	const defaults = saveCtrl(ctrl);
	const canvas = viewer.scene.canvas as HTMLCanvasElement;

	let removeDom: (() => void) | null = null;
	let target: any = null;
	let heading = 0;
	let pitch = -0.5;
	let range = 100;
	let dragging = false;
	let dragMode: "orbit" | "pan" | null = null;
	let lastX = 0;
	let lastY = 0;

	const bump = () => {
		try {
			viewer.scene.requestRender?.();
		} catch {
			/* ignore */
		}
	};

	const pickAt = (p: { x: number; y: number }) => {
		try {
			return ctx.pickWorld?.(p) ?? defaultPickWorld(Cesium, viewer, p);
		} catch {
			return defaultPickWorld(Cesium, viewer, p);
		}
	};

	const pickOrFallback = (p: { x: number; y: number }) =>
		pickAt(p) ?? alongLook(Cesium, viewer, range);

	const syncFromCamera = () => {
		if (!target) return;
		heading = viewer.camera.heading;
		pitch = viewer.camera.pitch;
		range = Math.max(
			Cesium.Cartesian3.distance(viewer.camera.positionWC, target),
			1,
		);
	};

	/** lookAt then bake to world so the globe controller cannot fight a live transform. */
	const applyPose = () => {
		if (!target) return;
		pitch = Math.min(PITCH_LIM, Math.max(-PITCH_LIM, pitch));
		range = Math.max(range, 0.5);
		try {
			viewer.camera.lookAt(
				target,
				new Cesium.HeadingPitchRange(heading, pitch, range),
			);
		} catch {
			return;
		}
		bakeLookAt(Cesium, viewer);
		bump();
	};

	const setTarget = (hit: any) => {
		if (!hit) return;
		target = Cesium.Cartesian3.clone(hit);
		syncFromCamera();
		applyPose();
	};

	const rotateBy = (dx: number, dy: number) => {
		const h = Math.max(canvas.clientHeight, 1);
		heading += (TWO_PI * dx) / h;
		pitch -= (TWO_PI * dy) / h;
		applyPose();
	};

	const panBy = (dx: number, dy: number) => {
		if (!target) return;
		const { right: dr, up: du } = panDelta(dx, dy, range, canvas.clientHeight);
		const move = new Cesium.Cartesian3();
		Cesium.Cartesian3.multiplyByScalar(viewer.camera.rightWC, dr, move);
		Cesium.Cartesian3.add(
			move,
			Cesium.Cartesian3.multiplyByScalar(
				viewer.camera.upWC,
				du,
				new Cesium.Cartesian3(),
			),
			move,
		);
		Cesium.Cartesian3.add(target, move, target);
		applyPose();
	};

	const beginDrag = (
		canvasPos: { x: number; y: number },
		mode: "orbit" | "pan",
		clientX: number,
		clientY: number,
	) => {
		if (mode === "orbit" || !target) {
			setTarget(pickOrFallback(canvasPos));
		} else {
			syncFromCamera();
			applyPose();
		}
		if (!target) return;
		dragging = true;
		dragMode = mode;
		lastX = clientX;
		lastY = clientY;
	};

	const endDrag = () => {
		dragging = false;
		dragMode = null;
		bakeLookAt(Cesium, viewer);
		bump();
	};

	const unbindPivot = () => {
		endDrag();
		target = null;
		removeDom?.();
		removeDom = null;
	};

	const bindPivot = () => {
		if (removeDom) return;
		if (!canvas.getAttribute("tabindex")) canvas.setAttribute("tabindex", "0");
		canvas.style.touchAction = "none";

		const touches = new Map<number, { x: number; y: number }>();
		let pinchDist = 0;
		let pinchRange = 0;

		const touchList = () => [...touches.values()];

		const onPointerDown = (e: PointerEvent) => {
			if (e.pointerType === "touch") {
				touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
				if (touches.size === 2) {
					e.preventDefault();
					const [a, b] = touchList();
					if (!a || !b) return;
					const midX = (a.x + b.x) / 2;
					const midY = (a.y + b.y) / 2;
					beginDrag(
						canvasLocalXY({ clientX: midX, clientY: midY }, canvas),
						"orbit",
						midX,
						midY,
					);
					pinchDist = Math.hypot(a.x - b.x, a.y - b.y);
					pinchRange = range;
				}
				return;
			}
			const pan = e.button === 1 && e.shiftKey;
			const orbit =
				(e.button === 1 && !e.shiftKey) || (e.button === 0 && e.altKey);
			if (!orbit && !pan) return;
			e.preventDefault();
			beginDrag(
				canvasLocalXY(e, canvas),
				pan ? "pan" : "orbit",
				e.clientX,
				e.clientY,
			);
			try {
				canvas.setPointerCapture(e.pointerId);
			} catch {
				/* ignore */
			}
		};
		const onPointerMove = (e: PointerEvent) => {
			if (e.pointerType === "touch" && touches.has(e.pointerId)) {
				touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
				if (touches.size !== 2) return;
				e.preventDefault();
				const [a, b] = touchList();
				if (!a || !b) return;
				const midX = (a.x + b.x) / 2;
				const midY = (a.y + b.y) / 2;
				const dist = Math.hypot(a.x - b.x, a.y - b.y);
				if (dragging && dragMode === "orbit") {
					rotateBy(midX - lastX, midY - lastY);
					lastX = midX;
					lastY = midY;
				}
				if (pinchDist > 8 && dist > 8) {
					const z = keyboardPrefs.pivotZoomSensitivity;
					range = Math.max(0.5, pinchRange * Math.pow(pinchDist / dist, z));
					applyPose();
				}
				return;
			}
			if (!dragging || !dragMode) return;
			const dx = e.clientX - lastX;
			const dy = e.clientY - lastY;
			lastX = e.clientX;
			lastY = e.clientY;
			if (dragMode === "pan") panBy(dx, dy);
			else rotateBy(dx, dy);
		};
		const onPointerUp = (e: PointerEvent) => {
			if (e.pointerType === "touch") {
				touches.delete(e.pointerId);
				if (touches.size < 2) endDrag();
				return;
			}
			if (!dragging) return;
			endDrag();
			try {
				canvas.releasePointerCapture(e.pointerId);
			} catch {
				/* ignore */
			}
		};
		const onWheel = (e: WheelEvent) => {
			e.preventDefault();
			if (!target) {
				setTarget(pickOrFallback(canvasLocalXY(e, canvas)));
			}
			if (!target) return;
			if (!dragging) syncFromCamera();
			if (e.ctrlKey || e.metaKey) {
				range = dollyRadius(
					range,
					e.deltaY,
					keyboardPrefs.pivotZoomSensitivity,
					0.5,
				);
				applyPose();
				return;
			}
			if (wheelIsTwoFinger(e)) {
				// Wheel pan is opposite to pointer dx/dy (natural/content scroll).
				rotateBy(-e.deltaX, -e.deltaY);
				return;
			}
			range = dollyRadius(
				range,
				e.deltaY,
				keyboardPrefs.pivotZoomSensitivity,
				0.5,
			);
			applyPose();
		};
		const onMouseDown = (e: MouseEvent) => {
			if (e.button === 1) e.preventDefault();
		};

		canvas.addEventListener("pointerdown", onPointerDown);
		window.addEventListener("pointermove", onPointerMove);
		window.addEventListener("pointerup", onPointerUp);
		window.addEventListener("pointercancel", onPointerUp);
		canvas.addEventListener("wheel", onWheel, { passive: false });
		canvas.addEventListener("mousedown", onMouseDown, true);
		canvas.addEventListener("auxclick", onMouseDown, true);
		removeDom = () => {
			canvas.removeEventListener("pointerdown", onPointerDown);
			window.removeEventListener("pointermove", onPointerMove);
			window.removeEventListener("pointerup", onPointerUp);
			window.removeEventListener("pointercancel", onPointerUp);
			canvas.removeEventListener("wheel", onWheel);
			canvas.removeEventListener("mousedown", onMouseDown, true);
			canvas.removeEventListener("auxclick", onMouseDown, true);
			canvas.style.touchAction = "";
		};
	};

	const applyPivotFlags = () => {
		ctrl.enableInputs = false;
		ctrl.enableCollisionDetection = false;
		ctrl.enableRotate = false;
		ctrl.enableTilt = false;
		ctrl.enableLook = false;
		ctrl.enableTranslate = false;
		ctrl.enableZoom = false;
	};

	const apply = (
		scheme: CameraScheme,
		dim: "2d" | "3d",
		opts?: { suspend?: boolean },
	) => {
		const pivot = scheme === "pivot" && dim === "3d" && !opts?.suspend;
		if (!pivot) {
			unbindPivot();
			if (opts?.suspend) return;
			restoreCtrl(ctrl, defaults);
			if (dim !== "3d") {
				ctrl.enableRotate = false;
				ctrl.enableTilt = false;
				ctrl.enableLook = false;
				ctrl.enableTranslate = true;
				ctrl.enableZoom = true;
			}
			return;
		}
		applyPivotFlags();
		bindPivot();
	};

	return {
		apply,
		dispose: () => {
			unbindPivot();
			if (!viewer.isDestroyed?.()) restoreCtrl(ctrl, defaults);
		},
	};
}
