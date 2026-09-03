<script lang="ts">
    import { enhance } from "$app/forms";
    import PlusIcon from "@lucide/svelte/icons/plus";
    import Trash2Icon from "@lucide/svelte/icons/trash-2";
    import { Button } from "$lib/components/ui/button/index.js";
    import { Input } from "$lib/components/ui/input/index.js";
    import { Field, FieldLabel } from "$lib/components/ui/field/index.js";
    import { SELECT_CLASS } from "../pages";

    let { data, form: rawForm } = $props();
    const form = $derived(rawForm as any);

    const members = $derived(data?.members ?? []);
    const currentUserId = $derived(data?.currentUserId ?? "");
    const userRole = $derived(data?.role ?? "viewer");
    const projectTitle = $derived(data?.project?.title ?? "Project");
    const isOwner = $derived(userRole === "owner");
    const canManage = $derived(userRole === "owner" || userRole === "admin");

    let showInvite = $state(false);
    let inviteEmail = $state("");
    let inviteRole = $state("viewer");

    $effect(() => {
        if (form?.memberAction) {
            showInvite = false;
            inviteEmail = "";
            inviteRole = "viewer";
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
                <PlusIcon class="size-3.5" />
                {showInvite ? "Cancel" : "Add member"}
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

    {#if showInvite && canManage}
        <form
            method="POST"
            action="?/addMember"
            class="mb-4 rounded-lg border border-border p-4 space-y-3"
            use:enhance
        >
            <div class="grid grid-cols-2 gap-3">
                <Field>
                    <FieldLabel for="invite_email">Email</FieldLabel>
                    <Input
                        id="invite_email"
                        type="email"
                        name="email"
                        required
                        placeholder="colleague@example.com"
                        bind:value={inviteEmail}
                    />
                </Field>
                <Field>
                    <FieldLabel for="invite_role">Role</FieldLabel>
                    <select
                        id="invite_role"
                        name="role"
                        bind:value={inviteRole}
                        class={SELECT_CLASS}
                    >
                        <option value="viewer">Viewer</option>
                        <option value="collaborator">Collaborator</option>
                        <option value="admin">Admin</option>
                        <option value="owner">Owner</option>
                    </select>
                </Field>
            </div>
            <Button type="submit" size="sm">Add</Button>
        </form>
    {/if}

    {#if members.length > 0}
        <div class="rounded-lg border border-border divide-y divide-border">
            {#each members as member (member.user_id)}
                <div class="flex items-center justify-between gap-4 px-4 py-3">
                    <div class="flex items-center gap-3 min-w-0">
                        <div
                            class="flex size-8 shrink-0 items-center justify-center rounded-full bg-secondary text-xs font-medium text-muted-foreground"
                        >
                            {member.email?.charAt(0).toUpperCase() ?? "?"}
                        </div>
                        <div class="min-w-0">
                            <p
                                class="text-sm font-medium text-foreground truncate"
                            >
                                {member.email}
                                {#if member.user_id === currentUserId}
                                    <span
                                        class="ml-1.5 text-xs font-normal text-muted-foreground"
                                        >you</span
                                    >
                                {/if}
                            </p>
                            <p class="text-xs text-muted-foreground mt-0.5">
                                {ROLE_LABELS[member.role] ?? member.role}
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
