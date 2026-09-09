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
    const accessToken = $derived(((data as any)?.accessToken as string) || "");
    const developCommit = $derived(
        ((data as any)?.developCommit as string) || "",
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
    let qfcLinkMode = $state("live");

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
    <title>QField — {projectTitle} — echidna</title>
</svelte:head>

<section>
    <div class="flex items-start justify-between gap-4 mb-4">
        <div>
            <h2 class="text-sm font-medium text-foreground">QField</h2>
            <p class="mt-1 text-sm text-muted-foreground">
                Hosted package tracks develop without a laptop CLI. QFieldCloud
                born-link / snapshot stay as landed.
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
                {#if displayQfield?.mode === "owned"}
                    Round trip requested. The bridge will land Cloud edits and
                    refresh its package from develop on the next pass.
                {:else}
                    Sync requested. The bridge will force re-pull the Cloud
                    package on its next pass.
                {/if}
            {:else if form.qfieldAction === "field_pushed"}
                Field package landed on develop{#if form.develop}
                    {" "}({String(form.develop).slice(0, 12)}){/if}. Public main
                is unchanged until promote.
			{:else if form.qfieldAction === "provisioned"}
				Created an Echidna-owned QFieldCloud project. The bridge will publish
				develop to it before it accepts field changes.
            {:else}
                Unlinked from QFieldCloud.
            {/if}
        </p>
    {/if}

    <div class="rounded-lg border border-border p-4 bg-card space-y-3 mb-8">
        <div>
            <h3 class="text-sm font-medium text-foreground">
                Hosted field package
            </h3>
            <p class="mt-1 text-sm text-muted-foreground">
                Checkout a QField/QGIS zip at
                <span class="font-mono">develop</span> (GPKG at that commit, no
                presence overlays). Push sends
                <span class="font-mono">base_commit</span> +
                <span class="font-mono">target_ref</span> — same envelope as
                CLI. Born-link / snapshot below stay available.
            </p>
        </div>
        {#if developCommit}
            <p class="text-xs text-muted-foreground font-mono">
                tracking develop @ {developCommit.slice(0, 12)}
            </p>
        {/if}
        <div class="flex flex-wrap gap-2">
            <Button
                href={`/api/v1/projects/${slug}/field-package?ref=develop${accessToken ? `&token=${encodeURIComponent(accessToken)}` : ""}`}
                size="sm"
            >
                Download field package
            </Button>
        </div>
        {#if canLinkQField}
            <form
                method="POST"
                action="?/pushFieldPackage"
                enctype="multipart/form-data"
                use:enhance
                class="space-y-3 pt-2 border-t border-border"
            >
                <Field>
                    <FieldLabel for="field-gpkg">Edited GPKG or zip</FieldLabel>
                    <input
                        id="field-gpkg"
                        name="gpkg"
                        type="file"
                        accept=".gpkg,.zip,application/zip,application/geopackage+sqlite3"
                        class="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm file:border-0 file:bg-transparent file:text-sm"
                        required
                    />
                    <FieldDescription>
                        Upload <span class="font-mono">project.gpkg</span> or
                        the whole field zip after QField edits.
                    </FieldDescription>
                </Field>
                <Field>
                    <FieldLabel for="field-base">Parent commit</FieldLabel>
                    <Input
                        id="field-base"
                        name="base_commit"
                        value={developCommit}
                        placeholder="from tinyowl.json"
                        required
                    />
                    <FieldDescription>
                        Must match the package’s
                        <span class="font-mono">base_commit</span>. If develop
                        moved, the commit parks on your personal ref.
                    </FieldDescription>
                </Field>
                <Field>
                    <FieldLabel for="field-msg">Message</FieldLabel>
                    <Input
                        id="field-msg"
                        name="message"
                        placeholder="qfield: trench 12"
                        required
                    />
                </Field>
                <Button type="submit" size="sm" variant="outline">
                    Push to develop
                </Button>
            </form>
        {/if}
    </div>

    <h3 class="text-sm font-medium text-foreground mb-3">QFieldCloud link</h3>
    <p class="mb-4 text-sm text-muted-foreground">
        Optional. Keep field sync on Cloud; use a pull-only foreign link or an
        owned self-hosted projection that round-trips develop via the bridge.
    </p>

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
            {:else if displayQfield.mode === "owned"}
                <p class="text-xs text-muted-foreground">
                    Owned projection — the bridge publishes develop to this
                    self-hosted Cloud project, then lands field deltas back on
                    develop and refreshes the Cloud package.
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
        <div class="space-y-4">
            <form
                method="POST"
                action="?/provisionQFieldCloud"
                use:enhance
                class="rounded-lg border border-primary/30 bg-primary/5 p-4 space-y-3"
            >
                <div>
                    <h4 class="text-sm font-medium text-foreground">
                        Create an Echidna QFieldCloud project
                    </h4>
                    <p class="mt-1 text-sm text-muted-foreground">
                        Creates a private, owned field façade on the selected
                        self-hosted Cloud. QField syncs normally; Echidna keeps
                        the develop ref as the source of truth.
                    </p>
                </div>
                <Field>
                    <FieldLabel for="owned-qfc-account">Cloud account</FieldLabel>
                    <select
                        id="owned-qfc-account"
                        name="account_id"
                        class={SELECT_CLASS}
                        bind:value={qfcAccountId}
                    >
                        {#each qfieldAccounts as acct}
                            <option value={acct.id}
                                >{acct.label || acct.base_url} ({acct.username})</option
                            >
                        {/each}
                    </select>
                </Field>
                <Field>
                    <FieldLabel for="owned-qfc-name">Cloud project name</FieldLabel>
                    <Input
                        id="owned-qfc-name"
                        name="name"
                        placeholder={projectTitle}
                    />
                    <FieldDescription>
                        Leave blank to use this project’s slug.
                    </FieldDescription>
                </Field>
                <Button type="submit" size="sm">Create owned project</Button>
            </form>

            <form
                method="POST"
                action="?/linkQFieldCloud"
                use:enhance
                class="rounded-lg border border-border p-4 space-y-3"
            >
                <h4 class="text-sm font-medium text-foreground">
                    Link an existing QFieldCloud project
                </h4>
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
            <input type="hidden" name="mode" value={qfcLinkMode} />
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
            <Field>
                <FieldLabel for="qfc-link-mode">Sync direction</FieldLabel>
                <select
                    id="qfc-link-mode"
                    class={SELECT_CLASS}
                    bind:value={qfcLinkMode}
                >
                    <option value="live">Cloud → Echidna</option>
                    <option value="owned">Owned self-hosted round trip</option>
                </select>
                <FieldDescription>
                    Owned mode replaces the selected Cloud project files with
                    the develop field package before accepting phone edits.
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
        </div>
    {:else}
        <p class="text-sm text-muted-foreground">
            Collaborator role or higher is required to link QFieldCloud.
        </p>
    {/if}
</section>
