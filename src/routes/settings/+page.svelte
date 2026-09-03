<script lang="ts">
    import { enhance } from "$app/forms";
    import {
        afterNavigate,
        goto,
        invalidateAll,
        replaceState,
    } from "$app/navigation";
    import { page } from "$app/stores";
    import { untrack } from "svelte";
    import Header from "$lib/components/ui/header.svelte";
    import UserAvatar from "$lib/components/ui/user-avatar.svelte";
    import AvatarEditor from "$lib/components/ui/avatar-editor.svelte";
    import AvatarCropDialog from "$lib/components/ui/avatar-crop-dialog.svelte";
    import { Tabs } from "$lib/components/ui/tabs/index.js";
    import { Button } from "$lib/components/ui/button/index.js";
    import { Input } from "$lib/components/ui/input/index.js";
    import {
        Field,
        FieldLabel,
        FieldDescription,
        FieldGroup,
    } from "$lib/components/ui/field/index.js";
    import { createClient } from "$lib/supabase/client";
    import { randomAvatarStyle, type AvatarStyle } from "$lib/avatar-style";
    import { generatedAvatarDataUrl } from "$lib/user-avatar";
    import { isAllowedAvatarType } from "$lib/avatar-crop";
    import { avatarPreview } from "$lib/stores/avatar-preview.svelte";
    import {
        themePrefs,
        setPreference,
        pushThemeToSupabase,
        ACCENT_PRESETS,
        type ThemePreferences,
        type BgBase,
        type RadiusScale,
        type BlurScale,
    } from "$lib/stores/theme.svelte";
    import CopyIcon from "@lucide/svelte/icons/copy";
    import CheckIcon from "@lucide/svelte/icons/check";
    import Trash2Icon from "@lucide/svelte/icons/trash-2";
    import PlusIcon from "@lucide/svelte/icons/plus";
    import ExternalLinkIcon from "@lucide/svelte/icons/external-link";
    import LogOutIcon from "@lucide/svelte/icons/log-out";
    import JobLog from "$lib/components/qfield/job-log.svelte";

    let { data, form: rawForm } = $props();
    const form = $derived(rawForm as any);

    const hasSession = $derived(Boolean($page.data?.user ?? data?.user));
    const user = $derived(data?.user);
    const hasAvatar = $derived(Boolean(data?.hasAvatar));
    let avatarStyle = $state<AvatarStyle>({});
    let editorDraft = $state<AvatarStyle>({});
    let editorOpen = $state(false);
    let avatarSaving = $state(false);
    let avatarBust = $state("");
    let cropOpen = $state(false);
    let cropUrl = $state("");
    let cropInput = $state<HTMLInputElement | null>(null);
    const qfieldAccounts = $derived(data?.qfieldAccounts ?? []);
    const qfieldLinks = $derived(
        (data?.qfieldLinks ?? []) as {
            tinyowl_slug: string;
            account_id: string;
            qfc_project_id: string;
            qfc_project_name?: string | null;
            last_synced_at?: string | null;
            base_url: string;
            username: string;
            mode?: string | null;
            import_status?: string | null;
            import_error?: string | null;
            job_log?: string | null;
            sync_pending?: boolean;
            sync_requested_at?: string | null;
        }[],
    );
    const ocLinks = $derived(
        (data?.ocLinks ?? []) as {
            tinyowl_slug: string;
            oc_uuid: string;
            oc_slug?: string | null;
            oc_label?: string | null;
            oc_uri?: string | null;
            import_status?: string | null;
            import_error?: string | null;
            row_count?: number | null;
            truncated?: boolean;
            job_log?: string | null;
            job_progress?: Record<string, unknown> | null;
        }[],
    );
    const cliTokens = $derived(data?.cliTokens ?? []);

    const tabs = [
        { value: "account", label: "Account" },
        { value: "qfieldcloud", label: "QFieldCloud" },
        { value: "opencontext", label: "Open Context" },
        { value: "tokens", label: "CLI tokens" },
        { value: "appearance", label: "Appearance" },
        { value: "security", label: "Security" },
    ];
    const tabValues = new Set(tabs.map((t) => t.value));

    function tabFromUrl(url: URL = $page.url): string {
        if (url.searchParams.get("qfield_publish") === "1") return "qfieldcloud";
        const t = url.searchParams.get("tab") ?? "";
        return tabValues.has(t) ? t : "account";
    }

    let activeTab = $state(untrack(() => tabFromUrl()));
    let showQFieldConnect = $state(false);
    let showQFieldPublish = $state(
        untrack(() => $page.url.searchParams.get("qfield_publish") === "1"),
    );
    type PublishProject = {
        id: string;
        name: string;
        status?: string;
        is_public?: boolean;
        owner?: string;
        user_role?: string;
        writable?: boolean;
        linked_slug?: string | null;
    };

    let publishAccountId = $state("");
    let publishProjects = $state<PublishProject[]>([]);
    let publishProjectId = $state("");
    let publishProjectName = $state("");
    let publishLoading = $state(false);
    let publishQuery = $state(
        untrack(() => $page.url.searchParams.get("qfc_name") ?? ""),
    );
    const publishPrefillId = untrack(
        () => $page.url.searchParams.get("qfc_id") ?? "",
    );

    const selectedPublish = $derived(
        publishProjects.find((p) => p.id === publishProjectId) ?? null,
    );
    const selectedIsSnapshot = $derived(
        Boolean(selectedPublish && selectedPublish.writable === false),
    );
    let publishForceSnapshot = $state(false);
    const willSnapshot = $derived(
        selectedIsSnapshot || publishForceSnapshot,
    );

    type JobLink = {
        tinyowl_slug?: string;
        job_log?: string | null;
        job_progress?: Record<string, unknown> | null;
        import_status?: string | null;
        import_error?: string | null;
        sync_pending?: boolean;
        sync_requested_at?: string | null;
        last_synced_at?: string | null;
        mode?: string | null;
        row_count?: number | null;
        truncated?: boolean;
    };
    let jobBySlug = $state<Record<string, JobLink>>({});

    function jobIsActive(link: JobLink | null | undefined) {
        if (!link) return false;
        const st = link.import_status;
        if (st === "pending" || st === "running") return true;
        return Boolean(link.sync_pending || link.sync_requested_at);
    }

    const watchKey = $derived.by(() => {
        const slugs = new Set<string>();
        if (form?.publishedSlug) {
            const live = jobBySlug[form.publishedSlug];
            if (!live || jobIsActive(live)) slugs.add(String(form.publishedSlug));
        }
        for (const l of qfieldLinks) {
            const live = jobBySlug[l.tinyowl_slug] ?? l;
            if (jobIsActive(live)) slugs.add(l.tinyowl_slug);
        }
        for (const l of ocLinks) {
            const live = jobBySlug[l.tinyowl_slug] ?? l;
            if (jobIsActive(live)) slugs.add(l.tinyowl_slug);
        }
        return [...slugs].sort().join(",");
    });

    $effect(() => {
        const key = watchKey;
        if (!key) return;
        const slugs = key.split(",");
        let stopped = false;
        async function tick() {
            for (const s of slugs) {
                const oc =
                    ocLinks.some((l) => l.tinyowl_slug === s) ||
                    ((form?.ocAction === "published" ||
                        form?.ocAction === "retried") &&
                        s === String(form?.publishedSlug ?? ""));
                const path = oc
                    ? `/api/opencontext/links/${encodeURIComponent(s)}`
                    : `/api/qfieldcloud/links/${encodeURIComponent(s)}`;
                try {
                    const res = await fetch(path);
                    if (!res.ok || stopped) continue;
                    const body = await res.json();
                    if (body && !stopped) {
                        jobBySlug = { ...jobBySlug, [s]: body };
                    }
                } catch {
                    /* ignore */
                }
            }
        }
        void tick();
        const id = setInterval(() => void tick(), 1000);
        return () => {
            stopped = true;
            clearInterval(id);
        };
    });

    let reconnectPrefill = $state<{
        base_url: string;
        username: string;
        label: string;
    } | null>(null);

    type OCHit = {
        uuid: string;
        slug?: string;
        label: string;
        uri: string;
        href?: string;
        citation_uri?: string;
        item_category?: string;
    };
    let ocQuery = $state("");
    let ocHits = $state<OCHit[]>([]);
    let ocLoading = $state(false);
    let ocSelected = $state("");
    const ocSelectedHit = $derived(
        ocHits.find((p) => p.uuid === ocSelected) ?? null,
    );

    async function searchOpenContext() {
        ocLoading = true;
        try {
            const qs = ocQuery.trim()
                ? `?q=${encodeURIComponent(ocQuery.trim())}`
                : "";
            const res = await fetch(`/api/opencontext/projects${qs}`);
            if (!res.ok) {
                ocHits = [];
                return;
            }
            const body = await res.json();
            ocHits = Array.isArray(body?.projects) ? body.projects : [];
            if (ocSelected && !ocHits.some((p) => p.uuid === ocSelected)) {
                ocSelected = ocHits[0]?.uuid ?? "";
            } else if (!ocSelected && ocHits.length) {
                ocSelected = ocHits[0].uuid;
            }
        } catch {
            ocHits = [];
        } finally {
            ocLoading = false;
        }
    }

    // Sync tab when navigating into /settings?tab=… from another route.
    // Ignore in-place query updates from our own replaceState (those race clicks).
    afterNavigate(({ from, to }) => {
        if (to?.url.pathname !== "/settings") return;
        if (from?.url.pathname === "/settings") return;
        activeTab = tabFromUrl(to.url);
    });

    function onTabChange(value: string) {
        if (!tabValues.has(value) || value === activeTab) return;
        activeTab = value;
        const current = $page.url.searchParams.get("tab");
        const currentNorm =
            current && tabValues.has(current) ? current : "account";
        if (currentNorm === value) return;
        const url = new URL($page.url);
        if (value === "account") url.searchParams.delete("tab");
        else url.searchParams.set("tab", value);
        try {
            replaceState(`${url.pathname}${url.search}${url.hash}`, {});
        } catch {
            // Router not ready yet (first paint) — tab UI still updates via activeTab.
        }
    }

    function setThemePreference<K extends keyof ThemePreferences>(
        key: K,
        value: ThemePreferences[K],
    ) {
        setPreference(key, value);
        void pushThemeToSupabase();
    }

    function tokenExpiryHint(expiresAt: string | null | undefined): {
        label: string;
        urgent: boolean;
    } | null {
        if (!expiresAt) return null;
        const exp = new Date(expiresAt).getTime();
        if (Number.isNaN(exp)) return null;
        const msLeft = exp - Date.now();
        const days = 7 * 24 * 60 * 60 * 1000;
        if (msLeft <= 0) {
            return { label: "Token expired — reconnect to refresh.", urgent: true };
        }
        if (msLeft <= days) {
            return {
                label: `Token expires soon (${formatDate(expiresAt)}) — reconnect to refresh.`,
                urgent: true,
            };
        }
        return null;
    }

    function startReconnect(acct: {
        base_url: string;
        username: string;
        label?: string | null;
    }) {
        reconnectPrefill = {
            base_url: acct.base_url,
            username: acct.username,
            label: acct.label ?? "",
        };
        showQFieldConnect = true;
    }

    function toggleConnectForm() {
        if (showQFieldConnect) {
            showQFieldConnect = false;
            reconnectPrefill = null;
        } else {
            reconnectPrefill = null;
            showQFieldConnect = true;
            showQFieldPublish = false;
        }
    }

    async function loadPublishProjects(
        accountId: string,
        opts?: { q?: string; id?: string; keepSelection?: boolean },
    ) {
        publishAccountId = accountId;
        const keep = Boolean(opts?.keepSelection);
        if (!keep) {
            publishProjects = [];
            publishProjectId = "";
            publishProjectName = "";
        }
        if (!accountId) return;
        publishLoading = true;
        try {
            const params = new URLSearchParams();
            const q = (opts?.q ?? publishQuery).trim();
            const id = (opts?.id ?? publishPrefillId).trim();
            if (q) params.set("q", q);
            if (id) params.set("id", id);
            const qs = params.toString();
            const res = await fetch(
                `/api/qfieldcloud/accounts/${accountId}/projects${qs ? `?${qs}` : ""}`,
            );
            if (res.ok) {
                const data = await res.json();
                publishProjects = Array.isArray(data)
                    ? data
                    : (data?.results ?? []);
                const preferId = id || publishProjectId;
                if (preferId) {
                    const match = publishProjects.find((p) => p.id === preferId);
                    if (match) {
                        publishProjectId = match.id;
                        publishProjectName = match.name || match.id;
                    }
                } else if (q) {
                    const match = publishProjects.find((p) =>
                        (p.name || "")
                            .toLowerCase()
                            .includes(q.toLowerCase()),
                    );
                    if (match) {
                        publishProjectId = match.id;
                        publishProjectName = match.name || match.id;
                    }
                }
            }
        } catch (_) {
            if (!keep) publishProjects = [];
        } finally {
            publishLoading = false;
        }
    }

    $effect(() => {
        if (
            showQFieldPublish &&
            qfieldAccounts.length > 0 &&
            !publishAccountId
        ) {
            void loadPublishProjects(qfieldAccounts[0].id, {
                q: publishQuery,
                id: publishPrefillId,
            });
        }
    });

    $effect(() => {
        if (form?.success && form?.qfieldAction === "published" && form.publishedUrl) {
            goto(form.publishedUrl);
        }
    });

    // Account
    let firstName = $state("");
    let lastName = $state("");
    let accountSaving = $state(false);
    let accountMsg = $state("");
    let accountError = $state("");

    $effect(() => {
        firstName = user?.user_metadata?.first_name ?? "";
        lastName = user?.user_metadata?.last_name ?? "";
    });

    let avatarHydrated = $state(false);
    $effect(() => {
        if (avatarHydrated) return;
        avatarStyle = { ...(data?.avatarStyle ?? {}) };
        avatarHydrated = true;
    });

    const initials = $derived(
        firstName
            ? (firstName.charAt(0) + (lastName?.charAt(0) ?? "")).toUpperCase()
            : (user?.email?.charAt(0).toUpperCase() ?? "U"),
    );

    async function saveAccount(e: SubmitEvent) {
        e.preventDefault();
        accountSaving = true;
        accountMsg = "";
        accountError = "";
        const supabase = createClient();
        const { error } = await supabase.auth.updateUser({
            data: {
                first_name: firstName.trim(),
                last_name: lastName.trim(),
            },
        });
        if (!error) {
            const displayName = `${firstName.trim()} ${lastName.trim()}`.trim();
            const { data: sessionData } = await supabase.auth.getSession();
            const token = sessionData.session?.access_token;
            if (token) {
                await fetch("/api/v1/me", {
                    method: "PATCH",
                    headers: {
                        Authorization: `Bearer ${token}`,
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify({ display_name: displayName }),
                });
            }
        }
        accountSaving = false;
        if (error) {
            accountError = error.message;
            return;
        }
        accountMsg = "Profile updated.";
        await invalidateAll();
    }

    async function meToken(): Promise<string | null> {
        const supabase = createClient();
        const { data: sessionData } = await supabase.auth.getSession();
        return sessionData.session?.access_token ?? null;
    }

    async function saveAvatarStyle(next: AvatarStyle) {
        if (!user?.id) return;
        const previous = avatarPreview.src(user.id);
        avatarStyle = next;
        avatarPreview.set(user.id, generatedAvatarDataUrl(user.id, next));
        editorOpen = false;
        avatarSaving = true;
        accountError = "";
        accountMsg = "";
        try {
            const token = await meToken();
            if (!token) throw new Error("Not signed in.");
            if (hasAvatar) {
                const del = await fetch("/api/v1/me/avatar", {
                    method: "DELETE",
                    headers: { Authorization: `Bearer ${token}` },
                });
                if (!del.ok) throw new Error(await del.text());
            }
            const res = await fetch("/api/v1/me", {
                method: "PATCH",
                headers: {
                    Authorization: `Bearer ${token}`,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({ avatar_style: next }),
            });
            if (!res.ok) throw new Error(await res.text());
            accountMsg = "Avatar saved.";
        } catch (err) {
            if (previous) avatarPreview.set(user.id, previous);
            else avatarPreview.clear(user.id);
            accountError =
                err instanceof Error ? err.message : "Could not save avatar.";
            editorOpen = true;
        } finally {
            avatarSaving = false;
        }
    }

    function openAvatarEditor() {
        editorDraft = randomAvatarStyle();
        editorOpen = true;
    }

    function pickAvatarFile() {
        cropInput?.click();
    }

    function onAvatarFile(event: Event) {
        const input = event.currentTarget as HTMLInputElement;
        const file = input.files?.[0];
        input.value = "";
        if (!file) return;
        if (!isAllowedAvatarType(file.type)) {
            accountError = "Choose a JPG, PNG, WEBP, or GIF image.";
            return;
        }
        if (cropUrl.startsWith("blob:")) URL.revokeObjectURL(cropUrl);
        cropUrl = URL.createObjectURL(file);
        cropOpen = true;
        accountError = "";
    }

    async function saveCroppedAvatar(file: File) {
        if (!user?.id) return;
        const token = await meToken();
        if (!token) throw new Error("Not signed in.");
        avatarSaving = true;
        accountError = "";
        try {
            const res = await fetch("/api/v1/me/avatar", {
                method: "PUT",
                headers: {
                    Authorization: `Bearer ${token}`,
                    "Content-Type": file.type || "image/webp",
                },
                body: file,
            });
            if (!res.ok) throw new Error(await res.text());
            avatarPreview.clear(user.id);
            avatarBust = String(Date.now());
            await invalidateAll();
        } finally {
            avatarSaving = false;
            if (cropUrl.startsWith("blob:")) URL.revokeObjectURL(cropUrl);
            cropUrl = "";
        }
    }

    $effect(() => {
        if (cropOpen || !cropUrl.startsWith("blob:")) return;
        const url = cropUrl;
        cropUrl = "";
        URL.revokeObjectURL(url);
    });

    // CLI tokens
    let showCreateToken = $state(false);
    let tokenLabel = $state("");
    let creatingToken = $state(false);
    let tokenError = $state("");
    let newlyCreatedToken = $state<string | null>(null);
    let copied = $state(false);
    let revokingId = $state<string | null>(null);

    async function createToken(e: SubmitEvent) {
        e.preventDefault();
        creatingToken = true;
        tokenError = "";
        newlyCreatedToken = null;
        try {
            const res = await fetch("/api/auth/cli-token", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ label: tokenLabel.trim() || "pat" }),
            });
            if (!res.ok) {
                tokenError = await res.text();
                return;
            }
            const body = await res.json();
            newlyCreatedToken = body.token ?? null;
            tokenLabel = "";
            showCreateToken = false;
            await invalidateAll();
        } catch (err) {
            tokenError = String(err);
        } finally {
            creatingToken = false;
        }
    }

    async function revokeToken(id: string) {
        if (
            !confirm(
                "Revoke this token? CLI sessions using it will stop working.",
            )
        ) {
            return;
        }
        revokingId = id;
        try {
            const res = await fetch("/api/auth/cli-token", {
                method: "DELETE",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ id }),
            });
            if (!res.ok) {
                tokenError = await res.text();
                return;
            }
            if (newlyCreatedToken) newlyCreatedToken = null;
            await invalidateAll();
        } catch (err) {
            tokenError = String(err);
        } finally {
            revokingId = null;
        }
    }

    async function copyToken() {
        if (!newlyCreatedToken) return;
        await navigator.clipboard.writeText(newlyCreatedToken);
        copied = true;
        setTimeout(() => (copied = false), 2000);
    }

    // Security
    let newPassword = $state("");
    let confirmPassword = $state("");
    let passwordSaving = $state(false);
    let passwordMsg = $state("");
    let passwordError = $state("");

    async function changePassword(e: SubmitEvent) {
        e.preventDefault();
        passwordMsg = "";
        passwordError = "";
        if (newPassword.length < 8) {
            passwordError = "Password must be at least 8 characters.";
            return;
        }
        if (newPassword !== confirmPassword) {
            passwordError = "Passwords do not match.";
            return;
        }
        passwordSaving = true;
        const supabase = createClient();
        const { error } = await supabase.auth.updateUser({
            password: newPassword,
        });
        passwordSaving = false;
        if (error) {
            passwordError = error.message;
            return;
        }
        newPassword = "";
        confirmPassword = "";
        passwordMsg = "Password updated.";
    }

    function linksForAccount(accountId: string) {
        return qfieldLinks.filter((l) => l.account_id === accountId);
    }

    function formatDate(ts: string | null | undefined): string {
        if (!ts) return "—";
        return new Date(ts).toLocaleString();
    }

    const bgBases: { value: BgBase; label: string }[] = [
        { value: "pitch", label: "Pitch" },
        { value: "dark", label: "Dark" },
        { value: "dim", label: "Dim" },
        { value: "stone", label: "Stone" },
        { value: "paper", label: "Paper" },
    ];
    const radii: { value: RadiusScale; label: string }[] = [
        { value: "sharp", label: "Sharp" },
        { value: "rounded", label: "Rounded" },
        { value: "pill", label: "Pill" },
    ];
    const blurs: { value: BlurScale; label: string }[] = [
        { value: "none", label: "None" },
        { value: "subtle", label: "Subtle" },
        { value: "glass", label: "Glass" },
    ];

    $effect(() => {
        if (form?.success && form?.qfieldAction === "connected") {
            showQFieldConnect = false;
            reconnectPrefill = null;
        }
    });
