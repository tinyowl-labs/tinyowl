<script lang="ts">
    import { enhance } from "$app/forms";
    import XIcon from "@lucide/svelte/icons/x";
    import { Button } from "$lib/components/ui/button/index.js";
    import { Input } from "$lib/components/ui/input/index.js";
    import { Field, FieldLabel } from "$lib/components/ui/field/index.js";
    import UserAvatar from "$lib/components/ui/user-avatar.svelte";

    export type PendingInvite = {
        id: string;
        role: string;
        email?: string | null;
        invitee_user_id?: string | null;
        url?: string;
        expires_at?: string;
        expired?: boolean;
    };

    export type UserHit = {
        user_id: string;
        username?: string;
        display_name: string;
        has_avatar?: boolean;
    };

    let {
        roleOptions,
        defaultRole,
        invites = [],
        inviteUrl = "",
        selectClass,
        canManage,
        showForm = true,
        accessToken = "",
        memberUserIds = [],
    }: {
        roleOptions: { value: string; label: string }[];
        defaultRole: string;
        invites?: PendingInvite[];
        inviteUrl?: string;
        selectClass: string;
        canManage: boolean;
        showForm?: boolean;
        accessToken?: string;
        memberUserIds?: string[];
    } = $props();

    let copied = $state(false);

    async function copyLink() {
        if (!inviteUrl) return;
        const abs = inviteUrl.startsWith("http")
            ? inviteUrl
            : `${window.location.origin}${inviteUrl}`;
        await navigator.clipboard.writeText(abs);
        copied = true;
        setTimeout(() => {
            copied = false;
        }, 1500);
    }

    // Person search: pick an existing account, or fall back to an email link.
    let query = $state("");
    let hits = $state<UserHit[]>([]);
    let searching = $state(false);
    let open = $state(false);
    let selected = $state<UserHit | null>(null);
    let email = $state("");
    let searchGen = 0;
    const memberIds = $derived(new Set(memberUserIds));
    const freshHits = $derived(hits.filter((h) => !memberIds.has(h.user_id)));
    const canSubmit = $derived(selected !== null || email.trim() !== "");

    function runSearch(q: string) {
        const gen = ++searchGen;
        const trimmed = q.trim();
        if (trimmed.length < 2 || selected) {
            hits = [];
            searching = false;
            open = false;
            return;
        }
        searching = true;
        setTimeout(async () => {
            if (gen !== searchGen) return;
            try {
                const res = await fetch(
                    `/api/v1/users/search?q=${encodeURIComponent(trimmed)}&limit=8`,
                    { headers: { Authorization: `Bearer ${accessToken}` } },
                );
                if (gen !== searchGen) return;
                hits = res.ok ? ((await res.json()) as UserHit[]) : [];
                open = true;
            } catch {
                if (gen === searchGen) {
                    hits = [];
                    open = false;
                }
            } finally {
                if (gen === searchGen) searching = false;
            }
        }, 200);
    }

    $effect(() => {
        query;
        selected;
        runSearch(query);
    });

    function pick(hit: UserHit) {
        selected = hit;
        email = "";
        hits = [];
        open = false;
    }

    function clearSelected() {
        selected = null;
        query = "";
        hits = [];
        open = false;
    }

    function resetForm() {
        clearSelected();
        email = "";
    }
</script>

