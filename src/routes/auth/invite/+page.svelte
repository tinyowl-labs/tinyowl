<script lang="ts">
    import { enhance } from "$app/forms";
    import AuthShell from "$lib/components/AuthShell.svelte";
    import { Button } from "$lib/components/ui/button/index.js";
    import { page } from "$app/stores";

    let { data, form } = $props();
    const loginHref = $derived(
        `/auth/login?next=${encodeURIComponent($page.url.pathname + $page.url.search)}`,
    );
    const signupHref = $derived(
        `/auth/signup?next=${encodeURIComponent($page.url.pathname + $page.url.search)}`,
    );
    const target = $derived.by(() => {
        const p = data.preview;
        if (!p) return "this workspace";
        if (p.kind === "org") return p.org_slug ?? "an organisation";
        return p.project_slug ?? "a project";
    });
</script>

<svelte:head><title>Invite — echidna</title></svelte:head>

<AuthShell>
    {#if data.missing}
        <div class="space-y-3 text-center">
            <h1 class="text-2xl font-bold">Invite not found</h1>
            <p class="text-muted-foreground text-sm">
                This link is missing a token.
            </p>
        </div>
    {:else if data.previewError || !data.preview}
        <div class="space-y-3 text-center">
            <h1 class="text-2xl font-bold">Invite unavailable</h1>
            <p class="text-sm text-destructive">
                {data.previewError || "This invite is not valid."}
            </p>
        </div>
    {:else if data.preview.revoked_at}
        <div class="space-y-3 text-center">
            <h1 class="text-2xl font-bold">Invite revoked</h1>
            <p class="text-muted-foreground text-sm">
                Ask an admin to send a new link.
            </p>
        </div>
    {:else if data.preview.expired}
        <div class="space-y-3 text-center">
            <h1 class="text-2xl font-bold">Invite expired</h1>
            <p class="text-muted-foreground text-sm">
                Ask an admin to send a new link.
            </p>
        </div>
    {:else}
        <div class="space-y-4">
            <div class="text-center">
                <h1 class="text-2xl font-bold">You're invited</h1>
                <p class="text-muted-foreground mt-1 text-sm">
                    Join {target} as {data.preview.role}.
                </p>
            </div>
            {#if form?.error}
                <p class="text-sm text-destructive">{form.error}</p>
            {/if}
            {#if data.signedIn}
                <form method="POST" action="?/redeem" use:enhance>
                    <input type="hidden" name="token" value={data.token} />
                    <Button type="submit" class="w-full">Accept invite</Button>
                </form>
            {:else}
                <div class="flex flex-col gap-2">
                    <Button href={loginHref}>Sign in to accept</Button>
                    <Button href={signupHref} variant="outline"
                        >Create an account</Button
                    >
                </div>
            {/if}
        </div>
    {/if}
</AuthShell>
