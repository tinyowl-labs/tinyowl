<script lang="ts">
    import NewProjectWizard from "$lib/components/projects/NewProjectWizard.svelte";

    let { data } = $props();
</script>

<svelte:head><title>New project — echidna</title></svelte:head>

<div class="h-full overflow-y-auto bg-background text-foreground">
    <NewProjectWizard
        accessToken={data.accessToken}
        org={data.org}
        qfieldAccounts={data.qfieldAccounts}
    />
</div>