{#if inviteUrl}
    <div
        class="mb-4 flex items-center gap-2 rounded-md border border-border bg-secondary/50 px-3 py-2"
    >
        <Input readonly value={inviteUrl} class="font-mono text-xs" />
        <Button type="button" size="sm" variant="outline" onclick={copyLink}>
            {copied ? "Copied" : "Copy link"}
        </Button>
    </div>
{/if}

{#if canManage && showForm}
    <form
        method="POST"
        action="?/createInvite"
        class="mb-4 space-y-3 rounded-lg border border-border p-4"
        use:enhance={() => {
            return async ({ result, update }) => {
                if (result.type === "success") resetForm();
                await update();
            };
        }}
    >
        {#if selected}
            <input type="hidden" name="user_id" value={selected.user_id} />
        {/if}
        <div class="grid gap-3 sm:grid-cols-2">
            <Field>
                <FieldLabel for="invite_person">Person</FieldLabel>
                {#if selected}
                    <div
                        class="flex items-center gap-2 rounded-md border border-border bg-secondary/50 px-2.5 py-1.5"
                    >
                        <UserAvatar
                            userId={selected.user_id}
                            name={selected.display_name}
                            class="size-6"
                        />
                        <span class="min-w-0 flex-1 truncate text-sm">
                            {selected.display_name}
                            {#if selected.username}
                                <span class="text-muted-foreground">
                                    @{selected.username}
                                </span>
                            {/if}
                        </span>
                        <button
                            type="button"
                            class="shrink-0 rounded p-0.5 text-muted-foreground hover:text-foreground"
                            aria-label="Clear selection"
                            onclick={clearSelected}
                        >
                            <XIcon class="size-3.5" />
                        </button>
                    </div>
                {:else}
                    <div class="relative">
                        <Input
                            id="invite_person"
                            type="text"
                            bind:value={query}
                            placeholder="Search name or username…"
                            autocomplete="off"
                            role="combobox"
                            aria-expanded={open}
                            aria-controls="invite-person-results"
                            onfocus={() => {
                                if (hits.length > 0) open = true;
                            }}
                            onblur={() => {
                                setTimeout(() => {
                                    open = false;
                                }, 150);
                            }}
                            onkeydown={(e) => {
                                if (e.key === "Escape") open = false;
                            }}
                        />
                        {#if open && (freshHits.length > 0 || (!searching && query.trim().length >= 2))}
                            <ul
                                id="invite-person-results"
                                role="listbox"
                                class="surface absolute inset-x-0 top-full z-50 mt-1 max-h-56 overflow-y-auto rounded-md border border-border p-1 shadow-lg"
                            >
                                {#each freshHits as hit (hit.user_id)}
                                    <li role="option" aria-selected="false">
                                        <button
                                            type="button"
                                            class="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left hover:bg-accent"
                                            onmousedown={(e) => {
                                                e.preventDefault();
                                                pick(hit);
                                            }}
                                        >
                                            <UserAvatar
                                                userId={hit.user_id}
                                                name={hit.display_name}
                                                class="size-6 shrink-0"
                                            />
                                            <span
                                                class="min-w-0 flex-1 truncate text-sm"
                                            >
                                                {hit.display_name}
                                                {#if hit.username}
                                                    <span
                                                        class="text-muted-foreground"
                                                    >
                                                        @{hit.username}
                                                    </span>
                                                {/if}
                                            </span>
                                        </button>
                                    </li>
                                {/each}
                                {#if freshHits.length === 0}
                                    <li
                                        class="px-2 py-1.5 text-sm text-muted-foreground"
                                    >
                                        No matching accounts — invite them by
                                        email below.
                                    </li>
                                {/if}
                            </ul>
                        {/if}
                    </div>
                {/if}
            </Field>
            <Field>
                <FieldLabel for="invite_role">Role</FieldLabel>
                <select
                    id="invite_role"
                    name="role"
                    class={selectClass}
                    value={defaultRole}
                >
                    {#each roleOptions as opt (opt.value)}
                        <option value={opt.value}>{opt.label}</option>
                    {/each}
                </select>
            </Field>
        </div>
        {#if !selected}
            <Field>
                <FieldLabel for="invite_email"
                    >Or invite by email link</FieldLabel
                >
                <Input
                    id="invite_email"
                    type="email"
                    name="email"
                    bind:value={email}
                    placeholder="colleague@example.com"
                />
            </Field>
        {/if}
        <Button type="submit" size="sm" disabled={!canSubmit}>
            {selected ? "Add" : "Invite"}
        </Button>
    </form>
{/if}

{#if invites.length > 0}
    <div class="mb-4 rounded-lg border border-border">
        <p class="px-4 py-2 text-xs font-medium text-muted-foreground">
            Pending invites
        </p>
        <div class="divide-y divide-border border-t border-border">
            {#each invites as inv (inv.id)}
                <div class="flex items-center justify-between gap-3 px-4 py-2">
                    <div class="min-w-0 text-sm">
                        <p class="truncate text-foreground">
                            {inv.email ||
                                (inv.invitee_user_id
                                    ? "Waiting for response"
                                    : "Anyone with the link")}
                        </p>
                        <p class="text-xs text-muted-foreground">
                            {inv.role}{#if inv.expired} · expired{/if}
                        </p>
                    </div>
                    {#if canManage}
                        <form method="POST" action="?/revokeInvite" use:enhance>
                            <input type="hidden" name="id" value={inv.id} />
                            <Button type="submit" size="sm" variant="ghost"
                                >Revoke</Button
                            >
                        </form>
                    {/if}
                </div>
            {/each}
        </div>
    </div>
{/if}
