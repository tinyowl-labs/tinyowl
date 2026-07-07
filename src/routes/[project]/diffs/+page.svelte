<script lang="ts">
    import GitCommit from "@lucide/svelte/icons/git-commit";
    import { page } from "$app/stores";

    let { data } = $props();

    const diffs = $derived(data?.diffs ?? []);

    function relativeTime(ts: string): string {
        const date = new Date(ts);
        const now = new Date();
        const diffMs = now.getTime() - date.getTime();
        const diffHours = Math.floor(diffMs / 3600000);
        const diffDays = Math.floor(diffMs / 86400000);
        if (diffHours < 1) return "Less than 1h ago";
        if (diffHours < 24) return `${diffHours}h ago`;
        if (diffDays < 7) return `${diffDays}d ago`;
        return date.toLocaleDateString();
    }

    function formatBytes(bytes: number): string {
        if (bytes < 1024) return `${bytes} B`;
        if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
        return `${(bytes / 1048576).toFixed(1)} MB`;
    }
</script>

<svelte:head>
    <title>Diffs — {$page.data?.project?.title ?? "Project"} — TinyOwl</title>
</svelte:head>

<div class="p-6">
    <div class="max-w-3xl">
        {#if diffs.length === 0}
            <div class="flex items-center justify-center h-64">
                <div class="text-center max-w-sm">
                    <div
                        class="mx-auto mb-4 flex size-14 items-center justify-center rounded-full bg-secondary"
                    >
                        <GitCommit class="size-6 text-muted-foreground" />
                    </div>
                    <h2 class="text-lg font-semibold text-foreground mb-2">
                        No diffs yet
                    </h2>
                    <p class="text-sm text-muted-foreground">
                        Run <code
                            class="font-mono text-xs rounded px-1 bg-secondary"
                            >tinyowl push</code
                        > to create your first diff.
                    </p>
                </div>
            </div>
        {:else}
            <div class="flex flex-col gap-0">
                {#each diffs as diff, i (diff.id)}
                    <div class="flex gap-3">
                        <div class="flex flex-col items-center shrink-0 w-6">
                            <div
                                class="size-2 rounded-full shrink-0 mt-2.5 bg-primary"
                            ></div>
                            {#if i < diffs.length - 1}
                                <div
                                    class="flex-1 w-px min-h-4 bg-border"
                                ></div>
                            {/if}
                        </div>

                        <div class="flex-1 min-w-0 pb-3">
                            <div
                                class="rounded-lg border bg-card px-3.5 py-2.5"
                            >
                                <div
                                    class="flex items-center justify-between gap-2"
                                >
                                    <div
                                        class="flex items-center gap-2 min-w-0"
                                    >
                                        <span
                                            class="font-mono text-sm font-semibold text-foreground"
                                        >
                                            #{diff.seq}
                                        </span>
                                        <span
                                            class="text-xs text-muted-foreground"
                                        >
                                            {diff.entity_count}
                                            {diff.entity_count === 1
                                                ? "entity"
                                                : "entities"}
                                        </span>
                                        <span
                                            class="text-[10px] text-muted-foreground/60"
                                        >
                                            {formatBytes(diff.byte_size)}
                                        </span>
                                    </div>
                                    <span
                                        class="text-[10px] text-muted-foreground shrink-0"
                                        title={new Date(
                                            diff.created_at,
                                        ).toLocaleString()}
                                    >
                                        {relativeTime(diff.created_at)}
                                    </span>
                                </div>

                                <div class="flex items-center gap-2 mt-1.5">
                                    <span
                                        class="font-mono text-[10px] text-muted-foreground/50 select-all"
                                    >
                                        {diff.sha256.slice(0, 12)}
                                    </span>
                                    {#if diff.parent_sha}
                                        <span
                                            class="text-[10px] text-muted-foreground/30"
                                            >←</span
                                        >
                                        <span
                                            class="font-mono text-[10px] text-muted-foreground/30 select-all"
                                        >
                                            {diff.parent_sha.slice(0, 12)}
                                        </span>
                                    {/if}
                                </div>
                            </div>
                        </div>
                    </div>
                {/each}
            </div>
        {/if}
    </div>
</div>
