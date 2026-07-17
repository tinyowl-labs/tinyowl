<script lang="ts">
    import Header from "$lib/components/ui/header.svelte";
    import DigitizeWizard from "$lib/components/digitize/DigitizeWizard.svelte";

    let { data } = $props();
    const accessToken = $derived(data.accessToken as string);
</script>

<svelte:head><title>Digitize — TinyOwl</title></svelte:head>

<div class="min-h-screen bg-background text-foreground">
    <Header hasSession={true} fixed />
    <main class="pt-11">
        <DigitizeWizard {accessToken} />
    </main>
</div>
