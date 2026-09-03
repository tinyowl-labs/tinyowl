export const AVATAR_EXPORT_SIZE = 512;
export const CROP_WORKSPACE_SIZE = 256;
export const CROP_GUIDE_SIZE = 144;
export const MIN_CROP_ZOOM = 1;
export const MAX_CROP_ZOOM = 3;
export const ALLOWED_AVATAR_MIME = [
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

export function maxCropOffset(
	imageSize: number,
	baseScale: number,
	zoom: number,
): number {
	const rendered = imageSize * baseScale * zoom;
	return Math.max(0, (rendered - CROP_GUIDE_SIZE) / 2);
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
