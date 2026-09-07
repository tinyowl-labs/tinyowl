<script lang="ts">
    import { enhance } from "$app/forms";
    import { Button } from "$lib/components/ui/button/index.js";

    let {
        signedIn,
        isMember,
        pending,
        loginHref,
        formError,
    }: {
        signedIn: boolean;
        isMember: boolean;
        pending: boolean;
        loginHref: string;
        formError?: string;
    } = $props();
</script>

{#if !isMember}
    <div class="shrink-0">
        {#if formError}
            <p class="mb-2 text-sm text-destructive">{formError}</p>
        {/if}
        {#if !signedIn}
            <Button href={loginHref} size="sm" variant="outline">
                Sign in to request to join
            </Button>
        {:else if pending}
            <p class="text-sm text-muted-foreground">Join request pending</p>
        {:else}
            <form method="POST" action="?/requestJoin" use:enhance>
                <Button type="submit" size="sm" variant="outline"
                    >Request to join</Button
                >
            </form>
        {/if}
    </div>
{/if}
