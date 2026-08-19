<script lang="ts">
    import { page } from "$app/stores";
    import GitPullRequestIcon from "@lucide/svelte/icons/git-pull-request";

    let { data } = $props();
    const slug = $derived($page.params.project ?? "");
    const changesets = $derived(((data as any)?.changesets as any[]) ?? []);

    function formatDate(ts: string): string {
        return new Date(ts).toLocaleDateString("en-GB", {
            day: "numeric",
            month: "short",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit",
        });
    }

    function formatBytes(n: number): string {
        if (n < 1024) return `${n} B`;
        if (n < 1048576) return `${(n / 1024).toFixed(1)} KB`;
        return `${(n / 1048576).toFixed(1)} MB`;
    }
</script>

<svelte:head>
    <title>Reviews — {slug} — TinyOwl</title>
</svelte:head>

<article class="mx-auto max-w-4xl px-6 py-12">
    <div class="mb-8">
        <div class="flex items-center gap-3">
            <GitPullRequestIcon class="size-6 text-muted-foreground" />
            <h1 class="text-2xl font-bold tracking-tight text-foreground">
                Reviews
            </h1>
        </div>
        <p class="mt-1 text-sm text-muted-foreground">
            Incremental pushes wait here until approve, request changes, or
            reject
        </p>
    </div>

    <div class="rounded-lg border border-border overflow-hidden">
        <div
            class="flex items-center gap-2 px-4 py-3 border-b border-border"
        >
            <span class="text-sm font-medium text-foreground"
                >Pending changesets</span
            >
            {#if changesets.length > 0}
                <span class="text-xs text-muted-foreground"
                    >({changesets.length})</span
                >
            {/if}
        </div>
        {#if changesets.length === 0}
            <div
                class="px-4 py-6 text-center text-sm text-muted-foreground"
            >
                No pending changesets
            </div>
        {:else}
            <div class="divide-y divide-border">
                {#each changesets as c}
                    <a
                        href="/{slug}/review/{c.id}"
                        class="px-4 py-2.5 flex items-center justify-between gap-3 text-xs hover:bg-accent/40"
                    >
                        <div class="flex items-center gap-2 min-w-0">
                            <span class="text-sm text-foreground truncate"
                                >{c.message?.trim() || "Untitled push"}</span
                            >
                            <span class="text-muted-foreground shrink-0"
                                >{formatDate(c.created_at)}</span
                            >
                        </div>
                        <div
                            class="flex items-center gap-3 text-muted-foreground shrink-0"
                        >
                            <span class="capitalize">{c.status}</span>
                            <span class="font-mono"
                                >{c.sha256?.slice(0, 7) ?? ""}</span
                            >
                            <span class="tabular-nums"
                                >{formatBytes(c.byte_size ?? 0)}</span
                            >
                        </div>
                    </a>
                {/each}
            </div>
        {/if}
    </div>
</article>
