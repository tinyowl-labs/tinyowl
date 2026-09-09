/** Browser client for POST /api/v1/projects/{slug}/media (same land path as CLI). */

import { Sha256Hasher } from "$lib/crypto/sha256";

export type MediaKind = "image" | "pdf" | "ortho" | "model" | "tileset";

export type UploadProgress = {
	phase: "hashing" | "compressing" | "uploading";
	loaded: number;
	total: number;
};

export type UploadResult = {
	status: "stored" | "queued";
	mediaHash: string;
	size: number;
	mediaType: string;
	kind: MediaKind;
	fileName: string;
};

const GZIP_THRESHOLD = 32 * 1024 * 1024;
const ATTACHMENT_MAX = 500 * 1024 * 1024;
const MODEL_MAX = 10 * 1024 * 1024 * 1024;

export function mediaTypeForFile(file: File): string {
	const name = file.name.toLowerCase();
	if (name.endsWith(".tif") || name.endsWith(".tiff")) return "image/tiff";
	if (name.endsWith(".3tz")) return "application/vnd.3dtiles+zip";
	if (name.endsWith(".glb")) return "model/gltf-binary";
	if (name.endsWith(".gltf")) return "model/gltf+json";
	if (name.endsWith(".pdf")) return "application/pdf";
	if (file.type) return file.type;
	return "application/octet-stream";
}

export function classifyMedia(file: File): MediaKind | null {
	const mt = mediaTypeForFile(file).toLowerCase();
	const name = file.name.toLowerCase();
	if (name.endsWith(".3tz") || mt.includes("3dtiles")) return "tileset";
	if (
		name.endsWith(".glb") ||
		name.endsWith(".gltf") ||
		mt.startsWith("model/gltf")
	) {
		return "model";
	}
	if (name.endsWith(".tif") || name.endsWith(".tiff") || mt.includes("tiff")) {
		return "ortho";
	}
	if (mt === "application/pdf" || name.endsWith(".pdf")) return "pdf";
	if (mt.startsWith("image/")) return "image";
	return null;
}

export function isAcceptedMediaFile(file: File): boolean {
	return classifyMedia(file) != null;
}

export function mediaKindLabel(kind: MediaKind): string {
	switch (kind) {
		case "pdf":
			return "Report";
		case "ortho":
			return "Ortho";
		case "model":
			return "3D model";
		case "tileset":
			return "3D tileset";
		default:
			return "Photo";
	}
}

export function maxBytesForKind(kind: MediaKind): number {
	return kind === "tileset" || kind === "model" ? MODEL_MAX : ATTACHMENT_MAX;
}

export function labelFromFileName(name: string): string {
	return name.replace(/\.[^.]+$/, "");
}

function shouldGzip(mediaType: string, size: number): boolean {
	if (size < GZIP_THRESHOLD) return false;
	if (typeof CompressionStream === "undefined") return false;
	const mt = mediaType.toLowerCase();
	return mt.includes("tiff") || mt.includes("geotiff");
}

async function hashFile(
	file: File,
	onChunk?: (loaded: number) => void,
): Promise<string> {
	const hasher = new Sha256Hasher();
	const reader = file.stream().getReader();
	let loaded = 0;
	try {
		while (true) {
			const { done, value } = await reader.read();
			if (done) break;
			if (value && value.byteLength > 0) {
				hasher.update(value);
				loaded += value.byteLength;
				onChunk?.(loaded);
			}
		}
	} finally {
		reader.releaseLock();
	}
	return hasher.hex();
}

function parseError(text: string, status: number): string {
	try {
		const body = JSON.parse(text) as { error?: string; message?: string };
		if (body.error) return String(body.error);
		if (body.message) return String(body.message);
	} catch {
		/* not JSON */
	}
	const trimmed = text.trim();
	if (trimmed) return trimmed.slice(0, 240);
	return `Upload failed (${status})`;
}

