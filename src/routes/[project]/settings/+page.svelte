<script lang="ts">
    import { enhance } from "$app/forms";
    import SettingsIcon from "@lucide/svelte/icons/settings";
    import UsersIcon from "@lucide/svelte/icons/users";
    import LinkIcon from "@lucide/svelte/icons/link";
    import PlusIcon from "@lucide/svelte/icons/plus";
    import Trash2Icon from "@lucide/svelte/icons/trash-2";
    import CheckIcon from "@lucide/svelte/icons/check";
    import XIcon from "@lucide/svelte/icons/x";
    import { Tabs } from "$lib/components/ui/tabs/index.js";
    import { Button } from "$lib/components/ui/button/index.js";

    let { data, form: rawForm } = $props();
    // Cast form to any for dynamic action error fields
    const form = $derived(rawForm as any);

    const members = $derived(data?.members ?? []);
    const mappings = $derived(data?.mappings ?? []);
    const currentUserId = $derived(data?.currentUserId ?? "");
    const userRole = $derived(data?.role ?? "viewer");
    const projectTitle = $derived(data?.project?.title ?? "Project");
    const isOwner = $derived(userRole === "owner");
    const canManage = $derived(userRole === "owner" || userRole === "admin");

    let activeTab = $state("members");
    let showInvite = $state(false);
    let inviteEmail = $state("");
    let inviteRole = $state("viewer");
    let editingMapping = $state<string | null>(null);
    let editConceptUri = $state("");

    $effect(() => {
        if (form?.memberAction) {
            showInvite = false;
            inviteEmail = "";
            inviteRole = "viewer";
        }
        if (form?.mappingAction) {
            editingMapping = null;
            editConceptUri = "";
        }
    });

    const tabs = $derived([
        { value: "members", label: "Members", count: members.length },
        { value: "visibility", label: "Visibility" },
        { value: "licence", label: "Licence" },
        { value: "mappings", label: "Mappings", count: mappings.length },
    ]);

    const ROLE_LABELS: Record<string, string> = {
        owner: "Owner",
        admin: "Admin",
        collaborator: "Collaborator",
        viewer: "Viewer",
    };

    function mappingKey(m: {
        entity_type: string;
        column_name: string;
        local_value: string;
    }): string {
        return `${m.entity_type}|${m.column_name}|${m.local_value}`;
    }

    function startEdit(mapping: {
        entity_type: string;
        column_name: string;
        local_value: string;
        concept_uri: string | null;
    }) {
        editingMapping = mappingKey(mapping);
        editConceptUri = mapping.concept_uri ?? "";
    }

    function cancelEdit() {
        editingMapping = null;
        editConceptUri = "";
    }

    // Visibility & licence state
    const project = $derived(data?.project);
    const globalVisibility = $derived(
        (project as any)?.visibility ?? "private",
    );
    const tableVisibility = $derived(
        ((project as any)?.table_visibility as Record<string, string>) ?? {},
    );
    const currentLicence = $derived((project as any)?.licence ?? "");
    const tables = $derived(
        ((data as any)?.tables as Record<string, string[]> | null) ?? {},
    );
    const tableNames = $derived(Object.keys(tables));

    const LICENCES = [
        {
            key: "CC0",
            label: "CC0 — Public Domain",
            url: "https://creativecommons.org/publicdomain/zero/1.0/",
        },
        {
            key: "CC_BY_4",
            label: "CC BY 4.0 — Attribution",
            url: "https://creativecommons.org/licenses/by/4.0/",
        },
        {
            key: "CC_BY_SA_4",
            label: "CC BY-SA 4.0 — Attribution-ShareAlike",
            url: "https://creativecommons.org/licenses/by-sa/4.0/",
        },
        {
            key: "CC_BY_NC_4",
            label: "CC BY-NC 4.0 — Attribution-NonCommercial",
            url: "https://creativecommons.org/licenses/by-nc/4.0/",
        },
        {
            key: "CC_BY_NC_SA_4",
            label: "CC BY-NC-SA 4.0 — Attribution-NonCommercial-ShareAlike",
            url: "https://creativecommons.org/licenses/by-nc-sa/4.0/",
        },
        {
            key: "ODbL",
            label: "ODbL — Open Database Licence",
            url: "https://opendatacommons.org/licenses/odbl/",
        },
        { key: "ALL_RIGHTS", label: "All Rights Reserved", url: "" },
    ];

    let saving = $state(false);

    $effect(() => {
        if (form?.visibilityAction || form?.licenceAction) {
            saving = false;
        }
    });
</script>

<svelte:head>
    <title>{projectTitle} Settings — TinyOwl</title>
