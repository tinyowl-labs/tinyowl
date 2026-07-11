<script lang="ts">
    import { enhance } from "$app/forms";
    import { invalidateAll } from "$app/navigation";
    import { page } from "$app/stores";
    import Header from "$lib/components/ui/header.svelte";
    import { Tabs } from "$lib/components/ui/tabs/index.js";
    import { Button } from "$lib/components/ui/button/index.js";
    import { Input } from "$lib/components/ui/input/index.js";
    import {
        Field,
        FieldLabel,
        FieldDescription,
        FieldGroup,
    } from "$lib/components/ui/field/index.js";
    import { createClient } from "$lib/supabase/client";
    import {
        themePrefs,
        setPreference,
        ACCENT_PRESETS,
        type BgBase,
        type RadiusScale,
        type BlurScale,
    } from "$lib/stores/theme.svelte";
    import CopyIcon from "@lucide/svelte/icons/copy";
    import CheckIcon from "@lucide/svelte/icons/check";
    import Trash2Icon from "@lucide/svelte/icons/trash-2";
    import PlusIcon from "@lucide/svelte/icons/plus";
    import ExternalLinkIcon from "@lucide/svelte/icons/external-link";
    import LogOutIcon from "@lucide/svelte/icons/log-out";

    let { data, form: rawForm } = $props();
    const form = $derived(rawForm as any);

    const hasSession = $derived(Boolean($page.data?.user ?? data?.user));
    const user = $derived(data?.user);
    const qfieldAccounts = $derived(data?.qfieldAccounts ?? []);
    const qfieldLinks = $derived(data?.qfieldLinks ?? []);
    const cliTokens = $derived(data?.cliTokens ?? []);

    let activeTab = $state("account");
    let showQFieldConnect = $state(false);

    // Account
    let firstName = $state("");
    let lastName = $state("");
    let accountSaving = $state(false);
    let accountMsg = $state("");
    let accountError = $state("");

    $effect(() => {
        firstName = user?.user_metadata?.first_name ?? "";
        lastName = user?.user_metadata?.last_name ?? "";
    });

    const initials = $derived(
        firstName
            ? (firstName.charAt(0) + (lastName?.charAt(0) ?? "")).toUpperCase()
            : (user?.email?.charAt(0).toUpperCase() ?? "U"),
    );

    async function saveAccount(e: SubmitEvent) {
        e.preventDefault();
        accountSaving = true;
        accountMsg = "";
        accountError = "";
        const supabase = createClient();
        const { error } = await supabase.auth.updateUser({
            data: {
                first_name: firstName.trim(),
                last_name: lastName.trim(),
            },
        });
        accountSaving = false;
        if (error) {
            accountError = error.message;
            return;
        }
        accountMsg = "Profile updated.";
        await invalidateAll();
    }

    // CLI tokens
    let showCreateToken = $state(false);
    let tokenLabel = $state("");
    let creatingToken = $state(false);
    let tokenError = $state("");
    let newlyCreatedToken = $state<string | null>(null);
    let copied = $state(false);
    let revokingId = $state<string | null>(null);

    async function createToken(e: SubmitEvent) {
        e.preventDefault();
        creatingToken = true;
        tokenError = "";
        newlyCreatedToken = null;
        try {
            const res = await fetch("/api/auth/cli-token", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ label: tokenLabel.trim() || "pat" }),
            });
            if (!res.ok) {
                tokenError = await res.text();
                return;
            }
            const body = await res.json();
            newlyCreatedToken = body.token ?? null;
            tokenLabel = "";
            showCreateToken = false;
            await invalidateAll();
        } catch (err) {
            tokenError = String(err);
        } finally {
            creatingToken = false;
        }
    }

    async function revokeToken(id: string) {
        if (
            !confirm(
                "Revoke this token? CLI sessions using it will stop working.",
            )
        ) {
            return;
        }
        revokingId = id;
        try {
            const res = await fetch("/api/auth/cli-token", {
                method: "DELETE",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ id }),
            });
            if (!res.ok) {
                tokenError = await res.text();
                return;
            }
            if (newlyCreatedToken) newlyCreatedToken = null;
            await invalidateAll();
        } catch (err) {
            tokenError = String(err);
        } finally {
            revokingId = null;
        }
    }

    async function copyToken() {
        if (!newlyCreatedToken) return;
        await navigator.clipboard.writeText(newlyCreatedToken);
        copied = true;
        setTimeout(() => (copied = false), 2000);
    }

    // Security
    let newPassword = $state("");
    let confirmPassword = $state("");
    let passwordSaving = $state(false);
    let passwordMsg = $state("");
    let passwordError = $state("");

    async function changePassword(e: SubmitEvent) {
        e.preventDefault();
        passwordMsg = "";
        passwordError = "";
        if (newPassword.length < 8) {
            passwordError = "Password must be at least 8 characters.";
            return;
        }
        if (newPassword !== confirmPassword) {
            passwordError = "Passwords do not match.";
            return;
        }
        passwordSaving = true;
        const supabase = createClient();
        const { error } = await supabase.auth.updateUser({
            password: newPassword,
        });
        passwordSaving = false;
        if (error) {
            passwordError = error.message;
            return;
        }
        newPassword = "";
        confirmPassword = "";
        passwordMsg = "Password updated.";
    }

    function linksForAccount(accountId: string) {
        return qfieldLinks.filter((l) => l.account_id === accountId);
    }

    function formatDate(ts: string | null | undefined): string {
        if (!ts) return "—";
        return new Date(ts).toLocaleString();
    }

    const tabs = [
        { value: "account", label: "Account" },
        { value: "qfieldcloud", label: "QFieldCloud" },
        { value: "tokens", label: "CLI tokens" },
        { value: "appearance", label: "Appearance" },
        { value: "security", label: "Security" },
    ];

    const bgBases: { value: BgBase; label: string }[] = [
        { value: "pitch", label: "Pitch" },
        { value: "dark", label: "Dark" },
        { value: "dim", label: "Dim" },
        { value: "stone", label: "Stone" },
        { value: "paper", label: "Paper" },
    ];
    const radii: { value: RadiusScale; label: string }[] = [
        { value: "sharp", label: "Sharp" },
        { value: "rounded", label: "Rounded" },
        { value: "pill", label: "Pill" },
    ];
    const blurs: { value: BlurScale; label: string }[] = [
        { value: "none", label: "None" },
        { value: "subtle", label: "Subtle" },
        { value: "glass", label: "Glass" },
    ];

    $effect(() => {
        if (form?.success && form?.qfieldAction === "connected") {
            showQFieldConnect = false;
        }
    });
