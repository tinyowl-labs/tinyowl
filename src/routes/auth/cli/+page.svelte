<script lang="ts">
    import { page } from "$app/stores";
    import { enhance } from "$app/forms";
    import { Button } from "$lib/components/ui/button";
    import * as InputOTP from "$lib/components/ui/input-otp";

    let { data, form } = $props();

    let code = $state($page.url.searchParams.get("code") || "");
    let verifying = $state(false);
    let done = $state(false);

    const loginHref = $derived(
        `/auth/login?next=${encodeURIComponent(`/auth/cli?code=${code || ""}`)}`,
    );
</script>

<svelte:head><title>Authorise CLI — echidna</title></svelte:head>

<div class="flex min-h-screen items-center justify-center px-4">
    <div class="w-full max-w-sm text-center">
        <h1 class="mb-4 text-lg font-semibold text-foreground">
            echidna CLI
        </h1>

        {#if !data.user}
            <p class="text-sm text-muted-foreground">
                Please
                <a href={loginHref} class="underline text-primary">sign in</a>
                {" "}first, then return.
            </p>
        {:else if done || form?.success}
            <div
                class="rounded-lg border border-border bg-secondary/50 p-4 text-left"
            >
                <h2 class="font-semibold text-foreground">Authorised</h2>
                <p class="mt-1 text-sm text-muted-foreground">
                    You can close this page and return to your terminal.
                </p>
            </div>
        {:else}
            <p class="text-xs text-muted-foreground">
                Signed in as{" "}
                <strong class="text-foreground"
                    >{data.user.email ?? data.user.id}</strong
                >
            </p>

            <p class="mt-4 text-xs text-muted-foreground">
                Enter the 8-character code shown in your terminal
            </p>

            <form
                method="POST"
                action="?/verify"
                class="mt-3"
                use:enhance={() => {
                    verifying = true;
                    return async ({ result, update }) => {
                        verifying = false;
                        await update();
                        if (result.type === "success") done = true;
                    };
                }}
            >
                <input type="hidden" name="code" value={code} />

                <div class="flex justify-center">
                    <InputOTP.Root maxlength={8} bind:value={code}>
                        {#snippet children({ cells })}
                            <InputOTP.Group
                                class="gap-2.5 *:data-[slot=input-otp-slot]:rounded-md *:data-[slot=input-otp-slot]:border"
                            >
                                {#each cells.slice(0, 4) as cell}
                                    <InputOTP.Slot {cell} />
                                {/each}
                                <InputOTP.Separator />
                                {#each cells.slice(4, 8) as cell}
                                    <InputOTP.Slot {cell} />
                                {/each}
                            </InputOTP.Group>
                        {/snippet}
                    </InputOTP.Root>
                </div>

                <Button
                    type="submit"
                    disabled={verifying || code.length < 8}
                    class="mt-6 w-full rounded-full"
                >
                    {verifying ? "Authorising…" : "Authorise CLI Access"}
                </Button>
            </form>

            {#if form?.error}
                <p class="mt-4 text-xs text-destructive">{form.error}</p>
            {/if}
        {/if}
    </div>
</div>