</svelte:head>

<div class="flex flex-col h-full px-6 py-4">
    <div class="shrink-0 mb-4">
        <div class="flex items-center gap-2.5">
            <SettingsIcon class="size-5 text-muted-foreground" />
            <h1 class="text-xl font-bold tracking-tight text-foreground">
                Settings
            </h1>
        </div>
        <p class="mt-0.5 text-sm text-muted-foreground">
            {projectTitle}
        </p>
    </div>

    <div class="flex-1 min-h-0">
        <Tabs bind:value={activeTab} {tabs}>
            {#snippet children(tabValue: string)}
                {#if tabValue === "members"}
                    <div class="pt-2">
                        <div class="flex items-center justify-between mb-4">
                            <div>
                                <p class="text-sm text-muted-foreground">
                                    Manage who has access to this project.
                                </p>
                            </div>
                            {#if canManage}
                                <Button
                                    size="sm"
                                    onclick={() => (showInvite = !showInvite)}
                                >
                                    <PlusIcon class="size-3.5 mr-1" />
                                    Add member
                                </Button>
                            {/if}
                        </div>

                        {#if form?.error && form?.memberAction}
                            <p
                                class="mb-4 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-2.5 text-sm text-destructive"
                            >
                                {form.error}
                            </p>
                        {/if}
                        {#if form?.success && form?.memberAction}
                            <p
                                class="mb-4 rounded-lg border border-green-500/30 bg-green-50 px-4 py-2.5 text-sm text-green-700 dark:border-green-500/20 dark:bg-green-950/50 dark:text-green-400"
                            >
                                Member {form.memberAction} successfully.
                            </p>
                        {/if}

                        {#if showInvite && canManage}
                            <form
                                method="POST"
                                action="?/addMember"
                                class="mb-4 rounded-lg border border-border p-4"
                                use:enhance
                            >
                                <h4 class="text-sm font-medium mb-3">
                                    Invite a collaborator
                                </h4>
                                <div class="flex gap-2">
                                    <input
                                        type="email"
                                        name="email"
                                        required
                                        placeholder="colleague@example.com"
                                        bind:value={inviteEmail}
                                        class="flex-1 h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm placeholder:text-muted-foreground/50 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                                    />
                                    <select
                                        name="role"
                                        bind:value={inviteRole}
                                        class="h-9 w-28 rounded-md border border-input bg-background px-2 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
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
                                class="rounded-lg border border-border overflow-hidden"
                            >
                                {#each members as member, i (member.user_id)}
                                    <div
                                        class="flex items-center justify-between gap-4 px-4 py-3 {i <
                                        members.length - 1
                                            ? 'border-b border-border'
                                            : ''}"
                                    >
                                        <div
                                            class="flex items-center gap-3 min-w-0"
                                        >
                                            <div
                                                class="flex size-8 shrink-0 items-center justify-center rounded-full bg-secondary text-xs font-semibold text-muted-foreground"
                                            >
                                                {member.email
                                                    ?.charAt(0)
                                                    .toUpperCase() ?? "?"}
                                            </div>
                                            <div class="min-w-0">
                                                <p
                                                    class="text-sm font-medium text-foreground truncate"
                                                >
                                                    {member.email}
                                                </p>
                                                <p
                                                    class="text-[11px] text-muted-foreground"
                                                >
                                                    {ROLE_LABELS[member.role] ??
                                                        member.role}
                                                </p>
                                            </div>
                                            {#if member.user_id === currentUserId}
                                                <span
                                                    class="ml-1 inline-flex items-center rounded-full bg-primary/10 px-2 py-0 text-[10px] font-medium text-primary"
                                                >
                                                    You
                                                </span>
                                            {/if}
                                        </div>

                                        {#if isOwner && member.user_id !== currentUserId}
                                            <div
                                                class="flex items-center gap-1.5"
                                            >
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
                                                        class="h-7 rounded-md border border-input bg-background px-1.5 py-0 text-xs shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                                                    >
                                                        <option value="viewer"
                                                            >Viewer</option
                                                        >
                                                        <option
                                                            value="collaborator"
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
                                                        class="flex items-center justify-center size-7 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
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
                                class="flex flex-col items-center justify-center rounded-lg border border-dashed border-border py-20"
                            >
                                <UsersIcon
                                    class="size-10 text-muted-foreground/30 mb-3"
                                />
                                <p class="text-sm text-muted-foreground mb-1">
                                    No members yet
                                </p>
                                <p
                                    class="text-xs text-muted-foreground max-w-xs text-center mb-5"
                                >
                                    Invite collaborators to work on this project
                                    together.
                                </p>
                                {#if canManage}
                                    <Button
                                        size="sm"
                                        onclick={() => (showInvite = true)}
                                    >
                                        <PlusIcon class="size-3.5 mr-1" />
                                        Add your first member
                                    </Button>
                                {/if}
                            </div>
                        {/if}
                    </div>
                {:else if tabValue === "visibility"}
                    <div class="pt-2 max-w-xl">
                        <p class="text-sm text-muted-foreground mb-6">
                            Control which tables are publicly visible. Private
                            tables require authentication to access.
                        </p>

                        <!-- Global toggle -->
                        <div class="rounded-lg border border-border p-4 mb-4">
                            <div
                                class="flex items-center justify-between gap-4"
                            >
                                <div>
                                    <p
                                        class="text-sm font-medium text-foreground"
                                    >
                                        Default visibility
                                    </p>
                                    <p
                                        class="text-xs text-muted-foreground mt-0.5"
                                    >
                                        Applies to all tables unless overridden
                                        below.
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
                                        disabled={saving}
                                        class="h-8 w-28 rounded-md border border-input bg-background px-2 py-0 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                                    >
                                        <option value="private">Private</option>
                                        <option value="public">Public</option>
                                    </select>
                                </form>
                            </div>
                        </div>

                        <!-- Per-table toggles -->
                        {#if tableNames.length > 0}
                            <div
                                class="rounded-lg border border-border overflow-hidden"
                            >
                                <div
                                    class="grid grid-cols-[1fr_auto] gap-3 items-center px-4 py-2.5 bg-secondary/50 border-b border-border text-xs font-medium text-muted-foreground uppercase tracking-wider"
                                >
                                    <span>Table</span>
                                    <span>Visibility</span>
                                </div>
                                {#each tableNames as name, i}
                                    {@const vis =
                                        tableVisibility[name] ??
                                        globalVisibility}
                                    <div
                                        class="grid grid-cols-[1fr_auto] gap-3 items-center px-4 py-2.5 {i <
                                        tableNames.length - 1
                                            ? 'border-b border-border'
                                            : ''} text-sm"
                                    >
                                        <span class="truncate text-foreground">
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
                                                class="h-7 w-24 rounded-md border border-input bg-background px-1.5 py-0 text-xs shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
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
                            </div>
                        {:else}
                            <div
                                class="flex flex-col items-center justify-center rounded-lg border border-dashed border-border py-16"
                            >
                                <p class="text-sm text-muted-foreground">
                                    No tables yet. Push data to configure
                                    per-table visibility.
                                </p>
                            </div>
                        {/if}
                    </div>
                {:else if tabValue === "licence"}
                    <div class="pt-2 max-w-xl">
                        <p class="text-sm text-muted-foreground mb-6">
                            Choose a licence that governs how others can use and
                            share your project data.
                        </p>

                        <div
                            class="rounded-lg border border-border overflow-hidden"
                        >
                            {#each LICENCES as lic, i}
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
                                        disabled={saving}
                                        class="flex items-center justify-between w-full px-4 py-3 text-left hover:bg-secondary/50 transition-colors {i <
                                        LICENCES.length - 1
                                            ? 'border-b border-border'
                                            : ''} {currentLicence === lic.key
                                            ? 'bg-accent'
                                            : ''}"
                                    >
                                        <div class="min-w-0">
                                            <p
                                                class="text-sm font-medium text-foreground"
                                            >
                                                {lic.label}
                                            </p>
                                            {#if lic.url}
                                                <a
                                                    href={lic.url}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    class="text-[11px] text-muted-foreground hover:text-primary transition-colors no-underline"
                                                    onclick={(e) =>
                                                        e.stopPropagation()}
                                                >
                                                    View licence
                                                </a>
                                            {/if}
                                        </div>
                                        {#if currentLicence === lic.key}
                                            <span
                                                class="shrink-0 size-5 rounded-full bg-primary flex items-center justify-center"
                                            >
                                                <CheckIcon
                                                    class="size-3 text-primary-foreground"
                                                />
                                            </span>
                                        {:else}
                                            <span
                                                class="shrink-0 size-5 rounded-full border-2 border-border"
                                            ></span>
                                        {/if}
                                    </button>
                                </form>
                            {/each}
                        </div>
                    </div>
                {:else if tabValue === "mappings"}
                    <div class="pt-2">
                        <div class="mb-4">
                            <p class="text-sm text-muted-foreground">
                                Map local values to external vocabularies and
                                concepts.
                            </p>
                        </div>

                        {#if form?.error && form?.mappingAction}
                            <p
                                class="mb-4 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-2.5 text-sm text-destructive"
                            >
                                {form.error}
                            </p>
                        {/if}
                        {#if form?.success && form?.mappingAction}
                            <p
                                class="mb-4 rounded-lg border border-green-500/30 bg-green-50 px-4 py-2.5 text-sm text-green-700 dark:border-green-500/20 dark:bg-green-950/50 dark:text-green-400"
                            >
                                Mapping updated.
                            </p>
                        {/if}

                        {#if mappings.length > 0}
                            <div
                                class="rounded-lg border border-border overflow-hidden"
                            >
                                <div
                                    class="grid grid-cols-[1fr_1fr_1fr_auto] gap-3 px-4 py-2.5 bg-secondary/50 border-b border-border text-xs font-medium text-muted-foreground uppercase tracking-wider"
                                >
                                    <span>Entity</span>
                                    <span>Column</span>
                                    <span>Concept URI</span>
                                    <span></span>
                                </div>
                                {#each mappings as mapping, i (mappingKey(mapping))}
                                    {@const key = mappingKey(mapping)}
                                    {@const isEditing = editingMapping === key}
                                    <div
                                        class="grid grid-cols-[1fr_1fr_1fr_auto] gap-3 items-center px-4 py-2.5 {i <
                                        mappings.length - 1
                                            ? 'border-b border-border'
                                            : ''} text-sm"
                                    >
                                        <span class="truncate text-foreground"
                                            >{mapping.entity_type}</span
                                        >
                                        <span
                                            class="truncate text-muted-foreground"
                                            >{mapping.column_name}</span
                                        >

                                        {#if isEditing}
                                            <form
                                                method="POST"
                                                action="?/updateMapping"
                                                use:enhance
                                                class="flex items-center gap-1.5"
                                            >
                                                <input
                                                    type="hidden"
                                                    name="entity_type"
                                                    value={mapping.entity_type}
                                                />
                                                <input
                                                    type="hidden"
                                                    name="column_name"
                                                    value={mapping.column_name}
                                                />
                                                <input
                                                    type="hidden"
                                                    name="local_value"
                                                    value={mapping.local_value}
                                                />
                                                <input
                                                    type="text"
                                                    name="concept_uri"
                                                    bind:value={editConceptUri}
                                                    placeholder="periodo:p0abc123"
                                                    class="h-7 w-full rounded border border-input bg-background px-2 py-0 text-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                                                />
                                                <div
                                                    class="flex items-center gap-0.5"
                                                >
                                                    <button
                                                        type="submit"
                                                        title="Save"
                                                        class="flex items-center justify-center size-6 rounded text-green-600 hover:bg-green-50 dark:hover:bg-green-950"
                                                    >
                                                        <CheckIcon
                                                            class="size-3.5"
                                                        />
                                                    </button>
                                                    <button
                                                        type="button"
                                                        title="Cancel"
                                                        onclick={cancelEdit}
                                                        class="flex items-center justify-center size-6 rounded text-muted-foreground hover:text-foreground hover:bg-secondary"
                                                    >
                                                        <XIcon
                                                            class="size-3.5"
                                                        />
                                                    </button>
                                                </div>
                                            </form>
                                        {:else}
                                            <span
                                                class="truncate {mapping.concept_uri
                                                    ? 'text-foreground font-mono text-xs'
                                                    : 'text-muted-foreground/40 italic text-xs'}"
                                            >
                                                {mapping.concept_uri ??
                                                    "unmapped"}
                                            </span>
                                            <button
                                                onclick={() =>
                                                    startEdit(mapping)}
                                                class="flex items-center justify-center size-7 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
                                                title="Edit mapping"
                                            >
                                                <LinkIcon class="size-3.5" />
                                            </button>
                                        {/if}
                                    </div>
                                {/each}
                            </div>
                        {:else}
                            <div
                                class="flex flex-col items-center justify-center rounded-lg border border-dashed border-border py-20"
                            >
                                <LinkIcon
                                    class="size-10 text-muted-foreground/30 mb-3"
                                />
                                <p class="text-sm text-muted-foreground mb-1">
                                    No mappings yet
                                </p>
                                <p
                                    class="text-xs text-muted-foreground max-w-xs text-center"
                                >
                                    Run
                                    <code
                                        class="font-mono text-xs rounded px-1 bg-secondary"
                                        >tinyowl push</code
                                    >
                                    to index column mappings, then map values to concepts
                                    here.
                                </p>
                            </div>
                        {/if}
                    </div>
                {/if}
            {/snippet}
        </Tabs>
    </div>
</div>
