<script lang="ts">
    import UploadIcon from "@lucide/svelte/icons/upload";
    import LoaderIcon from "@lucide/svelte/icons/loader";
    import XIcon from "@lucide/svelte/icons/x";
    import { entityLayersHref } from "$lib/project/entityLink";

    type Props = {
        projectSlug: string;
        accessToken: string;
        onUploaded: (info?: { mediaType: string }) => void;
    };

    let { projectSlug, accessToken, onUploaded }: Props = $props();

    let busy = $state(false);
    let error = $state("");
    let status = $state("");
    let entityType = $state("");
    let entityId = $state("");
    let entityQuery = $state("");
    let suggestions = $state<
        Array<{ entity_type: string; entity_id: string; label?: string }>
    >([]);
    let dragOver = $state(false);
    let open = $state(false);

    async function sha256Hex(buf: ArrayBuffer): Promise<string> {
        const hash = await crypto.subtle.digest("SHA-256", buf);
        return [...new Uint8Array(hash)]
            .map((b) => b.toString(16).padStart(2, "0"))
            .join("");
    }

    async function searchEntities(q: string) {
        entityQuery = q;
        if (q.trim().length < 1) {
            suggestions = [];
            return;
        }
        try {
            const res = await fetch(
                `/api/projects/${projectSlug}/search-entities?q=${encodeURIComponent(q)}&limit=8`,
            );
            if (!res.ok) return;
            const body = await res.json();
            const raw = Array.isArray(body)
                ? body
                : (body.entities ?? body.items ?? []);
            suggestions = raw.map(
                (e: {
                    entity_type: string;
                    entity_id: string;
                    match_value?: string;
                    label?: string;
                }) => ({
                    entity_type: e.entity_type,
                    entity_id: e.entity_id,
                    label: e.label ?? e.match_value,
                }),
            );
        } catch {
            suggestions = [];
        }
    }

    function pickEntity(e: {
        entity_type: string;
        entity_id: string;
        label?: string;
    }) {
        entityType = e.entity_type;
        entityId = e.entity_id;
        entityQuery = e.label
            ? `${e.label} (${e.entity_id})`
            : `${e.entity_type} ${e.entity_id}`;
        suggestions = [];
    }

    function isTilesetFile(file: File): boolean {
        const name = file.name.toLowerCase();
        return (
            name.endsWith(".3tz") ||
            file.type === "model/vnd.3dtiles" ||
            file.type === "application/vnd.3dtiles+zip"
        );
    }

    function mediaTypeForUpload(file: File): string {
        if (isTilesetFile(file)) return "model/vnd.3dtiles";
        if (file.type) return file.type;
        if (file.name.toLowerCase().endsWith(".pdf")) return "application/pdf";
        return "application/octet-stream";
    }

    async function uploadFile(file: File) {
        if (!accessToken) {
            error = "Sign in to upload";
            return;
        }
        busy = true;
        error = "";
        status = `Hashing ${file.name}…`;
        try {
            const buf = await file.arrayBuffer();
            const hash = await sha256Hex(buf);
            status = `Uploading ${file.name}…`;
            const mediaType = mediaTypeForUpload(file);
            const headers: Record<string, string> = {
                Authorization: `Bearer ${accessToken}`,
                "X-TinyOwl-Media-Hash": hash,
                "X-TinyOwl-Media-Type": mediaType,
            };
            if (entityType.trim() && !isTilesetFile(file)) {
                headers["X-TinyOwl-Entity-Type"] = entityType.trim();
            }
            if (entityId.trim() && !isTilesetFile(file)) {
                headers["X-TinyOwl-Entity-Id"] = entityId.trim();
            }
            if (isTilesetFile(file)) {
                headers["X-TinyOwl-Media-Label"] = file.name.replace(
                    /\.3tz$/i,
                    "",
                );
            }
            const res = await fetch(`/api/v1/projects/${projectSlug}/media`, {
                method: "POST",
                headers,
                body: buf,
            });
            if (!res.ok) {
                const body = await res.json().catch(() => ({}));
                throw new Error(body.error ?? `HTTP ${res.status}`);
            }
            status = isTilesetFile(file)
                ? `Queued ${file.name} for 3D ingest`
                : `Stored ${file.name}`;
            onUploaded({ mediaType });
        } catch (e: any) {
            error = e?.message ?? "Upload failed";
            status = "";
        } finally {
            busy = false;
        }
    }

    function onFiles(list: FileList | null) {
        if (!list?.length) return;
        const files = [...list].filter(
            (f) =>
                f.type.startsWith("image/") ||
                f.type === "application/pdf" ||
                f.name.toLowerCase().endsWith(".pdf") ||
                isTilesetFile(f),
        );
        if (files.length === 0) {
            error = "Choose an image, PDF, or georeferenced .3tz";
            return;
        }
        (async () => {
            for (const f of files) {
                await uploadFile(f);
            }
        })();
    }
