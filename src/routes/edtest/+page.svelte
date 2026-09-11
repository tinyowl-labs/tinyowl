<script lang="ts">
    import MarkdownEditor from "$lib/components/markdown/markdown-editor.svelte";

    let content = $state("# About\n\nSample text.\n");
    let editing = $state(true);
    let closing = $state(false);
    let closedCount = $state(0);

    function requestCancel() {
        if (closing) return;
        closing = true;
    }

    function handleClosed() {
        closedCount += 1;
        editing = false;
        closing = false;
    }

    function reopen() {
        editing = true;
        closing = false;
    }
</script>

<svelte:head>
    <title>Editor scratch test</title>
</svelte:head>

<div class="mx-auto max-w-3xl space-y-3 p-6">
    <button type="button" onclick={reopen}>reopen</button>
    <p>closed: {closedCount}</p>
    {#if editing}
        <MarkdownEditor
            bind:value={content}
            placeholder="Write something…"
            onCancel={requestCancel}
            onSave={requestCancel}
            {closing}
            onClosed={handleClosed}
        />
    {/if}
</div>
