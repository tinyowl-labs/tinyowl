<script lang="ts">
    import { goto } from "$app/navigation";
    import { page } from "$app/stores";
    import { env } from "$env/dynamic/public";
    import { createClient } from "$lib/supabase/client";
    import { looksLikeEmail, looksLikeUsername } from "$lib/auth-identifier";
    import { safeNext } from "$lib/auth-next";
    import OAuthButtons from "$lib/components/auth/OAuthButtons.svelte";
    import {
        FieldGroup,
        Field,
        FieldLabel,
        FieldDescription,
    } from "$lib/components/ui/field/index.js";
    import { Input } from "$lib/components/ui/input/index.js";
    import { Button } from "$lib/components/ui/button/index.js";

    const inviteOnly = env.PUBLIC_DEMO_INVITE_ONLY === "true";

    let identifier = $state("");
    let password = $state("");
    let loading = $state(false);
    let error = $state("");

    const oauthError = $derived($page.url.searchParams.get("error") ?? "");
    const showPassword = $derived(
        looksLikeEmail(identifier) || looksLikeUsername(identifier),
    );

    async function handleSubmit(e: SubmitEvent) {
        e.preventDefault();
        loading = true;
        error = "";
        const trimmed = identifier.trim().replace(/^@/, "");
        let email = "";
        try {
            const res = await fetch("/api/v1/auth/resolve-login", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ identifier: trimmed }),
            });
            if (res.ok) {
                const data = (await res.json()) as { email?: string };
                email = data.email?.trim() ?? "";
            }
        } catch {
        }
        if (!email) {
            error = "Invalid login credentials";
            loading = false;
            return;
        }
        const supabase = createClient();
        const { error: err } = await supabase.auth.signInWithPassword({
            email,
            password,
        });
        if (err) {
            error = err.message;
            loading = false;
            return;
        }
        const dest = safeNext($page.url.searchParams.get("next"));
        await goto(dest, { invalidateAll: true });
    }
</script>

<form onsubmit={handleSubmit} class="flex flex-col gap-6">
    <FieldGroup>
        <div class="flex flex-col items-center gap-1 text-center">
            <h1 class="text-2xl font-bold">Sign in to echidna</h1>
            {#if inviteOnly}
                <p class="text-muted-foreground text-sm text-balance">
                    Use the credentials you were given for this private demo
                </p>
            {/if}
        </div>
        <OAuthButtons
            next={$page.url.searchParams.get("next")}
            disabled={loading}
        />
        <Field>
            <FieldLabel for="identifier">Email or username</FieldLabel>
            <Input
                id="identifier"
                type="text"
                autocomplete="username"
                bind:value={identifier}
                placeholder="ada_field or m@example.com"
                required
            />
        </Field>
        {#if showPassword}
            <Field>
                <FieldLabel for="password">Password</FieldLabel>
                <Input
                    id="password"
                    type="password"
                    bind:value={password}
                    required
                />
            </Field>
        {/if}
        {#if error || oauthError}
            <p class="text-sm text-destructive">{error || oauthError}</p>
        {/if}
        {#if showPassword}
            <Field>
                <Button type="submit" disabled={loading}>
                    {loading ? "Signing in…" : "Sign in"}
                </Button>
            </Field>
        {/if}
        {#if !inviteOnly}
            <FieldDescription class="text-center">
                Don't have an account?
                <a
                    href="/auth/signup?next={encodeURIComponent(
                        safeNext($page.url.searchParams.get("next")),
                    )}"
                    class="underline underline-offset-4">Sign up</a
                >
            </FieldDescription>
        {/if}
    </FieldGroup>
</form>
