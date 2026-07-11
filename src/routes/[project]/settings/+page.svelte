<script lang="ts">
    import { enhance } from "$app/forms";
    import UsersIcon from "@lucide/svelte/icons/users";
    import LinkIcon from "@lucide/svelte/icons/link";
    import PlusIcon from "@lucide/svelte/icons/plus";
    import Trash2Icon from "@lucide/svelte/icons/trash-2";
    import CheckIcon from "@lucide/svelte/icons/check";
    import XIcon from "@lucide/svelte/icons/x";
    import SearchIcon from "@lucide/svelte/icons/search";
    import LoaderIcon from "@lucide/svelte/icons/loader";
    import ExternalLinkIcon from "@lucide/svelte/icons/external-link";
    import { Tabs } from "$lib/components/ui/tabs/index.js";
    import { Button } from "$lib/components/ui/button/index.js";

    let { data, form: rawForm } = $props();
    const form = $derived(rawForm as any);

    const members = $derived(data?.members ?? []);
    const mappings = $derived(data?.mappings ?? []);
    const annotations = $derived((data as any)?.annotations ?? []);
    const currentUserId = $derived(data?.currentUserId ?? "");
    const userRole = $derived(data?.role ?? "viewer");
    const projectTitle = $derived(data?.project?.title ?? "Project");
    const isOwner = $derived(userRole === "owner");
    const canManage = $derived(userRole === "owner" || userRole === "admin");

    let activeTab = $state("general");
    let showInvite = $state(false);
    let inviteEmail = $state("");
    let inviteRole = $state("viewer");
    let editingMapping = $state<string | null>(null);
    let editConceptUri = $state("");
    let mappingFilter = $state<"all" | "unmapped">("all");
    let tableFilter = $state("");
    let columnFilter = $state("");

    const unmappedCount = $derived(
        mappings.filter((m: any) => !m.concept_uri).length,
    );
    const mappedCount = $derived(mappings.length - unmappedCount);
    const pctMapped = $derived(
        mappings.length > 0
            ? Math.round((mappedCount / mappings.length) * 100)
            : 0,
    );
    const tableOptions = $derived(
        [...new Set(mappings.map((m: any) => m.entity_type as string))].sort(),
    );
    const columnOptions = $derived.by(() => {
        const cols = mappings
            .filter((m: any) => !tableFilter || m.entity_type === tableFilter)
            .map((m: any) => m.column_name as string);
        return [...new Set(cols)].sort();
    });
    const filteredMappings = $derived(
        mappings.filter((m: any) => {
            if (mappingFilter === "unmapped" && m.concept_uri) return false;
            if (tableFilter && m.entity_type !== tableFilter) return false;
            if (columnFilter && m.column_name !== columnFilter) return false;
            return true;
        }),
    );

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
        { value: "general", label: "General" },
        { value: "members", label: "Members", count: members.length },
        {
            value: "columns",
            label: "Columns",
            count: annotations.length,
        },
        {
            value: "values",
            label: "Values",
            count: mappings.length,
        },
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
        vocabResults = [];
        vocabLoading = false;
    }

    let vocabResults = $state<any[]>([]);
    let vocabLoading = $state(false);

    async function searchVocab(value: string) {
        vocabLoading = true;
        vocabResults = [];

        async function fetchVocab(vocab: string) {
            const ctrl = new AbortController();
            const timer = setTimeout(() => ctrl.abort(), 5000);
            try {
                const res = await fetch(
                    `/api/v1/vocab/search?vocab=${vocab}&q=${encodeURIComponent(value)}&limit=10`,
                    { signal: ctrl.signal },
                );
                clearTimeout(timer);
                return res.ok ? await res.json() : [];
            } catch (_) {
                return [];
            }
        }

        const [periodo, aat, crm] = await Promise.all([
            fetchVocab("periodo"),
            fetchVocab("aat"),
            fetchVocab("crm"),
        ]);
        vocabResults = [...periodo, ...aat, ...crm].sort(
            (a: any, b: any) => b.score - a.score,
        );
        vocabLoading = false;
    }

    let vocabForm = $state<HTMLFormElement | null>(null);
    let vocabFormData = $state({
        entity_type: "",
        column_name: "",
        local_value: "",
        concept_uri: "",
        vocabulary: "",
        confidence: "",
    });

    let pendingBulk = $state<{
        local_value: string;
        column_name: string;
        count: number;
        concept_uri: string;
        vocabulary: string;
        confidence: string;
    } | null>(null);

    async function doBulkApply() {
        if (!pendingBulk) return;
        await fetch("?/bulkMapping", {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams({
                local_value: pendingBulk.local_value,
                column_name: pendingBulk.column_name,
                concept_uri: pendingBulk.concept_uri,
                vocabulary: pendingBulk.vocabulary,
                confidence: pendingBulk.confidence,
            }).toString(),
        });
        pendingBulk = null;
        window.location.reload();
    }

    async function selectVocabMapping(mapping: any, result: any) {
        vocabFormData = {
            entity_type: mapping.entity_type,
            column_name: mapping.column_name,
            local_value: mapping.local_value,
            concept_uri: result.uri,
            vocabulary: result.vocabulary,
            confidence: String(Math.round(result.score * 100) / 100),
        };
        editingMapping = null;
        vocabResults = [];
        vocabLoading = false;
        const similar = mappings.filter(
            (m: any) =>
                !m.concept_uri &&
                m.local_value === mapping.local_value &&
                m.column_name === mapping.column_name &&
                m.entity_type !== mapping.entity_type,
        );
        pendingBulk =
            similar.length > 0
                ? {
                      local_value: mapping.local_value,
                      column_name: mapping.column_name,
                      count: similar.length,
                      concept_uri: result.uri,
                      vocabulary: result.vocabulary,
                      confidence: String(Math.round(result.score * 100) / 100),
                  }
                : null;
        setTimeout(() => vocabForm?.requestSubmit(), 0);
    }

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
                <div class="space-y-10 max-w-xl">
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
                <div>
                    <p class="mb-5 text-sm text-muted-foreground">
                        Column semantics from TOML. Edit
                        <code
                            class="font-mono text-xs rounded px-1 py-0.5 bg-secondary"
                            >tables/*.toml</code
                        >
                        and push to update.
                    </p>

                    {#if annotations.length > 0}
                        <div
                            class="rounded-lg border border-border overflow-hidden"
                        >
                            <div
                                class="grid grid-cols-[1fr_1fr_1fr_1fr] gap-3 px-4 py-2 bg-secondary/40 border-b border-border text-[11px] font-medium text-muted-foreground uppercase tracking-wide"
                            >
                                <span>Table</span>
                                <span>Column</span>
                                <span>Vocabulary</span>
                                <span>CRM</span>
                            </div>
                            <div class="divide-y divide-border">
                                {#each annotations as ann}
                                    <div
                                        class="grid grid-cols-[1fr_1fr_1fr_1fr] gap-3 px-4 py-2.5 text-sm"
                                    >
                                        <span class="truncate text-foreground"
                                            >{ann.entity_type}</span
                                        >
                                        <span
                                            class="truncate text-muted-foreground"
                                            >{ann.column_name}</span
                                        >
                                        <span
                                            class="truncate text-muted-foreground"
                                            >{ann.vocabulary ?? "—"}</span
                                        >
                                        <span
                                            class="truncate font-mono text-xs text-muted-foreground"
                                            >{ann.crm_property ?? "—"}</span
                                        >
                                    </div>
                                {/each}
                            </div>
                        </div>
                    {:else}
                        <div
                            class="flex flex-col items-center justify-center rounded-lg border border-dashed border-border py-16"
                        >
                            <LinkIcon
                                class="size-8 text-muted-foreground/40 mb-3"
                            />
                            <p class="text-sm text-muted-foreground mb-1">
                                No column annotations
                            </p>
                            <p
                                class="text-xs text-muted-foreground max-w-sm text-center"
                            >
                                Add
                                <code
                                    class="font-mono rounded px-1 bg-secondary"
                                    >vocabulary</code
                                >
                                or
                                <code
                                    class="font-mono rounded px-1 bg-secondary"
                                    >property</code
                                >
                                in TOML, then
                                <code
                                    class="font-mono rounded px-1 bg-secondary"
                                    >tinyowl push</code
                                >.
                            </p>
                        </div>
                    {/if}
                </div>
            {:else if tabValue === "values"}
                <div>
                    <form
                        method="POST"
                        action="?/updateMapping"
                        use:enhance
                        bind:this={vocabForm}
                        class="hidden"
                    >
                        <input
                            type="hidden"
                            name="entity_type"
                            value={vocabFormData.entity_type}
                        />
                        <input
                            type="hidden"
                            name="column_name"
                            value={vocabFormData.column_name}
                        />
                        <input
                            type="hidden"
                            name="local_value"
                            value={vocabFormData.local_value}
                        />
                        <input
                            type="hidden"
                            name="concept_uri"
                            value={vocabFormData.concept_uri}
                        />
                        <input
                            type="hidden"
                            name="vocabulary"
                            value={vocabFormData.vocabulary}
                        />
                        <input
                            type="hidden"
                            name="confidence"
                            value={vocabFormData.confidence}
                        />
                    </form>

                    <p class="mb-5 text-sm text-muted-foreground">
                        Map distinct cell values to external concepts (PeriodO,
                        AAT, …).
                    </p>

                    {#if mappings.length > 0}
                        <div class="mb-4 space-y-3">
                            <div class="flex flex-wrap items-center gap-3">
                                <div
                                    class="flex items-center gap-0.5 rounded-md bg-secondary p-0.5"
                                >
                                    <button
                                        type="button"
                                        onclick={() => (mappingFilter = "all")}
                                        class="px-2.5 py-1 rounded text-xs font-medium transition-colors {mappingFilter ===
                                        'all'
                                            ? 'bg-background text-foreground shadow-sm'
                                            : 'text-muted-foreground hover:text-foreground'}"
                                    >
                                        All
                                    </button>
                                    <button
                                        type="button"
                                        onclick={() =>
                                            (mappingFilter = "unmapped")}
                                        class="px-2.5 py-1 rounded text-xs font-medium transition-colors {mappingFilter ===
                                        'unmapped'
                                            ? 'bg-background text-foreground shadow-sm'
                                            : 'text-muted-foreground hover:text-foreground'}"
                                    >
                                        Unmapped ({unmappedCount})
                                    </button>
                                </div>
                                <div class="flex items-center gap-2 min-w-0 flex-1">
                                    <div
                                        class="h-1 flex-1 max-w-48 rounded-full bg-secondary overflow-hidden"
                                    >
                                        <div
                                            class="h-full rounded-full bg-primary transition-all duration-300"
                                            style="width: {pctMapped}%"
                                        ></div>
                                    </div>
                                    <span
                                        class="text-xs text-muted-foreground tabular-nums whitespace-nowrap"
                                        >{mappedCount}/{mappings.length}</span
                                    >
                                </div>
                            </div>
                            <div class="flex flex-wrap gap-2">
                                <select
                                    bind:value={tableFilter}
                                    onchange={() => (columnFilter = "")}
                                    class="{selectClass} h-8 text-xs"
                                >
                                    <option value="">All tables</option>
                                    {#each tableOptions as t}
                                        <option value={t}>{t}</option>
                                    {/each}
                                </select>
                                <select
                                    bind:value={columnFilter}
                                    class="{selectClass} h-8 text-xs"
                                >
                                    <option value="">All columns</option>
                                    {#each columnOptions as c}
                                        <option value={c}>{c}</option>
                                    {/each}
                                </select>
                            </div>
                        </div>
                    {/if}

                    {#if form?.error && form?.mappingAction}
                        <p
                            class="mb-4 rounded-md border border-destructive/25 bg-destructive/5 px-3 py-2 text-sm text-destructive"
                        >
                            {form.error}
                        </p>
                    {/if}
                    {#if form?.success && form?.mappingAction}
                        <p
                            class="mb-4 rounded-md border border-border bg-secondary/50 px-3 py-2 text-sm text-foreground"
                        >
                            Mapping updated.
                        </p>
                    {/if}

                    {#if pendingBulk}
                        <div
                            class="mb-4 rounded-md border border-border bg-secondary/40 px-3 py-2.5 text-sm flex items-center justify-between gap-3"
                        >
                            <span class="text-foreground"
                                >Also map <strong>{pendingBulk.count}</strong> other
                                “{pendingBulk.local_value}” terms?</span
                            >
                            <button
                                type="button"
                                onclick={doBulkApply}
                                class="shrink-0 rounded-md bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
                            >
                                Apply to all
                            </button>
                        </div>
                    {/if}

                    {#if mappings.length > 0}
                        <div
                            class="rounded-lg border border-border overflow-hidden"
                        >
                            <div
                                class="grid grid-cols-[1fr_1fr_1fr_1fr_auto] gap-3 px-4 py-2 bg-secondary/40 border-b border-border text-[11px] font-medium text-muted-foreground uppercase tracking-wide"
                            >
                                <span>Value</span>
                                <span>Table</span>
                                <span>Column</span>
                                <span>Concept</span>
                                <span class="w-7"></span>
                            </div>
                            <div class="divide-y divide-border">
                                {#each filteredMappings as mapping (mappingKey(mapping))}
                                    {@const key = mappingKey(mapping)}
                                    {@const isEditing = editingMapping === key}
                                    <div
                                        class="grid grid-cols-[1fr_1fr_1fr_1fr_auto] gap-3 items-center px-4 py-2.5 text-sm"
                                    >
                                        <span
                                            class="truncate text-foreground font-medium"
                                            >{mapping.local_value}</span
                                        >
                                        <span
                                            class="truncate text-muted-foreground"
                                            >{mapping.entity_type}</span
                                        >
                                        <span
                                            class="truncate text-muted-foreground"
                                            >{mapping.column_name}</span
                                        >

                                        {#if isEditing}
                                            {#if !mapping.concept_uri}
                                                <span
                                                    class="truncate text-xs text-muted-foreground"
                                                    >searching…</span
                                                >
                                                <button
                                                    type="button"
                                                    title="Cancel"
                                                    onclick={cancelEdit}
                                                    class="flex size-7 items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
                                                >
                                                    <XIcon class="size-3.5" />
                                                </button>
                                            {:else}
                                                <form
                                                    method="POST"
                                                    action="?/updateMapping"
                                                    use:enhance
                                                    class="flex items-center gap-1.5 col-span-1"
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
                                                        bind:value={
                                                            editConceptUri
                                                        }
                                                        placeholder="periodo:p0abc123"
                                                        class="h-7 w-full rounded border border-input bg-background px-2 text-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                                                    />
                                                    <div
                                                        class="flex items-center gap-0.5"
                                                    >
                                                        <button
                                                            type="submit"
                                                            title="Save"
                                                            class="flex size-6 items-center justify-center rounded text-foreground hover:bg-secondary"
                                                        >
                                                            <CheckIcon
                                                                class="size-3.5"
                                                            />
                                                        </button>
                                                        <button
                                                            type="button"
                                                            title="Cancel"
                                                            onclick={cancelEdit}
                                                            class="flex size-6 items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-secondary"
                                                        >
                                                            <XIcon
                                                                class="size-3.5"
                                                            />
                                                        </button>
                                                    </div>
                                                </form>
                                            {/if}
                                        {:else}
                                            <span
                                                class="truncate {mapping.concept_uri
                                                    ? 'text-foreground font-mono text-xs'
                                                    : 'text-muted-foreground/50 italic text-xs'}"
                                            >
                                                {mapping.concept_uri ??
                                                    "unmapped"}
                                            </span>
                                            <button
                                                type="button"
                                                onclick={() => {
                                                    if (!mapping.concept_uri) {
                                                        editingMapping =
                                                            mappingKey(mapping);
                                                        searchVocab(
                                                            mapping.local_value,
                                                        );
                                                    } else {
                                                        startEdit(mapping);
                                                    }
                                                }}
                                                class="flex size-7 items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
                                                title={mapping.concept_uri
                                                    ? "Edit mapping"
                                                    : "Search vocabularies"}
                                            >
                                                <SearchIcon class="size-3.5" />
                                            </button>
                                        {/if}
                                    </div>
                                    {#if isEditing && !mapping.concept_uri}
                                        <div
                                            class="px-4 py-3 bg-secondary/25 border-t border-border"
                                        >
                                            {#if vocabLoading}
                                                <div
                                                    class="flex items-center gap-2 text-xs text-muted-foreground py-3"
                                                >
                                                    <LoaderIcon
                                                        class="size-3.5 animate-spin"
                                                    />
                                                    Searching vocabularies…
                                                </div>
                                            {:else if vocabResults.length > 0}
                                                <div
                                                    class="space-y-0.5 max-h-48 overflow-y-auto"
                                                >
                                                    {#each vocabResults as result}
                                                        <button
                                                            type="button"
                                                            onclick={() =>
                                                                selectVocabMapping(
                                                                    mapping,
                                                                    result,
                                                                )}
                                                            class="w-full flex items-center justify-between gap-3 px-2.5 py-2 rounded-md text-left text-xs hover:bg-background transition-colors"
                                                        >
                                                            <div class="min-w-0">
                                                                <span
                                                                    class="font-medium text-foreground truncate block"
                                                                    >{result.label}</span
                                                                >
                                                                <span
                                                                    class="text-muted-foreground"
                                                                    >{result.vocabulary}{#if result.context}
                                                                        — {result.context}{/if}</span
                                                                >
                                                            </div>
                                                            <span
                                                                class="shrink-0 text-muted-foreground font-mono text-[10px]"
                                                                >{Math.round(
                                                                    result.score *
                                                                        100,
                                                                )}%</span
                                                            >
                                                        </button>
                                                    {/each}
                                                </div>
                                            {:else}
                                                <p
                                                    class="text-xs text-muted-foreground py-2"
                                                >
                                                    No matching terms found.
                                                </p>
                                                <button
                                                    type="button"
                                                    onclick={() =>
                                                        startEdit(mapping)}
                                                    class="text-xs text-primary hover:underline"
                                                >
                                                    Enter concept URI manually
                                                </button>
                                            {/if}
                                        </div>
                                    {/if}
                                {/each}
                                {#if filteredMappings.length === 0}
                                    <div
                                        class="flex flex-col items-center justify-center py-12"
                                    >
                                        <p
                                            class="text-sm text-muted-foreground"
                                        >
                                            No terms match this filter
                                        </p>
                                        <button
                                            type="button"
                                            onclick={() => {
                                                mappingFilter = "all";
                                                tableFilter = "";
                                                columnFilter = "";
                                            }}
                                            class="mt-1 text-xs text-primary hover:underline"
                                        >
                                            Clear filters
                                        </button>
                                    </div>
                                {/if}
                            </div>
                        </div>
                    {:else}
                        <div
                            class="flex flex-col items-center justify-center rounded-lg border border-dashed border-border py-16"
                        >
                            <LinkIcon
                                class="size-8 text-muted-foreground/40 mb-3"
                            />
                            <p class="text-sm text-muted-foreground mb-1">
                                No value mappings yet
                            </p>
                            <p
                                class="text-xs text-muted-foreground max-w-sm text-center"
                            >
                                Run
                                <code
                                    class="font-mono rounded px-1 bg-secondary"
                                    >tinyowl push</code
                                >
                                to index distinct values, then map them here.
                            </p>
                        </div>
                    {/if}
                </div>
            {/if}
        {/snippet}
    </Tabs>
</div>
