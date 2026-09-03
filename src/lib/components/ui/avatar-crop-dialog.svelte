<script lang="ts">
	import { Dialog } from "bits-ui";
	import XIcon from "@lucide/svelte/icons/x";
	import PlusIcon from "@lucide/svelte/icons/plus";
	import MinusIcon from "@lucide/svelte/icons/minus";
	import { Button } from "$lib/components/ui/button/index.js";
	import {
		CROP_WORKSPACE_SIZE,
		MAX_CROP_ZOOM,
		MIN_CROP_ZOOM,
		clamp,
		exportCroppedAvatar,
		loadImageFromUrl,
		maxCropOffset,
		previewBaseScale,
	} from "$lib/avatar-crop";

	let {
		open = $bindable(false),
		imageUrl = "",
		saving = false,
		onSave,
	}: {
		open?: boolean;
		imageUrl?: string;
		saving?: boolean;
		onSave: (file: File) => void | Promise<void>;
	} = $props();

	let imageWidth = $state(0);
	let imageHeight = $state(0);
	let cropZoom = $state(1);
	let cropOffsetX = $state(0);
	let cropOffsetY = $state(0);
	let cropError = $state("");
	let busy = $state(false);

	let dragging = $state(false);
	let pointerId = $state<number | null>(null);
	let dragStartX = 0;
	let dragStartY = 0;
	let dragStartOffsetX = 0;
	let dragStartOffsetY = 0;

	const baseScale = $derived(previewBaseScale(imageWidth, imageHeight));
	const maxX = $derived(maxCropOffset(imageWidth, baseScale, cropZoom));
	const maxY = $derived(maxCropOffset(imageHeight, baseScale, cropZoom));
	const cropPreviewStyle = $derived.by(() => {
		const renderWidth = imageWidth ? imageWidth * baseScale : CROP_WORKSPACE_SIZE;
		const renderHeight = imageHeight ? imageHeight * baseScale : CROP_WORKSPACE_SIZE;
		return `width: ${renderWidth}px; height: ${renderHeight}px; transform: translate(calc(-50% + ${cropOffsetX}px), calc(-50% + ${cropOffsetY}px)) scale(${cropZoom}); transform-origin: center center;`;
	});

	$effect(() => {
		cropOffsetX = clamp(cropOffsetX, -maxX, maxX);
		cropOffsetY = clamp(cropOffsetY, -maxY, maxY);
	});

	$effect(() => {
		if (!open || !imageUrl) return;
		cropZoom = 1;
		cropOffsetX = 0;
		cropOffsetY = 0;
		cropError = "";
		void loadImageFromUrl(imageUrl)
			.then((img) => {
				imageWidth = img.naturalWidth || img.width;
				imageHeight = img.naturalHeight || img.height;
			})
			.catch((e) => {
				cropError = e instanceof Error ? e.message : "Unable to preview image.";
			});
	});

	function zoomBy(delta: number) {
		cropZoom = clamp(cropZoom + delta, MIN_CROP_ZOOM, MAX_CROP_ZOOM);
	}

	function resetCrop() {
		cropZoom = 1;
		cropOffsetX = 0;
		cropOffsetY = 0;
	}

	function onWheel(event: WheelEvent) {
		event.preventDefault();
		zoomBy(event.deltaY > 0 ? -0.12 : 0.12);
	}

	function onPointerDown(event: PointerEvent) {
		dragging = true;
		pointerId = event.pointerId;
		(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
		dragStartX = event.clientX;
		dragStartY = event.clientY;
		dragStartOffsetX = cropOffsetX;
		dragStartOffsetY = cropOffsetY;
	}

	function onPointerMove(event: PointerEvent) {
		if (!dragging || event.pointerId !== pointerId) return;
		cropOffsetX = clamp(
			dragStartOffsetX + (event.clientX - dragStartX),
			-maxX,
			maxX,
		);
		cropOffsetY = clamp(
			dragStartOffsetY + (event.clientY - dragStartY),
			-maxY,
			maxY,
		);
	}

	function onPointerEnd(event: PointerEvent) {
		if (event.pointerId !== pointerId) return;
		dragging = false;
		pointerId = null;
	}

	async function save() {
		if (!imageUrl || busy || saving) return;
		busy = true;
		cropError = "";
		try {
			const file = await exportCroppedAvatar({
				imageUrl,
				cropZoom,
				cropOffsetX,
				cropOffsetY,
			});
			await onSave(file);
			open = false;
		} catch (e) {
			cropError = e instanceof Error ? e.message : "Could not save avatar.";
		} finally {
			busy = false;
		}
	}
</script>

<Dialog.Root bind:open>
	<Dialog.Portal>
		<Dialog.Overlay
			class="fixed inset-0 z-50 bg-black/50 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0"
		/>
		<Dialog.Content
			class="fixed top-[50%] left-[50%] z-50 w-[calc(100%-2rem)] max-w-sm translate-x-[-50%] translate-y-[-50%] rounded-lg border border-border bg-background p-4 shadow-lg outline-none"
		>
			<div class="mb-3 flex items-start justify-between gap-3">
				<div>
					<Dialog.Title class="text-sm font-medium text-foreground"
						>Crop avatar</Dialog.Title
					>
					<Dialog.Description class="mt-0.5 text-xs text-muted-foreground"
						>Drag to position. Scroll or use +/− to zoom.</Dialog.Description
					>
				</div>
				<Dialog.Close
					class="rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
					aria-label="Close"
				>
					<XIcon class="size-4" />
				</Dialog.Close>
			</div>

			<div class="flex flex-col items-center gap-3">
				<div
					class="relative cursor-grab touch-none select-none overflow-hidden rounded-xl border border-border bg-muted active:cursor-grabbing"
					style="width: {CROP_WORKSPACE_SIZE}px; height: {CROP_WORKSPACE_SIZE}px;"
					role="application"
					aria-label="Avatar crop area"
					onwheel={onWheel}
					onpointerdown={onPointerDown}
					onpointermove={onPointerMove}
					onpointerup={onPointerEnd}
					onpointercancel={onPointerEnd}
				>
					{#if imageUrl}
						<img
							src={imageUrl}
							alt=""
							class="pointer-events-none absolute top-1/2 left-1/2 max-w-none"
							draggable="false"
							style={cropPreviewStyle}
							ondragstart={(e) => e.preventDefault()}
						/>
					{/if}
					<div
						class="pointer-events-none absolute inset-0"
						style="background: radial-gradient(circle 72px at center, transparent 70px, rgb(0 0 0 / 0.55) 71px);"
					></div>
					<div
						class="pointer-events-none absolute top-1/2 left-1/2 size-36 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-background/90"
					></div>
				</div>

				<div class="flex items-center justify-center gap-2">
					<Button
						type="button"
						variant="outline"
						size="icon-sm"
						onclick={() => zoomBy(-0.12)}
						aria-label="Zoom out"
					>
						<MinusIcon class="size-4" />
					</Button>
					<Button
						type="button"
						variant="outline"
						size="icon-sm"
						onclick={() => zoomBy(0.12)}
						aria-label="Zoom in"
					>
						<PlusIcon class="size-4" />
					</Button>
					<Button type="button" variant="secondary" size="sm" onclick={resetCrop}
						>Reset</Button
					>
				</div>

				{#if cropError}
					<p class="text-sm text-destructive" role="alert">{cropError}</p>
				{/if}

				<Button
					type="button"
					class="w-full"
					disabled={busy || saving || !imageUrl}
					onclick={() => void save()}
				>
					{busy || saving ? "Saving…" : "Save avatar"}
				</Button>
			</div>
		</Dialog.Content>
	</Dialog.Portal>
</Dialog.Root>
