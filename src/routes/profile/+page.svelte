<script lang="ts">
    import { goto } from "$app/navigation";
    import { enhance } from "$app/forms";
    import UsersIcon from "@lucide/svelte/icons/users";
    import PlusIcon from "@lucide/svelte/icons/plus";
    import LogOutIcon from "@lucide/svelte/icons/log-out";
    import ArrowRight from "@lucide/svelte/icons/arrow-right";
    import Settings from "@lucide/svelte/icons/settings";
    import GitCommit from "@lucide/svelte/icons/git-commit";
    import redthreadSvg from "$lib/assets/redthread.svg?raw";
    import { onMount } from "svelte";
    import { isDark } from "$lib/stores/theme.svelte";
    import CommitTimeline from "$lib/components/dashboard/CommitTimeline.svelte";

    const dark = $derived(isDark());
    const owlSvg = $derived(
        dark
            ? redthreadSvg
                  .replace(/fill:#000000/g, "fill:currentColor")
                  .replace(/stroke:#000000/g, "stroke:currentColor")
                  .replace(/fill:#ffffff/g, "fill:#000000")
                  .replace(/stroke:#ffffff/g, "stroke:#000000")
            : redthreadSvg,
    );

    let isMounted = $state(false);
    let showCreate = $state(false);
    let { data, form } = $props();

    const user = $derived(data?.user);
    const projects = $derived(data?.projects ?? []);
    const diffs = $derived(data?.diffs ?? []);
    const displayName = $derived(
        user?.user_metadata?.first_name
            ? `${user.user_metadata.first_name} ${user.user_metadata.last_name ?? ""}`.trim()
            : (user?.email ?? "User"),
    );
    const initials = $derived(
        user?.user_metadata?.first_name
            ? (
                  user.user_metadata.first_name.charAt(0) +
                  (user.user_metadata.last_name?.charAt(0) ?? "")
              ).toUpperCase()
            : (user?.email?.charAt(0).toUpperCase() ?? "U"),
    );

    onMount(() => {
        isMounted = true;
    });

    $effect(() => {
        if (form?.success) {
            showCreate = false;
            goto(`/${form.slug}`);
        }
    });
</script>

<svelte:head><title>Profile — TinyOwl</title></svelte:head>

<header
    class="flex items-center gap-2 shrink-0 px-4 h-11 border-b border-border bg-background"
>
    <a href="/" aria-label="tinyowl" class="flex items-center gap-2.5 mr-1">
        <span
            class="size-5 shrink-0 inline-block [&>svg]:w-full [&>svg]:h-full text-foreground"
        >
            {#if isMounted}{@html owlSvg}{/if}
        </span>
        <span class="text-sm font-semibold">tinyowl</span>
    </a>
    <span class="w-px h-4 shrink-0 bg-border"></span>
    <span class="text-sm font-medium text-muted-foreground">Profile</span>
    <div class="ml-auto flex items-center gap-1">
        <a
            href="/settings"
            title="Settings"
            class="flex items-center justify-center size-8 rounded-md text-muted-foreground hover:text-foreground transition-colors"
        >
            <Settings class="size-4" />
        </a>
        <a
            href="/auth/logout"
            title="Log out"
            class="flex items-center justify-center size-8 rounded-md text-muted-foreground hover:text-destructive transition-colors"
        >
            <LogOutIcon class="size-4" />
        </a>
    </div>
</header>

<div class="flex-1 min-h-0 overflow-y-auto bg-background">
    <div class="mx-auto max-w-4xl px-6 py-8">
        {#if user}
            <!-- Profile header -->
            <div class="flex items-start gap-5 mb-10">
                <div
                    class="size-20 shrink-0 rounded-full bg-secondary flex items-center justify-center text-2xl font-medium text-muted-foreground"
                >
                    {initials}
                </div>
                <div class="min-w-0 pt-1">
                    <h1
                        class="text-2xl font-bold tracking-tight text-foreground"
                    >
                        {displayName}
                    </h1>
                    {#if user.email}
                        <p class="text-sm mt-0.5 text-muted-foreground">
                            {user.email}
                        </p>
                    {/if}
                    <div class="flex items-center gap-3 mt-2">
                        <p class="text-sm text-muted-foreground">
                            {projects.length}
                            {projects.length === 1 ? "project" : "projects"}
                        </p>
                    </div>
                </div>
            </div>

            <!-- Projects -->
            <div class="flex items-center justify-between mb-4">
                <h2
                    class="text-sm font-semibold tracking-wider uppercase text-muted-foreground"
                >
                    Projects
                </h2>
                <button
                    onclick={() => (showCreate = true)}
                    class="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
                >
                    <PlusIcon class="size-3.5" /> New project
                </button>
            </div>

            {#if projects.length === 0}
                <div class="rounded-lg border p-10 text-center bg-card">
                    <div
                        class="mx-auto mb-4 flex size-14 items-center justify-center rounded-full bg-secondary"
                    >
                        <UsersIcon class="size-6 text-muted-foreground" />
                    </div>
                    <h3 class="text-base font-semibold mb-1.5 text-foreground">
                        No projects yet
                    </h3>
                    <p
                        class="text-sm max-w-xs mx-auto mb-5 text-muted-foreground"
                    >
                        Create your first project to start managing
                        archaeological data.
                    </p>
                    <button
                        onclick={() => (showCreate = true)}
                        class="inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-semibold bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
                    >
                        Create your first project
                    </button>
                </div>
            {:else}
                <div class="flex flex-col gap-2">
                    {#each projects as project}
                        <a
                            href="/{project.slug}"
                            class="group w-full rounded-lg border p-4 text-left bg-card hover:bg-accent transition-colors no-underline"
                        >
                            <div class="flex items-start justify-between gap-4">
                                <div class="min-w-0">
                                    <div class="flex items-center gap-2">
                                        <UsersIcon
                                            class="size-3.5 shrink-0 text-muted-foreground"
                                        />
                                        <h3
                                            class="text-sm font-semibold truncate text-foreground"
                                        >
                                            {project.title}
                                        </h3>
                                    </div>
                                    <p
                                        class="text-xs mt-1 text-muted-foreground"
                                    >
                                        {project.slug}
                                    </p>
                                </div>
                                <div class="flex items-center gap-3 shrink-0">
                                    {#if project.role}
                                        <span
                                            class="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium bg-secondary text-muted-foreground"
                                            >{project.role}</span
                                        >
                                    {/if}
                                    <ArrowRight
                                        class="size-4 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground"
                                    />
                                </div>
                            </div>
                        </a>
                    {/each}
                </div>
            {/if}

            <!-- Diff timeline -->
            <div class="mt-10">
                <h2
                    class="text-sm font-semibold tracking-wider uppercase text-muted-foreground mb-4"
                >
                    Recent Diffs
                </h2>

                {#if diffs.length === 0}
                    <div class="rounded-lg border p-8 text-center bg-card">
                        <div
                            class="mx-auto mb-3 flex size-10 items-center justify-center rounded-full bg-secondary"
                        >
                            <GitCommit class="size-4 text-muted-foreground" />
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
        {:else}
            <div class="text-center py-20">
                <p class="text-sm text-muted-foreground">
                    <a href="/auth/login" class="underline underline-offset-4"
                        >Sign in</a
                    > to view your profile.
                </p>
            </div>
        {/if}
    </div>
</div>

<!-- Create project modal -->
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
                    <button
                        type="submit"
                        class="flex-1 rounded-full bg-primary text-primary-foreground px-4 py-2 text-sm font-semibold hover:bg-primary/90 transition-colors"
                        >Create</button
                    >
                    <button
                        type="button"
                        onclick={() => (showCreate = false)}
                        class="rounded-full border px-4 py-2 text-sm text-muted-foreground hover:bg-accent transition-colors"
                        >Cancel</button
                    >
                </div>
            </form>
        </div>
    </div>
{/if}