</script>

<svelte:head><title>Settings — TinyOwl</title></svelte:head>

<div class="flex flex-col h-screen overflow-hidden">
    <Header subtitle="Settings" {hasSession} />

    <main class="flex-1 min-h-0 overflow-y-auto bg-background">
        <div class="mx-auto w-full max-w-4xl px-6 py-8">
            <header class="mb-6">
                <h1
                    class="text-2xl font-semibold tracking-tight text-foreground"
                >
                    Settings
                </h1>
                <p class="mt-1 text-sm text-muted-foreground">
                    Account, integrations, and preferences
                </p>
            </header>

            <Tabs bind:value={activeTab} {tabs}>
                {#snippet children(tabValue: string)}
                    {#if tabValue === "account"}
                        <div class="space-y-8 w-full">
                            <section>
                                <div class="flex items-center gap-4 mb-6">
                                    <div
                                        class="size-16 shrink-0 rounded-full bg-secondary flex items-center justify-center text-xl font-medium text-muted-foreground"
                                    >
                                        {initials}
                                    </div>
                                    <div class="min-w-0">
                                        <p
                                            class="text-sm font-medium text-foreground truncate"
                                        >
                                            {firstName
                                                ? `${firstName} ${lastName}`.trim()
                                                : (user?.email ?? "User")}
                                        </p>
                                        {#if user?.email}
                                            <p
                                                class="text-sm text-muted-foreground truncate"
                                            >
                                                {user.email}
                                            </p>
                                        {/if}
                                    </div>
                                </div>

                                <form onsubmit={saveAccount} class="space-y-4">
                                    <FieldGroup>
                                        <div class="grid grid-cols-2 gap-3">
                                            <Field>
                                                <FieldLabel for="first_name"
                                                    >First name</FieldLabel
                                                >
                                                <Input
                                                    id="first_name"
                                                    bind:value={firstName}
                                                    autocomplete="given-name"
                                                />
                                            </Field>
                                            <Field>
                                                <FieldLabel for="last_name"
                                                    >Last name</FieldLabel
                                                >
                                                <Input
                                                    id="last_name"
                                                    bind:value={lastName}
                                                    autocomplete="family-name"
                                                />
                                            </Field>
                                        </div>
                                        <Field>
                                            <FieldLabel for="email"
                                                >Email</FieldLabel
                                            >
                                            <Input
                                                id="email"
                                                type="email"
                                                value={user?.email ?? ""}
                                                disabled
                                            />
                                            <FieldDescription
                                                >Email cannot be changed
                                                here.</FieldDescription
                                            >
                                        </Field>
                                    </FieldGroup>
                                    {#if accountError}
                                        <p class="text-sm text-destructive">
                                            {accountError}
                                        </p>
                                    {/if}
                                    {#if accountMsg}
                                        <p class="text-sm text-foreground">
                                            {accountMsg}
                                        </p>
                                    {/if}
                                    <Button
                                        type="submit"
                                        disabled={accountSaving}
                                    >
                                        {accountSaving
                                            ? "Saving…"
                                            : "Save changes"}
                                    </Button>
                                </form>
                            </section>
                        </div>
                    {:else if tabValue === "qfieldcloud"}
                        <div class="space-y-8 w-full">
                            <section>
                                <div
                                    class="flex items-start justify-between gap-4 mb-4"
                                >
                                    <div>
                                        <h2
                                            class="text-sm font-medium text-foreground"
                                        >
                                            Connected instances
                                        </h2>
                                        <p
                                            class="mt-1 text-sm text-muted-foreground"
                                        >
                                            Connect a Cloud account, then link a
                                            project from that project's
                                            settings.
                                        </p>
                                    </div>
                                    <Button
                                        type="button"
                                        variant="outline"
                                        size="sm"
                                        onclick={() =>
                                            (showQFieldConnect =
                                                !showQFieldConnect)}
                                    >
                                        {showQFieldConnect
                                            ? "Cancel"
                                            : "Connect instance"}
                                    </Button>
                                </div>

                                {#if form?.error && form?.qfieldAction}
                                    <p
                                        class="mb-4 rounded-md border border-destructive/25 bg-destructive/5 px-3 py-2 text-sm text-destructive"
                                    >
                                        {form.error}
                                    </p>
                                {/if}
                                {#if form?.success && form?.qfieldAction === "connected"}
                                    <p
                                        class="mb-4 rounded-md border border-border bg-secondary/50 px-3 py-2 text-sm text-foreground"
                                    >
                                        Connected. Open a project’s Settings →
                                        QFieldCloud to link a Cloud project.
                                    </p>
                                {/if}

                                {#if showQFieldConnect}
                                    <form
                                        method="POST"
                                        action="?/connectQFieldCloud"
                                        class="mb-4 rounded-lg border border-border p-4 space-y-3"
                                        use:enhance
                                    >
                                        <Field>
                                            <FieldLabel for="base_url"
                                                >Instance URL</FieldLabel
                                            >
                                            <Input
                                                id="base_url"
                                                type="url"
                                                name="base_url"
                                                required
                                                placeholder="https://app.qfield.cloud"
                                            />
                                        </Field>
                                        <div class="grid grid-cols-2 gap-3">
                                            <Field>
                                                <FieldLabel for="qfc_username"
                                                    >Username</FieldLabel
                                                >
                                                <Input
                                                    id="qfc_username"
                                                    type="text"
                                                    name="username"
                                                    required
                                                    autocomplete="username"
                                                />
                                            </Field>
                                            <Field>
                                                <FieldLabel for="qfc_password"
                                                    >Password</FieldLabel
                                                >
                                                <Input
                                                    id="qfc_password"
                                                    type="password"
                                                    name="password"
                                                    required
                                                    autocomplete="current-password"
                                                />
                                            </Field>
                                        </div>
                                        <Field>
                                            <FieldLabel for="qfc_label"
                                                >Label (optional)</FieldLabel
                                            >
                                            <Input
                                                id="qfc_label"
                                                type="text"
                                                name="label"
                                                placeholder="injserver"
                                            />
                                        </Field>
                                        <p class="text-xs text-muted-foreground">
                                            Password is used once to obtain a
                                            token; it is not stored.
                                        </p>
                                        <Button type="submit" size="sm"
                                            >Connect</Button
                                        >
                                    </form>
                                {/if}

                                {#if qfieldAccounts.length === 0}
                                    <div
                                        class="rounded-lg border border-dashed border-border px-4 py-8 text-center"
                                    >
                                        <p class="text-sm text-muted-foreground">
                                            No Cloud instances connected yet.
                                        </p>
                                    </div>
                                {:else}
                                    <div class="flex flex-col gap-3">
                                        {#each qfieldAccounts as acct}
                                            {@const links = linksForAccount(
                                                acct.id,
                                            )}
                                            <div
                                                class="rounded-lg border border-border p-4 bg-card space-y-3"
                                            >
                                                <div
                                                    class="flex items-start justify-between gap-4"
                                                >
                                                    <div class="min-w-0">
                                                        <p
                                                            class="text-sm font-medium text-foreground truncate"
                                                        >
                                                            {acct.label ||
                                                                acct.base_url}
                                                        </p>
                                                        <p
                                                            class="text-xs text-muted-foreground mt-0.5"
                                                        >
                                                            {acct.username} · {acct.base_url}
                                                        </p>
                                                        {#if acct.expires_at}
                                                            <p
                                                                class="text-xs text-muted-foreground mt-1"
                                                            >
                                                                Token expires: {formatDate(
                                                                    acct.expires_at,
                                                                )}
                                                            </p>
                                                        {/if}
                                                    </div>
                                                    <form
                                                        method="POST"
                                                        action="?/disconnectQFieldCloud"
                                                        use:enhance
                                                    >
                                                        <input
                                                            type="hidden"
                                                            name="account_id"
                                                            value={acct.id}
                                                        />
                                                        <Button
                                                            type="submit"
                                                            variant="ghost"
                                                            size="sm"
                                                            class="text-muted-foreground hover:text-destructive"
                                                            onclick={(e) => {
                                                                if (
                                                                    !confirm(
                                                                        "Disconnect this Cloud account?",
                                                                    )
                                                                )
                                                                    e.preventDefault();
                                                            }}
                                                        >
                                                            Disconnect
                                                        </Button>
                                                    </form>
                                                </div>

                                                {#if links.length > 0}
                                                    <div
                                                        class="border-t border-border pt-3"
                                                    >
                                                        <p
                                                            class="text-xs font-medium text-muted-foreground mb-2"
                                                        >
                                                            Linked TinyOwl
                                                            projects
                                                        </p>
                                                        <ul class="space-y-1.5">
                                                            {#each links as link}
                                                                <li>
                                                                    <a
                                                                        href="/{link.tinyowl_slug}/settings"
                                                                        class="inline-flex items-center gap-1.5 text-sm text-foreground hover:underline"
                                                                    >
                                                                        {link.tinyowl_slug}
                                                                        {#if link.qfc_project_name}
                                                                            <span
                                                                                class="text-muted-foreground"
                                                                                >←
                                                                                {link.qfc_project_name}</span
                                                                            >
                                                                        {/if}
                                                                        <ExternalLinkIcon
                                                                            class="size-3 text-muted-foreground"
                                                                        />
                                                                    </a>
                                                                </li>
                                                            {/each}
                                                        </ul>
                                                    </div>
                                                {:else}
                                                    <p
                                                        class="text-xs text-muted-foreground border-t border-border pt-3"
                                                    >
                                                        No projects linked yet.
                                                        Open a project’s
                                                        Settings → QFieldCloud
                                                        to link one.
                                                    </p>
                                                {/if}
                                            </div>
                                        {/each}
                                    </div>
                                {/if}
                            </section>
                        </div>
                    {:else if tabValue === "tokens"}
                        <div class="space-y-8 w-full">
                            <section>
                                <div
                                    class="flex items-start justify-between gap-4 mb-4"
                                >
                                    <div>
                                        <h2
                                            class="text-sm font-medium text-foreground"
                                        >
                                            Personal access tokens
                                        </h2>
                                        <p
                                            class="mt-1 text-sm text-muted-foreground"
                                        >
                                            Use with the TinyOwl CLI. Running
                                            <code
                                                class="font-mono text-xs rounded px-1 bg-secondary"
                                                >tinyowl login</code
                                            >
                                            also creates a
                                            <code
                                                class="font-mono text-xs rounded px-1 bg-secondary"
                                                >cli-login</code
                                            > token.
                                        </p>
                                    </div>
                                    <Button
                                        type="button"
                                        variant="outline"
                                        size="sm"
                                        onclick={() => {
                                            showCreateToken = !showCreateToken;
                                            newlyCreatedToken = null;
                                            tokenError = "";
                                        }}
                                    >
                                        <PlusIcon class="size-3.5" />
                                        {showCreateToken
                                            ? "Cancel"
                                            : "New token"}
                                    </Button>
                                </div>

                                {#if newlyCreatedToken}
                                    <div
                                        class="mb-4 rounded-lg border border-border bg-secondary/40 p-4 space-y-2"
                                    >
                                        <p
                                            class="text-sm font-medium text-foreground"
                                        >
                                            Copy your token now — it won’t be
                                            shown again.
                                        </p>
                                        <div class="flex items-center gap-2">
                                            <code
                                                class="flex-1 min-w-0 truncate rounded-md border border-border bg-background px-3 py-2 font-mono text-xs"
                                            >
                                                {newlyCreatedToken}
                                            </code>
                                            <Button
                                                type="button"
                                                variant="outline"
                                                size="icon-sm"
                                                onclick={copyToken}
                                                title="Copy"
                                            >
                                                {#if copied}
                                                    <CheckIcon class="size-4" />
                                                {:else}
                                                    <CopyIcon class="size-4" />
                                                {/if}
                                            </Button>
                                        </div>
                                    </div>
                                {/if}

                                {#if showCreateToken}
                                    <form
                                        onsubmit={createToken}
                                        class="mb-4 rounded-lg border border-border p-4 space-y-3"
                                    >
                                        <Field>
                                            <FieldLabel for="token_label"
                                                >Label</FieldLabel
                                            >
                                            <Input
                                                id="token_label"
                                                bind:value={tokenLabel}
                                                placeholder="laptop"
                                            />
                                        </Field>
                                        {#if tokenError}
                                            <p class="text-sm text-destructive">
                                                {tokenError}
                                            </p>
                                        {/if}
                                        <Button
                                            type="submit"
                                            size="sm"
                                            disabled={creatingToken}
                                        >
                                            {creatingToken
                                                ? "Creating…"
                                                : "Create token"}
                                        </Button>
                                    </form>
                                {/if}

                                {#if tokenError && !showCreateToken}
                                    <p class="mb-4 text-sm text-destructive">
                                        {tokenError}
                                    </p>
                                {/if}

                                {#if cliTokens.length === 0}
                                    <div
                                        class="rounded-lg border border-dashed border-border px-4 py-8 text-center"
                                    >
                                        <p class="text-sm text-muted-foreground">
                                            No tokens yet.
                                        </p>
                                    </div>
                                {:else}
                                    <div
                                        class="rounded-lg border border-border divide-y divide-border"
                                    >
                                        {#each cliTokens as tok}
                                            <div
                                                class="flex items-center justify-between gap-4 px-4 py-3"
                                            >
                                                <div class="min-w-0">
                                                    <p
                                                        class="text-sm font-medium text-foreground"
                                                    >
                                                        {tok.label || "pat"}
                                                    </p>
                                                    <p
                                                        class="text-xs font-mono text-muted-foreground mt-0.5"
                                                    >
                                                        {tok.token_prefix}…
                                                    </p>
                                                    <p
                                                        class="text-xs text-muted-foreground mt-1"
                                                    >
                                                        Created {formatDate(
                                                            tok.created_at,
                                                        )}
                                                        · Last used {formatDate(
                                                            tok.last_used_at,
                                                        )}
                                                    </p>
                                                </div>
                                                <Button
                                                    type="button"
                                                    variant="ghost"
                                                    size="icon-sm"
                                                    class="text-muted-foreground hover:text-destructive shrink-0"
                                                    disabled={revokingId ===
                                                        tok.id}
                                                    onclick={() =>
                                                        revokeToken(tok.id)}
                                                    title="Revoke"
                                                >
                                                    <Trash2Icon
                                                        class="size-4"
                                                    />
                                                </Button>
                                            </div>
                                        {/each}
                                    </div>
                                {/if}
                            </section>
                        </div>
                    {:else if tabValue === "appearance"}
                        <div class="space-y-8 w-full">
                            <section>
                                <h2
                                    class="text-sm font-medium text-foreground mb-1"
                                >
                                    Background
                                </h2>
                                <p class="text-sm text-muted-foreground mb-4">
                                    Stored in this browser only.
                                </p>
                                <div class="flex flex-wrap gap-2">
                                    {#each bgBases as opt}
                                        <button
                                            type="button"
                                            onclick={() =>
                                                setPreference(
                                                    "bgBase",
                                                    opt.value,
                                                )}
                                            class="rounded-md border px-3 py-1.5 text-sm transition-colors {themePrefs.bgBase ===
                                            opt.value
                                                ? 'border-foreground bg-secondary text-foreground'
                                                : 'border-border text-muted-foreground hover:bg-secondary/50'}"
                                        >
                                            {opt.label}
                                        </button>
                                    {/each}
                                </div>
                            </section>

                            <section>
                                <h2
                                    class="text-sm font-medium text-foreground mb-1"
                                >
                                    Accent
                                </h2>
                                <p class="text-sm text-muted-foreground mb-4">
                                    Curated hues for UI accents.
                                </p>
                                <div class="flex flex-wrap gap-2">
                                    {#each ACCENT_PRESETS as preset}
                                        <button
                                            type="button"
                                            onclick={() =>
                                                setPreference(
                                                    "accentHue",
                                                    preset.hue,
                                                )}
                                            class="inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm transition-colors {themePrefs.accentHue ===
                                            preset.hue
                                                ? 'border-foreground bg-secondary text-foreground'
                                                : 'border-border text-muted-foreground hover:bg-secondary/50'}"
                                        >
                                            <span
                                                class="size-3 rounded-full shrink-0"
                                                style="background: hsl({preset.hue} 60% 50%)"
                                            ></span>
                                            {preset.name}
                                        </button>
                                    {/each}
                                </div>
                            </section>

                            <section>
                                <h2
                                    class="text-sm font-medium text-foreground mb-1"
                                >
                                    Corner radius
                                </h2>
                                <div class="flex flex-wrap gap-2 mt-4">
                                    {#each radii as opt}
                                        <button
                                            type="button"
                                            onclick={() =>
                                                setPreference(
                                                    "radius",
                                                    opt.value,
                                                )}
                                            class="rounded-md border px-3 py-1.5 text-sm transition-colors {themePrefs.radius ===
                                            opt.value
                                                ? 'border-foreground bg-secondary text-foreground'
                                                : 'border-border text-muted-foreground hover:bg-secondary/50'}"
                                        >
                                            {opt.label}
                                        </button>
                                    {/each}
                                </div>
                            </section>

                            <section>
                                <h2
                                    class="text-sm font-medium text-foreground mb-1"
                                >
                                    Blur
                                </h2>
                                <div class="flex flex-wrap gap-2 mt-4">
                                    {#each blurs as opt}
                                        <button
                                            type="button"
                                            onclick={() =>
                                                setPreference(
                                                    "blur",
                                                    opt.value,
                                                )}
                                            class="rounded-md border px-3 py-1.5 text-sm transition-colors {themePrefs.blur ===
                                            opt.value
                                                ? 'border-foreground bg-secondary text-foreground'
                                                : 'border-border text-muted-foreground hover:bg-secondary/50'}"
                                        >
                                            {opt.label}
                                        </button>
                                    {/each}
                                </div>
                            </section>
                        </div>
                    {:else if tabValue === "security"}
                        <div class="space-y-10 w-full">
                            <section>
                                <h2
                                    class="text-sm font-medium text-foreground mb-1"
                                >
                                    Change password
                                </h2>
                                <p class="text-sm text-muted-foreground mb-4">
                                    Set a new password for your account.
                                </p>
                                <form
                                    onsubmit={changePassword}
                                    class="space-y-4"
                                >
                                    <FieldGroup>
                                        <Field>
                                            <FieldLabel for="new_password"
                                                >New password</FieldLabel
                                            >
                                            <Input
                                                id="new_password"
                                                type="password"
                                                bind:value={newPassword}
                                                autocomplete="new-password"
                                            />
                                        </Field>
                                        <Field>
                                            <FieldLabel for="confirm_password"
                                                >Confirm password</FieldLabel
                                            >
                                            <Input
                                                id="confirm_password"
                                                type="password"
                                                bind:value={confirmPassword}
                                                autocomplete="new-password"
                                            />
                                        </Field>
                                    </FieldGroup>
                                    {#if passwordError}
                                        <p class="text-sm text-destructive">
                                            {passwordError}
                                        </p>
                                    {/if}
                                    {#if passwordMsg}
                                        <p class="text-sm text-foreground">
                                            {passwordMsg}
                                        </p>
                                    {/if}
                                    <Button
                                        type="submit"
                                        disabled={passwordSaving}
                                    >
                                        {passwordSaving
                                            ? "Updating…"
                                            : "Update password"}
                                    </Button>
                                </form>
                            </section>

                            <section class="border-t border-border pt-8">
                                <h2
                                    class="text-sm font-medium text-foreground mb-1"
                                >
                                    Sign out
                                </h2>
                                <p class="text-sm text-muted-foreground mb-4">
                                    End your session on this device.
                                </p>
                                <Button href="/auth/logout" variant="outline">
                                    <LogOutIcon class="size-4" />
                                    Sign out
                                </Button>
                            </section>
                        </div>
                    {/if}
                {/snippet}
            </Tabs>
        </div>
    </main>
</div>
