<script lang="ts">
    import { enhance } from "$app/forms";
    import SettingsIcon from "@lucide/svelte/icons/settings";
    import Header from "$lib/components/ui/header.svelte";
    import { Button } from "$lib/components/ui/button/index.js";
    import { page } from "$app/stores";

    let { data, form: rawForm } = $props();
    const form = $derived(rawForm as any);
    const hasSession = $derived(Boolean($page.data?.user ?? data?.user));
    const qfieldAccounts = $derived(data?.qfieldAccounts ?? []);
    const qfieldLinks = $derived(data?.qfieldLinks ?? []);
    const cliTokens = $derived(data?.cliTokens ?? []);

    let showConnect = $state(false);

    const inputClass =
        "mt-1 block w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring";
</script>

<svelte:head><title>Settings — TinyOwl</title></svelte:head>

<div class="flex flex-col h-screen overflow-hidden">
    <Header subtitle="Settings" {hasSession} />

    <main class="flex-1 min-h-0 overflow-y-auto bg-background">
        <div class="mx-auto max-w-2xl px-6 py-8 space-y-10">
            <div>
                <h1
                    class="text-2xl font-semibold tracking-tight text-foreground flex items-center gap-2"
                >
                    <SettingsIcon class="size-5" />
                    Settings
                </h1>
                <p class="mt-1 text-sm text-muted-foreground">
                    Integrations and account preferences.
                </p>
            </div>

            {#if form?.error && form?.qfieldAction}
                <p
                    class="rounded-md border border-destructive/25 bg-destructive/5 px-3 py-2 text-sm text-destructive"
                >
                    {form.error}
                </p>
            {/if}
            {#if form?.success && form?.qfieldAction === "connected"}
                <p
                    class="rounded-md border border-border bg-secondary/50 px-3 py-2 text-sm text-foreground"
                >
                    Connected. Link a Cloud project from a project’s Settings →
                    QFieldCloud.
                </p>
            {/if}

            <section>
                <div class="flex items-center justify-between mb-4">
                    <div>
                        <h2 class="text-sm font-medium text-foreground">
                            QFieldCloud
                        </h2>
                        <p class="mt-1 text-sm text-muted-foreground">
                            Connect a Cloud instance (custom URL). Password is
                            used once for a token and is not stored.
                        </p>
                    </div>
                    <Button
                        size="sm"
                        variant={showConnect ? "outline" : "default"}
                        onclick={() => (showConnect = !showConnect)}
                    >
                        {showConnect ? "Cancel" : "Connect"}
                    </Button>
                </div>

                {#if showConnect}
                    <form
                        method="POST"
                        action="?/connectQFieldCloud"
                        class="mb-4 rounded-lg border border-border p-4 space-y-3"
                        use:enhance={() => {
                            return async ({ update }) => {
                                await update();
                                showConnect = false;
                            };
                        }}
                    >
                        <label class="block">
                            <span class="text-xs text-muted-foreground"
                                >Instance URL</span
                            >
                            <input
                                type="url"
                                name="base_url"
                                required
                                placeholder="https://injserver01.taila2d030.ts.net"
                                class={inputClass}
                            />
                        </label>
                        <div class="grid grid-cols-2 gap-3">
                            <label class="block">
                                <span class="text-xs text-muted-foreground"
                                    >Username</span
                                >
                                <input
                                    type="text"
                                    name="username"
                                    required
                                    autocomplete="username"
                                    class={inputClass}
                                />
                            </label>
                            <label class="block">
                                <span class="text-xs text-muted-foreground"
                                    >Password</span
                                >
                                <input
                                    type="password"
                                    name="password"
                                    required
                                    autocomplete="current-password"
                                    class={inputClass}
                                />
                            </label>
                        </div>
                        <label class="block">
                            <span class="text-xs text-muted-foreground"
                                >Label (optional)</span
                            >
                            <input
                                type="text"
                                name="label"
                                placeholder="injserver"
                                class={inputClass}
                            />
                        </label>
                        <Button type="submit" size="sm">Connect</Button>
                    </form>
                {/if}

                {#if qfieldAccounts.length === 0}
                    <div
                        class="rounded-lg border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground"
                    >
                        No Cloud instances connected yet.
                    </div>
                {:else}
                    <div class="flex flex-col gap-2">
                        {#each qfieldAccounts as acct}
                            <div
                                class="flex items-center justify-between gap-4 rounded-lg border border-border p-4"
                            >
                                <div class="min-w-0">
                                    <p
                                        class="text-sm font-medium text-foreground truncate"
                                    >
                                        {acct.label || acct.base_url}
                                    </p>
                                    <p
                                        class="text-xs text-muted-foreground mt-0.5"
                                    >
                                        {acct.username} · {acct.base_url}
                                    </p>
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
                                    <button
                                        type="submit"
                                        class="text-xs text-muted-foreground hover:text-destructive"
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
                                    </button>
                                </form>
                            </div>
                        {/each}
                    </div>
                {/if}

                {#if qfieldLinks.length > 0}
                    <div class="mt-6">
                        <h3
                            class="text-xs font-semibold tracking-wider uppercase text-muted-foreground mb-2"
                        >
                            Linked projects
                        </h3>
                        <ul class="space-y-1">
                            {#each qfieldLinks as link}
                                <li class="text-sm text-foreground">
                                    <a
                                        href="/{link.tinyowl_slug}/settings"
                                        class="hover:underline"
                                        >{link.tinyowl_slug}</a
                                    >
                                    <span class="text-muted-foreground">
                                        → {link.qfc_project_name ||
                                            link.qfc_project_id}
                                    </span>
                                </li>
                            {/each}
                        </ul>
                    </div>
                {/if}
            </section>

            {#if cliTokens.length > 0}
                <section>
                    <h2 class="text-sm font-medium text-foreground mb-1">
                        CLI tokens
                    </h2>
                    <p class="text-sm text-muted-foreground mb-4">
                        Personal access tokens from
                        <code class="font-mono text-xs">tinyowl login</code>.
                    </p>
                    <div
                        class="rounded-lg border border-border divide-y divide-border"
                    >
                        {#each cliTokens as tok}
                            <div class="px-4 py-3">
                                <p class="text-sm text-foreground">
                                    {tok.label || "CLI token"}
                                </p>
                                <p class="text-xs text-muted-foreground mt-0.5">
                                    {tok.token_prefix}… · created {tok.created_at}
                                </p>
                            </div>
                        {/each}
                    </div>
                </section>
            {/if}
        </div>
    </main>
</div>
