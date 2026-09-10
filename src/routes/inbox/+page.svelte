<script lang="ts">
    import { enhance } from "$app/forms";
    import InboxIcon from "@lucide/svelte/icons/inbox";
    import { Button } from "$lib/components/ui/button/index.js";
    import type { InboxNotification } from "./+page.server";

    let { data, form: rawForm } = $props();
    const form = $derived(rawForm as any);
    const items = $derived(data.items ?? []);
    const unread = $derived(data.unread ?? 0);

    function actionableInvite(n: InboxNotification) {
        if (n.kind !== "invite_received" || !n.invite) return null;
        if (n.invite.accepted_at || n.invite.declined_at || n.invite.revoked_at) {
            return null;
        }
        return n.invite;
    }

    function targetHref(n: InboxNotification): string {
        const jr = n.join_request;
        if (jr) {
            if (jr.kind === "org" && jr.org_slug) {
                if (n.kind === "join_request") {
                    return `/orgs/${jr.org_slug}/settings/members`;
                }
                return `/orgs/${jr.org_slug}`;
            }
            if (jr.project_slug) {
                const slug = encodeURIComponent(jr.project_slug);
                if (n.kind === "join_request") {
				return `/${encodeURIComponent(slug)}/settings/members`;
                }
			return `/${encodeURIComponent(slug)}`;
            }
        }
        const inv = n.invite;
        if (inv?.kind === "org" && inv.org_slug) {
            return `/orgs/${inv.org_slug}/settings/members`;
        }
        if (inv?.project_slug) {
            return `/${encodeURIComponent(inv.project_slug)}/settings/members`;
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

<div class="flex h-full flex-col overflow-hidden">    <main class="min-h-0 flex-1 overflow-y-auto bg-background">
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

            {#if form?.error}
                <p
                    class="mb-4 rounded-md border border-destructive/25 bg-destructive/5 px-3 py-2 text-sm text-destructive"
                >
                    {form.error}
                </p>
            {/if}

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
                        {@const invite = actionableInvite(n)}
                        <div class="flex items-start gap-3 px-4 py-3">
                            <form
                                method="POST"
                                action="?/open"
                                use:enhance
                                class="min-w-0 flex-1"
                            >
                                <input type="hidden" name="id" value={n.id} />
                                <input
                                    type="hidden"
                                    name="href"
                                    value={targetHref(n)}
                                />
                                <button
                                    type="submit"
                                    class="flex w-full items-start gap-3 text-left hover:bg-accent/60"
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
                            {#if invite}
                                <div class="flex shrink-0 items-center gap-1.5">
                                    <form
                                        method="POST"
                                        action="?/declineInvite"
                                        use:enhance
                                    >
                                        <input
                                            type="hidden"
                                            name="id"
                                            value={invite.id}
                                        />
                                        <Button
                                            type="submit"
                                            size="sm"
                                            variant="ghost"
                                            class="text-muted-foreground"
                                        >
                                            Decline
                                        </Button>
                                    </form>
                                    <form
                                        method="POST"
                                        action="?/acceptInvite"
                                        use:enhance
                                    >
                                        <input
                                            type="hidden"
                                            name="id"
                                            value={invite.id}
                                        />
                                        <Button type="submit" size="sm">
                                            Accept
                                        </Button>
                                    </form>
                                </div>
                            {/if}
                        </div>
                    {/each}
                </div>
            {/if}
        </div>
    </main>
</div>
