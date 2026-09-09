const AVATAR_EXPORT_SIZE = 512;
export const CROP_WORKSPACE_SIZE = 256;
const CROP_GUIDE_SIZE = 144;
export const MIN_CROP_ZOOM = 1;
export const MAX_CROP_ZOOM = 3;

/** Landscape cover crop workspace (16:9). */
export const COVER_WORKSPACE_WIDTH = 384;
export const COVER_WORKSPACE_HEIGHT = 216;
const COVER_EXPORT_WIDTH = 1920;
const COVER_EXPORT_HEIGHT = 1080;

const ALLOWED_AVATAR_MIME = [
	"image/jpeg",
	"image/png",
	"image/webp",
	"image/gif",
] as const;

export function isAllowedAvatarType(type: string): boolean {
	return (ALLOWED_AVATAR_MIME as readonly string[]).includes(type);
}

export function clamp(value: number, min: number, max: number): number {
	return Math.min(max, Math.max(min, value));
}

export function previewBaseScale(imageWidth: number, imageHeight: number): number {
	if (imageWidth <= 0 || imageHeight <= 0) return 1;
	return Math.max(CROP_GUIDE_SIZE / imageWidth, CROP_GUIDE_SIZE / imageHeight);
}

export function previewBaseScaleRect(
	imageWidth: number,
	imageHeight: number,
	guideWidth: number,
	guideHeight: number,
): number {
	if (imageWidth <= 0 || imageHeight <= 0) return 1;
	return Math.max(guideWidth / imageWidth, guideHeight / imageHeight);
}

export function maxCropOffset(
	imageSize: number,
	baseScale: number,
	zoom: number,
): number {
	const rendered = imageSize * baseScale * zoom;
	return Math.max(0, (rendered - CROP_GUIDE_SIZE) / 2);
}

export function maxCropOffsetRect(
	imageSize: number,
	baseScale: number,
	zoom: number,
	guideSize: number,
): number {
	const rendered = imageSize * baseScale * zoom;
	return Math.max(0, (rendered - guideSize) / 2);
}

export function loadImageFromUrl(url: string): Promise<HTMLImageElement> {
	return new Promise((resolve, reject) => {
		const image = new Image();
		image.onload = () => resolve(image);
		image.onerror = () => reject(new Error("Unable to read selected image."));
		image.src = url;
	});
}

export async function exportCroppedAvatar(opts: {
	imageUrl: string;
	cropZoom: number;
	cropOffsetX: number;
	cropOffsetY: number;
}): Promise<File> {
	const image = await loadImageFromUrl(opts.imageUrl);
	const canvas = document.createElement("canvas");
	canvas.width = AVATAR_EXPORT_SIZE;
	canvas.height = AVATAR_EXPORT_SIZE;
	const context = canvas.getContext("2d");
	if (!context) throw new Error("Unable to process image.");

	const baseScale = Math.max(
		AVATAR_EXPORT_SIZE / image.width,
		AVATAR_EXPORT_SIZE / image.height,
	);
	const finalScale = baseScale * opts.cropZoom;
	const offsetScale = AVATAR_EXPORT_SIZE / CROP_GUIDE_SIZE;
	const offsetX = opts.cropOffsetX * offsetScale;
	const offsetY = opts.cropOffsetY * offsetScale;

	context.clearRect(0, 0, AVATAR_EXPORT_SIZE, AVATAR_EXPORT_SIZE);
	context.translate(AVATAR_EXPORT_SIZE / 2 + offsetX, AVATAR_EXPORT_SIZE / 2 + offsetY);
	context.scale(finalScale, finalScale);
	context.drawImage(image, -image.width / 2, -image.height / 2);

	const blob = await new Promise<Blob | null>((resolve) => {
		canvas.toBlob((value) => resolve(value), "image/webp", 0.9);
	});
	if (!blob) throw new Error("Unable to encode avatar.");
	return new File([blob], "avatar.webp", { type: "image/webp" });
}

/** Crop + re-encode a cover as 16:9 WebP (same drag/zoom model as avatar). */
export async function exportCroppedCover(opts: {
	imageUrl: string;
	cropZoom: number;
	cropOffsetX: number;
	cropOffsetY: number;
}): Promise<File> {
	const image = await loadImageFromUrl(opts.imageUrl);
	const canvas = document.createElement("canvas");
	canvas.width = COVER_EXPORT_WIDTH;
	canvas.height = COVER_EXPORT_HEIGHT;
	const context = canvas.getContext("2d");
	if (!context) throw new Error("Unable to process image.");

	const baseScale = Math.max(
		COVER_EXPORT_WIDTH / image.width,
		COVER_EXPORT_HEIGHT / image.height,
	);
	const finalScale = baseScale * opts.cropZoom;
	const offsetScaleX = COVER_EXPORT_WIDTH / COVER_WORKSPACE_WIDTH;
	const offsetScaleY = COVER_EXPORT_HEIGHT / COVER_WORKSPACE_HEIGHT;
	const offsetX = opts.cropOffsetX * offsetScaleX;
	const offsetY = opts.cropOffsetY * offsetScaleY;

	context.clearRect(0, 0, COVER_EXPORT_WIDTH, COVER_EXPORT_HEIGHT);
	context.translate(COVER_EXPORT_WIDTH / 2 + offsetX, COVER_EXPORT_HEIGHT / 2 + offsetY);
	context.scale(finalScale, finalScale);
	context.drawImage(image, -image.width / 2, -image.height / 2);

	const blob = await new Promise<Blob | null>((resolve) => {
		canvas.toBlob((value) => resolve(value), "image/webp", 0.85);
	});
	if (!blob) throw new Error("Unable to encode cover.");
	return new File([blob], "cover.webp", { type: "image/webp" });
}
