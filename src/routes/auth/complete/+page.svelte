<script lang="ts">
    import { goto, invalidateAll } from "$app/navigation";
    import AuthShell from "$lib/components/AuthShell.svelte";
    import { createClient } from "$lib/supabase/client";
    import {
        FieldGroup,
        Field,
        FieldLabel,
        FieldDescription,
    } from "$lib/components/ui/field/index.js";
    import { Input } from "$lib/components/ui/input/index.js";
    import { Button } from "$lib/components/ui/button/index.js";
    import { untrack } from "svelte";

    let { data } = $props();
    let firstName = $state(untrack(() => data.firstName));
    let lastName = $state(untrack(() => data.lastName));
    let username = $state(untrack(() => data.username));
    let loading = $state(false);
    let error = $state("");

    async function handleSubmit(e: SubmitEvent) {
        e.preventDefault();
        loading = true;
        error = "";
        const supabase = createClient();
        const { data: sessionData } = await supabase.auth.getSession();
        const token = sessionData.session?.access_token;
        if (!token) {
            error = "Not signed in.";
            loading = false;
            return;
        }
        await supabase.auth.updateUser({
            data: {
                first_name: firstName.trim(),
                last_name: lastName.trim(),
                username: username.trim(),
            },
        });
        const res = await fetch("/api/v1/me", {
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
        if (!res.ok) {
            const text = await res.text();
            try {
                const body = JSON.parse(text) as { error?: string };
                error = body.error || text;
            } catch {
                error = text || "Could not save profile.";
            }
            loading = false;
            return;
        }
        await invalidateAll();
        await goto(data.next, { invalidateAll: true });
    }
</script>

<svelte:head><title>Complete your profile — echidna</title></svelte:head>

<AuthShell>
    <form onsubmit={handleSubmit} class="flex flex-col gap-6">
        <FieldGroup>
            <div class="flex flex-col items-center gap-1 text-center">
                <h1 class="text-2xl font-bold">Finish your profile</h1>
                <p class="text-muted-foreground text-sm text-balance">
                    Choose a username and confirm your name
                </p>
            </div>
            <div class="grid grid-cols-2 gap-4">
                <Field>
                    <FieldLabel for="first-name">First name</FieldLabel>
                    <Input
                        id="first-name"
                        bind:value={firstName}
                        autocomplete="given-name"
                        required
                    />
                </Field>
                <Field>
                    <FieldLabel for="last-name">Last name</FieldLabel>
                    <Input
                        id="last-name"
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
                    bind:value={username}
                    autocomplete="username"
                    minlength={3}
                    maxlength={30}
                    required
                />
                <FieldDescription>3–30 characters: a–z, 0–9, _</FieldDescription>
            </Field>
            {#if error}
                <p class="text-sm text-destructive">{error}</p>
            {/if}
            <Field>
                <Button type="submit" disabled={loading}
                    >{loading ? "Saving…" : "Continue"}</Button
                >
            </Field>
        </FieldGroup>
    </form>
</AuthShell>
