<script lang="ts">
    import {
        classifyMedia,
        mediaKindLabel,
        uploadProjectMedia,
        type MediaKind,
        type UploadProgress,
        type UploadResult,
    } from "$lib/project/uploadMedia";

    type QueueStatus =
        | "pending"
        | "hashing"
        | "compressing"
        | "uploading"
        | "stored"
        | "queued"
        | "error";

    type QueueItem = {
        id: string;
        file: File;
        kind: MediaKind;
        status: QueueStatus;
        error: string;
        loaded: number;
        total: number;
        result?: UploadResult;
    };

    type Props = {
        accessToken: string;
        slug: string;
        onUploaded: (info: {
            stored: number;
            queued: number;
            names: string[];
            kinds: MediaKind[];
        }) => void;
    };

    let { accessToken, slug, onUploaded }: Props = $props();

    let items = $state.raw<QueueItem[]>([]);
    let dragOver = $state(false);
    let running = $state(false);
    let rejectError = $state("");

    const pending = $derived(items.filter((it) => it.status === "pending"));
    const doneOk = $derived(
        items.filter((it) => it.status === "stored" || it.status === "queued"),
    );
    const failed = $derived(items.filter((it) => it.status === "error"));
    const canContinue = $derived(doneOk.length > 0 && !running && pending.length === 0);

    function nextId(file: File): string {
        // randomUUID is missing on some HTTP origins; getRandomValues usually works.
        const c = globalThis.crypto as Crypto | undefined;
        let uuid: string;
        if (c && typeof c.randomUUID === "function") {
            uuid = c.randomUUID();
        } else if (c && typeof c.getRandomValues === "function") {
            const bytes = new Uint8Array(16);
            c.getRandomValues(bytes);
            bytes[6] = (bytes[6]! & 0x0f) | 0x40;
            bytes[8] = (bytes[8]! & 0x3f) | 0x80;
            const hex = [...bytes]
                .map((b) => b.toString(16).padStart(2, "0"))
                .join("");
            uuid = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
        } else {
            uuid = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
        }
        return `${file.name}:${file.size}:${file.lastModified}:${uuid}`;
    }

    function patch(id: string, partial: Partial<QueueItem>) {
        items = items.map((it) => (it.id === id ? { ...it, ...partial } : it));
    }

    function enqueue(list: FileList | File[]) {
        const accepted: QueueItem[] = [];
        let skipped = 0;
        for (const file of [...list]) {
            const kind = classifyMedia(file);
            if (!kind) {
                skipped += 1;
                continue;
            }
            accepted.push({
                id: nextId(file),
                file,
                kind,
                status: "pending",
                error: "",
                loaded: 0,
                total: file.size,
            });
        }
        if (accepted.length === 0 && skipped > 0) {
            rejectError = "Choose an image, PDF, GeoTIFF, .3tz, or GLB/glTF";
            return;
        }
        rejectError = "";
        items = [...items, ...accepted];
        void drain();
    }

    async function drain() {
        if (running) return;
        running = true;
        try {
            while (true) {
                const next = items.find((it) => it.status === "pending");
                if (!next) break;
                await uploadOne(next);
            }
        } finally {
            running = false;
        }
        if (items.some((it) => it.status === "pending")) void drain();
    }

    function applyProgress(id: string, p: UploadProgress) {
        patch(id, {
            status: p.phase,
            loaded: p.loaded,
            total: p.total || 1,
        });
    }

    async function uploadOne(item: QueueItem) {
        patch(item.id, { status: "hashing", error: "", loaded: 0 });
        try {
            const result = await uploadProjectMedia({
                projectSlug: slug,
                accessToken,
                file: item.file,
                onProgress: (p) => applyProgress(item.id, p),
            });
            patch(item.id, {
                status: result.status,
                loaded: item.file.size,
                total: item.file.size,
                result,
                error: "",
            });
        } catch (e) {
            patch(item.id, {
                status: "error",
                error: e instanceof Error ? e.message : "Upload failed",
            });
        }
    }

    function onDrop(e: DragEvent) {
        e.preventDefault();
        dragOver = false;
        const list = e.dataTransfer?.files;
        if (list?.length) enqueue(list);
    }

    function onFileInput(e: Event) {
        const input = e.currentTarget as HTMLInputElement;
        if (input.files?.length) enqueue(input.files);
        input.value = "";
    }

    function removeItem(id: string) {
        const it = items.find((x) => x.id === id);
        if (!it || it.status === "hashing" || it.status === "uploading" || it.status === "compressing") {
            return;
        }
        items = items.filter((x) => x.id !== id);
    }

    function continueDone() {
        onUploaded({
            stored: items.filter((it) => it.status === "stored").length,
            queued: items.filter((it) => it.status === "queued").length,
            names: doneOk.map((it) => it.file.name),
            kinds: [...new Set(doneOk.map((it) => it.kind))],
        });
    }

    function phaseLabel(it: QueueItem): string {
        switch (it.status) {
            case "pending":
                return "Waiting";
            case "hashing":
                return "Hashing";
            case "compressing":
                return "Compressing";
            case "uploading":
                return "Uploading";
            case "stored":
                return "Stored";
            case "queued":
                return "Queued for ingest";
            default:
                return "Failed";
        }
    }

    function pct(it: QueueItem): number {
        if (it.status === "stored" || it.status === "queued") return 100;
        if (it.total <= 0) return 0;
        return Math.min(99, Math.round((it.loaded / it.total) * 100));
    }
