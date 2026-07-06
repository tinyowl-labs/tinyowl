<script lang="ts">
    interface ProfileDiff {
        id: number;
        project_slug: string;
        project_title: string;
        seq: number;
        sha256: string;
        parent_sha: string | null;
        entity_count: number;
        byte_size: number;
        created_at: string;
    }

    let { diffs }: { diffs: ProfileDiff[] } = $props();

    function relativeTime(ts: string): string {
        const date = new Date(ts);
        const now = new Date();
        const diffMs = now.getTime() - date.getTime();
        const diffMins = Math.floor(diffMs / 60000);
        const diffHours = Math.floor(diffMs / 3600000);
        const diffDays = Math.floor(diffMs / 86400000);
        if (diffMins < 1) return "Just now";
        if (diffMins < 60) return `${diffMins}m ago`;
        if (diffHours < 24) return `${diffHours}h ago`;
        if (diffDays < 7) return `${diffDays}d ago`;
        return date.toLocaleDateString();
    }

    function formatFull(ts: string): string {
        return new Date(ts).toLocaleString();
    }

    function formatBytes(bytes: number): string {
        if (bytes < 1024) return `${bytes} B`;
        if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
        return `${(bytes / 1048576).toFixed(1)} MB`;
    }
</script>

<div class="flex flex-col gap-0">
    {#each diffs as diff, i (diff.id)}
        <div class="flex gap-3">
            <!-- Timeline rail -->
            <div class="flex flex-col items-center shrink-0 w-8">
                <div
                    class="size-2.5 rounded-full shrink-0 mt-2 bg-primary"
                ></div>
                {#if i < diffs.length - 1}
                    <div class="flex-1 w-px min-h-8 bg-border"></div>
                {/if}
            </div>

            <!-- Diff card -->
            <div class="flex-1 min-w-0 pb-3">
                <div
                    class="rounded-lg border bg-card px-3.5 py-2.5 transition-colors duration-120"
                >
                    <div class="flex items-start justify-between gap-2">
                        <div class="min-w-0 flex-1">
                            <p
                                class="text-sm font-semibold leading-snug text-foreground"
                            >
                                {diff.project_title}
                                <span
                                    class="font-mono text-xs font-normal text-muted-foreground ml-1"
                                >
                                    #{diff.seq}
                                </span>
                            </p>
                            <div
                                class="flex items-center gap-1.5 mt-1 flex-wrap"
                            >
                                <span class="text-xs text-muted-foreground">
                                    {diff.entity_count}
                                    {diff.entity_count === 1
                                        ? " entity"
                                        : " entities"}
                                </span>
                                <span class="text-[10px] text-muted-foreground">
                                    ·
                                </span>
                                <span class="text-[10px] text-muted-foreground">
                                    {formatBytes(diff.byte_size)}
                                </span>
                            </div>
                        </div>
                    </div>

                    <!-- Footer: time + hash -->
                    <div class="flex items-center gap-2 mt-2">
                        <span
                            class="text-[10px] text-muted-foreground"
                            title={formatFull(diff.created_at)}
                        >
                            {relativeTime(diff.created_at)}
                        </span>
                        <span
                            class="font-mono text-[10px] select-all text-muted-foreground/50"
                        >
                            {diff.sha256.slice(0, 7)}
                        </span>
                        {#if diff.parent_sha}
                            <span class="text-[10px] text-muted-foreground/30">
                                ← {diff.parent_sha.slice(0, 7)}
                            </span>
                        {/if}
                    </div>
                </div>
            </div>
        </div>
    {/each}
</div>
