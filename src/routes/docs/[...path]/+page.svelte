<script lang="ts">
    let { data } = $props();
</script>

<svelte:head>
    <title>{data?.title ?? "Documentation"} — TinyOwl Docs</title>
</svelte:head>

<article class="mx-auto max-w-4xl px-6 py-12">
    {#if data?.html}
        <div class="readme-content">
            {@html data.html}
        </div>
    {:else}
        <div class="flex items-center justify-center py-20">
            <p class="text-muted-foreground text-sm">Page not found.</p>
        </div>
    {/if}
</article>

<style>
    :global(.readme-content) {
        font-size: 0.9375rem;
        line-height: 1.7;
        color: var(--foreground);
        max-width: none;
    }

    :global(.readme-content h1) {
        font-size: 1.75rem;
        font-weight: 600;
        margin: 1.5em 0 0.5em;
        padding-bottom: 0.3em;
        border-bottom: 1px solid var(--border);
        color: var(--foreground);
        line-height: 1.3;
    }
    :global(.readme-content h1:first-child) {
        margin-top: 0;
    }
    :global(.readme-content h2) {
        font-size: 1.35rem;
        font-weight: 600;
        margin: 1.8em 0 0.4em;
        padding-bottom: 0.25em;
        border-bottom: 1px solid var(--border);
        color: var(--foreground);
        line-height: 1.3;
    }
    :global(.readme-content h3) {
        font-size: 1.15rem;
        font-weight: 600;
        margin: 1.4em 0 0.3em;
        color: var(--foreground);
        line-height: 1.3;
    }
    :global(.readme-content h4) {
        font-size: 1rem;
        font-weight: 600;
        margin: 1.2em 0 0.2em;
        color: var(--foreground);
    }
    :global(.readme-content p) {
        margin: 0.8em 0;
    }
    :global(.readme-content p:first-child) {
        margin-top: 0;
    }
    :global(.readme-content strong) {
        font-weight: 600;
    }
    :global(.readme-content a) {
        color: var(--primary);
        text-decoration: none;
    }
    :global(.readme-content a:hover) {
        text-decoration: underline;
    }
    :global(.readme-content ul),
    :global(.readme-content ol) {
        margin: 0.5em 0;
        padding-left: 1.8em;
    }
    :global(.readme-content li) {
        margin: 0.15em 0;
    }
    :global(.readme-content ul) {
        list-style-type: disc;
    }
    :global(.readme-content ul ul) {
        list-style-type: circle;
    }
    :global(.readme-content ul ul ul) {
        list-style-type: square;
    }
    :global(.readme-content blockquote) {
        margin: 0.8em 0;
        padding: 0.5em 1em;
        border-left: 4px solid var(--border);
        background: color-mix(in oklab, var(--secondary) 50%, transparent);
        color: var(--muted-foreground);
    }
    :global(.readme-content blockquote p) {
        margin: 0.3em 0;
    }
    :global(.readme-content code) {
        font-family:
            ui-monospace, "Cascadia Code", "Source Code Pro", Menlo, Consolas,
            monospace;
        font-size: 0.875em;
        background: color-mix(in oklab, var(--secondary) 70%, transparent);
        padding: 0.15em 0.4em;
        border-radius: var(--radius-sm);
    }
    :global(.readme-content pre) {
        margin: 0.8em 0;
        padding: 1em 1.2em;
        background: color-mix(in oklab, var(--secondary) 50%, transparent);
        border: 1px solid var(--border);
        border-radius: var(--radius-lg);
        overflow-x: auto;
        font-size: 0.85em;
        line-height: 1.5;
    }
    :global(.readme-content pre code) {
        background: none;
        padding: 0;
        font-size: inherit;
    }
    :global(.readme-content table) {
        width: 100%;
        margin: 0.8em 0;
        border-collapse: collapse;
        font-size: 0.9em;
    }
    :global(.readme-content thead th) {
        background: color-mix(in oklab, var(--secondary) 60%, transparent);
        font-weight: 600;
        text-align: left;
        padding: 0.5em 0.75em;
        border: 1px solid var(--border);
        font-size: 0.9em;
    }
    :global(.readme-content tbody td) {
        padding: 0.4em 0.75em;
        border: 1px solid var(--border);
        vertical-align: top;
    }
    :global(.readme-content tbody tr:nth-child(even)) {
        background: color-mix(in oklab, var(--secondary) 30%, transparent);
    }
    :global(.readme-content hr) {
        margin: 1.5em 0;
        border: none;
        border-top: 1px solid var(--border);
    }
    :global(.readme-content img) {
        max-width: 100%;
        height: auto;
        border-radius: var(--radius-md);
    }
</style>
