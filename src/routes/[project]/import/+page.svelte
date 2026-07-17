<script lang="ts">
    import DigitizeWizard from "$lib/components/digitize/DigitizeWizard.svelte";
    import { page } from "$app/stores";

    let { data } = $props();
    const accessToken = $derived(data.accessToken as string);
    const slug = $derived($page.params.project);
    const title = $derived((data.title as string) ?? slug);
</script>

<svelte:head><title>Import — {title}</title></svelte:head>

<DigitizeWizard {accessToken} existingSlug={slug} existingTitle={title} />
