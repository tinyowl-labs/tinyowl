<script lang="ts">
    import { enhance } from "$app/forms";
    import { page } from "$app/stores";
    import InboxIcon from "@lucide/svelte/icons/inbox";
    import Header from "$lib/components/ui/header.svelte";
    import { Button } from "$lib/components/ui/button/index.js";
    import type { InboxNotification } from "./+page.server";

    let { data } = $props();
    const hasSession = $derived(Boolean($page.data?.user ?? data?.user));
    const items = $derived(data.items ?? []);
    const unread = $derived(data.unread ?? 0);

    function targetHref(n: InboxNotification): string {
        const jr = n.join_request;
        if (!jr) return "/inbox";
        if (jr.kind === "org" && jr.org_slug) {
            if (n.kind === "join_request") {
                return `/orgs/${jr.org_slug}/settings/members`;
            }
            return `/orgs/${jr.org_slug}`;
        }
        if (jr.project_slug) {
            const slug = encodeURIComponent(jr.project_slug);
            if (n.kind === "join_request") {
                return `/${slug}/settings/members`;
            }
            return `/${slug}`;
        }
        return "/inbox";
    }

    function when(iso: string): string {
        const d = new Date(iso);
        if (Number.isNaN(d.getTime())) return iso;
        return d.toLocaleString("en-GB", {
            day: "numeric",
            month: "short",
            hour: "2-digit",
            minute: "2-digit",
        });
    }
</script>

<svelte:head><title>Inbox — echidna</title></svelte:head>

<div class="flex h-screen flex-col overflow-hidden">
    <Header subtitle="Inbox" {hasSession} />
    <main class="min-h-0 flex-1 overflow-y-auto bg-background">
        <div class="mx-auto max-w-5xl px-6 py-6">
            <div class="mb-6 flex items-center justify-between gap-4">
                <h1 class="text-lg font-semibold text-foreground">Inbox</h1>
                {#if unread > 0}
                    <form method="POST" action="?/readAll" use:enhance>
                        <Button type="submit" size="sm" variant="outline"
                            >Mark all read</Button
                        >
                    </form>
                {/if}
            </div>

            {#if items.length === 0}
                <div
                    class="rounded-lg border border-dashed border-border px-4 py-12 text-center"
                >
                    <InboxIcon
                        class="mx-auto size-8 text-muted-foreground/60"
                    />
                    <p class="mt-3 text-sm text-muted-foreground">
                        No notifications yet.
                    </p>
                </div>
            {:else}
                <div
                    class="divide-y divide-border rounded-lg border border-border"
                >
                    {#each items as n (n.id)}
                        <form method="POST" action="?/open" use:enhance>
                            <input type="hidden" name="id" value={n.id} />
                            <input
                                type="hidden"
                                name="href"
                                value={targetHref(n)}
                            />
                            <button
                                type="submit"
                                class="flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-accent/60"
                            >
                                <span
                                    class="mt-1.5 size-2 shrink-0 rounded-full {n.read_at
                                        ? "bg-transparent"
                                        : "bg-primary"}"
                                    aria-hidden="true"
                                ></span>
                                <span class="min-w-0 flex-1">
                                    <span
                                        class="block text-sm {n.read_at
                                            ? "font-normal text-foreground"
                                            : "font-medium text-foreground"}"
                                        >{n.title}</span
                                    >
                                    <span
                                        class="mt-0.5 block text-xs text-muted-foreground"
                                        >{when(n.created_at)}</span
                                    >
                                </span>
                            </button>
                        </form>
                    {/each}
                </div>
            {/if}
        </div>
    </main>
</div>