</script>

<svelte:head><title>Settings — echidna</title></svelte:head>

<div class="flex flex-col h-screen overflow-hidden">
    <Header subtitle="Settings" {hasSession} />

    <main class="flex-1 min-h-0 overflow-y-auto bg-background">
        <div class="mx-auto w-full max-w-5xl px-6 py-6">
            <Tabs
                value={activeTab}
                {tabs}
                orientation="vertical"
                onValueChange={onTabChange}
            >
                {#snippet children(tabValue: string)}
                    {#if tabValue === "account"}
                        <div class="space-y-6 w-full">
                            <section>
                                <div class="flex items-center gap-4 mb-4">
                                    {#if user?.id}
                                        <UserAvatar
                                            userId={user.id}
                                            name={firstName
                                                ? `${firstName} ${lastName}`.trim()
                                                : (user?.email ?? "")}
                                            class="size-16"
                                            bust={hasAvatar
                                                ? avatarBust || "1"
                                                : form?.accountAction ===
                                                    "avatar-removed"
                                                  ? "0"
                                                  : ""}
                                        />
                                    {:else}
                                        <div
                                            class="size-16 shrink-0 rounded-full bg-secondary flex items-center justify-center text-xl font-medium text-muted-foreground"
                                        >
                                            {initials}
                                        </div>
                                    {/if}
                                    <div class="min-w-0">
                                        <p
                                            class="text-sm font-medium text-foreground truncate"
                                        >
                                            {firstName
                                                ? `${firstName} ${lastName}`.trim()
                                                : (user?.email ?? "User")}
                                        </p>
                                        {#if user?.email}
                                            <p
                                                class="text-sm text-muted-foreground truncate"
                                            >
                                                {user.email}
                                            </p>
                                        {/if}
                                        {#if user?.id}
                                            <a
                                                href="/users/{user.id}"
                                                class="mt-1 inline-block text-xs text-muted-foreground no-underline hover:text-foreground"
                                                >View profile</a
                                            >
                                        {/if}
                                    </div>
                                </div>
                                <div class="mb-4 flex flex-wrap gap-2">
                                    <button
                                        type="button"
                                        class="inline-flex cursor-pointer items-center gap-2 rounded-md border border-border px-3 py-1.5 text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
                                        onclick={openAvatarEditor}
                                    >
                                        Generate new avatar
                                    </button>
                                    <button
                                        type="button"
                                        class="inline-flex cursor-pointer items-center gap-2 rounded-md border border-border px-3 py-1.5 text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
                                        onclick={pickAvatarFile}
                                    >
                                        Upload avatar
                                    </button>
                                    <input
                                        bind:this={cropInput}
                                        type="file"
                                        accept="image/jpeg,image/png,image/gif,image/webp"
                                        class="sr-only"
                                        onchange={onAvatarFile}
                                    />
                                    {#if hasAvatar}
                                        <form
                                            method="POST"
                                            action="?/removeAvatar"
                                            use:enhance
                                        >
                                            <Button
                                                type="submit"
                                                size="sm"
                                                variant="ghost"
                                                class="text-muted-foreground"
                                                >Remove photo</Button
                                            >
                                        </form>
                                    {/if}
                                </div>

                                {#if user?.id}
                                    <AvatarEditor
                                        bind:open={editorOpen}
                                        seed={user.id}
                                        bind:style={editorDraft}
                                        saving={avatarSaving}
                                        onSave={saveAvatarStyle}
                                    />
                                    <AvatarCropDialog
                                        bind:open={cropOpen}
                                        imageUrl={cropUrl}
                                        saving={avatarSaving}
                                        onSave={saveCroppedAvatar}
                                    />
                                {/if}

                                <form onsubmit={saveAccount} class="space-y-4">
                                    <FieldGroup>
                                        <div class="grid grid-cols-2 gap-3">
                                            <Field>
                                                <FieldLabel for="first_name"
                                                    >First name</FieldLabel
                                                >
                                                <Input
                                                    id="first_name"
                                                    bind:value={firstName}
                                                    autocomplete="given-name"
                                                    maxlength={100}
                                                />
                                            </Field>
                                            <Field>
                                                <FieldLabel for="last_name"
                                                    >Last name</FieldLabel
                                                >
                                                <Input
                                                    id="last_name"
                                                    bind:value={lastName}
                                                    autocomplete="family-name"
                                                    maxlength={100}
                                                />
                                            </Field>
                                        </div>
                                        <Field>
                                            <FieldLabel for="email"
                                                >Email</FieldLabel
                                            >
                                            <Input
                                                id="email"
                                                type="email"
                                                value={user?.email ?? ""}
                                                disabled
                                            />
                                            <FieldDescription
                                                >Email cannot be changed
                                                here.</FieldDescription
                                            >
                                        </Field>
                                    </FieldGroup>
                                    {#if accountError}
                                        <p class="text-sm text-destructive">
                                            {accountError}
                                        </p>
                                    {/if}
                                    {#if accountMsg}
                                        <p class="text-sm text-foreground">
                                            {accountMsg}
                                        </p>
                                    {/if}
                                    <Button
                                        type="submit"
                                        disabled={accountSaving}
                                    >
                                        {accountSaving
                                            ? "Saving…"
                                            : "Save changes"}
                                    </Button>
                                </form>
                            </section>
                        </div>
                    {:else if tabValue === "qfieldcloud"}
                        <div class="space-y-6 w-full">
                            <section>
                                <div
                                    class="flex items-start justify-between gap-4 mb-4"
                                >
                                    <div>
                                        <h2
                                            class="text-sm font-medium text-foreground"
                                        >
                                            Connected instances
                                        </h2>
                                        <p
                                            class="mt-1 text-sm text-muted-foreground"
                                        >
                                            Connect a Cloud account, then
                                            publish a Cloud project below — or
                                            link from an existing project's
                                            Settings.
                                        </p>
                                    </div>
                                    <Button
                                        type="button"
                                        variant="outline"
                                        size="sm"
                                        class="text-muted-foreground hover:bg-accent hover:text-foreground"
                                        onclick={toggleConnectForm}
                                    >
                                        {showQFieldConnect
                                            ? "Cancel"
                                            : "Connect instance"}
                                    </Button>
                                </div>

                                {#if form?.error && form?.qfieldAction}
                                    <p
                                        class="mb-4 rounded-md border border-destructive/25 bg-destructive/5 px-3 py-2 text-sm text-destructive"
                                    >
                                        {form.error}
                                    </p>
                                {/if}
                                {#if form?.success && form?.qfieldAction === "connected"}
                                    <p
                                        class="mb-4 rounded-md border border-border bg-secondary/50 px-3 py-2 text-sm text-foreground"
                                    >
                                        Connected. Publish a Cloud project below,
                                        or link from a project’s Settings →
                                        QFieldCloud.
                                    </p>
                                {/if}
                                {#if form?.success && form?.qfieldAction === "published"}
                                    <div
                                        class="mb-4 rounded-md border border-border bg-secondary/50 px-3 py-2 text-sm text-foreground space-y-2"
                                    >
                                        <p>
                                            {#if form.publishedMode === "snapshot"}
                                                Copied
                                            {:else}
                                                Published
                                            {/if}
                                            {#if form.publishedSlug}
                                                <a
                                                    class="underline"
                                                    href={form.publishedUrl ||
                                                        `/${form.publishedSlug}`}
                                                    >{form.publishedSlug}</a
                                                >
                                            {/if}
                                            {#if form.publishedMode === "snapshot"}
                                                — snapshot import queued. The
                                                Cloud project is left
                                                untouched.
                                            {:else}
                                                — bridge sync requested.
                                            {/if}
                                        </p>
                                        {#if form.publishedSlug}
                                            {@const live =
                                                jobBySlug[form.publishedSlug]}
                                            <JobLog
                                                log={live?.job_log || ""}
                                                status={live?.import_status ||
                                                    (form.publishedMode ===
                                                    "snapshot"
                                                        ? "pending"
                                                        : "")}
                                                error={live?.import_error ||
                                                    ""}
                                                progress={live?.job_progress ||
                                                    null}
                                            />
                                        {/if}
                                    </div>
                                {/if}

                                <div class="mb-4 flex flex-wrap gap-2">
                                    <Button
                                        type="button"
                                        variant={showQFieldPublish
                                            ? "default"
                                            : "outline"}
                                        size="sm"
                                        class={showQFieldPublish
                                            ? ""
                                            : "text-muted-foreground hover:bg-accent hover:text-foreground"}
                                        onclick={() => {
                                            showQFieldPublish = !showQFieldPublish;
                                            if (showQFieldPublish)
                                                showQFieldConnect = false;
                                        }}
                                    >
                                        {showQFieldPublish
                                            ? "Hide publish"
                                            : "Publish from QFieldCloud"}
                                    </Button>
                                </div>

                                {#if showQFieldPublish}
                                    <form
                                        method="POST"
                                        action="?/publishFromQField"
                                        class="mb-6 rounded-lg border border-border p-4 space-y-3"
                                        use:enhance
                                    >
                                        <p class="text-sm text-muted-foreground">
                                            Create an echidna project from a
                                            QFieldCloud project. Writable
                                            projects stay born-linked unless you
                                            choose snapshot. Public or
                                            read-only projects are always copied
                                            into echidna; the Cloud original is
                                            left untouched.
                                        </p>
                                        <Field>
                                            <FieldLabel for="publish_account"
                                                >Cloud account</FieldLabel
                                            >
                                            <select
                                                id="publish_account"
                                                name="account_id"
                                                class="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
                                                required
                                                value={publishAccountId}
                                                onchange={(e) =>
                                                    void loadPublishProjects(
                                                        (e.currentTarget as HTMLSelectElement)
                                                            .value,
                                                        { q: publishQuery },
                                                    )}
                                            >
                                                {#each qfieldAccounts as acct}
                                                    <option value={acct.id}
                                                        >{acct.label ||
                                                            acct.username} ({acct.base_url})</option
                                                    >
                                                {/each}
                                            </select>
                                        </Field>
                                        <Field>
                                            <FieldLabel for="publish_q_search"
                                                >Find public projects</FieldLabel
                                            >
                                            <div class="flex gap-2">
                                                <Input
                                                    id="publish_q_search"
                                                    type="search"
                                                    placeholder="Search public Cloud projects by name"
                                                    bind:value={publishQuery}
                                                    onkeydown={(e) => {
                                                        if (e.key === "Enter") {
                                                            e.preventDefault();
                                                            if (publishAccountId)
                                                                void loadPublishProjects(
                                                                    publishAccountId,
                                                                    {
                                                                        q: publishQuery,
                                                                        keepSelection: true,
                                                                    },
                                                                );
                                                        }
                                                    }}
                                                />
                                                <Button
                                                    type="button"
                                                    variant="outline"
                                                    size="sm"
                                                    onclick={() => {
                                                        if (publishAccountId)
                                                            void loadPublishProjects(
                                                                publishAccountId,
                                                                {
                                                                    q: publishQuery,
                                                                    keepSelection: true,
                                                                },
                                                            );
                                                    }}
                                                >
                                                    Search
                                                </Button>
                                            </div>
                                            <FieldDescription>
                                                Own projects load automatically.
                                                Type a name and press Enter to
                                                include public Cloud projects.
                                            </FieldDescription>
                                        </Field>
                                        <Field>
                                            <FieldLabel for="publish_qfc"
                                                >QFieldCloud project</FieldLabel
                                            >
                                            {#if publishLoading}
                                                <p class="text-sm text-muted-foreground">
                                                    Loading projects…
                                                </p>
                                            {:else}
                                                <select
                                                    id="publish_qfc"
                                                    name="qfc_project_id"
                                                    class="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
                                                    required
                                                    value={publishProjectId}
                                                    onchange={(e) => {
                                                        const sel =
                                                            e.currentTarget as HTMLSelectElement;
                                                        publishProjectId =
                                                            sel.value;
                                                        const match =
                                                            publishProjects.find(
                                                                (p) =>
                                                                    p.id ===
                                                                    sel.value,
                                                            );
                                                        publishProjectName =
                                                            match?.name ||
                                                            sel.value;
                                                    }}
                                                >
                                                    <option value=""
                                                        >Select…</option
                                                    >
                                                    {#each publishProjects as proj}
                                                        <option value={proj.id}
                                                            >{proj.name ||
                                                                proj.id}{#if proj.writable === false}
                                                                {" "}(public copy){/if}</option
                                                        >
                                                    {/each}
                                                </select>
                                            {/if}
                                        </Field>
                                        {#if selectedPublish}
                                            <label
                                                class="flex items-start gap-2 text-sm text-foreground"
                                            >
                                                <input
                                                    type="checkbox"
                                                    class="mt-0.5 size-4 accent-primary"
                                                    checked={willSnapshot}
                                                    disabled={selectedIsSnapshot}
                                                    onchange={(e) => {
                                                        publishForceSnapshot =
                                                            e.currentTarget
                                                                .checked;
                                                    }}
                                                />
                                                <span>
                                                    Copy as snapshot — don’t
                                                    keep Cloud in sync
                                                    {#if selectedIsSnapshot}
                                                        <span
                                                            class="block text-muted-foreground"
                                                            >Required for
                                                            public/read-only
                                                            Cloud projects.</span
                                                        >
                                                    {:else}
                                                        <span
                                                            class="block text-muted-foreground"
                                                            >Imports the package
                                                            once. Echidna
                                                            becomes the source
                                                            of truth; nothing is
                                                            written back to
                                                            Cloud.</span
                                                        >
                                                    {/if}
                                                </span>
                                            </label>
                                        {/if}
                                        <input
                                            type="hidden"
                                            name="qfc_project_name"
                                            value={publishProjectName}
                                        />
                                        {#if willSnapshot}
                                            <input
                                                type="hidden"
                                                name="mode"
                                                value="snapshot"
                                            />
                                        {/if}
                                        <div class="grid grid-cols-2 gap-3">
                                            <Field>
                                                <FieldLabel for="publish_title"
                                                    >Title (optional)</FieldLabel
                                                >
                                                <Input
                                                    id="publish_title"
                                                    name="title"
                                                    placeholder="Derived from Cloud name"
                                                />
                                            </Field>
                                            <Field>
                                                <FieldLabel for="publish_slug"
                                                    >Slug (optional)</FieldLabel
                                                >
                                                <Input
                                                    id="publish_slug"
                                                    name="slug"
                                                    placeholder="auto"
                                                />
                                            </Field>
                                        </div>
                                        <Button type="submit" size="sm"
                                            >{willSnapshot
                                                ? "Copy into echidna"
                                                : "Create + link"}</Button
                                        >
                                    </form>
                                {/if}

                                {#if showQFieldConnect}
                                    <form
                                        method="POST"
                                        action="?/connectQFieldCloud"
                                        class="mb-4 rounded-lg border border-border p-4 space-y-3"
                                        use:enhance
                                    >
                                        <Field>
                                            <FieldLabel for="base_url"
                                                >Instance URL</FieldLabel
                                            >
                                            <Input
                                                id="base_url"
                                                type="url"
                                                name="base_url"
                                                required
                                                placeholder="https://app.qfield.cloud"
                                                value={reconnectPrefill?.base_url ??
                                                    ""}
                                            />
                                        </Field>
                                        <div class="grid grid-cols-2 gap-3">
                                            <Field>
                                                <FieldLabel for="qfc_username"
                                                    >Username</FieldLabel
                                                >
                                                <Input
                                                    id="qfc_username"
                                                    type="text"
                                                    name="username"
                                                    required
                                                    autocomplete="username"
                                                    value={reconnectPrefill?.username ??
                                                        ""}
                                                />
                                            </Field>
                                            <Field>
                                                <FieldLabel for="qfc_password"
                                                    >Password</FieldLabel
                                                >
                                                <Input
                                                    id="qfc_password"
                                                    type="password"
                                                    name="password"
                                                    required
                                                    autocomplete="current-password"
                                                />
                                            </Field>
                                        </div>
                                        <Field>
                                            <FieldLabel for="qfc_label"
                                                >Label (optional)</FieldLabel
                                            >
                                            <Input
                                                id="qfc_label"
                                                type="text"
                                                name="label"
                                                placeholder="injserver"
                                                value={reconnectPrefill?.label ??
                                                    ""}
                                            />
                                        </Field>
                                        <p class="text-xs text-muted-foreground">
                                            Password is used once to obtain a
                                            token; it is not stored.
                                        </p>
                                        <Button type="submit" size="sm">
                                            {reconnectPrefill
                                                ? "Reconnect"
                                                : "Connect"}
                                        </Button>
                                    </form>
                                {/if}

                                {#if qfieldAccounts.length === 0}
                                    <div
                                        class="rounded-lg border border-dashed border-border px-4 py-8 text-center"
                                    >
                                        <p class="text-sm text-muted-foreground">
                                            No Cloud instances connected yet.
                                        </p>
                                    </div>
                                {:else}
                                    <div class="flex flex-col gap-3">
                                        {#each qfieldAccounts as acct}
                                            {@const links = linksForAccount(
                                                acct.id,
                                            )}
                                            {@const expiryHint =
                                                tokenExpiryHint(acct.expires_at)}
                                            <div
                                                class="rounded-lg border border-border p-4 bg-card space-y-3"
                                            >
                                                <div
                                                    class="flex items-start justify-between gap-4"
                                                >
                                                    <div class="min-w-0">
                                                        <p
                                                            class="text-sm font-medium text-foreground truncate"
                                                        >
                                                            {acct.label ||
                                                                acct.base_url}
                                                        </p>
                                                        <p
                                                            class="text-xs text-muted-foreground mt-0.5"
                                                        >
                                                            {acct.username} · {acct.base_url}
                                                        </p>
                                                        {#if acct.expires_at}
                                                            <p
                                                                class="text-xs text-muted-foreground mt-1"
                                                            >
                                                                Token expires: {formatDate(
                                                                    acct.expires_at,
                                                                )}
                                                            </p>
                                                        {/if}
                                                        {#if expiryHint}
                                                            <p
                                                                class="text-xs mt-1 {expiryHint.urgent
                                                                    ? 'text-destructive'
                                                                    : 'text-muted-foreground'}"
                                                            >
                                                                {expiryHint.label}
                                                            </p>
                                                        {/if}
                                                    </div>
                                                    <div
                                                        class="flex items-center gap-1 shrink-0"
                                                    >
                                                        <Button
                                                            type="button"
                                                            variant="ghost"
                                                            size="sm"
                                                            class="text-muted-foreground hover:bg-accent hover:text-foreground"
                                                            onclick={() =>
                                                                startReconnect(
                                                                    acct,
                                                                )}
                                                        >
                                                            Reconnect
                                                        </Button>
                                                        <form
                                                            method="POST"
                                                            action="?/disconnectQFieldCloud"
                                                            use:enhance
                                                        >
                                                            <input
                                                                type="hidden"
                                                                name="account_id"
                                                                value={acct.id}
                                                            />
                                                            <Button
                                                                type="submit"
                                                                variant="ghost"
                                                                size="sm"
                                                                class="text-muted-foreground hover:text-destructive"
                                                                onclick={(
                                                                    e,
                                                                ) => {
                                                                    if (
                                                                        !confirm(
                                                                            "Disconnect this Cloud account?",
                                                                        )
                                                                    )
                                                                        e.preventDefault();
                                                                }}
                                                            >
                                                                Disconnect
                                                            </Button>
                                                        </form>
                                                    </div>
                                                </div>

                                                {#if links.length > 0}
                                                    <div
                                                        class="border-t border-border pt-3"
                                                    >
                                                        <p
                                                            class="text-xs font-medium text-muted-foreground mb-2"
                                                        >
                                                            Linked TinyOwl
                                                            projects
                                                        </p>
                                                        <ul class="space-y-1.5">
                                                            {#each links as link}
                                                                {@const live =
                                                                    jobBySlug[
                                                                        link
                                                                            .tinyowl_slug
                                                                    ] ?? link}
                                                                <li class="space-y-1.5">
                                                                    <a
                                                                        href="/{link.tinyowl_slug}/settings"
                                                                        class="inline-flex items-center gap-1.5 text-sm text-foreground hover:underline"
                                                                    >
                                                                        {link.tinyowl_slug}
                                                                        {#if link.qfc_project_name}
                                                                            <span
                                                                                class="text-muted-foreground"
                                                                                >←
                                                                                {link.qfc_project_name}</span
                                                                            >
                                                                        {/if}
                                                                        {#if link.mode === "snapshot"}
                                                                            <span
                                                                                class="text-muted-foreground"
                                                                                >({live.import_status ===
                                                                                "done"
                                                                                    ? "snapshot"
                                                                                    : `snapshot ${live.import_status || "pending"}`})</span
                                                                            >
                                                                        {/if}
                                                                        <ExternalLinkIcon
                                                                            class="size-3 text-muted-foreground"
                                                                        />
                                                                    </a>
                                                                    {#if live.job_log || jobIsActive(live)}
                                                                        <JobLog
                                                                            log={live.job_log ||
                                                                                ""}
                                                                            status={live.import_status ||
                                                                                ""}
                                                                            error={live.import_error ||
                                                                                ""}
                                                                            progress={live.job_progress ||
                                                                                null}
                                                                        />
                                                                    {/if}
                                                                </li>
                                                            {/each}
                                                        </ul>
                                                    </div>
                                                {:else}
                                                    <p
                                                        class="text-xs text-muted-foreground border-t border-border pt-3"
                                                    >
                                                        No projects linked yet.
                                                        Open a project’s
                                                        Settings → QFieldCloud
                                                        to link one.
                                                    </p>
                                                {/if}
                                            </div>
                                        {/each}
                                    </div>
                                {/if}
                            </section>
                        </div>
                    {:else if tabValue === "opencontext"}
                        <div class="space-y-6 w-full">
                            <section>
                                <div class="mb-4">
                                    <h2
                                        class="text-sm font-medium text-foreground"
                                    >
                                        Clone a publication
                                    </h2>
                                    <p
                                        class="mt-1 text-sm text-muted-foreground"
                                    >
                                        Search Open Context and copy a project
                                        into echidna as a snapshot. The source
                                        is read-only — this does not write back.
                                    </p>
                                </div>
                                {#if form?.error && form?.ocAction}
                                    <p
                                        class="mb-4 rounded-md border border-destructive/25 bg-destructive/5 px-3 py-2 text-sm text-destructive"
                                    >
                                        {form.error}
                                    </p>
                                {/if}
                                {#if form?.success && (form?.ocAction === "retried" || form?.ocAction === "published")}
                                    <p
                                        class="mb-4 rounded-md border border-border bg-secondary/50 px-3 py-2 text-sm text-foreground"
                                    >
                                        {#if form.ocAction === "retried"}
                                            Retry queued
                                        {:else}
                                            Cloned
                                        {/if}
                                        {#if form.publishedSlug}
                                            <a
                                                class="underline"
                                                href={form.publishedUrl ||
                                                    `/${form.publishedSlug}`}
                                                >{form.publishedSlug}</a
                                            >
                                        {/if}
                                        — follow the log on the clone below.
                                    </p>
                                {/if}
                                <form
                                    method="POST"
                                    action="?/publishFromOpenContext"
                                    class="mb-6 rounded-lg border border-border p-4 space-y-3"
                                    use:enhance
                                >
                                    <Field>
                                        <FieldLabel for="oc_q"
                                            >Find a project</FieldLabel
                                        >
                                        <div class="flex gap-2">
                                            <Input
                                                id="oc_q"
                                                type="search"
                                                placeholder="Kenan Tepe, Murlo, votive…"
                                                bind:value={ocQuery}
                                                onkeydown={(e) => {
                                                    if (e.key === "Enter") {
                                                        e.preventDefault();
                                                        void searchOpenContext();
                                                    }
                                                }}
                                            />
                                            <Button
                                                type="button"
                                                variant="outline"
                                                onclick={() =>
                                                    void searchOpenContext()}
                                                disabled={ocLoading}
                                            >
                                                {ocLoading
                                                    ? "Searching…"
                                                    : "Search"}
                                            </Button>
                                        </div>
                                    </Field>
                                    <Field>
                                        <FieldLabel for="oc_uuid"
                                            >Publication</FieldLabel
                                        >
                                        <select
                                            id="oc_uuid"
                                            name="oc_uuid"
                                            class="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
                                            required
                                            bind:value={ocSelected}
                                        >
                                            {#if ocHits.length === 0}
                                                <option value=""
                                                    >Search to list projects</option
                                                >
                                            {:else}
                                                {#each ocHits as hit}
                                                    <option value={hit.uuid}
                                                        >{hit.label}</option
                                                    >
                                                {/each}
                                            {/if}
                                        </select>
                                        {#if ocSelectedHit?.uri}
                                            <FieldDescription>
                                                <a
                                                    class="underline"
                                                    href={ocSelectedHit.href ||
                                                        ocSelectedHit.uri}
                                                    target="_blank"
                                                    rel="noreferrer"
                                                    >{ocSelectedHit.uri}</a
                                                >
                                            </FieldDescription>
                                        {/if}
                                    </Field>
                                    <div
                                        class="grid gap-3 sm:grid-cols-2"
                                    >
                                        <Field>
                                            <FieldLabel for="oc_title"
                                                >Title</FieldLabel
                                            >
                                            <Input
                                                id="oc_title"
                                                name="title"
                                                placeholder={ocSelectedHit?.label ||
                                                    "Optional"}
                                            />
                                        </Field>
                                        <Field>
                                            <FieldLabel for="oc_slug"
                                                >Slug</FieldLabel
                                            >
                                            <Input
                                                id="oc_slug"
                                                name="slug"
                                                placeholder="derived from title"
                                            />
                                        </Field>
                                    </div>
                                    <Field>
                                        <FieldLabel for="oc_max"
                                            >Max records</FieldLabel
                                        >
                                        <Input
                                            id="oc_max"
                                            name="max_rows"
                                            type="number"
                                            min="1"
                                            max="10000"
                                            value="2000"
                                        />
                                        <FieldDescription>
                                            Large archives (DINAA, Kenan Tepe)
                                            are truncated at this cap. Start
                                            small.
                                        </FieldDescription>
                                    </Field>
                                    <Button
                                        type="submit"
                                        disabled={!ocSelected}
                                    >
                                        Clone snapshot
                                    </Button>
                                </form>
                                {#if ocLinks.length}
                                    <div class="space-y-2">
                                        <h3
                                            class="text-sm font-medium text-foreground"
                                        >
                                            Cloned projects
                                        </h3>
                                        {#each ocLinks as link}
                                            {@const live =
                                                jobBySlug[link.tinyowl_slug] ??
                                                link}
                                            <div
                                                class="rounded-md border border-border px-3 py-2 text-sm"
                                            >
                                                <a
                                                    class="underline"
                                                    href={`/${link.tinyowl_slug}`}
                                                    >{link.tinyowl_slug}</a
                                                >
                                                <span
                                                    class="text-muted-foreground"
                                                >
                                                    ← {link.oc_label ||
                                                        link.oc_slug ||
                                                        link.oc_uuid}
                                                </span>
                                                <span
                                                    class="ml-2 text-xs text-muted-foreground"
                                                >
                                                    snapshot {live.import_status ||
                                                        "pending"}
                                                    {#if live.row_count}
                                                        · {live.row_count} rows
                                                    {/if}
                                                    {#if live.truncated}
                                                        · truncated
                                                    {/if}
                                                </span>
                                                {#if jobIsActive(live) || live.import_status === "failed"}
                                                    <div class="mt-2">
                                                        <JobLog
                                                            log={live.job_log ||
                                                                ""}
                                                            status={live.import_status ||
                                                                ""}
                                                            error={live.import_error ||
                                                                ""}
                                                            progress={live.job_progress ||
                                                                null}
                                                            idle="waiting for import…"
                                                        />
                                                    </div>
                                                {:else if live.import_error}
                                                    <p
                                                        class="mt-1 text-xs text-destructive"
                                                    >
                                                        {live.import_error}
                                                    </p>
                                                {/if}
                                                {#if live.import_status === "failed"}
                                                    <form
                                                        method="POST"
                                                        action="?/retryOpenContext"
                                                        class="mt-2"
                                                        use:enhance={() => {
                                                            return async ({
                                                                result,
                                                                update,
                                                            }) => {
                                                                await update();
                                                                if (
                                                                    result.type ===
                                                                    "success"
                                                                ) {
                                                                    jobBySlug =
                                                                        {
                                                                            ...jobBySlug,
                                                                            [link.tinyowl_slug]:
                                                                                {
                                                                                    ...live,
                                                                                    import_status:
                                                                                        "pending",
                                                                                },
                                                                        };
                                                                }
                                                            };
                                                        }}
                                                    >
                                                        <input
                                                            type="hidden"
                                                            name="slug"
                                                            value={link.tinyowl_slug}
                                                        />
                                                        <Button
                                                            type="submit"
                                                            variant="outline"
                                                            size="sm"
                                                            disabled={jobIsActive(
                                                                live,
                                                            )}
                                                        >
                                                            Retry
                                                        </Button>
                                                    </form>
                                                {/if}
                                            </div>
                                        {/each}
                                    </div>
                                {/if}
                            </section>
                        </div>
                    {:else if tabValue === "tokens"}
                        <div class="space-y-6 w-full">
                            <section>
                                <div
                                    class="flex items-start justify-between gap-4 mb-4"
                                >
                                    <div>
                                        <h2
                                            class="text-sm font-medium text-foreground"
                                        >
                                            Personal access tokens
                                        </h2>
                                        <p
                                            class="mt-1 text-sm text-muted-foreground"
                                        >
                                            Use with the TinyOwl CLI. Running
                                            <code
                                                class="font-mono text-xs rounded px-1 bg-secondary"
                                                >tinyowl login</code
                                            >
                                            also creates a
                                            <code
                                                class="font-mono text-xs rounded px-1 bg-secondary"
                                                >cli-login</code
                                            > token.
                                        </p>
                                    </div>
                                    <Button
                                        type="button"
                                        variant="outline"
                                        size="sm"
                                        class="text-muted-foreground hover:bg-accent hover:text-foreground"
                                        onclick={() => {
                                            showCreateToken = !showCreateToken;
                                            newlyCreatedToken = null;
                                            tokenError = "";
                                        }}
                                    >
                                        <PlusIcon class="size-3.5" />
                                        {showCreateToken
                                            ? "Cancel"
                                            : "New token"}
                                    </Button>
                                </div>

                                {#if newlyCreatedToken}
                                    <div
                                        class="mb-4 rounded-lg border border-border bg-secondary/40 p-4 space-y-2"
                                    >
                                        <p
                                            class="text-sm font-medium text-foreground"
                                        >
                                            Copy your token now — it won’t be
                                            shown again.
                                        </p>
                                        <div class="flex items-center gap-2">
                                            <code
                                                class="flex-1 min-w-0 truncate rounded-md border border-border bg-background px-3 py-2 font-mono text-xs"
                                            >
                                                {newlyCreatedToken}
                                            </code>
                                            <Button
                                                type="button"
                                                variant="outline"
                                                size="icon-sm"
                                                class="text-muted-foreground hover:bg-accent hover:text-foreground"
                                                onclick={copyToken}
                                                title="Copy"
                                            >
                                                {#if copied}
                                                    <CheckIcon class="size-4" />
                                                {:else}
                                                    <CopyIcon class="size-4" />
                                                {/if}
                                            </Button>
                                        </div>
                                    </div>
                                {/if}

                                {#if showCreateToken}
                                    <form
                                        onsubmit={createToken}
                                        class="mb-4 rounded-lg border border-border p-4 space-y-3"
                                    >
                                        <Field>
                                            <FieldLabel for="token_label"
                                                >Label</FieldLabel
                                            >
                                            <Input
                                                id="token_label"
                                                bind:value={tokenLabel}
                                                placeholder="laptop"
                                            />
                                        </Field>
                                        {#if tokenError}
                                            <p class="text-sm text-destructive">
                                                {tokenError}
                                            </p>
                                        {/if}
                                        <Button
                                            type="submit"
                                            size="sm"
                                            disabled={creatingToken}
                                        >
                                            {creatingToken
                                                ? "Creating…"
                                                : "Create token"}
                                        </Button>
                                    </form>
                                {/if}

                                {#if tokenError && !showCreateToken}
                                    <p class="mb-4 text-sm text-destructive">
                                        {tokenError}
                                    </p>
                                {/if}

                                {#if cliTokens.length === 0}
                                    <div
                                        class="rounded-lg border border-dashed border-border px-4 py-8 text-center"
                                    >
                                        <p class="text-sm text-muted-foreground">
                                            No tokens yet.
                                        </p>
                                    </div>
                                {:else}
                                    <div
                                        class="rounded-lg border border-border divide-y divide-border"
                                    >
                                        {#each cliTokens as tok}
                                            <div
                                                class="flex items-center justify-between gap-4 px-4 py-3"
                                            >
                                                <div class="min-w-0">
                                                    <p
                                                        class="text-sm font-medium text-foreground"
                                                    >
                                                        {tok.label || "pat"}
                                                    </p>
                                                    <p
                                                        class="text-xs font-mono text-muted-foreground mt-0.5"
                                                    >
                                                        {tok.token_prefix}…
                                                    </p>
                                                    <p
                                                        class="text-xs text-muted-foreground mt-1"
                                                    >
                                                        Created {formatDate(
                                                            tok.created_at,
                                                        )}
                                                        · Last used {formatDate(
                                                            tok.last_used_at,
                                                        )}
                                                    </p>
                                                </div>
                                                <Button
                                                    type="button"
                                                    variant="ghost"
                                                    size="icon-sm"
                                                    class="text-muted-foreground hover:text-destructive shrink-0"
                                                    disabled={revokingId ===
                                                        tok.id}
                                                    onclick={() =>
                                                        revokeToken(tok.id)}
                                                    title="Revoke"
                                                >
                                                    <Trash2Icon
                                                        class="size-4"
                                                    />
                                                </Button>
                                            </div>
                                        {/each}
                                    </div>
                                {/if}
                            </section>
                        </div>
                    {:else if tabValue === "appearance"}
                        <div class="space-y-6 w-full">
                            <section>
                                <h2
                                    class="text-sm font-medium text-foreground mb-1"
                                >
                                    Background
                                </h2>
                                <p class="text-sm text-muted-foreground mb-4">
                                    Synced to your account when signed in.
                                </p>
                                <div class="flex flex-wrap gap-2">
                                    {#each bgBases as opt}
                                        <button
                                            type="button"
                                            onclick={() =>
                                                setThemePreference(
                                                    "bgBase",
                                                    opt.value,
                                                )}
                                            class="rounded-md border px-3 py-1.5 text-sm transition-colors {themePrefs.bgBase ===
                                            opt.value
                                                ? 'border-foreground bg-secondary text-foreground'
                                                : 'border-border text-muted-foreground hover:bg-accent hover:text-foreground'}"
                                        >
                                            {opt.label}
                                        </button>
                                    {/each}
                                </div>
                            </section>

                            <section>
                                <h2
                                    class="text-sm font-medium text-foreground mb-1"
                                >
                                    Accent
                                </h2>
                                <p class="text-sm text-muted-foreground mb-4">
                                    Curated hues for UI accents.
                                </p>
                                <div class="flex flex-wrap gap-2">
                                    {#each ACCENT_PRESETS as preset}
                                        <button
                                            type="button"
                                            onclick={() =>
                                                setThemePreference(
                                                    "accentHue",
                                                    preset.hue,
                                                )}
                                            class="inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm transition-colors {themePrefs.accentHue ===
                                            preset.hue
                                                ? 'border-foreground bg-secondary text-foreground'
                                                : 'border-border text-muted-foreground hover:bg-accent hover:text-foreground'}"
                                        >
                                            <span
                                                class="size-3 rounded-full shrink-0"
                                                style="background: hsl({preset.hue} 60% 50%)"
                                            ></span>
                                            {preset.name}
                                        </button>
                                    {/each}
                                </div>
                            </section>

                            <section>
                                <h2
                                    class="text-sm font-medium text-foreground mb-1"
                                >
                                    Corner radius
                                </h2>
                                <div class="flex flex-wrap gap-2 mt-4">
                                    {#each radii as opt}
                                        <button
                                            type="button"
                                            onclick={() =>
                                                setThemePreference(
                                                    "radius",
                                                    opt.value,
                                                )}
                                            class="rounded-md border px-3 py-1.5 text-sm transition-colors {themePrefs.radius ===
                                            opt.value
                                                ? 'border-foreground bg-secondary text-foreground'
                                                : 'border-border text-muted-foreground hover:bg-accent hover:text-foreground'}"
                                        >
                                            {opt.label}
                                        </button>
                                    {/each}
                                </div>
                            </section>

                            <section>
                                <h2
                                    class="text-sm font-medium text-foreground mb-1"
                                >
                                    Blur
                                </h2>
                                <div class="flex flex-wrap gap-2 mt-4">
                                    {#each blurs as opt}
                                        <button
                                            type="button"
                                            onclick={() =>
                                                setThemePreference(
                                                    "blur",
                                                    opt.value,
                                                )}
                                            class="rounded-md border px-3 py-1.5 text-sm transition-colors {themePrefs.blur ===
                                            opt.value
                                                ? 'border-foreground bg-secondary text-foreground'
                                                : 'border-border text-muted-foreground hover:bg-accent hover:text-foreground'}"
                                        >
                                            {opt.label}
                                        </button>
                                    {/each}
                                </div>
                            </section>
                        </div>
                    {:else if tabValue === "security"}
                        <div class="space-y-6 w-full">
                            <section>
                                <h2
                                    class="text-sm font-medium text-foreground mb-1"
                                >
                                    Change password
                                </h2>
                                <p class="text-sm text-muted-foreground mb-4">
                                    Set a new password for your account.
                                </p>
                                <form
                                    onsubmit={changePassword}
                                    class="space-y-4"
                                >
                                    <FieldGroup>
                                        <Field>
                                            <FieldLabel for="new_password"
                                                >New password</FieldLabel
                                            >
                                            <Input
                                                id="new_password"
                                                type="password"
                                                bind:value={newPassword}
                                                autocomplete="new-password"
                                            />
                                        </Field>
                                        <Field>
                                            <FieldLabel for="confirm_password"
                                                >Confirm password</FieldLabel
                                            >
                                            <Input
                                                id="confirm_password"
                                                type="password"
                                                bind:value={confirmPassword}
                                                autocomplete="new-password"
                                            />
                                        </Field>
                                    </FieldGroup>
                                    {#if passwordError}
                                        <p class="text-sm text-destructive">
                                            {passwordError}
                                        </p>
                                    {/if}
                                    {#if passwordMsg}
                                        <p class="text-sm text-foreground">
                                            {passwordMsg}
                                        </p>
                                    {/if}
                                    <Button
                                        type="submit"
                                        disabled={passwordSaving}
                                    >
                                        {passwordSaving
                                            ? "Updating…"
                                            : "Update password"}
                                    </Button>
                                </form>
                            </section>

                            <section class="border-t border-border pt-6">
                                <h2
                                    class="text-sm font-medium text-foreground mb-1"
                                >
                                    Sign out
                                </h2>
                                <p class="text-sm text-muted-foreground mb-4">
                                    End your session on this device.
                                </p>
                                <Button
                                    href="/auth/logout"
                                    variant="outline"
                                    class="text-muted-foreground hover:bg-accent hover:text-foreground"
                                >
                                    <LogOutIcon class="size-4" />
                                    Sign out
                                </Button>
                            </section>
                        </div>
                    {/if}
                {/snippet}
            </Tabs>
        </div>
    </main>
</div>
