<script lang="ts">
    import { goto } from "$app/navigation";
    import { createClient } from "$lib/supabase/client";
    import {
        FieldGroup,
        Field,
        FieldLabel,
        FieldDescription,
    } from "$lib/components/ui/field/index.js";
    import { Input } from "$lib/components/ui/input/index.js";
    import { Button } from "$lib/components/ui/button/index.js";

    let email = $state("");
    let password = $state("");
    let loading = $state(false);
    let error = $state("");

    async function handleSubmit(e: SubmitEvent) {
        e.preventDefault();
        loading = true;
        error = "";
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
        await goto("/profile");
    }
</script>

<form onsubmit={handleSubmit} class="flex flex-col gap-6">
    <FieldGroup>
        <div class="flex flex-col items-center gap-1 text-center">
            <h1 class="text-2xl font-bold">Sign in to TinyOwl</h1>
            <p class="text-muted-foreground text-sm text-balance">
                Enter your email below to sign in to your account
            </p>
        </div>
        <Field>
            <FieldLabel for="email">Email</FieldLabel>
            <Input
                id="email"
                type="email"
                bind:value={email}
                placeholder="m@example.com"
                required
            />
        </Field>
        <Field>
            <FieldLabel for="password">Password</FieldLabel>
            <Input
                id="password"
                type="password"
                bind:value={password}
                required
            />
        </Field>
        {#if error}
            <p class="text-sm text-destructive">{error}</p>
        {/if}
        <Field>
            <Button type="submit" disabled={loading}>
                {loading ? "Signing in…" : "Sign in"}
            </Button>
        </Field>
        <FieldDescription class="text-center">
            Don't have an account?
            <a href="/auth/signup" class="underline underline-offset-4"
                >Sign up</a
            >
        </FieldDescription>
    </FieldGroup>
</form>
