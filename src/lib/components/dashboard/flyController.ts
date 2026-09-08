/**
 * Exclusive 3D free-fly. WASD + Q/E + hold-LMB look.
 * Rewrite (not injalak): rAF + requestRender, Q/E are down/up.
 */
import {
	isTypingTarget,
	matchPrefShortcut,
	type ShortcutId,
} from "$lib/shortcuts";

export type FlyControllerOpts = {
	Cesium: any;
	viewer: any;
	bumpRender: () => void;
	getSensitivity: () => number;
};

type MoveFlag = "forward" | "back" | "left" | "right" | "up" | "down";

const MOVE_BY_ID: Partial<Record<ShortcutId, MoveFlag>> = {
	"fly-forward": "forward",
	"fly-back": "back",
	"fly-left": "left",
	"fly-right": "right",
	"fly-up": "up",
	"fly-down": "down",
};

type FlyFlags = Record<MoveFlag, boolean> & {
	looking: boolean;
	boost: boolean;
};

export function attachFlyController(opts: FlyControllerOpts): () => void {
	const { Cesium, viewer, bumpRender, getSensitivity } = opts;
	const canvas = viewer.scene.canvas as HTMLCanvasElement;
	const controller = viewer.scene.screenSpaceCameraController;
	const previous = {
		rotate: controller.enableRotate,
		translate: controller.enableTranslate,
		zoom: controller.enableZoom,
		tilt: controller.enableTilt,
		look: controller.enableLook,
		inputs: controller.enableInputs,
	};
	controller.enableRotate = false;
	controller.enableTranslate = false;
	controller.enableZoom = false;
	controller.enableTilt = false;
	controller.enableLook = false;
	controller.enableInputs = false;

	if (!canvas.getAttribute("tabindex")) canvas.setAttribute("tabindex", "0");

	const flags: FlyFlags = {
		forward: false,
		back: false,
		left: false,
		right: false,
		up: false,
		down: false,
		looking: false,
		boost: false,
	};

	let startMouse = { x: 0, y: 0 };
	let mouse = { x: 0, y: 0 };

	const handler = new Cesium.ScreenSpaceEventHandler(canvas);
	handler.setInputAction((m: { position?: { x: number; y: number } }) => {
		if (!m.position) return;
		flags.looking = true;
		startMouse = { x: m.position.x, y: m.position.y };
		mouse = { ...startMouse };
	}, Cesium.ScreenSpaceEventType.LEFT_DOWN);
	handler.setInputAction((m: { endPosition?: { x: number; y: number } }) => {
		if (!m.endPosition) return;
		mouse = { x: m.endPosition.x, y: m.endPosition.y };
	}, Cesium.ScreenSpaceEventType.MOUSE_MOVE);
	handler.setInputAction(() => {
		flags.looking = false;
	}, Cesium.ScreenSpaceEventType.LEFT_UP);

	const setFromEvent = (ev: KeyboardEvent, down: boolean) => {
		if (isTypingTarget(ev.target)) return;
		if (ev.code === "ShiftLeft" || ev.code === "ShiftRight") {
			flags.boost = down;
		}
		const id = matchPrefShortcut(ev, ["map-fly"]);
		if (!id) return;
		const flag = MOVE_BY_ID[id];
		if (!flag) return;
		flags[flag] = down;
		ev.preventDefault();
	};

	const onKeyDown = (ev: KeyboardEvent) => setFromEvent(ev, true);
	const onKeyUp = (ev: KeyboardEvent) => setFromEvent(ev, false);

	window.addEventListener("keydown", onKeyDown, true);
	window.addEventListener("keyup", onKeyUp, true);

	let raf = 0;
	let last = performance.now();
	const tick = (now: number) => {
		raf = requestAnimationFrame(tick);
		if (viewer.isDestroyed?.()) return;
		const dt = Math.min((now - last) / 1000, 0.05);
		last = now;
		const camera = viewer.camera;
		const sensitivity = Math.max(0.25, getSensitivity());

		if (flags.looking) {
			const w = Math.max(canvas.clientWidth, 1);
			const h = Math.max(canvas.clientHeight, 1);
			const x = (mouse.x - startMouse.x) / w;
			const y = -(mouse.y - startMouse.y) / h;
			const look = 0.08 * sensitivity;
			camera.lookRight(x * look);
			camera.lookUp(y * look);
		}

		let height = 100;
		try {
			height = camera.positionCartographic?.height ?? 100;
		} catch {
			/* ignore */
		}
		const moveRate =
			Math.max(Math.abs(height) / 100, 0.4) * sensitivity * (flags.boost ? 2.5 : 1) * (dt * 60);

		let moved = flags.looking;
		if (flags.forward) {
			camera.moveForward(moveRate);
			moved = true;
		}
		if (flags.back) {
			camera.moveBackward(moveRate);
			moved = true;
		}
		if (flags.left) {
			camera.moveLeft(moveRate);
			moved = true;
		}
		if (flags.right) {
			camera.moveRight(moveRate);
			moved = true;
		}
		if (flags.up) {
			camera.moveUp(moveRate);
			moved = true;
		}
		if (flags.down) {
			camera.moveDown(moveRate);
			moved = true;
		}
		if (moved) bumpRender();
	};
	raf = requestAnimationFrame(tick);

	return () => {
		cancelAnimationFrame(raf);
		window.removeEventListener("keydown", onKeyDown, true);
		window.removeEventListener("keyup", onKeyUp, true);
		try {
			handler.destroy();
		} catch {
			/* ignore */
		}
		try {
			controller.enableRotate = previous.rotate;
			controller.enableTranslate = previous.translate;
			controller.enableZoom = previous.zoom;
			controller.enableTilt = previous.tilt;
			controller.enableLook = previous.look;
			controller.enableInputs = previous.inputs;
		} catch {
			/* ignore */
		}
	};
}