function xhrUpload(
	url: string,
	headers: Record<string, string>,
	body: Blob,
	onProgress?: (loaded: number, total: number) => void,
): Promise<{ ok: boolean; status: number; text: string }> {
	return new Promise((resolve, reject) => {
		const xhr = new XMLHttpRequest();
		xhr.open("POST", url);
		for (const [k, v] of Object.entries(headers)) {
			xhr.setRequestHeader(k, v);
		}
		xhr.upload.onprogress = (ev) => {
			if (ev.lengthComputable) onProgress?.(ev.loaded, ev.total);
		};
		xhr.onload = () =>
			resolve({
				ok: xhr.status >= 200 && xhr.status < 300,
				status: xhr.status,
				text: xhr.responseText,
			});
		xhr.onerror = () => reject(new Error("Network error"));
		xhr.onabort = () => reject(new Error("Upload cancelled"));
		xhr.send(body);
	});
}

export async function uploadProjectMedia(opts: {
	projectSlug: string;
	accessToken: string;
	file: File;
	onProgress?: (p: UploadProgress) => void;
}): Promise<UploadResult> {
	const { projectSlug, accessToken, file, onProgress } = opts;
	if (!accessToken) throw new Error("Sign in to upload");
	const kind = classifyMedia(file);
	if (!kind) {
		throw new Error("Choose an image, PDF, GeoTIFF, .3tz, or GLB/glTF");
	}
	const max = maxBytesForKind(kind);
	if (file.size > max) {
		const cap = kind === "tileset" || kind === "model" ? "10 GiB" : "500 MB";
		throw new Error(`${file.name} is larger than ${cap}`);
	}

	onProgress?.({ phase: "hashing", loaded: 0, total: file.size });
	const hash = await hashFile(file, (loaded) => {
		onProgress?.({ phase: "hashing", loaded, total: file.size });
	});

	const mediaType = mediaTypeForFile(file);
	const gzipOn = shouldGzip(mediaType, file.size);
	const headers: Record<string, string> = {
		Authorization: `Bearer ${accessToken}`,
		"Content-Type": "application/octet-stream",
		"X-TinyOwl-Media-Hash": hash,
		"X-TinyOwl-Media-Type": mediaType,
		"X-TinyOwl-Raw-Size": String(file.size),
		"X-TinyOwl-Media-Label": labelFromFileName(file.name),
	};

	const url = `/api/v1/projects/${encodeURIComponent(projectSlug)}/media`;

	let status = 0;
	let text = "";
	if (gzipOn) {
		onProgress?.({
			phase: "compressing",
			loaded: 0,
			total: file.size,
		});
		headers["Content-Encoding"] = "gzip";
		const body = file.stream().pipeThrough(new CompressionStream("gzip"));
		const init: RequestInit & { duplex?: "half" } = {
			method: "POST",
			headers,
			body,
			duplex: "half",
		};
		onProgress?.({ phase: "uploading", loaded: 0, total: file.size });
		const res = await fetch(url, init);
		status = res.status;
		text = await res.text();
		if (res.ok) {
			onProgress?.({ phase: "uploading", loaded: file.size, total: file.size });
		}
	} else {
		onProgress?.({ phase: "uploading", loaded: 0, total: file.size });
		const res = await xhrUpload(url, headers, file, (loaded, total) => {
			onProgress?.({ phase: "uploading", loaded, total });
		});
		status = res.status;
		text = res.text;
	}

	if (status < 200 || status >= 300) {
		throw new Error(parseError(text, status));
	}

	let payload: { status?: string; media_hash?: string; size?: number } = {};
	try {
		payload = JSON.parse(text) as typeof payload;
	} catch {
		throw new Error("Upload succeeded but the server response was not JSON");
	}
	const stored = payload.status === "queued" ? "queued" : "stored";
	return {
		status: stored,
		mediaHash: payload.media_hash || hash,
		size: payload.size ?? file.size,
		mediaType,
		kind,
		fileName: file.name,
	};
}
