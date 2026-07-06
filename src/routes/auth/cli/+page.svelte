<script lang="ts">
    import { page } from "$app/stores";
    import { Button } from "$lib/components/ui/button";
    import * as InputOTP from "$lib/components/ui/input-otp";

    let { data } = $props();

    let code = $state($page.url.searchParams.get("code") || "");
    let verifying = $state(false);
    let done = $state(false);
    let errorMsg = $state("");

    async function verify() {
        if (!data.accessToken || code.length < 8) return;
        verifying = true;
        errorMsg = "";
        try {
            const res = await fetch(`${data.serverUrl}/auth/cli/verify`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ code, token: data.accessToken }),
            });
            if (!res.ok) {
                const err = await res.json();
                throw new Error(err.error || "Verification failed");
            }
            done = true;
        } catch (e) {
            errorMsg = e instanceof Error ? e.message : "Unknown error";
        } finally {
            verifying = false;
        }
    }
</script>

<svelte:head><title>Authorise CLI — TinyOwl</title></svelte:head>

<div class="flex min-h-screen items-center justify-center px-4">
    <div class="w-full max-w-sm text-center">
        <h1
            class="mb-4 text-lg font-semibold text-[#15110f] dark:text-[#f7f2ee]"
        >
            TinyOwl CLI
        </h1>

        {#if !data.user}
            <p class="text-sm text-[#8b817c] dark:text-neutral-500">
                Please
                <a href="/auth/login" class="underline">sign in</a>
                {" "}first, then return.
            </p>
        {:else if done}
            <div
                class="rounded-lg border border-green-300 bg-green-50 p-4 text-left dark:border-green-800 dark:bg-green-950"
            >
                <h2 class="font-semibold text-green-800 dark:text-green-300">
                    Authorised
                </h2>
                <p class="mt-1 text-sm text-green-700 dark:text-green-400">
                    You can close this page and return to your terminal.
                </p>
            </div>
        {:else}
            <p class="text-xs text-[#8b817c] dark:text-neutral-500">
                Signed in as{" "}
                <strong>{data.user.email ?? data.user.id}</strong>
            </p>

            <p class="mt-4 text-xs text-[#8b817c] dark:text-neutral-500">
                Enter the 8-character code shown in your terminal
            </p>

            <div class="mt-3 flex justify-center">
                <InputOTP.Root
                    maxlength={8}
                    bind:value={code}
                    onComplete={verify}
                >
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
                onclick={verify}
                disabled={verifying || code.length < 8}
                class="mt-6 w-full rounded-full"
            >
                {verifying ? "Authorising…" : "Authorise CLI Access"}
            </Button>

            {#if errorMsg}
                <p class="mt-4 text-xs text-red-500">{errorMsg}</p>
            {/if}
        {/if}
    </div>
</div>
