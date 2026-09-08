<script lang="ts">
    import { enhance } from "$app/forms";
    import { Button } from "$lib/components/ui/button/index.js";
    import { Input } from "$lib/components/ui/input/index.js";
    import { Field, FieldLabel } from "$lib/components/ui/field/index.js";

    export type PendingInvite = {
        id: string;
        role: string;
        email?: string | null;
        url?: string;
        expires_at?: string;
        expired?: boolean;
    };

    let {
        roleOptions,
        defaultRole,
        invites = [],
        inviteUrl = "",
        selectClass,
        canManage,
        showForm = true,
    }: {
        roleOptions: { value: string; label: string }[];
        defaultRole: string;
        invites?: PendingInvite[];
        inviteUrl?: string;
        selectClass: string;
        canManage: boolean;
        showForm?: boolean;
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
        use:enhance
    >
        <div class="grid grid-cols-2 gap-3">
            <Field>
                <FieldLabel for="invite_email">Email (optional)</FieldLabel>
                <Input
                    id="invite_email"
                    type="email"
                    name="email"
                    placeholder="colleague@example.com"
                />
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
        <Button type="submit" size="sm">Invite</Button>
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
                            {inv.email || "Anyone with the link"}
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
