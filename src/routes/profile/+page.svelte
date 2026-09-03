<script lang="ts">
    import { goto } from "$app/navigation";
    import { page } from "$app/stores";
    import { browser } from "$app/environment";
    import { enhance } from "$app/forms";
    import UsersIcon from "@lucide/svelte/icons/users";
    import PlusIcon from "@lucide/svelte/icons/plus";
    import GitCommit from "@lucide/svelte/icons/git-commit";
    import SearchIcon from "@lucide/svelte/icons/search";
    import SettingsIcon from "@lucide/svelte/icons/settings";
    import ChevronDownIcon from "@lucide/svelte/icons/chevron-down";
    import CheckIcon from "@lucide/svelte/icons/check";
    import UserPlusIcon from "@lucide/svelte/icons/user-plus";
    import Header from "$lib/components/ui/header.svelte";
    import UserAvatar from "$lib/components/ui/user-avatar.svelte";
    import { Button } from "$lib/components/ui/button/index.js";
    import CommitTimeline from "$lib/components/dashboard/CommitTimeline.svelte";

    const RECENT_LIMIT = 6;

    let showCreate = $state(false);
    let query = $state("");
    let accountOpen = $state(false);
    let accountMenuEl: HTMLDivElement | undefined = $state();
    let { data, form } = $props();

    const hasSession = $derived(Boolean($page.data?.user ?? data?.user));
    const user = $derived(data?.user);
    const projects = $derived(data?.projects ?? []);
    const orgs = $derived(data?.orgs ?? []);
    const diffs = $derived(data?.diffs ?? []);

    const displayName = $derived(
        user?.user_metadata?.first_name
            ? `${user.user_metadata.first_name} ${user.user_metadata.last_name ?? ""}`.trim()
            : (user?.email ?? "User"),
    );

    const initials = $derived(
        user?.user_metadata?.first_name
            ? `${user.user_metadata.first_name.charAt(0)}${user.user_metadata.last_name?.charAt(0) ?? ""}`.toUpperCase()
            : (user?.email?.charAt(0).toUpperCase() ?? "U"),
    );

    const lastEditedAt = $derived.by(() => {
        const map = new Map<string, string>();
        for (const d of diffs) {
            if (!map.has(d.project_slug)) map.set(d.project_slug, d.created_at);
        }
        return map;
    });

    const recentProjects = $derived.by(() => {
        const bySlug = new Map(projects.map((p) => [p.slug, p]));
        const seen = new Set<string>();
        const ordered: typeof projects = [];
        for (const d of diffs) {
            if (seen.has(d.project_slug)) continue;
            const p = bySlug.get(d.project_slug);
            if (!p) continue;
            ordered.push(p);
            seen.add(d.project_slug);
            if (ordered.length >= RECENT_LIMIT) return ordered;
        }
        for (const p of projects) {
            if (seen.has(p.slug)) continue;
            ordered.push(p);
            seen.add(p.slug);
            if (ordered.length >= RECENT_LIMIT) break;
        }
        return ordered;
    });

    const searching = $derived(query.trim().length > 0);

    const visibleProjects = $derived.by(() => {
        const q = query.trim().toLowerCase();
        if (!q) return recentProjects;
        return projects.filter(
            (p) =>
                p.title.toLowerCase().includes(q) ||
                p.slug.toLowerCase().includes(q),
        );
    });

    function relativeTime(ts: string): string {
        const date = new Date(ts);
        const diffMins = Math.floor((Date.now() - date.getTime()) / 60000);
        const diffHours = Math.floor(diffMins / 60);
        const diffDays = Math.floor(diffHours / 24);
        if (diffMins < 1) return "Just now";
        if (diffMins < 60) return `${diffMins}m ago`;
        if (diffHours < 24) return `${diffHours}h ago`;
        if (diffDays < 7) return `${diffDays}d ago`;
        return date.toLocaleDateString();
    }

    $effect(() => {
        if (form?.success && form?.slug) {
            showCreate = false;
            goto(`/${form.slug}`);
        }
    });

    $effect(() => {
        if (!browser || !accountOpen) return;
        const onPointer = (e: PointerEvent) => {
            if (accountMenuEl?.contains(e.target as Node)) return;
            accountOpen = false;
        };
        const onKey = (e: KeyboardEvent) => {
            if (e.key === "Escape") accountOpen = false;
        };
        window.addEventListener("pointerdown", onPointer);
        window.addEventListener("keydown", onKey);
        return () => {
            window.removeEventListener("pointerdown", onPointer);
            window.removeEventListener("keydown", onKey);
        };
    });
</script>

<svelte:head><title>Projects — echidna</title></svelte:head>

