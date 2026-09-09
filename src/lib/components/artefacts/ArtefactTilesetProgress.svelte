<script lang="ts">
    import { onMount } from "svelte";
    import AlertTriangleIcon from "@lucide/svelte/icons/alert-triangle";
    import {
        tilesetIngestFailed,
        tilesetIngestStatus,
        type ArtefactMediaItem,
    } from "$lib/components/artefacts/artefactMedia";

    let {
        item,
        class: klass = "",
    }: {
        item: ArtefactMediaItem;
        class?: string;
    } = $props();

    const failed = $derived(tilesetIngestFailed(item));
    const status = $derived(tilesetIngestStatus(item));
    const label = $derived(
        failed
            ? "Ingest failed"
            : status === "processing"
              ? "Extracting tileset…"
              : status === "awaiting_blob"
                ? "Waiting for upload…"
                : "Queued for extract…",
    );

    let nowMs = $state(Date.now());

    onMount(() => {
        if (failed) return;
        const id = setInterval(() => {
            nowMs = Date.now();
        }, 1000);
        return () => clearInterval(id);
    });

    const elapsed = $derived.by(() => {
        const raw = item.ingest_started_at;
        if (!raw) return "";
        const started = Date.parse(raw);
        if (!Number.isFinite(started)) return "";
        const sec = Math.max(0, Math.floor((nowMs - started) / 1000));
        if (sec < 60) return `${sec}s`;
        const m = Math.floor(sec / 60);
        const s = sec % 60;
        if (m < 60) return `${m}m ${s.toString().padStart(2, "0")}s`;
        const h = Math.floor(m / 60);
        return `${h}h ${(m % 60).toString().padStart(2, "0")}m`;
    });
</script>

<div
    class="flex h-full w-full flex-col items-center justify-center gap-3 bg-neutral-950 px-6 text-center {klass}"
    role="status"
    aria-live="polite"
    aria-busy={!failed}
>
    {#if failed}
        <AlertTriangleIcon class="size-5 text-destructive" />
        <p class="text-xs font-medium text-foreground">{label}</p>
        <p class="max-w-sm text-[11px] text-muted-foreground">
            {item.ingest_error?.trim() || "The tileset worker could not extract this package."}
        </p>
    {:else}
        <p class="text-xs font-medium text-foreground">{label}</p>
        {#if elapsed}
            <p class="text-[11px] tabular-nums text-muted-foreground">
                Running {elapsed}
            </p>
        {/if}
        <div
            class="h-1 w-full max-w-[12rem] overflow-hidden rounded-full bg-white/10"
            aria-hidden="true"
        >
            <div class="tileset-progress-indeterminate h-full w-1/3 rounded-full bg-white/70"></div>
        </div>
        <p class="max-w-xs text-[10px] text-muted-foreground/80">
            Large packages can take several minutes. Preview unlocks when extract finishes.
        </p>
    {/if}
</div>

<style>
    @keyframes tileset-progress-slide {
        0% {
            transform: translateX(-120%);
        }
        100% {
            transform: translateX(360%);
        }
    }
    .tileset-progress-indeterminate {
        animation: tileset-progress-slide 1.35s ease-in-out infinite;
    }
</style>
