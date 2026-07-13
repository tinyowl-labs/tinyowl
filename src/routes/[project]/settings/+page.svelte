<script lang="ts">
    import { enhance } from "$app/forms";
    import UsersIcon from "@lucide/svelte/icons/users";
    import PlusIcon from "@lucide/svelte/icons/plus";
    import Trash2Icon from "@lucide/svelte/icons/trash-2";
    import CheckIcon from "@lucide/svelte/icons/check";
    import ExternalLinkIcon from "@lucide/svelte/icons/external-link";
    import { Tabs } from "$lib/components/ui/tabs/index.js";
    import { Button } from "$lib/components/ui/button/index.js";
    import MappingWorkbench from "$lib/components/settings/MappingWorkbench.svelte";

    let { data, form: rawForm } = $props();
    const form = $derived(rawForm as any);

    const members = $derived(data?.members ?? []);
    const mappings = $derived(data?.mappings ?? []);
    const annotations = $derived(((data as any)?.annotations ?? []) as {
        entity_type: string;
        column_name: string;
        vocabulary: string | null;
        crm_property: string | null;
        crm_range: string | null;
    }[]);
    const currentUserId = $derived(data?.currentUserId ?? "");
    const userRole = $derived(data?.role ?? "viewer");
    const projectTitle = $derived(data?.project?.title ?? "Project");
    const slug = $derived(
        (data as any)?.slug ?? (data?.project?.slug as string) ?? "",
    );
    const isOwner = $derived(userRole === "owner");
    const canManage = $derived(userRole === "owner" || userRole === "admin");
    const canLinkQField = $derived(
        userRole === "owner" ||
            userRole === "admin" ||
            userRole === "collaborator",
    );

    const qfieldLink = $derived((data as any)?.qfieldLink ?? null);
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
    let activeTab = $state("general");
    let showInvite = $state(false);
    let inviteEmail = $state("");
    let inviteRole = $state("viewer");

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
        if (activeTab === "qfieldcloud" && qfcAccountId) {
            loadQfcProjects(qfcAccountId);
        }
    });

    $effect(() => {
        if (form?.memberAction) {
            showInvite = false;
            inviteEmail = "";
            inviteRole = "viewer";
        }
    });

    const tables = $derived(
        ((data as any)?.tables as Record<string, string[]> | null) ?? {},
    );
    const tableNames = $derived(Object.keys(tables));

    // Merge schema columns with annotations so every column is mappable.
    const columnRows = $derived.by(() => {
        const byKey = new Map(
            annotations.map((a) => [`${a.entity_type}|${a.column_name}`, a]),
        );
        const rows: {
            entity_type: string;
            column_name: string;
            vocabulary: string | null;
            crm_property: string | null;
            crm_range: string | null;
        }[] = [];
        const seen = new Set<string>();

        for (const [table, cols] of Object.entries(tables)) {
            for (const col of cols ?? []) {
                const key = `${table}|${col}`;
                seen.add(key);
                const a = byKey.get(key);
                rows.push({
                    entity_type: table,
                    column_name: col,
                    vocabulary: a?.vocabulary ?? null,
                    crm_property: a?.crm_property ?? null,
                    crm_range: a?.crm_range ?? null,
                });
            }
        }
        for (const a of annotations) {
            const key = `${a.entity_type}|${a.column_name}`;
            if (seen.has(key)) continue;
            rows.push({
                entity_type: a.entity_type,
                column_name: a.column_name,
                vocabulary: a.vocabulary ?? null,
                crm_property: a.crm_property ?? null,
                crm_range: a.crm_range ?? null,
            });
        }
        return rows.sort(
            (a, b) =>
                a.entity_type.localeCompare(b.entity_type) ||
                a.column_name.localeCompare(b.column_name),
        );
    });

    const tabs = $derived([
        { value: "general", label: "General" },
        { value: "qfieldcloud", label: "QFieldCloud" },
        { value: "members", label: "Members", count: members.length },
        { value: "columns", label: "Columns", count: columnRows.length },
        { value: "values", label: "Values", count: mappings.length },
    ]);

    const ROLE_LABELS: Record<string, string> = {
        owner: "Owner",
        admin: "Admin",
        collaborator: "Collaborator",
        viewer: "Viewer",
    };

    const project = $derived(data?.project);
    const globalVisibility = $derived(
        (project as any)?.visibility ?? "private",
    );
    const tableVisibility = $derived(
        ((project as any)?.table_visibility as Record<string, string>) ?? {},
    );
    const currentLicence = $derived((project as any)?.licence ?? "");
    const currentEmbargoUntil = $derived.by(() => {
        const raw = (project as any)?.embargo_until as string | null | undefined;
        if (!raw) return "";
        // datetime-local wants YYYY-MM-DDTHH:mm
        const d = new Date(raw);
        if (Number.isNaN(d.getTime())) return raw.slice(0, 16);
        return d.toISOString().slice(0, 16);
    });
    const currentEmbargoNote = $derived(
        ((project as any)?.embargo_note as string | null | undefined) ?? "",
    );
    const currentLocationPrecision = $derived(
        ((project as any)?.location_precision as string | undefined) ?? "exact",
    );

    const LOCATION_PRECISIONS = [
        { key: "exact", label: "Exact", desc: "Full coordinates" },
        {
            key: "approx_100m",
            label: "~100 m",
            desc: "Snap to ~100 m grid",
        },
        {
            key: "approx_1km",
            label: "~1 km",
            desc: "Snap to ~1 km grid",
        },
        {
            key: "bbox_only",
            label: "Bbox only",
            desc: "Project extent only",
        },
        {
            key: "hidden",
            label: "Hidden",
            desc: "No public locations",
        },
    ];

    const LICENCES = [
        {
            key: "CC0",
            label: "CC0",
            desc: "Public Domain",
            url: "https://creativecommons.org/publicdomain/zero/1.0/",
        },
        {
            key: "CC_BY_4",
            label: "CC BY 4.0",
            desc: "Attribution",
            url: "https://creativecommons.org/licenses/by/4.0/",
        },
        {
            key: "CC_BY_SA_4",
            label: "CC BY-SA 4.0",
            desc: "Attribution-ShareAlike",
            url: "https://creativecommons.org/licenses/by-sa/4.0/",
        },
        {
            key: "CC_BY_NC_4",
            label: "CC BY-NC 4.0",
            desc: "Attribution-NonCommercial",
            url: "https://creativecommons.org/licenses/by-nc/4.0/",
        },
        {
            key: "CC_BY_NC_SA_4",
            label: "CC BY-NC-SA 4.0",
            desc: "Attribution-NonCommercial-ShareAlike",
            url: "https://creativecommons.org/licenses/by-nc-sa/4.0/",
        },
        {
            key: "ODbL",
            label: "ODbL",
            desc: "Open Database Licence",
            url: "https://opendatacommons.org/licenses/odbl/",
        },
        { key: "ALL_RIGHTS", label: "All Rights Reserved", desc: "", url: "" },
    ];

    const selectClass =
        "h-8 rounded-md border border-input bg-background px-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";
    const inputClass =
        "h-9 rounded-md border border-input bg-background px-3 text-sm shadow-sm placeholder:text-muted-foreground/50 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";