<div class="flex flex-col h-screen overflow-hidden">
    <Header subtitle="Projects" {hasSession} />

    {#if user}
        <main class="flex-1 min-h-0 overflow-y-auto bg-background">
            <div class="mx-auto max-w-5xl px-6 py-6">
                <div class="mb-6 flex items-center justify-between gap-4">
                    <div class="relative min-w-0" bind:this={accountMenuEl}>
                        <button
                            type="button"
                            class="flex min-w-0 max-w-full items-center gap-2.5 rounded-md px-1.5 py-1 text-left outline-none transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
                            aria-label="Switch account"
                            aria-haspopup="listbox"
                            aria-expanded={accountOpen}
                            onclick={() => (accountOpen = !accountOpen)}
                        >
                            <span
                                class="flex size-9 shrink-0 items-center justify-center"
                                aria-hidden="true"
                            >
                                {#if user?.id}
                                    <UserAvatar
                                        userId={user.id}
                                        name={displayName}
                                        class="size-9"
                                    />
                                {:else}
                                    <span
                                        class="flex size-9 items-center justify-center rounded-full bg-secondary text-xs font-medium text-muted-foreground"
                                        >{initials}</span
                                    >
                                {/if}
                            </span>
                            <span class="min-w-0">
                                <span
                                    class="block truncate text-sm font-medium text-foreground"
                                    >{displayName}</span
                                >
                                {#if user?.email}
                                    <span
                                        class="block truncate text-xs text-muted-foreground"
                                        >{user.email}</span
                                    >
                                {/if}
                            </span>
                            <ChevronDownIcon
                                class="size-3.5 shrink-0 text-muted-foreground {accountOpen
                                    ? 'rotate-180'
                                    : ''} transition-transform"
                            />
                        </button>
                        {#if accountOpen}
                            <div
                                class="absolute left-0 top-full z-50 mt-1 min-w-64 rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-md"
                                role="listbox"
                                aria-label="Accounts"
                            >
                                <p
                                    class="px-2 py-1.5 text-[11px] font-medium text-muted-foreground"
                                >
                                    Accounts
                                </p>
                                <div
                                    class="flex items-center gap-2 rounded-sm px-2 py-1.5"
                                    role="option"
                                    aria-selected="true"
                                >
                                    <div
                                        class="flex size-7 shrink-0 items-center justify-center"
                                        aria-hidden="true"
                                    >
                                        {#if user?.id}
                                            <UserAvatar
                                                userId={user.id}
                                                name={displayName}
                                                class="size-7"
                                            />
                                        {:else}
                                            <span
                                                class="flex size-7 items-center justify-center rounded-full bg-secondary text-[10px] font-medium text-muted-foreground"
                                                >{initials}</span
                                            >
                                        {/if}
                                    </div>
                                    <div class="min-w-0 flex-1">
                                        <p
                                            class="truncate text-xs font-medium text-foreground"
                                        >
                                            {displayName}
                                        </p>
                                        {#if user?.email}
                                            <p
                                                class="truncate text-[11px] text-muted-foreground"
                                            >
                                                {user.email}
                                            </p>
                                        {/if}
                                    </div>
                                    <CheckIcon
                                        class="size-3.5 shrink-0 text-foreground"
                                    />
                                </div>
                                <div class="my-1 h-px bg-border"></div>
                                <a
                                    href="/auth/login"
                                    class="flex items-center gap-2 rounded-sm px-2 py-1.5 text-xs text-foreground no-underline hover:bg-accent hover:text-accent-foreground"
                                >
                                    <UserPlusIcon class="size-3.5 shrink-0" />
                                    Add account
                                </a>
                            </div>
                        {/if}
                    </div>
                    <a
                        href="/settings"
                        class="inline-flex shrink-0 items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium text-muted-foreground no-underline transition-colors hover:bg-accent hover:text-foreground"
                    >
                        <SettingsIcon class="size-3.5" />
                        Settings
                    </a>
                </div>

                <section class="mb-8">
                    {#if orgs.length > 0}
                        <div class="mb-6">
                            <div
                                class="mb-3 flex items-center justify-between gap-3"
                            >
                                <h2
                                    class="text-xs font-semibold uppercase tracking-wider text-muted-foreground"
                                >
                                    Organisations
                                </h2>
                                <a
                                    href="/orgs"
                                    class="text-xs text-muted-foreground no-underline hover:text-foreground"
                                    >All</a
                                >
                            </div>
                            <div class="flex flex-wrap gap-2">
                                {#each orgs as org (org.slug)}
                                    <a
                                        href="/orgs/{org.slug}"
                                        class="inline-flex items-center gap-2 rounded-md border border-border bg-card px-2.5 py-1.5 text-xs no-underline hover:bg-accent"
                                    >
                                        {#if org.has_avatar}
                                            <img
                                                src="/orgs/{org.slug}/avatar"
                                                alt=""
                                                class="size-5 rounded-full object-cover"
                                            />
                                        {/if}
                                        <span class="font-medium text-foreground"
                                            >{org.name}</span
                                        >
                                    </a>
                                {/each}
                            </div>
                        </div>
                    {/if}

                    <div
                        class="mb-3 flex items-center justify-between gap-3"
                    >
                        <h1
                            class="text-lg font-semibold tracking-tight text-foreground"
                        >
                            {searching ? "Projects" : "Recent projects"}
                        </h1>
                        <div class="flex items-center gap-1">
                            <button
                                type="button"
                                onclick={() => (showCreate = true)}
                                class="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                            >
                                <PlusIcon class="size-3.5" />
                                New
                            </button>
                            <a
                                href="/settings?qfield_publish=1"
                                class="inline-flex items-center rounded-md px-2 py-1 text-xs font-medium text-muted-foreground no-underline transition-colors hover:bg-accent hover:text-foreground"
                            >
                                From QFieldCloud
                            </a>
                        </div>
                    </div>

                    {#if projects.length > 0}
                        <div class="relative mb-3">
                            <SearchIcon
                                class="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground"
                            />
                            <input
                                type="search"
                                bind:value={query}
                                placeholder="Search projects"
                                autocomplete="off"
                                class="h-9 w-full rounded-md border border-input bg-background pl-9 pr-3 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                            />
                        </div>
                    {/if}

                    <div class="h-52 overflow-y-auto">
                        {#if projects.length === 0}
                            <div
                                class="flex h-full flex-col items-center justify-center rounded-lg border border-border bg-card px-4 text-center"
                            >
                                <UsersIcon
                                    class="mb-2 size-6 text-muted-foreground"
                                />
                                <p class="mb-3 text-sm text-muted-foreground">
                                    No projects yet
                                </p>
                                <div class="flex flex-wrap justify-center gap-2">
                                    <Button
                                        type="button"
                                        size="sm"
                                        onclick={() => (showCreate = true)}
                                    >
                                        Create project
                                    </Button>
                                    <Button
                                        href="/settings?qfield_publish=1"
                                        variant="outline"
                                        size="sm"
                                    >
                                        From QFieldCloud
                                    </Button>
                                </div>
                            </div>
                        {:else if visibleProjects.length === 0}
                            <p
                                class="flex h-full items-center justify-center rounded-lg border border-border bg-card px-4 text-center text-sm text-muted-foreground"
                            >
                                No matching projects
                            </p>
                        {:else}
                            <div
                                class="grid content-start gap-2 sm:grid-cols-2"
                            >
                                {#each visibleProjects as project}
                                    <a
                                        href="/{project.slug}"
                                        class="rounded-lg border border-border bg-card px-3.5 py-3 no-underline transition-colors hover:bg-accent hover:text-foreground"
                                    >
                                        <span
                                            class="block truncate text-sm font-medium text-foreground"
                                            >{project.title}</span
                                        >
                                        <span
                                            class="mt-0.5 block truncate text-[11px] text-muted-foreground"
                                            >{project.slug}{#if project.role}
                                                · {project.role}{/if}{#if lastEditedAt.get(project.slug)}
                                                · {relativeTime(
                                                    lastEditedAt.get(
                                                        project.slug,
                                                    )!,
                                                )}{/if}</span
                                        >
                                    </a>
                                {/each}
                            </div>
                        {/if}
                    </div>
                </section>

                <section>
                    <h2
                        class="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground"
                    >
                        Recent activity
                    </h2>
                    {#if diffs.length === 0}
                        <div
                            class="rounded-lg border border-border bg-card px-4 py-6 text-center"
                        >
                            <div
                                class="mx-auto mb-2 flex size-8 items-center justify-center rounded-full bg-secondary"
                            >
                                <GitCommit
                                    class="size-3.5 text-muted-foreground"
                                />
                            </div>
                            <p class="text-sm text-muted-foreground">
                                No diffs yet. Run
                                <code
                                    class="rounded bg-secondary px-1 font-mono text-xs"
                                >
                                    tinyowl push
                                </code>
                                to push your first diff.
                            </p>
                        </div>
                    {:else}
                        <CommitTimeline {diffs} />
                    {/if}
                </section>
            </div>
        </main>
    {:else}
        <div class="flex-1 flex items-center justify-center bg-background">
            <p class="text-sm text-muted-foreground">
                <a href="/auth/login" class="underline underline-offset-4"
                    >Sign in</a
                > to view your projects.
            </p>
        </div>
    {/if}
</div>

{#if showCreate}
    <button
        class="fixed inset-0 z-50 bg-black/20"
        onclick={() => (showCreate = false)}
        aria-label="Close"
    ></button>
    <div class="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div class="w-full max-w-sm rounded-xl border bg-card p-6 shadow-xl">
            <h2 class="text-base font-semibold mb-4">New project</h2>
            <form method="POST" action="?/create" use:enhance>
                <label class="block mb-4">
                    <span class="text-xs text-muted-foreground"
                        >Project name</span
                    >
                    <input
                        type="text"
                        name="name"
                        required
                        placeholder="My Excavation"
                        class="mt-1 block w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                    />
                </label>
                {#if form?.error}
                    <p class="text-xs text-destructive mb-4">{form.error}</p>
                {/if}
                <div class="flex gap-2">
                    <Button type="submit" class="flex-1">Create</Button>
                    <Button
                        type="button"
                        variant="outline"
                        onclick={() => (showCreate = false)}>Cancel</Button
                    >
                </div>
            </form>
        </div>
    </div>
{/if}
