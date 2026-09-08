<script lang="ts">
    import DigitizeWizard from "$lib/components/digitize/DigitizeWizard.svelte";

    let { data } = $props();
    const accessToken = $derived(data.accessToken as string);
</script>

<svelte:head><title>Digitize — echidna</title></svelte:head>

<div class="h-full overflow-y-auto bg-background text-foreground">
    <main>
        <DigitizeWizard {accessToken} />
    </main>
</div>
