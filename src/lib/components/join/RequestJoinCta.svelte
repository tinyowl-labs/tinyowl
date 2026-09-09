<script lang="ts">
    import { enhance } from "$app/forms";
    import { goto } from "$app/navigation";
    import { Button } from "$lib/components/ui/button/index.js";

    let {
        signedIn,
        isMember,
        pending,
        loginHref,
        formError,
        leaveAction,
    }: {
        signedIn: boolean;
        isMember: boolean;
        pending: boolean;
        loginHref: string;
        formError?: string;
        /** Form action for leaving (e.g. "?/leaveProject"). Omit to hide. */
        leaveAction?: string;
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
{:else if leaveAction}
    <div class="shrink-0">
        {#if formError}
            <p class="mb-2 text-sm text-destructive">{formError}</p>
        {/if}
        <form
            method="POST"
            action={leaveAction}
            use:enhance={() => {
                return async ({ result, update }) => {
                    await update();
                    if (result.type === "success") {
                        await goto("/");
                    }
                };
            }}
        >
            <Button
                type="submit"
                size="sm"
                variant="ghost"
                class="text-muted-foreground hover:text-destructive"
                onclick={(e) => {
                    if (
                        !confirm(
                            "Leave this project? You will lose access until someone re-invites you.",
                        )
                    )
                        e.preventDefault();
                }}
            >
                Leave project
            </Button>
        </form>
    </div>
{/if}