</script>

<div class="flex flex-col gap-5">
    <div>
        <h2 class="text-base font-semibold text-foreground">Add media</h2>
        <p class="mt-0.5 max-w-lg text-sm text-muted-foreground">
            Photos, grey-literature PDFs, an ortho (GeoTIFF), or a 3D tileset /
            GLB. No table or GeoJSON required. Files are content-addressed;
            members see them on Artefacts immediately. Orthos and tilesets
            queue for ingest, then show on Layers.
        </p>
    </div>

    <div class="flex flex-wrap gap-1.5 text-[11px]">
        <span class="rounded-full border border-border px-2 py-0.5 text-muted-foreground"
            >JPEG / PNG</span
        >
        <span class="rounded-full border border-border px-2 py-0.5 text-muted-foreground"
            >PDF</span
        >
        <span class="rounded-full border border-border px-2 py-0.5 text-muted-foreground"
            >GeoTIFF</span
        >
        <span class="rounded-full border border-border px-2 py-0.5 text-muted-foreground"
            >.3tz</span
        >
        <span class="rounded-full border border-border px-2 py-0.5 text-muted-foreground"
            >GLB</span
        >
    </div>

    <label
        class="flex cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed px-6 py-14 text-center transition-colors {dragOver
            ? 'border-primary bg-primary/5'
            : 'border-border hover:border-muted-foreground/40 hover:bg-secondary/20'}"
        ondragover={(e) => {
            e.preventDefault();
            dragOver = true;
        }}
        ondragleave={() => (dragOver = false)}
        ondrop={onDrop}
    >
        <input
            type="file"
            class="sr-only"
            accept="image/*,application/pdf,.pdf,.tif,.tiff,.3tz,.glb,.gltf,model/vnd.3dtiles,model/gltf-binary"
            multiple
            onchange={onFileInput}
        />
        <span class="text-sm font-medium text-foreground"
            >Drop files or click to browse</span
        >
        <span class="text-xs text-muted-foreground"
            >No spatial file needed. Link to rows later from Schema → Media.</span
        >
    </label>

    {#if rejectError}
        <p
            class="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
            {rejectError}
        </p>
    {/if}

    {#if items.length}
        <ul class="flex flex-col gap-2">
            {#each items as it (it.id)}
                <li
                    class="rounded-lg border border-border bg-secondary/30 px-3 py-2"
                >
                    <div class="flex items-start gap-3">
                        <div class="min-w-0 flex-1">
                            <p class="truncate text-sm text-foreground">
                                {it.file.name}
                            </p>
                            <p class="text-[11px] text-muted-foreground">
                                {mediaKindLabel(it.kind)} · {phaseLabel(it)}
                            </p>
                            {#if it.error}
                                <p class="mt-1 text-[11px] text-destructive">
                                    {it.error}
                                </p>
                            {/if}
                        </div>
                        {#if it.status !== "hashing" && it.status !== "uploading" && it.status !== "compressing"}
                            <button
                                type="button"
                                class="shrink-0 text-[11px] text-muted-foreground hover:text-foreground"
                                onclick={() => removeItem(it.id)}
                            >
                                Remove
                            </button>
                        {/if}
                    </div>
                    {#if it.status === "hashing" || it.status === "compressing" || it.status === "uploading"}
                        <div
                            class="mt-2 h-1.5 overflow-hidden rounded-full bg-muted"
                            role="progressbar"
                            aria-valuenow={pct(it)}
                            aria-valuemin={0}
                            aria-valuemax={100}
                        >
                            <div
                                class="h-full rounded-full bg-primary transition-[width] duration-200"
                                style="width: {pct(it)}%"
                            ></div>
                        </div>
                    {/if}
                </li>
            {/each}
        </ul>
    {/if}

    <div class="flex flex-wrap items-center gap-3">
        <button
            type="button"
            class="rounded-md bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground disabled:opacity-50"
            disabled={!canContinue}
            onclick={continueDone}
        >
            {doneOk.length
                ? `Continue · ${doneOk.length} file${doneOk.length === 1 ? "" : "s"}`
                : "Upload at least one file"}
        </button>
        {#if failed.length && !running}
            <span class="text-xs text-muted-foreground"
                >{failed.length} failed — fix or remove, then continue</span
            >
        {/if}
    </div>
</div>
