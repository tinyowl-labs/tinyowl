<script lang="ts">
    import UploadIcon from "@lucide/svelte/icons/upload";
    import LoaderIcon from "@lucide/svelte/icons/loader";
    import { entityLayersHref } from "$lib/project/entityLink";

    type Props = {
        projectSlug: string;
        accessToken: string;
        onUploaded: () => void;
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
            const headers: Record<string, string> = {
                Authorization: `Bearer ${accessToken}`,
                "X-TinyOwl-Media-Hash": hash,
                "X-TinyOwl-Media-Type": file.type || "application/octet-stream",
            };
            if (entityType.trim()) {
                headers["X-TinyOwl-Entity-Type"] = entityType.trim();
            }
            if (entityId.trim()) {
                headers["X-TinyOwl-Entity-Id"] = entityId.trim();
            }
            const res = await fetch(
                `/api/v1/projects/${projectSlug}/media`,
                {
                    method: "POST",
                    headers,
                    body: buf,
                },
            );
            if (!res.ok) {
                const body = await res.json().catch(() => ({}));
                throw new Error(body.error ?? `HTTP ${res.status}`);
            }
            status = `Stored ${file.name}`;
            onUploaded();
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
                f.name.toLowerCase().endsWith(".pdf"),
        );
        if (files.length === 0) {
            error = "Choose an image or PDF";
            return;
        }
        // Sequential uploads keep status readable
        (async () => {
            for (const f of files) {
                await uploadFile(f);
            }
        })();
    }
</script>

<div
    class="rounded-lg border border-dashed border-border bg-secondary/15 p-3 space-y-3"
    class:border-primary={dragOver}
    ondragover={(e) => {
        e.preventDefault();
        dragOver = true;
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
    <div class="flex items-start gap-2">
        <UploadIcon class="size-4 mt-0.5 text-muted-foreground shrink-0" />
        <div class="min-w-0 flex-1">
            <p class="text-sm font-medium text-foreground">
                Upload photos or grey literature
            </p>
            <p class="text-xs text-muted-foreground mt-0.5">
                Images and PDFs. Optionally link to a context or find.
            </p>
        </div>
    </div>

    <div class="relative">
        <label class="block text-[10px] font-medium uppercase tracking-wide text-muted-foreground mb-1">
            Link to entity (optional)
        </label>
        <input
            type="text"
            class="w-full rounded-md border border-border bg-background px-2 py-1.5 text-xs"
            placeholder="Search contexts / finds…"
            value={entityQuery}
            oninput={(e) => searchEntities(e.currentTarget.value)}
            disabled={busy}
        />
        {#if suggestions.length > 0}
            <ul
                class="absolute z-10 mt-1 w-full rounded-md border border-border bg-background shadow-md max-h-40 overflow-y-auto"
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
                            <span class="ml-2 font-mono text-muted-foreground"
                                >{s.entity_id}</span
                            >
                        </button>
                    </li>
                {/each}
            </ul>
        {/if}
        {#if entityType && entityId}
            <p class="mt-1 text-[11px] text-muted-foreground">
                Linking to
                <a
                    class="text-primary hover:underline"
                    href={entityLayersHref(projectSlug, {
                        layer: entityType,
                        highlight: entityId,
                    })}>{entityType} · {entityId}</a
                >
                <button
                    type="button"
                    class="ml-2 underline"
                    onclick={() => {
                        entityType = "";
                        entityId = "";
                        entityQuery = "";
                    }}>clear</button
                >
            </p>
        {/if}
    </div>

    <label
        class="inline-flex items-center gap-2 rounded-md border border-border px-3 py-1.5 text-xs text-foreground hover:bg-accent/50 cursor-pointer {busy
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
            accept="image/*,application/pdf,.pdf"
            multiple
            disabled={busy}
            onchange={(e) => onFiles(e.currentTarget.files)}
        />
    </label>

    {#if status}
        <p class="text-xs text-muted-foreground">{status}</p>
    {/if}
    {#if error}
        <p class="text-xs text-destructive">{error}</p>
    {/if}
</div>
