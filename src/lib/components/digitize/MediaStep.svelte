<script lang="ts">
    import MediaUpload from "$lib/components/artefacts/MediaUpload.svelte";

    type Props = {
        accessToken: string;
        projectSlug: string;
        onContinue: () => void;
        onSkip: () => void;
    };

    let { accessToken, projectSlug, onContinue, onSkip }: Props = $props();
    let uploaded = $state(0);
</script>

<div class="flex flex-col gap-4">
    <div>
        <h2 class="text-sm font-medium text-foreground">Attach media</h2>
        <p class="text-xs text-muted-foreground mt-0.5">
            Optional. Link photos to entities now, or skip and use Artefacts
            later.
        </p>
    </div>

    <MediaUpload
        {projectSlug}
        {accessToken}
        onUploaded={() => {
            uploaded += 1;
        }}
    />

    {#if uploaded > 0}
        <p class="text-xs text-muted-foreground">
            {uploaded} upload{uploaded === 1 ? "" : "s"} this session
        </p>
    {/if}

    <div class="flex gap-2 pt-2">
        <button
            type="button"
            onclick={onContinue}
            class="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
        >
            Continue
        </button>
        <button
            type="button"
            onclick={onSkip}
            class="rounded-md border border-border px-4 py-2 text-sm text-muted-foreground hover:text-foreground"
        >
            Skip
        </button>
    </div>
</div>
