<script lang="ts">
    import { goto } from "$app/navigation";
    import { page } from "$app/stores";
    import { createClient } from "$lib/supabase/client";
    import { looksLikeEmail } from "$lib/auth-identifier";
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

    let firstName = $state("");
    let lastName = $state("");
    let username = $state("");
    let email = $state("");
    let password = $state("");
    let loading = $state(false);
    let error = $state("");
    let success = $state("");

    const showPassword = $derived(looksLikeEmail(email));

    async function saveProfile(token: string) {
        await fetch("/api/v1/me", {
            method: "PATCH",
            headers: {
                Authorization: `Bearer ${token}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                username: username.trim(),
                first_name: firstName.trim(),
                last_name: lastName.trim(),
            }),
        });
    }

    async function handleSubmit(e: SubmitEvent) {
        e.preventDefault();
        loading = true;
        error = "";
        success = "";
        if (!firstName || !lastName || !username || !email || !password) {
            error = "All fields are required.";
            loading = false;
            return;
        }
        const supabase = createClient();
        const { data, error: err } = await supabase.auth.signUp({
            email,
            password,
            options: {
                data: {
                    first_name: firstName,
                    last_name: lastName,
                    username,
                },
            },
        });
        if (err) {
            error = err.message;
            loading = false;
            return;
        }
        if (data.session?.access_token) {
            await saveProfile(data.session.access_token);
            const dest = safeNext($page.url.searchParams.get("next"), "/profile");
            await goto(dest, { invalidateAll: true });
            return;
        }
        success = "Account created. Check your email to confirm.";
        loading = false;
    }
</script>

<form onsubmit={handleSubmit} class="flex flex-col gap-6">
    <FieldGroup>
        <div class="flex flex-col items-center gap-1 text-center">
            <h1 class="text-2xl font-bold">Create an account</h1>
        </div>
        <OAuthButtons
            next={$page.url.searchParams.get("next")}
            disabled={loading}
        />
        <Field>
            <FieldLabel for="signup-email">Email</FieldLabel>
            <Input
                id="signup-email"
                type="email"
                bind:value={email}
                placeholder="m@example.com"
                required
            />
        </Field>
        {#if showPassword}
            <Field>
                <FieldLabel for="signup-password">Password</FieldLabel>
                <Input
                    id="signup-password"
                    type="password"
                    bind:value={password}
                    required
                />
            </Field>
            <div class="grid grid-cols-2 gap-4">
                <Field>
                    <FieldLabel for="first-name">First name</FieldLabel>
                    <Input
                        id="first-name"
                        type="text"
                        bind:value={firstName}
                        autocomplete="given-name"
                        required
                    />
                </Field>
                <Field>
                    <FieldLabel for="last-name">Last name</FieldLabel>
                    <Input
                        id="last-name"
                        type="text"
                        bind:value={lastName}
                        autocomplete="family-name"
                        required
                    />
                </Field>
            </div>
            <Field>
                <FieldLabel for="username">Username</FieldLabel>
                <Input
                    id="username"
                    type="text"
                    bind:value={username}
                    autocomplete="username"
                    placeholder="ada_field"
                    minlength={3}
                    maxlength={30}
                    required
                />
                <FieldDescription>3–30 characters: a–z, 0–9, _</FieldDescription>
            </Field>
        {/if}
        {#if error}<p class="text-sm text-destructive">{error}</p>{/if}
        {#if success}<p class="text-sm text-muted-foreground">{success}</p>{/if}
        {#if showPassword}
            <Field>
                <Button type="submit" disabled={loading}
                    >{loading ? "Creating account…" : "Create account"}</Button
                >
            </Field>
        {/if}
        <FieldDescription class="text-center">
            Already have an account?
            <a
                href="/auth/login?next={encodeURIComponent(
                    safeNext($page.url.searchParams.get("next")),
                )}"
                class="underline underline-offset-4">Sign in</a
            >
        </FieldDescription>
    </FieldGroup>
</form>
