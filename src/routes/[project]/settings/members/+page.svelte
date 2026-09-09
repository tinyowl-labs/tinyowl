<script lang="ts">
    import { enhance } from "$app/forms";
    import PlusIcon from "@lucide/svelte/icons/plus";
    import XIcon from "@lucide/svelte/icons/x";
    import Trash2Icon from "@lucide/svelte/icons/trash-2";
    import { Button } from "$lib/components/ui/button/index.js";
    import { SELECT_CLASS } from "../pages";
    import UserAvatar from "$lib/components/ui/user-avatar.svelte";
    import PendingJoinRequests from "$lib/components/join/PendingJoinRequests.svelte";
    import InviteMembers from "$lib/components/join/InviteMembers.svelte";

    let { data, form: rawForm } = $props();
    const form = $derived(rawForm as any);

    const members = $derived(data?.members ?? []);
    const joinRequests = $derived(data?.joinRequests ?? []);
    const invites = $derived(data?.invites ?? []);
    const currentUserId = $derived(data?.currentUserId ?? "");
    const userRole = $derived(data?.role ?? "viewer");
    const projectTitle = $derived(data?.project?.title ?? "Project");
    const isOwner = $derived(userRole === "owner");
    const canManage = $derived(userRole === "owner" || userRole === "admin");

    let showInvite = $state(false);
    const inviteUrl = $derived(
        typeof form?.inviteUrl === "string" ? form.inviteUrl : "",
    );

    $effect(() => {
        if (form?.memberAction) {
            showInvite = form.memberAction === "invited" || form.memberAction === "added";
        }
    });

    const ROLE_LABELS: Record<string, string> = {
        owner: "Owner",
        admin: "Admin",
        collaborator: "Collaborator",
        viewer: "Viewer",
    };
</script>

<svelte:head>
    <title>Members — {projectTitle} — echidna</title>
</svelte:head>

<section>
    <div class="flex items-start justify-between gap-4 mb-4">
        <div>
            <h2 class="text-sm font-medium text-foreground">Members</h2>
            <p class="mt-1 text-sm text-muted-foreground">
                Who can access this project.
            </p>
        </div>
        {#if canManage}
            <Button
                type="button"
                size="sm"
                variant="outline"
                class="text-muted-foreground hover:bg-accent hover:text-foreground"
                onclick={() => (showInvite = !showInvite)}
            >
                {#if showInvite}
                    <XIcon class="size-3.5" />
                    Cancel
                {:else}
                    <PlusIcon class="size-3.5" />
                    Invite
                {/if}
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
    {#if form?.success && form?.memberAction}
        <p
            class="mb-4 rounded-md border border-border bg-secondary/50 px-3 py-2 text-sm text-foreground"
        >
            Member {form.memberAction}.
        </p>
    {/if}

    {#if canManage}
        <InviteMembers
            canManage={true}
            showForm={showInvite}
            defaultRole="viewer"
            selectClass={SELECT_CLASS}
            inviteUrl={inviteUrl}
            invites={invites}
            accessToken={(data as any)?.accessToken ?? ""}
            memberUserIds={members.map((m: any) => m.user_id)}
            roleOptions={[
                { value: "viewer", label: "Viewer" },
                { value: "collaborator", label: "Collaborator" },
                { value: "admin", label: "Admin" },
                { value: "owner", label: "Owner" },
            ]}
        />
    {/if}

    <PendingJoinRequests
        requests={joinRequests}
        defaultRole="collaborator"
        roleOptions={[
            { value: "viewer", label: "Viewer" },
            { value: "collaborator", label: "Collaborator" },
            { value: "admin", label: "Admin" },
            { value: "owner", label: "Owner" },
        ]}
    />

    {#if members.length > 0}
        <div class="rounded-lg border border-border divide-y divide-border">
            {#each members as member (member.user_id)}
                <div class="flex items-center justify-between gap-4 px-4 py-3">
                    <div class="flex items-center gap-3 min-w-0">
                        <UserAvatar
                            userId={member.user_id}
                            name={member.display_name || member.email || member.user_id}
                            href="/users/{member.user_id}"
                            class="size-8"
                        />
                        <div class="min-w-0">
                            <p
                                class="text-sm font-medium text-foreground truncate"
                            >
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
                            <p class="text-xs text-muted-foreground mt-0.5">
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
                                    <option value="viewer">Viewer</option>
                                    <option value="collaborator"
                                        >Collaborator</option
                                    >
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
                                    class="text-muted-foreground hover:text-destructive shrink-0"
                                    title="Remove member"
                                    onclick={(e) => {
                                        if (
                                            !confirm(
                                                `Remove ${member.email} from this project?`,
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
    {:else}
        <div
            class="rounded-lg border border-dashed border-border px-4 py-8 text-center"
        >
            <p class="text-sm text-muted-foreground">No members yet.</p>
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
</section>