</script>

<svelte:head>
    <title>{projectTitle} Settings — TinyOwl</title>
</svelte:head>

<div class="mx-auto w-full max-w-4xl px-6 py-8">
    <header class="mb-6">
        <h1 class="text-2xl font-semibold tracking-tight text-foreground">
            Settings
        </h1>
        <p class="mt-1 text-sm text-muted-foreground">{projectTitle}</p>
    </header>

    <Tabs bind:value={activeTab} {tabs}>
        {#snippet children(tabValue: string)}
            {#if tabValue === "general"}
                <div class="space-y-10 w-full">
                    <section>
                        <div class="mb-4">
                            <h2 class="text-sm font-medium text-foreground">
                                Visibility
                            </h2>
                            <p class="mt-1 text-sm text-muted-foreground">
                                Private tables require authentication. Overrides
                                apply per table.
                            </p>
                        </div>

                        <div
                            class="rounded-lg border border-border divide-y divide-border"
                        >
                            <div
                                class="flex items-center justify-between gap-4 px-4 py-3"
                            >
                                <div class="min-w-0">
                                    <p class="text-sm text-foreground">
                                        Default
                                    </p>
                                    <p
                                        class="text-xs text-muted-foreground mt-0.5"
                                    >
                                        Used when a table has no override
                                    </p>
                                </div>
                                <form
                                    method="POST"
                                    action="?/updateVisibility"
                                    use:enhance
                                >
                                    <select
                                        name="visibility"
                                        value={globalVisibility}
                                        onchange={(e) =>
                                            e.currentTarget
                                                .closest("form")
                                                ?.requestSubmit()}
                                        class="{selectClass} w-28"
                                    >
                                        <option value="private">Private</option>
                                        <option value="public">Public</option>
                                    </select>
                                </form>
                            </div>

                            {#if tableNames.length > 0}
                                {#each tableNames as name}
                                    {@const vis =
                                        tableVisibility[name] ??
                                        globalVisibility}
                                    <div
                                        class="flex items-center justify-between gap-4 px-4 py-2.5"
                                    >
                                        <span
                                            class="truncate text-sm text-foreground"
                                        >
                                            {name.replace(/_/g, " ")}
                                        </span>
                                        <form
                                            method="POST"
                                            action="?/updateVisibility"
                                            use:enhance
                                        >
                                            <input
                                                type="hidden"
                                                name="table_name"
                                                value={name}
                                            />
                                            <select
                                                name="visibility"
                                                value={vis}
                                                onchange={(e) =>
                                                    e.currentTarget
                                                        .closest("form")
                                                        ?.requestSubmit()}
                                                class="{selectClass} h-7 w-24 text-xs"
                                            >
                                                <option value="public"
                                                    >Public</option
                                                >
                                                <option value="private"
                                                    >Private</option
                                                >
                                            </select>
                                        </form>
                                    </div>
                                {/each}
                            {:else}
                                <div
                                    class="px-4 py-6 text-center text-sm text-muted-foreground"
                                >
                                    No tables yet — push data to set per-table
                                    visibility.
                                </div>
                            {/if}
                        </div>
                    </section>

                    <section>
                        <div class="mb-4">
                            <h2 class="text-sm font-medium text-foreground">
                                Licence
                            </h2>
                            <p class="mt-1 text-sm text-muted-foreground">
                                How others may use and share this project’s
                                data.
                            </p>
                        </div>

                        <div
                            class="rounded-lg border border-border divide-y divide-border"
                        >
                            {#each LICENCES as lic}
                                <form
                                    method="POST"
                                    action="?/updateLicence"
                                    use:enhance
                                >
                                    <input
                                        type="hidden"
                                        name="licence"
                                        value={lic.key}
                                    />
                                    <button
                                        type="submit"
                                        class="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-secondary/40 transition-colors {currentLicence ===
                                        lic.key
                                            ? 'bg-secondary/50'
                                            : ''}"
                                    >
                                        <span
                                            class="flex size-4 shrink-0 items-center justify-center rounded-full border {currentLicence ===
                                            lic.key
                                                ? 'border-primary bg-primary'
                                                : 'border-border'}"
                                        >
                                            {#if currentLicence === lic.key}
                                                <CheckIcon
                                                    class="size-2.5 text-primary-foreground"
                                                />
                                            {/if}
                                        </span>
                                        <span class="min-w-0 flex-1">
                                            <span
                                                class="text-sm text-foreground"
                                                >{lic.label}</span
                                            >
                                            {#if lic.desc}
                                                <span
                                                    class="text-sm text-muted-foreground"
                                                >
                                                    — {lic.desc}</span
                                                >
                                            {/if}
                                        </span>
                                        {#if lic.url}
                                            <a
                                                href={lic.url}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                class="shrink-0 text-muted-foreground/50 hover:text-muted-foreground transition-colors"
                                                title="View licence"
                                                onclick={(e) =>
                                                    e.stopPropagation()}
                                            >
                                                <ExternalLinkIcon
                                                    class="size-3.5"
                                                />
                                            </a>
                                        {/if}
                                    </button>
                                </form>
                            {/each}
                        </div>
                    </section>

                    <section>
                        <div class="mb-4">
                            <h2 class="text-sm font-medium text-foreground">
                                Embargo &amp; location precision
                            </h2>
                            <p class="mt-1 text-sm text-muted-foreground">
                                While embargoed, or when precision is reduced,
                                viewers and anonymous readers see fuzzed or
                                hidden locations. Collaborators always see
                                exact coordinates.
                            </p>
                        </div>

                        <form
                            method="POST"
                            action="?/updateEmbargo"
                            use:enhance
                            class="rounded-lg border border-border divide-y divide-border"
                        >
                            <div class="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                                <div class="min-w-0">
                                    <p class="text-sm text-foreground">
                                        Embargo until
                                    </p>
                                    <p
                                        class="text-xs text-muted-foreground mt-0.5"
                                    >
                                        Clear the date to lift the embargo
                                    </p>
                                </div>
                                <input
                                    type="datetime-local"
                                    name="embargo_until"
                                    value={currentEmbargoUntil}
                                    class="{inputClass} w-full sm:w-56"
                                />
                            </div>
                            <div class="flex flex-col gap-2 px-4 py-3">
                                <label
                                    class="text-sm text-foreground"
                                    for="embargo_note"
                                >
                                    Embargo note
                                </label>
                                <textarea
                                    id="embargo_note"
                                    name="embargo_note"
                                    rows="2"
                                    class="{inputClass} h-auto min-h-[2.5rem] py-2 w-full"
                                    placeholder="Optional reason shown to admins"
                                    >{currentEmbargoNote}</textarea
                                >
                            </div>
                            <div class="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                                <div class="min-w-0">
                                    <p class="text-sm text-foreground">
                                        Location precision
                                    </p>
                                    <p
                                        class="text-xs text-muted-foreground mt-0.5"
                                    >
                                        Applied to maps, centroids, and search
                                        for non-collaborators
                                    </p>
                                </div>
                                <select
                                    name="location_precision"
                                    value={currentLocationPrecision}
                                    class="{selectClass} w-full sm:w-40"
                                >
                                    {#each LOCATION_PRECISIONS as p}
                                        <option value={p.key}>{p.label}</option>
                                    {/each}
                                </select>
                            </div>
                            <div class="flex justify-end px-4 py-3">
                                <button
                                    type="submit"
                                    class="h-8 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground hover:bg-primary/90"
                                >
                                    Save
                                </button>
                            </div>
                        </form>
                    </section>
                </div>
            {:else if tabValue === "qfieldcloud"}
                <div class="space-y-8 w-full">
                    <section>
                        <div class="mb-4">
                            <h2 class="text-sm font-medium text-foreground">
                                QFieldCloud link
                            </h2>
                            <p class="mt-1 text-sm text-muted-foreground">
                                Keep field sync on Cloud; TinyOwl ingests after
                                delta apply via the bridge.
                            </p>
                        </div>

                        {#if form?.error && form?.qfieldAction}
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
                                {form.qfieldAction === "linked"
                                    ? "Linked to QFieldCloud."
                                    : "Unlinked from QFieldCloud."}
                            </p>
                        {/if}

                        {#if qfieldLink}
                            <div
                                class="rounded-lg border border-border px-4 py-3 space-y-2"
                            >
                                <p class="text-sm text-foreground">
                                    Linked to
                                    <span class="font-medium"
                                        >{qfieldLink.qfc_project_name ||
                                            qfieldLink.qfc_project_id}</span
                                    >
                                </p>
                                <p class="text-xs text-muted-foreground">
                                    {qfieldLink.base_url}
                                    {#if qfieldLink.username}
                                        · {qfieldLink.username}
                                    {/if}
                                </p>
                                {#if qfieldLink.last_synced_at}
                                    <p class="text-xs text-muted-foreground">
                                        Last bridge sync: {qfieldLink.last_synced_at}
                                    </p>
                                {/if}
                                {#if qfieldLink.gpkg_name}
                                    <p class="text-xs text-muted-foreground">
                                        Bridge GPKG: {qfieldLink.gpkg_name}
                                    </p>
                                {/if}
                                {#if canLinkQField}
                                    <form
                                        method="POST"
                                        action="?/unlinkQFieldCloud"
                                        use:enhance
                                        class="pt-2"
                                    >
                                        <Button
                                            type="submit"
                                            size="sm"
                                            variant="outline"
                                            onclick={(e) => {
                                                if (
                                                    !confirm(
                                                        "Unlink this Cloud project?",
                                                    )
                                                )
                                                    e.preventDefault();
                                            }}
                                        >
                                            Unlink
                                        </Button>
                                    </form>
                                {/if}
                            </div>
                        {:else if qfieldAccounts.length === 0}
                            <div
                                class="rounded-lg border border-dashed border-border px-4 py-8 text-center"
                            >
                                <p class="text-sm text-muted-foreground mb-3">
                                    Connect a QFieldCloud account in Settings
                                    first.
                                </p>
                                <a
                                    href="/settings?tab=qfieldcloud"
                                    class="text-sm text-primary hover:underline"
                                    >Go to Settings</a
                                >
                            </div>
                        {:else if canLinkQField}
                            <div class="space-y-4">
                                <div>
                                    <label
                                        class="text-xs font-medium text-muted-foreground"
                                        for="qfc-account"
                                        >Cloud account</label
                                    >
                                    <select
                                        id="qfc-account"
                                        class="{selectClass} mt-1 w-full"
                                        bind:value={qfcAccountId}
                                        onchange={() =>
                                            loadQfcProjects(qfcAccountId)}
                                    >
                                        {#each qfieldAccounts as acct}
                                            <option value={acct.id}
                                                >{acct.label || acct.base_url}
                                                ({acct.username})</option
                                            >
                                        {/each}
                                    </select>
                                </div>

                                {#if qfcProjectsLoading}
                                    <p class="text-sm text-muted-foreground">
                                        Loading Cloud projects…
                                    </p>
                                {:else if qfcProjectsError}
                                    <p class="text-sm text-destructive">
                                        {qfcProjectsError}
                                    </p>
                                {:else if qfcProjects.length === 0}
                                    <p class="text-sm text-muted-foreground">
                                        No Cloud projects found for this
                                        account.
                                    </p>
                                {:else}
                                    <form
                                        method="POST"
                                        action="?/linkQFieldCloud"
                                        use:enhance
                                        class="space-y-3"
                                    >
                                        <input
                                            type="hidden"
                                            name="account_id"
                                            value={qfcAccountId}
                                        />
                                        <input
                                            type="hidden"
                                            name="qfc_project_id"
                                            value={selectedQfcProjectId}
                                        />
                                        <input
                                            type="hidden"
                                            name="qfc_project_name"
                                            value={qfcProjects.find(
                                                (p) =>
                                                    p.id ===
                                                    selectedQfcProjectId,
                                            )?.name ?? ""}
                                        />
                                        <div>
                                            <label
                                                class="text-xs font-medium text-muted-foreground"
                                                for="qfc-gpkg"
                                                >GPKG filename (for bridge)</label
                                            >
                                            <input
                                                id="qfc-gpkg"
                                                name="gpkg_name"
                                                bind:value={qfcGpkgName}
                                                placeholder="project.gpkg"
                                                class="mt-1 w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-sm"
                                            />
                                            <p
                                                class="mt-1 text-[10px] text-muted-foreground"
                                            >
                                                Optional. Defaults to env
                                                BRIDGE_GPKG_NAME on the bridge
                                                host.
                                            </p>
                                        </div>
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
                                                        checked={selectedQfcProjectId ===
                                                            proj.id}
                                                        onchange={() =>
                                                            (selectedQfcProjectId =
                                                                proj.id)}
                                                    />
                                                    <span class="min-w-0 flex-1">
                                                        <span
                                                            class="text-sm text-foreground block"
                                                            >{proj.name}</span
                                                        >
                                                        <span
                                                            class="text-xs text-muted-foreground"
                                                        >
                                                            {#if proj.linked_slug}
                                                                Linked to {proj.linked_slug}
                                                            {:else if proj.has_marker}
                                                                Has TinyOwl
                                                                marker{#if proj.marker_slug}
                                                                    ({proj.marker_slug})
                                                                {/if}
                                                            {:else}
                                                                Available
                                                            {/if}
                                                        </span>
                                                    </span>
                                                </label>
                                            {/each}
                                        </div>
                                        <Button
                                            type="submit"
                                            size="sm"
                                            disabled={!selectedQfcProjectId}
                                        >
                                            Link selected project
                                        </Button>
                                    </form>
                                {/if}
                            </div>
                        {:else}
                            <p class="text-sm text-muted-foreground">
                                Collaborator role or higher is required to link
                                QFieldCloud.
                            </p>
                        {/if}
                    </section>
                </div>
            {:else if tabValue === "members"}
                <div>
                    <div class="flex items-start justify-between gap-4 mb-5">
                        <p class="text-sm text-muted-foreground">
                            Who can access this project.
                        </p>
                        {#if canManage}
                            <Button
                                size="sm"
                                variant={showInvite ? "outline" : "default"}
                                onclick={() => (showInvite = !showInvite)}
                            >
                                <PlusIcon class="size-3.5 mr-1" />
                                Add member
                            </Button>
                        {/if}
                    </div>

                    {#if form?.error && form?.memberAction}
                        <p
                            class="mb-4 rounded-md border border-destructive/25 bg-destructive/5 px-3 py-2 text-sm text-destructive"
                        >
                            {form.error}
                        </p>
                    {/if}
                    {#if form?.success && form?.memberAction}
                        <p
                            class="mb-4 rounded-md border border-border bg-secondary/50 px-3 py-2 text-sm text-foreground"
                        >
                            Member {form.memberAction}.
                        </p>
                    {/if}

                    {#if showInvite && canManage}
                        <form
                            method="POST"
                            action="?/addMember"
                            class="mb-5 rounded-lg border border-border p-4"
                            use:enhance
                        >
                            <div class="flex flex-wrap gap-2">
                                <input
                                    type="email"
                                    name="email"
                                    required
                                    placeholder="colleague@example.com"
                                    bind:value={inviteEmail}
                                    class="{inputClass} min-w-[14rem] flex-1"
                                />
                                <select
                                    name="role"
                                    bind:value={inviteRole}
                                    class="{selectClass} h-9 w-32"
                                >
                                    <option value="viewer">Viewer</option>
                                    <option value="collaborator"
                                        >Collaborator</option
                                    >
                                    <option value="admin">Admin</option>
                                    <option value="owner">Owner</option>
                                </select>
                                <Button type="submit" size="sm">Add</Button>
                            </div>
                        </form>
                    {/if}

                    {#if members.length > 0}
                        <div
                            class="rounded-lg border border-border divide-y divide-border"
                        >
                            {#each members as member (member.user_id)}
                                <div
                                    class="flex items-center justify-between gap-4 px-4 py-3"
                                >
                                    <div class="flex items-center gap-3 min-w-0">
                                        <div
                                            class="flex size-8 shrink-0 items-center justify-center rounded-full bg-secondary text-xs font-medium text-muted-foreground"
                                        >
                                            {member.email
                                                ?.charAt(0)
                                                .toUpperCase() ?? "?"}
                                        </div>
                                        <div class="min-w-0">
                                            <p
                                                class="text-sm text-foreground truncate"
                                            >
                                                {member.email}
                                                {#if member.user_id === currentUserId}
                                                    <span
                                                        class="ml-1.5 text-xs text-muted-foreground"
                                                        >you</span
                                                    >
                                                {/if}
                                            </p>
                                            <p
                                                class="text-xs text-muted-foreground"
                                            >
                                                {ROLE_LABELS[member.role] ??
                                                    member.role}
                                            </p>
                                        </div>
                                    </div>

                                    {#if isOwner && member.user_id !== currentUserId}
                                        <div class="flex items-center gap-1.5">
                                            <form
                                                method="POST"
                                                action="?/updateRole"
                                                use:enhance
                                            >
                                                <input
                                                    type="hidden"
                                                    name="userId"
                                                    value={member.user_id}
                                                />
                                                <select
                                                    name="role"
                                                    value={member.role}
                                                    onchange={(e) => {
                                                        e.currentTarget
                                                            .closest("form")
                                                            ?.requestSubmit();
                                                    }}
                                                    class="{selectClass} h-7 text-xs"
                                                >
                                                    <option value="viewer"
                                                        >Viewer</option
                                                    >
                                                    <option value="collaborator"
                                                        >Collaborator</option
                                                    >
                                                    <option value="admin"
                                                        >Admin</option
                                                    >
                                                    <option value="owner"
                                                        >Owner</option
                                                    >
                                                </select>
                                            </form>
                                            <form
                                                method="POST"
                                                action="?/removeMember"
                                                use:enhance
                                            >
                                                <input
                                                    type="hidden"
                                                    name="userId"
                                                    value={member.user_id}
                                                />
                                                <button
                                                    type="submit"
                                                    title="Remove member"
                                                    class="flex size-7 items-center justify-center rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                                                    onclick={(e) => {
                                                        if (
                                                            !confirm(
                                                                `Remove ${member.email} from this project?`,
                                                            )
                                                        )
                                                            e.preventDefault();
                                                    }}
                                                >
                                                    <Trash2Icon
                                                        class="size-3.5"
                                                    />
                                                </button>
                                            </form>
                                        </div>
                                    {/if}
                                </div>
                            {/each}
                        </div>
                    {:else}
                        <div
                            class="flex flex-col items-center justify-center rounded-lg border border-dashed border-border py-16"
                        >
                            <UsersIcon
                                class="size-8 text-muted-foreground/40 mb-3"
                            />
                            <p class="text-sm text-muted-foreground">
                                No members yet
                            </p>
                            {#if canManage}
                                <button
                                    type="button"
                                    onclick={() => (showInvite = true)}
                                    class="mt-2 text-sm text-primary hover:underline"
                                >
                                    Invite someone
                                </button>
                            {/if}
                        </div>
                    {/if}
                </div>
            {:else if tabValue === "columns"}
                <MappingWorkbench
                    mode="columns"
                    rows={columnRows}
                    {form}
                    description="Assign a CRM property to each column (e.g. crm:P2_has_type). Vocabulary is separate — usually set from TOML."
                />
            {:else if tabValue === "values"}
                <div class="mb-3 flex justify-end">
                    <a
                        href="/{slug}/mappings.toml"
                        class="text-xs font-medium text-primary hover:underline"
                        download="{slug}-mappings.toml"
                    >
                        Export mappings.toml
                    </a>
                </div>
                <MappingWorkbench
                    mode="values"
                    rows={mappings}
                    {form}
                    description="Map distinct values to external concepts. Multi-value (array) cells are exploded into one row per element — FK lists show the related label when available. Manual UI mappings are preserved on TOML push."
                />
            {/if}
        {/snippet}
    </Tabs>
</div>
