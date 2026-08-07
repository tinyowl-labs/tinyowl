<script lang="ts">
    import { page } from "$app/stores";

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
</script>

<svelte:head>
    <title>Reviews — {slug} — TinyOwl</title>
</svelte:head>

<article class="p-6 max-w-3xl">
    <h1 class="text-xl font-medium text-foreground mb-1">Pending reviews</h1>
    <p class="text-sm text-muted-foreground mb-6">
        Incremental pushes wait here until approve, request changes, or reject.
    </p>

    {#if changesets.length === 0}
        <p class="text-sm text-muted-foreground">No open changesets.</p>
    {:else}
        <ul class="divide-y divide-border rounded-lg border border-border overflow-hidden">
            {#each changesets as c}
                <li>
                    <a
                        href="/{slug}/review/{c.id}"
                        class="flex items-start justify-between gap-3 px-4 py-3 hover:bg-accent/40"
                    >
                        <div class="min-w-0">
                            <p class="text-sm text-foreground truncate">
                                {c.message?.trim() || "Untitled push"}
                            </p>
                            <p class="text-xs text-muted-foreground mt-0.5">
                                <span class="capitalize">{c.status}</span>
                                · {formatDate(c.created_at)}
                                · <span class="font-mono"
                                    >{c.sha256?.slice(0, 7)}</span
                                >
                            </p>
                        </div>
                        <span class="text-xs text-muted-foreground shrink-0"
                            >{c.byte_size ?? 0} B</span
                        >
                    </a>
                </li>
            {/each}
        </ul>
    {/if}
</article>