</script>

<div
    class="relative"
    ondragover={(e) => {
        e.preventDefault();
        dragOver = true;
        open = true;
    }}
    ondragleave={() => (dragOver = false)}
    ondrop={(e) => {
        e.preventDefault();
        dragOver = false;
        onFiles(e.dataTransfer?.files ?? null);
    }}
    role="region"
    aria-label="Upload artefacts"
>
    {#if !open}
        <button
            type="button"
            class="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-2.5 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:bg-secondary/60 transition-colors"
            onclick={() => (open = true)}
        >
            <UploadIcon class="size-3.5" />
            Upload
        </button>
    {:else}
        <div
            class="flex flex-wrap items-center gap-2 rounded-md border border-border bg-secondary/30 px-2.5 py-2 {dragOver
                ? 'ring-1 ring-primary'
                : ''}"
        >
            <div class="relative min-w-[12rem] max-w-xs flex-1">
                <input
                    type="text"
                    class="w-full rounded-md border border-border bg-background px-2 py-1.5 text-xs placeholder:text-muted-foreground"
                    placeholder="Link to entity (optional)"
                    value={entityQuery}
                    oninput={(e) => searchEntities(e.currentTarget.value)}
                    disabled={busy}
                />
                {#if suggestions.length > 0}
                    <ul
                        class="absolute z-20 mt-1 w-full rounded-md border border-border bg-background shadow-md max-h-40 overflow-y-auto"
                    >
                        {#each suggestions as s}
                            <li>
                                <button
                                    type="button"
                                    class="w-full text-left px-2 py-1.5 text-xs hover:bg-accent/60"
                                    onclick={() => pickEntity(s)}
                                >
                                    <span class="text-foreground"
                                        >{s.label ?? s.entity_type}</span
                                    >
                                    <span
                                        class="ml-2 font-mono text-muted-foreground"
                                        >{s.entity_id}</span
                                    >
                                </button>
                            </li>
                        {/each}
                    </ul>
                {/if}
            </div>

            {#if entityType && entityId}
                <a
                    class="max-w-[10rem] truncate text-[11px] text-primary hover:underline"
                    href={entityLayersHref(projectSlug, {
                        layer: entityType,
                        highlight: entityId,
                    })}
                    title="{entityType} · {entityId}"
                >
                    {entityId}
                </a>
                <button
                    type="button"
                    class="text-[11px] text-muted-foreground hover:text-foreground"
                    onclick={() => {
                        entityType = "";
                        entityId = "";
                        entityQuery = "";
                    }}>Clear</button
                >
            {/if}

            <label
                class="inline-flex items-center gap-1.5 rounded-md bg-foreground px-2.5 py-1.5 text-xs font-medium text-background cursor-pointer hover:opacity-90 {busy
                    ? 'opacity-60 pointer-events-none'
                    : ''}"
            >
                {#if busy}
                    <LoaderIcon class="size-3.5 animate-spin" />
                {:else}
                    <UploadIcon class="size-3.5" />
                {/if}
                Choose files
                <input
                    type="file"
                    class="sr-only"
                    accept="image/*,application/pdf,.pdf,.3tz,model/vnd.3dtiles"
                    multiple
                    disabled={busy}
                    onchange={(e) => onFiles(e.currentTarget.files)}
                />
            </label>

            <button
                type="button"
                class="rounded-md p-1 text-muted-foreground hover:text-foreground"
                aria-label="Close upload"
                onclick={() => {
                    open = false;
                    error = "";
                    status = "";
                }}
            >
                <XIcon class="size-3.5" />
            </button>

            {#if status}
                <span class="w-full text-[11px] text-muted-foreground"
                    >{status}</span
                >
            {/if}
            {#if error}
                <span class="w-full text-[11px] text-destructive">{error}</span>
            {/if}
            {#if dragOver}
                <span class="w-full text-[11px] text-muted-foreground"
                    >Drop images, PDFs, or .3tz here</span
                >
            {/if}
        </div>
    {/if}
</div>
