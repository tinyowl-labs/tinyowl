<script lang="ts">
    import { enhance } from "$app/forms";
    import PlusIcon from "@lucide/svelte/icons/plus";
    import Trash2Icon from "@lucide/svelte/icons/trash-2";
    import { Button } from "$lib/components/ui/button/index.js";
    import UserAvatar from "$lib/components/ui/user-avatar.svelte";
    import PendingJoinRequests from "$lib/components/join/PendingJoinRequests.svelte";
    import InviteMembers from "$lib/components/join/InviteMembers.svelte";

    const SELECT_CLASS =
        "flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm";

    let { data, form: rawForm } = $props();
    const form = $derived(rawForm as any);
    const org = $derived(data.org);
    const members = $derived(data.members ?? []);
    const joinRequests = $derived(data.joinRequests ?? []);
    const invites = $derived(data.invites ?? []);
    const currentUserId = $derived(data.currentUserId ?? "");
    const isOwner = $derived(org.role === "owner");
    const canManage = $derived(org.role === "owner" || org.role === "admin");
    let showInvite = $state(false);
    const inviteUrl = $derived(
        typeof form?.inviteUrl === "string" ? form.inviteUrl : "",
    );

    $effect(() => {
        if (form?.memberAction === "invited" || form?.memberAction === "added") {
            showInvite = true;
        }
    });

    const ROLE_LABELS: Record<string, string> = {
        owner: "Owner",
        admin: "Admin",
        member: "Member",
    };
</script>

<svelte:head>
    <title>Members — {org.name} — echidna</title>
</svelte:head>

<section>
    <div class="mb-4 flex items-start justify-between gap-4">
        <div>
            <h2 class="text-sm font-medium text-foreground">Members</h2>
            <p class="mt-1 text-sm text-muted-foreground">
                Organisation roles — distinct from project members.
            </p>
        </div>
        {#if canManage}
        <Button
            type="button"
            size="sm"
            variant="outline"
            onclick={() => (showInvite = !showInvite)}
        >
            <PlusIcon class="size-3.5" />
            {showInvite ? "Cancel" : "Invite"}
        </Button>
        {/if}
    </div>
    {#if form?.error}
        <p
            class="mb-4 rounded-md border border-destructive/25 bg-destructive/5 px-3 py-2 text-sm text-destructive"
        >
            {form.error}
        </p>
    {/if}
    <InviteMembers
        canManage={canManage}
        showForm={showInvite}
        defaultRole="member"
        selectClass={SELECT_CLASS}
        inviteUrl={inviteUrl}
        invites={invites}
        roleOptions={[
            { value: "member", label: "Member" },
            { value: "admin", label: "Admin" },
            ...(isOwner ? [{ value: "owner", label: "Owner" }] : []),
        ]}
    />
    <PendingJoinRequests
        requests={joinRequests}
        defaultRole="member"
        roleOptions={[
            { value: "member", label: "Member" },
            { value: "admin", label: "Admin" },
            ...(isOwner ? [{ value: "owner", label: "Owner" }] : []),
        ]}
    />
    {#if members.length > 0}
        <div class="divide-y divide-border rounded-lg border border-border">
            {#each members as member (member.user_id)}
                <div class="flex items-center justify-between gap-4 px-4 py-3">
                    <div class="flex min-w-0 items-center gap-3">
                        <UserAvatar
                            userId={member.user_id}
                            name={member.display_name || member.email || member.user_id}
                            href="/users/{member.user_id}"
                            class="size-8"
                        />
                        <div class="min-w-0">
                        <p class="truncate text-sm font-medium text-foreground">
                            <a
                                href="/users/{member.user_id}"
                                class="text-foreground no-underline hover:underline"
                                >{member.display_name || member.email || member.user_id}</a
                            >
                            {#if member.user_id === currentUserId}
                                <span
                                    class="ml-1.5 text-xs font-normal text-muted-foreground"
                                    >you</span
                                >
                            {/if}
                        </p>
                        <p class="mt-0.5 text-xs text-muted-foreground">
                            {#if member.username && member.display_name !== member.username}@{member.username} · {/if}{ROLE_LABELS[member.role] ?? member.role}
                        </p>
                        </div>
                    </div>
                    {#if isOwner && member.user_id !== currentUserId}
                        <div class="flex items-center gap-1.5">
                            <form method="POST" action="?/updateRole" use:enhance>
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
                                    class="{SELECT_CLASS} h-8 w-auto text-xs"
                                >
                                    <option value="member">Member</option>
                                    <option value="admin">Admin</option>
                                    <option value="owner">Owner</option>
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
                                <Button
                                    type="submit"
                                    variant="ghost"
                                    size="icon-sm"
                                    class="text-muted-foreground hover:text-destructive"
                                    title="Remove"
                                    onclick={(e) => {
                                        if (
                                            !confirm(
                                                `Remove ${member.email || member.user_id}?`,
                                            )
                                        )
                                            e.preventDefault();
                                    }}
                                >
                                    <Trash2Icon class="size-4" />
                                </Button>
                            </form>
                        </div>
                    {/if}
                </div>
            {/each}
        </div>
    {/if}
</section>
