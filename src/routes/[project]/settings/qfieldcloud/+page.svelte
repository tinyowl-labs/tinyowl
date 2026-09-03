<script lang="ts">
    import { enhance } from "$app/forms";
    import { Button } from "$lib/components/ui/button/index.js";
    import { Input } from "$lib/components/ui/input/index.js";
    import {
        Field,
        FieldLabel,
        FieldDescription,
    } from "$lib/components/ui/field/index.js";
    import JobLog from "$lib/components/qfield/job-log.svelte";
    import { SELECT_CLASS } from "../pages";

    let { data, form: rawForm } = $props();
    const form = $derived(rawForm as any);

    const projectTitle = $derived(data?.project?.title ?? "Project");
    const slug = $derived(
        (data as any)?.slug ?? (data?.project?.slug as string) ?? "",
    );
    const userRole = $derived(data?.role ?? "viewer");
    const canLinkQField = $derived(
        userRole === "owner" ||
            userRole === "admin" ||
            userRole === "collaborator",
    );

    const qfieldLink = $derived((data as any)?.qfieldLink ?? null);
    let polledQfield = $state<any>(null);
    const displayQfield = $derived(polledQfield ?? qfieldLink);
    const qfieldJobActive = $derived(
        Boolean(
            displayQfield &&
                (displayQfield.import_status === "pending" ||
                    displayQfield.import_status === "running" ||
                    displayQfield.sync_pending ||
                    displayQfield.sync_requested_at),
        ),
    );

    $effect(() => {
        const s = slug;
        const on = qfieldJobActive;
        if (!s || !on) return;
        let stopped = false;
        async function tick() {
            try {
                const res = await fetch(
                    `/api/qfieldcloud/links/${encodeURIComponent(s)}`,
                );
                if (res.ok && !stopped) polledQfield = await res.json();
            } catch {
                /* ignore */
            }
        }
        void tick();
        const id = setInterval(() => void tick(), 1000);
        return () => {
            stopped = true;
            clearInterval(id);
        };
    });

    const qfieldAccounts = $derived(
        ((data as any)?.qfieldAccounts ?? []) as {
            id: string;
            base_url: string;
            username: string;
            label?: string | null;
        }[],
    );

    let qfcAccountId = $state("");
    let qfcProjects = $state<
        {
            id: string;
            name: string;
            status?: string;
            linked_slug?: string | null;
            has_marker?: boolean;
            marker_slug?: string | null;
        }[]
    >([]);
    let qfcProjectsLoading = $state(false);
    let qfcProjectsError = $state("");
    let selectedQfcProjectId = $state("");
    let qfcGpkgName = $state("");

    $effect(() => {
        if (qfieldAccounts.length > 0 && !qfcAccountId) {
            qfcAccountId = qfieldAccounts[0].id;
        }
    });

    async function loadQfcProjects(accountId: string) {
        if (!accountId) {
            qfcProjects = [];
            return;
        }
        qfcProjectsLoading = true;
        qfcProjectsError = "";
        try {
            const res = await fetch(
                `/api/qfieldcloud/accounts/${accountId}/projects`,
            );
            if (!res.ok) {
                qfcProjectsError = await res.text();
                qfcProjects = [];
                return;
            }
            qfcProjects = await res.json();
        } catch (e) {
            qfcProjectsError = String(e);
            qfcProjects = [];
        } finally {
            qfcProjectsLoading = false;
        }
    }

    $effect(() => {
        if (qfcAccountId) {
            loadQfcProjects(qfcAccountId);
        }
    });
</script>

<svelte:head>
    <title>QFieldCloud — {projectTitle} — echidna</title>
</svelte:head>

