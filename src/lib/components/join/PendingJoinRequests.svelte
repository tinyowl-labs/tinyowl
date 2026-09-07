<script lang="ts">
    import { enhance } from "$app/forms";
    import { Button } from "$lib/components/ui/button/index.js";
    import UserAvatar from "$lib/components/ui/user-avatar.svelte";

    export type PendingJoinRequest = {
        id: string;
        requester_id: string;
        requester_name?: string;
        requester_email?: string;
        status: string;
        created_at?: string;
    };

    const SELECT_CLASS =
        "flex h-8 w-auto rounded-md border border-input bg-transparent px-2 text-xs";

    let {
        requests,
        roleOptions,
        defaultRole,
    }: {
        requests: PendingJoinRequest[];
        roleOptions: { value: string; label: string }[];
        defaultRole: string;
    } = $props();

    function label(req: PendingJoinRequest) {
        return req.requester_name || req.requester_email || req.requester_id;
    }
</script>

{#if requests.length > 0}
    <section class="mb-8">
        <h2 class="text-sm font-medium text-foreground">Join requests</h2>
        <p class="mt-1 mb-3 text-sm text-muted-foreground">
            Accept adds a member with the role you choose. Decline leaves no
            membership.
        </p>
        <div class="divide-y divide-border rounded-lg border border-border">
            {#each requests as req (req.id)}
                <div
                    class="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
                >
                    <div class="flex min-w-0 items-center gap-3">
                        <UserAvatar
                            userId={req.requester_id}
                            name={label(req)}
                            href="/users/{req.requester_id}"
                            class="size-8"
                        />
                        <div class="min-w-0">
                            <p
                                class="truncate text-sm font-medium text-foreground"
                            >
                                <a
                                    href="/users/{req.requester_id}"
                                    class="text-foreground no-underline hover:underline"
                                    >{label(req)}</a
                                >
                            </p>
                            {#if req.requester_email && req.requester_email !== label(req)}
                                <p class="mt-0.5 text-xs text-muted-foreground">
                                    {req.requester_email}
                                </p>
                            {/if}
                        </div>
                    </div>
                    <div class="flex items-center gap-1.5">
                        <form
                            method="POST"
                            action="?/acceptJoin"
                            class="flex items-center gap-1.5"
                            use:enhance
                        >
                            <input type="hidden" name="id" value={req.id} />
                            <select
                                name="role"
                                class={SELECT_CLASS}
                                value={defaultRole}
                            >
                                {#each roleOptions as opt}
                                    <option value={opt.value}>{opt.label}</option>
                                {/each}
                            </select>
                            <Button type="submit" size="sm">Accept</Button>
                        </form>
                        <form method="POST" action="?/declineJoin" use:enhance>
                            <input type="hidden" name="id" value={req.id} />
                            <Button type="submit" size="sm" variant="outline"
                                >Decline</Button
                            >
                        </form>
                    </div>
                </div>
            {/each}
        </div>
    </section>
{/if}
