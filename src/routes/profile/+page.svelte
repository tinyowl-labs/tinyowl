<script lang="ts">
    import { goto } from "$app/navigation";
    import { page } from "$app/stores";
    import { browser } from "$app/environment";
    import { enhance } from "$app/forms";
    import UsersIcon from "@lucide/svelte/icons/users";
    import PlusIcon from "@lucide/svelte/icons/plus";
    import GitCommit from "@lucide/svelte/icons/git-commit";
    import PanelLeftIcon from "@lucide/svelte/icons/panel-left";
    import PanelLeftCloseIcon from "@lucide/svelte/icons/panel-left-close";
    import SettingsIcon from "@lucide/svelte/icons/settings";
    import Header from "$lib/components/ui/header.svelte";
    import MobileNav from "$lib/components/ui/mobile-nav.svelte";
    import { Button } from "$lib/components/ui/button/index.js";
    import CommitTimeline from "$lib/components/dashboard/CommitTimeline.svelte";

    let showCreate = $state(false);
    let { data, form } = $props();

    const hasSession = $derived(Boolean($page.data?.user ?? data?.user));
    const user = $derived(data?.user);
    const projects = $derived(data?.projects ?? []);
    const diffs = $derived(data?.diffs ?? []);

    const displayName = $derived(
        user?.user_metadata?.first_name
            ? `${user.user_metadata.first_name} ${user.user_metadata.last_name ?? ""}`.trim()
            : (user?.email ?? "User"),
    );

    let collapsed = $state(!browser || (browser && window.innerWidth < 768));
    let mobileOpen = $state(false);

    $effect(() => {
        if (!browser) return;
        const onResize = () => {
            if (window.innerWidth >= 768) mobileOpen = false;
            if (window.innerWidth < 768) collapsed = true;
        };
        window.addEventListener("resize", onResize);
        return () => window.removeEventListener("resize", onResize);
    });

    $effect(() => {
        if (form?.success && form?.slug) {
            showCreate = false;
            goto(`/${form.slug}`);
        }
    });
</script>

<svelte:head><title>Profile — TinyOwl</title></svelte:head>