<section>
    <div class="flex items-start justify-between gap-4 mb-4">
        <div>
            <h2 class="text-sm font-medium text-foreground">QFieldCloud link</h2>
            <p class="mt-1 text-sm text-muted-foreground">
                Keep field sync on Cloud; TinyOwl ingests after delta apply via
                the bridge.
            </p>
        </div>
    </div>

    {#if form?.error}
        <p
            class="mb-4 rounded-md border border-destructive/25 bg-destructive/5 px-3 py-2 text-sm text-destructive"
        >
            {form.error}
        </p>
    {/if}
    {#if form?.success && form?.qfieldAction}
        <p
            class="mb-4 rounded-md border border-border bg-secondary/50 px-3 py-2 text-sm text-foreground"
        >
            {#if form.qfieldAction === "linked"}
                Linked to QFieldCloud.
            {:else if form.qfieldAction === "sync_requested"}
                Sync requested. The bridge will force re-pull the Cloud package
                on its next pass.
            {:else}
                Unlinked from QFieldCloud.
            {/if}
        </p>
    {/if}

    {#if displayQfield}
        <div class="rounded-lg border border-border p-4 bg-card space-y-3">
            <p class="text-sm text-foreground">
                {#if displayQfield.mode === "snapshot"}
                    Copied from
                {:else}
                    Linked to
                {/if}
                <span class="font-medium"
                    >{displayQfield.qfc_project_name ||
                        displayQfield.qfc_project_id}</span
                >
            </p>
            {#if displayQfield.mode === "snapshot"}
                <p class="text-xs text-muted-foreground">
                    Snapshot — echidna is the source of truth. The Cloud project
                    is not live-synced.
                    {#if displayQfield.source_owner}
                        Original owner: {displayQfield.source_owner}.
                    {/if}
                </p>
            {/if}
            {#if displayQfield.job_log || displayQfield.import_status === "pending" || displayQfield.import_status === "running" || displayQfield.sync_pending || displayQfield.sync_requested_at}
                <JobLog
                    log={displayQfield.job_log || ""}
                    status={displayQfield.import_status ||
                        (displayQfield.sync_pending ||
                        displayQfield.sync_requested_at
                            ? "syncing"
                            : "")}
                    error={displayQfield.import_error || ""}
                    progress={displayQfield.job_progress || null}
                />
            {/if}
            <p class="text-xs text-muted-foreground">
                {displayQfield.base_url}
                {#if displayQfield.username}
                    · {displayQfield.username}
                {/if}
            </p>
            {#if displayQfield.sync_pending || displayQfield.sync_requested_at}
                <p class="text-xs text-amber-700">
                    Sync pending since {displayQfield.sync_requested_at}
                </p>
            {/if}
            {#if displayQfield.last_synced_at}
                <p class="text-xs text-muted-foreground">
                    Last bridge sync: {displayQfield.last_synced_at}
                </p>
            {/if}
            {#if displayQfield.gpkg_name}
                <p class="text-xs text-muted-foreground">
                    Bridge GPKG: {displayQfield.gpkg_name}
                </p>
            {/if}
            {#if canLinkQField}
                <div class="flex flex-wrap gap-2 pt-1">
                    {#if displayQfield.mode !== "snapshot"}
                        <form
                            method="POST"
                            action="?/syncQFieldCloud"
                            use:enhance
                        >
                            <Button
                                type="submit"
                                size="sm"
                                disabled={Boolean(
                                    displayQfield.sync_pending ||
                                        displayQfield.sync_requested_at,
                                )}
                            >
                                {displayQfield.sync_pending ||
                                displayQfield.sync_requested_at
                                    ? "Sync pending…"
                                    : "Sync now"}
                            </Button>
                        </form>
                    {/if}
                    <form
                        method="POST"
                        action="?/unlinkQFieldCloud"
                        use:enhance
                    >
                        <Button
                            type="submit"
                            size="sm"
                            variant="outline"
                            class="text-muted-foreground hover:bg-accent hover:text-foreground"
                            onclick={(e) => {
                                if (!confirm("Unlink this Cloud project?"))
                                    e.preventDefault();
                            }}
                        >
                            Unlink
                        </Button>
                    </form>
                </div>
            {/if}
        </div>
    {:else if qfieldAccounts.length === 0}
        <div
            class="rounded-lg border border-dashed border-border px-4 py-8 text-center"
        >
            <p class="text-sm text-muted-foreground mb-3">
                Connect a QFieldCloud account in Settings first.
            </p>
            <a
                href="/settings?tab=qfieldcloud"
                class="text-sm text-primary hover:underline">Go to Settings</a
            >
        </div>
    {:else if canLinkQField}
        <form
            method="POST"
            action="?/linkQFieldCloud"
            use:enhance
            class="rounded-lg border border-border p-4 space-y-3"
        >
            <input type="hidden" name="account_id" value={qfcAccountId} />
            <input
                type="hidden"
                name="qfc_project_id"
                value={selectedQfcProjectId}
            />
            <input
                type="hidden"
                name="qfc_project_name"
                value={qfcProjects.find((p) => p.id === selectedQfcProjectId)
                    ?.name ?? ""}
            />
            <Field>
                <FieldLabel for="qfc-account">Cloud account</FieldLabel>
                <select
                    id="qfc-account"
                    class={SELECT_CLASS}
                    bind:value={qfcAccountId}
                    onchange={() => loadQfcProjects(qfcAccountId)}
                >
                    {#each qfieldAccounts as acct}
                        <option value={acct.id}
                            >{acct.label || acct.base_url} ({acct.username})</option
                        >
                    {/each}
                </select>
            </Field>
            <Field>
                <FieldLabel for="qfc-gpkg">GPKG filename (for bridge)</FieldLabel>
                <Input
                    id="qfc-gpkg"
                    name="gpkg_name"
                    bind:value={qfcGpkgName}
                    placeholder="project.gpkg"
                />
                <FieldDescription>
                    Optional. Defaults to env BRIDGE_GPKG_NAME on the bridge
                    host.
                </FieldDescription>
            </Field>

            {#if qfcProjectsLoading}
                <p class="text-sm text-muted-foreground">
                    Loading Cloud projects…
                </p>
            {:else if qfcProjectsError}
                <p class="text-sm text-destructive">{qfcProjectsError}</p>
            {:else if qfcProjects.length === 0}
                <p class="text-sm text-muted-foreground">
                    No Cloud projects found for this account.
                </p>
            {:else}
                <Field>
                    <FieldLabel>QFieldCloud project</FieldLabel>
                    <div
                        class="rounded-lg border border-border divide-y divide-border max-h-72 overflow-y-auto"
                    >
                        {#each qfcProjects as proj}
                            <label
                                class="flex items-start gap-3 px-3 py-2.5 cursor-pointer hover:bg-secondary/40 {selectedQfcProjectId ===
                                proj.id
                                    ? 'bg-secondary/50'
                                    : ''}"
                            >
                                <input
                                    type="radio"
                                    name="_pick"
                                    class="mt-1"
                                    checked={selectedQfcProjectId === proj.id}
                                    onchange={() =>
                                        (selectedQfcProjectId = proj.id)}
                                />
                                <span class="min-w-0 flex-1">
                                    <span class="text-sm text-foreground block"
                                        >{proj.name}</span
                                    >
                                    <span class="text-xs text-muted-foreground">
                                        {#if proj.linked_slug}
                                            Linked to {proj.linked_slug}
                                        {:else if proj.has_marker}
                                            Has TinyOwl marker{#if proj.marker_slug}({proj.marker_slug}){/if}
                                        {:else}
                                            Available
                                        {/if}
                                    </span>
                                </span>
                            </label>
                        {/each}
                    </div>
                </Field>
                <Button type="submit" size="sm" disabled={!selectedQfcProjectId}>
                    Link selected project
                </Button>
            {/if}
        </form>
    {:else}
        <p class="text-sm text-muted-foreground">
            Collaborator role or higher is required to link QFieldCloud.
        </p>
    {/if}
</section>
