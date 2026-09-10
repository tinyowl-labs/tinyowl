<script lang="ts">
    import { onMount } from "svelte";
    import { createClient } from "$lib/supabase/client";

    let error = $state("");
    let busy = $state(true);
    let clientName = $state("QFieldCloud");
    let scopes = $state<string[]>([]);
    let authorizationId = "";

    onMount(async () => {
        authorizationId = new URLSearchParams(window.location.search).get("authorization_id") ?? "";
        if (!authorizationId) {
            error = "Missing authorization request.";
            busy = false;
            return;
        }
        const supabase = createClient();
        const { data: sessionData } = await supabase.auth.getSession();
        if (!sessionData.session) {
            window.location.href = `/auth/login?next=${encodeURIComponent(window.location.pathname + window.location.search)}`;
            return;
        }
        const { data, error: detailsError } = await supabase.auth.oauth.getAuthorizationDetails(authorizationId);
        if (detailsError || !data) {
            error = detailsError?.message ?? "Authorization request expired.";
            busy = false;
            return;
        }
        if ("redirect_url" in data) {
            window.location.href = data.redirect_url;
            return;
        }
        clientName = data.client.name || clientName;
        scopes = data.scope.split(" ").filter(Boolean);
        busy = false;
    });

    async function decide(approved: boolean) {
        if (!authorizationId) return;
        busy = true;
        const supabase = createClient();
        const action = approved
            ? supabase.auth.oauth.approveAuthorization(authorizationId, { skipBrowserRedirect: true })
            : supabase.auth.oauth.denyAuthorization(authorizationId, { skipBrowserRedirect: true });
        const { data, error: actionError } = await action;
        if (actionError || !data) {
            error = actionError?.message ?? "Could not complete authorization.";
            busy = false;
            return;
        }
        window.location.href = data.redirect_url;
    }
</script>

<svelte:head><title>Authorize QFieldCloud — Echidna</title></svelte:head>

<main class="mx-auto flex min-h-screen max-w-md items-center px-6">
    <section class="w-full rounded-xl border border-border bg-card p-6 shadow-sm">
        <p class="text-xs font-medium uppercase tracking-wider text-muted-foreground">Echidna</p>
        <h1 class="mt-2 text-xl font-semibold text-foreground">Authorize {clientName}?</h1>
        <p class="mt-2 text-sm text-muted-foreground">QFieldCloud will use your Echidna identity to show field projects you can access.</p>
        {#if scopes.length}
            <p class="mt-4 text-xs text-muted-foreground">Requested: {scopes.join(", ")}</p>
        {/if}
        {#if error}
            <p class="mt-4 text-sm text-destructive">{error}</p>
        {/if}
        <div class="mt-6 flex gap-3">
            <button type="button" class="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50" disabled={busy || Boolean(error)} onclick={() => decide(true)}>Continue</button>
            <button type="button" class="rounded-md border border-input px-4 py-2 text-sm text-foreground disabled:opacity-50" disabled={busy || Boolean(error)} onclick={() => decide(false)}>Cancel</button>
        </div>
    </section>
</main>