<div class="flex flex-col h-screen overflow-hidden">
    <Header subtitle="Profile" {hasSession} />

    {#if user}
        <div class="flex flex-1 min-h-0">
            <!-- Desktop left sidebar: Your projects -->
            <aside
                class="hidden md:flex shrink-0 border-r border-border glass-panel flex-col transition-all duration-200 {collapsed
                    ? 'w-12'
                    : 'w-64'}"
            >
                <button
                    onclick={() => (collapsed = !collapsed)}
                    class="flex items-center justify-center h-10 shrink-0 border-b border-border text-muted-foreground hover:text-foreground hover:bg-secondary/30 transition-colors"
                    title={collapsed ? "Expand projects" : "Collapse projects"}
                >
                    {#if collapsed}
                        <PanelLeftIcon class="size-4" />
                    {:else}
                        <PanelLeftCloseIcon class="size-4" />
                    {/if}
                </button>

                {#if !collapsed}
                    <div
                        class="flex items-center justify-between gap-2 px-3 py-2 border-b border-border"
                    >
                        <h2
                            class="text-xs font-semibold tracking-wider uppercase text-muted-foreground"
                        >
                            Your projects
                        </h2>
                        <button
                            type="button"
                            onclick={() => (showCreate = true)}
                            class="inline-flex items-center justify-center size-7 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary/50 transition-colors"
                            title="New project"
                        >
                            <PlusIcon class="size-3.5" />
                        </button>
                    </div>
                {:else}
                    <button
                        type="button"
                        onclick={() => (showCreate = true)}
                        class="flex items-center justify-center m-1.5 size-8 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary/50 transition-colors"
                        title="New project"
                    >
                        <PlusIcon class="size-4" />
                    </button>
                {/if}

                <nav class="flex flex-col gap-0.5 p-1.5 flex-1 overflow-y-auto">
                    {#if projects.length === 0}
                        {#if !collapsed}
                            <div class="px-2 py-6 text-center">
                                <UsersIcon
                                    class="size-5 mx-auto mb-2 text-muted-foreground"
                                />
                                <p class="text-xs text-muted-foreground mb-3">
                                    No projects yet
                                </p>
                                <Button
                                    type="button"
                                    size="sm"
                                    onclick={() => (showCreate = true)}
                                >
                                    Create project
                                </Button>
                            </div>
                        {/if}
                    {:else}
                        {#each projects as project}
                            <a
                                href="/{project.slug}"
                                title={collapsed ? project.title : undefined}
                                class="flex items-center gap-2.5 rounded-md {collapsed
                                    ? 'justify-center px-0 py-1.5'
                                    : 'px-2.5 py-2'} text-sm text-muted-foreground hover:text-foreground hover:bg-secondary/50 transition-colors no-underline"
                            >
                                <UsersIcon class="size-4 shrink-0" />
                                {#if !collapsed}
                                    <span class="min-w-0 flex-1">
                                        <span
                                            class="block truncate font-medium text-foreground"
                                            >{project.title}</span
                                        >
                                        <span
                                            class="block truncate text-[11px] text-muted-foreground"
                                            >{project.slug}{#if project.role}
                                                · {project.role}{/if}</span
                                        >
                                    </span>
                                {/if}
                            </a>
                        {/each}
                    {/if}
                </nav>
            </aside>

            <!-- Mobile projects drawer -->
            <MobileNav bind:open={mobileOpen} title="Your projects">
                {#snippet children()}
                    <div class="p-3 border-b border-border">
                        <Button
                            type="button"
                            size="sm"
                            class="w-full"
                            onclick={() => {
                                mobileOpen = false;
                                showCreate = true;
                            }}
                        >
                            <PlusIcon class="size-3.5" />
                            New project
                        </Button>
                    </div>
                    <nav class="flex flex-col gap-0.5 p-3">
                        {#if projects.length === 0}
                            <p
                                class="px-3 py-6 text-center text-sm text-muted-foreground"
                            >
                                No projects yet
                            </p>
                        {:else}
                            {#each projects as project}
                                <a
                                    href="/{project.slug}"
                                    onclick={() => (mobileOpen = false)}
                                    class="flex items-center gap-3 rounded-md px-3 py-2 text-sm text-muted-foreground hover:text-foreground hover:bg-secondary/50 transition-colors no-underline"
                                >
                                    <UsersIcon class="size-4 shrink-0" />
                                    <span class="min-w-0">
                                        <span
                                            class="block truncate font-medium text-foreground"
                                            >{project.title}</span
                                        >
                                        <span
                                            class="block truncate text-xs text-muted-foreground"
                                            >{project.slug}{#if project.role}
                                                · {project.role}{/if}</span
                                        >
                                    </span>
                                </a>
                            {/each}
                        {/if}
                    </nav>
                {/snippet}
            </MobileNav>

            <main class="flex-1 min-h-0 overflow-y-auto bg-background">
                <div class="mx-auto max-w-3xl px-6 py-8">
                    <div class="flex items-start justify-between gap-4 mb-8">
                        <div class="min-w-0">
                            <h1
                                class="text-2xl font-semibold tracking-tight text-foreground"
                            >
                                Recent activity
                            </h1>
                            <p class="mt-1 text-sm text-muted-foreground">
                                Diffs across your projects · {displayName}
                            </p>
                        </div>
                        <a
                            href="/settings"
                            class="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-secondary/50 transition-colors no-underline shrink-0"
                        >
                            <SettingsIcon class="size-3.5" />
                            Settings
                        </a>
                    </div>

                    {#if diffs.length === 0}
                        <div class="rounded-lg border p-8 text-center bg-card">
                            <div
                                class="mx-auto mb-3 flex size-10 items-center justify-center rounded-full bg-secondary"
                            >
                                <GitCommit
                                    class="size-4 text-muted-foreground"
                                />
                            </div>
                            <p class="text-sm text-muted-foreground">
                                No diffs yet. Run
                                <code
                                    class="font-mono text-xs rounded px-1 bg-secondary"
                                >
                                    tinyowl push
                                </code>
                                to push your first diff.
                            </p>
                        </div>
                    {:else}
                        <CommitTimeline {diffs} />
                    {/if}
                </div>
            </main>
        </div>
    {:else}
        <div class="flex-1 flex items-center justify-center bg-background">
            <p class="text-sm text-muted-foreground">
                <a href="/auth/login" class="underline underline-offset-4"
                    >Sign in</a
                > to view your profile.
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
