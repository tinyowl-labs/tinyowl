<script lang="ts">
    import SearchIcon from "@lucide/svelte/icons/search";
    import XIcon from "@lucide/svelte/icons/x";
    import TagIcon from "@lucide/svelte/icons/tag";
    import BookMarkedIcon from "@lucide/svelte/icons/book-marked";
    import ImageIcon from "@lucide/svelte/icons/image";
    import LoaderIcon from "@lucide/svelte/icons/loader";
    import GlobeIcon from "@lucide/svelte/icons/globe";
    import MapIcon from "@lucide/svelte/icons/map";
    import CrosshairIcon from "@lucide/svelte/icons/crosshair";
    import { onMount } from "svelte";
    import { goto } from "$app/navigation";
    import { page } from "$app/stores";
    import {
        searchHref,
        formatBBox,
        formatLatLng,
        formatRadius,
        DEFAULT_SEARCH_RADIUS,
        type SearchBBox,
    } from "$lib/search/params";
    import {
        searchPleiadesPlaces,
        type PleiadesPlace,
    } from "$lib/search/pleiades";
    import {
        clearImageQuery,
        loadImageQuery,
        postSimilarByImage,
        previewDataUrlFromFile,
        saveImageQuery,
    } from "$lib/search/imageQuery";

    type MentionMode = "kinds" | "tag" | "vocab" | "place";

    type KindItem = {
        kind: "kind";
        id: "tag" | "vocab" | "place";
        label: string;
        hint: string;
    };
    type ValueItem = {
        kind: "value";
        id: string;
        label: string;
        mode: "tag" | "vocab";
    };
    type PlaceItem = { kind: "place"; place: PleiadesPlace };
    type MenuItem = KindItem | ValueItem | PlaceItem;

    type Props = {
        value?: string;
        tags?: string[];
        vocabularies?: string[];
        lat?: number | null;
        lng?: number | null;
        radius?: number | null;
        bbox?: SearchBBox | null;
        dateFrom?: number | string | null;
        dateTo?: number | string | null;
        /** When false, keep quiet `?semantic=0` opt-out across composer navigations. */
        semantic?: boolean;
        /** Reverse-image seed (`?media_hash=`). */
        mediaHash?: string | null;
        /** Temp query-by-image (`?image=1`). */
        imageQuery?: boolean;
        accessToken?: string | null;
        autofocus?: boolean;
        placeholder?: string;
        examples?: string[];
        /** Show ⌘K / Ctrl K cue and focus the input on that shortcut. */
        shortcutHint?: boolean;
        /** Gazetteer title restored from `?place=` */
        placeLabel?: string | null;
        class?: string;
    };

    let {
        value = $bindable(""),
        tags = [],
        vocabularies = [],
        lat = $bindable(null),
        lng = $bindable(null),
        radius = $bindable(DEFAULT_SEARCH_RADIUS),
        bbox = $bindable(null),
        dateFrom = null,
        dateTo = null,
        semantic = true,
        mediaHash = null,
        imageQuery = false,
        accessToken = null,
        autofocus = false,
        placeholder = "Search projects or places…  Type @ for filters",
        examples = [],
        shortcutHint = false,
        placeLabel = null,
        class: klass = "",
    }: Props = $props();

    const CYCLE_MS = 3200;
    const FADE_MS = 220;
    const KINDS: KindItem[] = [
        {
            kind: "kind",
            id: "place",
            label: "Place",
            hint: "Ancient places from Pleiades",
        },
        {
            kind: "kind",
            id: "tag",
            label: "Tag",
            hint: "Filter projects by tag",
        },
        {
            kind: "kind",
            id: "vocab",
            label: "Vocab",
            hint: "Mapped vocabulary terms",
        },
    ];

    let inputEl = $state<HTMLInputElement | null>(null);
    let fileInputEl = $state<HTMLInputElement | null>(null);
    let focused = $state(false);
    let exampleIndex = $state(0);
    let exampleVisible = $state(true);
    let reduceMotion = $state(false);
    let dragOver = $state(false);
    let imageBusy = $state(false);
    let imageError = $state("");

    let mentionOpen = $state(false);
    let mentionMode = $state<MentionMode>("kinds");
    let mentionQuery = $state("");
    let highlight = $state(-1);
    let tagSuggestions = $state<string[]>([]);
    let termSuggestions = $state<string[]>([]);
    let placeHits = $state<PleiadesPlace[]>([]);
    let loading = $state(false);
    let loadingPlaces = $state(false);
    let debounceTimer: ReturnType<typeof setTimeout> | undefined;
    let placesTimer: ReturnType<typeof setTimeout> | undefined;
    let placesReq = 0;
    let placeChip = $state<{ title: string; lat: number; lng: number } | null>(
        null,
    );
    let appliedPlaceLabel = $state<string | null>(null);

    const activeTags = $derived(tags);
    const activeVocabs = $derived(vocabularies);
    const activeMediaHash = $derived(mediaHash?.trim() || null);
    const imageSession = $derived(
        imageQuery ? loadImageQuery() : null,
    );
    const hasImageChip = $derived(
        Boolean(activeMediaHash) || Boolean(imageSession?.previewDataUrl),
    );
    const hasSpatialChip = $derived(
        bbox != null || (lat != null && lng != null),
    );
    const atSearch = $derived($page.url.pathname === "/search");
    const cycling = $derived(examples.length > 0);
    const placesMenuOpen = $derived(
        !mentionOpen &&
            value.trim().length >= 2 &&
            (placeHits.length > 0 || loadingPlaces),
    );
    const dropdownOpen = $derived(mentionOpen || placesMenuOpen);
    const paused = $derived(
        focused ||
            value.trim().length > 0 ||
            dropdownOpen ||
            hasImageChip ||
            hasSpatialChip ||
            activeTags.length > 0 ||
            activeVocabs.length > 0,
    );
    const activePlaceholder = $derived(
        cycling ? (examples[exampleIndex] ?? placeholder) : placeholder,
    );
    const seedThumbUrl = $derived.by(() => {
        if (imageSession?.previewDataUrl) return imageSession.previewDataUrl;
        if (!activeMediaHash) return null;
                const q = accessToken
                    ? `?token=${encodeURIComponent(accessToken)}`
                    : "";
                return `/media/${activeMediaHash}${q}`;
    });

    function placeItems(): PlaceItem[] {
        return placeHits.map((p) => ({ kind: "place" as const, place: p }));
    }

    const menuItems = $derived.by((): MenuItem[] => {
        if (!mentionOpen) return placeItems();
        if (mentionMode === "kinds") {
            const q = mentionQuery.trim().toLowerCase();
            const kinds = q
                ? KINDS.filter(
                      (k) =>
                          k.id.startsWith(q) ||
                          k.label.toLowerCase().startsWith(q),
                  )
                : KINDS;
            // Direct hits once the user types past kind names
            const tagHits =
                q.length >= 2
                    ? tagSuggestions.map(
                          (t): ValueItem => ({
                              kind: "value",
                              id: `tag:${t}`,
                              label: t,
                              mode: "tag",
                          }),
                      )
                    : [];
            const termHits =
                q.length >= 2
                    ? termSuggestions.map(
                          (t): ValueItem => ({
                              kind: "value",
                              id: `vocab:${t}`,
                              label: t,
                              mode: "vocab",
                          }),
                      )
                    : [];
            return [...kinds, ...tagHits, ...termHits, ...placeItems()];
        }
        if (mentionMode === "tag") {
            return tagSuggestions.map((t) => ({
                kind: "value" as const,
                id: `tag:${t}`,
                label: t,
                mode: "tag" as const,
            }));
        }
        if (mentionMode === "place") return placeItems();
        return termSuggestions.map((t) => ({
            kind: "value" as const,
            id: `vocab:${t}`,
            label: t,
            mode: "vocab" as const,
        }));
    });

    let isMac = $state(false);

    onMount(() => {
        const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
        const syncMotion = () => {
            reduceMotion = mq.matches;
        };
        syncMotion();
        mq.addEventListener("change", syncMotion);

        isMac = /Mac|iPhone|iPad|iPod/i.test(navigator.platform || navigator.userAgent);

        const onGlobalKey = (e: KeyboardEvent) => {
            if (!shortcutHint) return;

            if (e.key === "Enter" && !e.repeat && !e.metaKey && !e.ctrlKey && !e.altKey) {
                if (e.isComposing) return;
                const t = e.target as HTMLElement | null;
                const tag = t?.tagName;
                if (
                    t &&
                    t !== inputEl &&
                    (tag === "TEXTAREA" ||
                        tag === "SELECT" ||
                        t.isContentEditable)
                ) {
                    return;
                }
                e.preventDefault();
                e.stopPropagation();
                if (trySelectFromMenu()) return;
                commitSearch();
                return;
            }

            const key = e.key.toLowerCase();
            if (key !== "k") return;
            if (!(e.metaKey || e.ctrlKey)) return;
            // Don't steal from editable fields elsewhere.
            const t = e.target as HTMLElement | null;
            const tag = t?.tagName;
            if (
                t &&
                t !== inputEl &&
                (tag === "INPUT" ||
                    tag === "TEXTAREA" ||
                    tag === "SELECT" ||
                    t.isContentEditable)
            ) {
                return;
            }
            e.preventDefault();
            inputEl?.focus();
            inputEl?.select();
        };
        window.addEventListener("keydown", onGlobalKey, true);

        return () => {
            mq.removeEventListener("change", syncMotion);
            window.removeEventListener("keydown", onGlobalKey, true);
        };
    });

    $effect(() => {
        if (reduceMotion || paused || examples.length < 2) return;

        let cancelled = false;
        let timeout: ReturnType<typeof setTimeout>;

        const tick = () => {
            timeout = setTimeout(async () => {
                if (cancelled) return;
                exampleVisible = false;
                await new Promise((r) => setTimeout(r, FADE_MS));
                if (cancelled) return;
                exampleIndex = (exampleIndex + 1) % examples.length;
                exampleVisible = true;
                tick();
            }, CYCLE_MS);
        };

        tick();

        return () => {
            cancelled = true;
            clearTimeout(timeout);
            exampleVisible = true;
        };
    });

    $effect(() => {
        if (bbox || lat == null || lng == null) {
            if (placeChip) placeChip = null;
            return;
        }
        if (
            placeChip &&
            (placeChip.lat !== lat || placeChip.lng !== lng)
        ) {
            placeChip = null;
            appliedPlaceLabel = placeLabel;
            return;
        }
        if (
            !placeChip &&
            placeLabel &&
            appliedPlaceLabel !== placeLabel
        ) {
            placeChip = { title: placeLabel, lat, lng };
            appliedPlaceLabel = placeLabel;
        }
    });

    $effect(() => {
        // Keep highlight in range when the menu rebuilds.
        // Free-text places use -1 so Enter still searches the typed query.
        const n = menuItems.length;
        if (!mentionOpen) {
            if (n === 0) {
                if (highlight !== -1) highlight = -1;
            } else if (highlight >= n) {
                highlight = n - 1;
            }
            return;
        }
        if (highlight < 0) highlight = 0;
        else if (n > 0 && highlight >= n) highlight = n - 1;
    });

    function navigate(next: {
        q?: string;
        tags?: string[];
        vocabularies?: string[];
        mediaHash?: string | null;
        imageQuery?: boolean | null;
        lat?: number | null;
        lng?: number | null;
        radius?: number | null;
        bbox?: SearchBBox | null;
        placeName?: string | null;
    }) {
        const nextBBox = next.bbox !== undefined ? next.bbox : bbox;
        const nextLat = next.lat !== undefined ? next.lat : lat;
        const nextLng = next.lng !== undefined ? next.lng : lng;
        goto(
            searchHref({
                q: next.q ?? value,
                tags: next.tags ?? activeTags,
                vocabularies: next.vocabularies ?? activeVocabs,
                lat: nextLat,
                lng: nextLng,
                radius: next.radius !== undefined ? next.radius : radius,
                bbox: nextBBox,
                placeName:
                    nextBBox
                        ? null
                        : next.placeName !== undefined
                          ? next.placeName
                          : placeChip?.title ?? null,
                dateFrom,
                dateTo,
                semantic: semantic ? undefined : false,
                mediaHash:
                    next.mediaHash !== undefined
                        ? next.mediaHash
                        : activeMediaHash,
                imageQuery:
                    next.imageQuery !== undefined
                        ? next.imageQuery
                        : next.mediaHash
                          ? false
                          : imageQuery,
            }),
        );
    }

    function removeMedia() {
        imageError = "";
        clearImageQuery();
        navigate({ mediaHash: null, imageQuery: false });
    }

    async function attachImageFile(file: File) {
        imageError = "";
        if (!file.type.startsWith("image/") && !file.type) {
            // Some browsers omit type for HEIC etc.; still try.
        } else if (file.type && !file.type.startsWith("image/")) {
            imageError = "Choose an image file (JPEG, PNG, or WebP)";
            return;
        }
        if (file.size > 20 * 1024 * 1024) {
            imageError = "Image too large (max 20MB)";
            return;
        }
        imageBusy = true;
        try {
            const preview = await previewDataUrlFromFile(file);
            const { items, projects, status } = await postSimilarByImage(file, {
                accessToken,
                limit: 24,
                bbox: bbox ? formatBBox(bbox) : null,
                dateFrom,
                dateTo,
                tag: activeTags[0] ?? null,
            });
            saveImageQuery({
                previewDataUrl: preview,
                items,
                projects,
                status:
                    status === "no_matches" && items.length === 0
                        ? "No similar photos found"
                        : status,
                at: Date.now(),
            });
            navigate({ mediaHash: null, imageQuery: true });
        } catch (e: any) {
            imageError = e?.message ?? "Could not search by image";
        } finally {
            imageBusy = false;
        }
    }

    function onFilePicked(e: Event) {
        const input = e.currentTarget as HTMLInputElement;
        const file = input.files?.[0];
        input.value = "";
        if (file) void attachImageFile(file);
    }

    /** Open the native file picker from a trusted user gesture. */
    function openImagePicker() {
        imageError = "";
        // Must stay synchronous with the click handler so browsers allow the picker.
        fileInputEl?.click();
    }

    function onPaste(e: ClipboardEvent) {
        const items = e.clipboardData?.items;
        if (!items) return;
        for (const item of items) {
            if (!item.type.startsWith("image/")) continue;
            const file = item.getAsFile();
            if (!file) continue;
            e.preventDefault();
            void attachImageFile(file);
            return;
        }
    }

    function onDragOver(e: DragEvent) {
        if (![...(e.dataTransfer?.types ?? [])].includes("Files")) return;
        e.preventDefault();
        e.stopPropagation();
        if (e.dataTransfer) e.dataTransfer.dropEffect = "copy";
        dragOver = true;
    }

    function onDragLeave(e: DragEvent) {
        e.preventDefault();
        dragOver = false;
    }

    function onDrop(e: DragEvent) {
        e.preventDefault();
        e.stopPropagation();
        dragOver = false;
        const file = [...(e.dataTransfer?.files ?? [])].find((f) =>
            f.type.startsWith("image/"),
        );
        if (file) void attachImageFile(file);
        else if (e.dataTransfer?.files?.length)
            imageError = "Drop an image file (JPEG, PNG, or WebP)";
    }

    /** Strip the active @mention token from the free-text query. */
    function stripMention(raw: string): string {
        return raw.replace(/(^|\s)@[^\s]*$/, "$1").trimEnd();
    }

    function closeMention() {
        mentionOpen = false;
        mentionMode = "kinds";
        mentionQuery = "";
        highlight = -1;
        tagSuggestions = [];
        termSuggestions = [];
    }

    function trySelectFromMenu(): boolean {
        if (mentionOpen && menuItems.length > 0 && highlight >= 0) {
            selectItem(menuItems[highlight]!);
            return true;
        }
        if (
            !mentionOpen &&
            highlight >= 0 &&
            menuItems[highlight]?.kind === "place"
        ) {
            selectItem(menuItems[highlight]!);
            return true;
        }
        return false;
    }

    function commitSearch() {
        const cleaned = stripMention(value);
        value = cleaned;
        closeMention();
        placesReq += 1;
        placeHits = [];
        navigate({ q: cleaned });
    }

    function handleSubmit(e: SubmitEvent) {
        e.preventDefault();
        if (trySelectFromMenu()) return;
        commitSearch();
    }

    function removeTag(tag: string) {
        navigate({
            tags: activeTags.filter((t) => t.toLowerCase() !== tag.toLowerCase()),
        });
    }

    function removeVocab(v: string) {
        navigate({
            vocabularies: activeVocabs.filter(
                (x) => x.toLowerCase() !== v.toLowerCase(),
            ),
        });
    }

    function applyTag(tag: string) {
        const next = [...activeTags];
        if (!next.some((t) => t.toLowerCase() === tag.toLowerCase())) {
            next.push(tag);
        }
        const cleaned = stripMention(value);
        value = cleaned;
        closeMention();
        navigate({ q: cleaned, tags: next });
    }

    function applyVocab(v: string) {
        const next = [...activeVocabs];
        if (!next.some((x) => x.toLowerCase() === v.toLowerCase())) {
            next.push(v);
        }
        const cleaned = stripMention(value);
        value = cleaned;
        closeMention();
        navigate({ q: cleaned, vocabularies: next });
    }

    function applyPlace(place: PleiadesPlace) {
        closeMention();
        placesReq += 1;
        placeHits = [];
        value = "";
        bbox = null;
        lat = place.lat;
        lng = place.lng;
        radius = place.radius;
        placeChip = { title: place.title, lat: place.lat, lng: place.lng };
        appliedPlaceLabel = place.title;
        queueMicrotask(() => inputEl?.focus());
    }

    function removeSpatial() {
        placeChip = null;
        appliedPlaceLabel = placeLabel;
        bbox = null;
        lat = null;
        lng = null;
        radius = DEFAULT_SEARCH_RADIUS;
        if (atSearch) {
            navigate({
                lat: null,
                lng: null,
                radius: null,
                bbox: null,
                placeName: null,
            });
        }
    }

    function enterKind(id: "tag" | "vocab" | "place") {
        mentionMode = id;
        mentionQuery = "";
        highlight = 0;
        // Rewrite the in-progress mention so further typing filters that kind
        value = value.replace(/(^|\s)@[^\s]*$/, `$1@${id}:`);
        tagSuggestions = [];
        termSuggestions = [];
        if (id !== "place") placeHits = [];
        queueMicrotask(() => inputEl?.focus());
    }

    function selectItem(item: MenuItem) {
        if (item.kind === "kind") {
            enterKind(item.id);
            return;
        }
        if (item.kind === "place") {
            applyPlace(item.place);
            return;
        }
        if (item.mode === "tag") applyTag(item.label);
        else applyVocab(item.label);
    }

    /**
     * Parse the trailing @token from the main input (Cursor-style).
     * Forms: `@` | `@pot` | `@tag:` | `@tag:pot` | `@vocab:` | `@vocab:terra`
     */
    function syncMentionFromValue(raw: string) {
        const m = /(^|\s)@([^\s]*)$/.exec(raw);
        if (!m) {
            if (mentionOpen) closeMention();
            return;
        }

        const token = m[2] ?? "";
        if (!mentionOpen) {
            highlight = 0;
            placesReq += 1;
            clearTimeout(placesTimer);
        }
        mentionOpen = true;

        const lower = token.toLowerCase();
        if (lower.startsWith("tag:")) {
            mentionMode = "tag";
            mentionQuery = token.slice(4);
            scheduleFetch();
            return;
        }
        if (lower.startsWith("vocab:")) {
            mentionMode = "vocab";
            mentionQuery = token.slice(6);
            scheduleFetch();
            return;
        }
        if (lower.startsWith("place:")) {
            mentionMode = "place";
            mentionQuery = token.slice(6);
            scheduleFetch();
            return;
        }

        // Bare @query — kinds menu, with tag/term/place suggestions once 2+ chars
        mentionMode = "kinds";
        mentionQuery = token;
        if (token.length >= 2) scheduleFetch();
        else {
            tagSuggestions = [];
            termSuggestions = [];
        }
    }

    function onInput(e: Event) {
        const el = e.currentTarget as HTMLInputElement;
        value = el.value;
        syncMentionFromValue(value);
        if (!mentionOpen) schedulePlacesFetch(value);
        else {
            clearTimeout(placesTimer);
            if (mentionMode !== "place" && mentionMode !== "kinds") {
                placeHits = [];
            }
        }
    }

    function popLastChip() {
        if (hasSpatialChip) {
            removeSpatial();
            return;
        }
        if (activeVocabs.length > 0) {
            removeVocab(activeVocabs[activeVocabs.length - 1]!);
            return;
        }
        if (activeTags.length > 0) {
            removeTag(activeTags[activeTags.length - 1]!);
            return;
        }
        if (hasImageChip) removeMedia();
    }

    function onKeydown(e: KeyboardEvent) {
        if (
            e.key === "Backspace" &&
            !value &&
            !mentionOpen &&
            (hasSpatialChip ||
                activeTags.length > 0 ||
                activeVocabs.length > 0 ||
                hasImageChip)
        ) {
            e.preventDefault();
            popLastChip();
            return;
        }

        const listOpen = mentionOpen || placesMenuOpen;
        if (!listOpen) {
            if (e.key === "@" || (e.key === "2" && e.shiftKey)) {
                // Let `@` insert, then sync on next input event
                return;
            }
            return;
        }

        if (e.key === "Escape") {
            e.preventDefault();
            if (mentionOpen) {
                value = stripMention(value);
                closeMention();
            } else {
                placeHits = [];
                highlight = -1;
                placesReq += 1;
            }
            return;
        }

        if (e.key === "ArrowDown") {
            e.preventDefault();
            if (menuItems.length === 0) return;
            if (!mentionOpen) {
                highlight =
                    highlight + 1 >= menuItems.length ? -1 : highlight + 1;
            } else {
                highlight = (highlight + 1) % menuItems.length;
            }
            return;
        }

        if (e.key === "ArrowUp") {
            e.preventDefault();
            if (menuItems.length === 0) return;
            if (!mentionOpen) {
                highlight =
                    highlight <= -1 ? menuItems.length - 1 : highlight - 1;
            } else {
                highlight =
                    (highlight - 1 + menuItems.length) % menuItems.length;
            }
            return;
        }

        if (e.key === "Enter" || e.key === "Tab") {
            if (mentionOpen && menuItems.length > 0) {
                e.preventDefault();
                selectItem(menuItems[highlight]!);
                return;
            }
            if (
                !mentionOpen &&
                highlight >= 0 &&
                menuItems[highlight]
            ) {
                e.preventDefault();
                selectItem(menuItems[highlight]!);
            }
            return;
        }
    }

    function schedulePlacesFetch(raw: string) {
        clearTimeout(placesTimer);
        const prefix = raw.trim();
        if (prefix.length < 2) {
            placesReq += 1;
            placeHits = [];
            loadingPlaces = false;
            return;
        }
        placesTimer = setTimeout(() => void runPlacesFetch(prefix), 180);
    }

    async function runPlacesFetch(prefix: string) {
        const req = ++placesReq;
        loadingPlaces = true;
        try {
            const hits = await searchPleiadesPlaces(prefix, 8);
            if (req !== placesReq) return;
            placeHits = hits;
        } catch {
            if (req !== placesReq) return;
            placeHits = [];
        } finally {
            if (req === placesReq) loadingPlaces = false;
        }
    }

    function scheduleFetch() {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => void runFetch(), 120);
    }

    async function runFetch() {
        const prefix = mentionQuery.trim();
        const wantTags = mentionMode === "tag" || mentionMode === "kinds";
        const wantTerms = mentionMode === "vocab" || mentionMode === "kinds";
        const wantPlaces =
            mentionMode === "place" || mentionMode === "kinds";

        if (!prefix) {
            tagSuggestions = [];
            termSuggestions = [];
            if (mentionMode === "place") placeHits = [];
            return;
        }

        loading = true;
        try {
            const jobs: Promise<void>[] = [];
            if (wantTags) {
                jobs.push(
                    (async () => {
                        const res = await fetch(
                            `/api/v1/search/lexicon/tags?prefix=${encodeURIComponent(prefix)}&limit=20`,
                        );
                        if (!res.ok) throw new Error(String(res.status));
                        const data = (await res.json()) as { tags?: string[] };
                        tagSuggestions = data.tags ?? [];
                    })(),
                );
            } else {
                tagSuggestions = [];
            }
            if (wantTerms) {
                jobs.push(
                    (async () => {
                        const res = await fetch(
                            `/api/v1/search/lexicon/terms?prefix=${encodeURIComponent(prefix)}&limit=20`,
                        );
                        if (!res.ok) throw new Error(String(res.status));
                        const data = (await res.json()) as { terms?: string[] };
                        termSuggestions = data.terms ?? [];
                    })(),
                );
            } else {
                termSuggestions = [];
            }
            if (wantPlaces && prefix.length >= 2) {
                jobs.push(
                    (async () => {
                        const hits = await searchPleiadesPlaces(prefix, 8);
                        placeHits = hits;
                    })(),
                );
            } else if (mentionMode === "place") {
                placeHits = [];
            }
            await Promise.all(jobs);
        } catch {
            if (wantTags) tagSuggestions = [];
            if (wantTerms) termSuggestions = [];
            if (wantPlaces) placeHits = [];
        } finally {
            loading = false;
        }
    }

    function onBlur() {
        // Delay so mousedown on a menu item can fire first
        focused = false;
        setTimeout(() => {
            if (!focused) {
                closeMention();
                placesReq += 1;
                placeHits = [];
            }
        }, 150);
    }
</script>

<div class="relative z-30 space-y-2">
    {#if imageError}
        <p class="text-[11px] text-destructive">{imageError}</p>
    {/if}

    <form
        onsubmit={handleSubmit}
        class="relative w-full"
        ondragover={onDragOver}
        ondragleave={onDragLeave}
        ondrop={onDrop}
        onpaste={onPaste}
    >
        <div
            class="search-vt-bar relative flex w-full min-h-11 flex-wrap items-center gap-1 rounded-xl border border-border bg-background py-1.5 pl-10 pr-12 shadow-sm focus-within:border-primary dark:bg-muted dark:shadow-none {dragOver
                ? 'ring-2 ring-primary/40'
                : ''} {klass}"
            onclick={() => inputEl?.focus()}
        >
        <SearchIcon
            class="pointer-events-none absolute left-3.5 top-1/2 z-10 size-4 -translate-y-1/2 text-muted-foreground"
        />
        {#if hasImageChip}
            <button
                type="button"
                class="inline-flex items-center gap-1 rounded-md bg-primary/10 px-1.5 py-0.5 text-[11px] font-medium text-primary hover:bg-primary/15"
                onclick={removeMedia}
                title="Remove image search"
            >
                {#if seedThumbUrl}
                    <img
                        src={seedThumbUrl}
                        alt=""
                        class="size-4 rounded object-cover"
                    />
                {:else}
                    <ImageIcon class="size-3" />
                {/if}
                <span class="text-primary/60">image</span>
                <XIcon class="size-3 opacity-70" />
            </button>
        {/if}
        {#if bbox}
            <button
                type="button"
                class="inline-flex max-w-[16rem] items-center gap-1 rounded-md bg-primary/10 px-1.5 py-0.5 text-[11px] font-medium text-primary hover:bg-primary/15"
                onclick={removeSpatial}
                title="Remove map area filter"
            >
                <MapIcon class="size-3 opacity-70" />
                <span class="text-primary/60">area</span>
                <span class="truncate tabular-nums"
                    >{formatLatLng(bbox.south, bbox.west)}
                    → {formatLatLng(bbox.north, bbox.east)}</span
                >
                <XIcon class="size-3 opacity-70" />
            </button>
        {:else if lat != null && lng != null}
            <button
                type="button"
                class="inline-flex max-w-[14rem] items-center gap-1 rounded-md bg-primary/10 px-1.5 py-0.5 text-[11px] font-medium text-primary hover:bg-primary/15"
                onclick={removeSpatial}
                title="Remove radius filter"
            >
                {#if placeChip}
                    <GlobeIcon class="size-3 opacity-70" />
                    <span class="truncate">{placeChip.title}</span>
                {:else}
                    <CrosshairIcon class="size-3 opacity-70" />
                    <span class="text-primary/60">radius</span>
                {/if}
                <span class="tabular-nums"
                    >{formatRadius(radius ?? DEFAULT_SEARCH_RADIUS)}</span
                >
                <XIcon class="size-3 opacity-70" />
            </button>
        {/if}
        {#each activeTags as tag (tag.toLowerCase())}
            <button
                type="button"
                class="inline-flex items-center gap-1 rounded-md bg-primary/10 px-1.5 py-0.5 text-[11px] font-medium text-primary hover:bg-primary/15"
                onclick={() => removeTag(tag)}
                title="Remove tag filter"
            >
                <span class="text-primary/60">tag:</span>{tag}
                <XIcon class="size-3 opacity-70" />
            </button>
        {/each}
        {#each activeVocabs as v (v.toLowerCase())}
            <button
                type="button"
                class="inline-flex items-center gap-1 rounded-md bg-secondary px-1.5 py-0.5 text-[11px] font-medium text-foreground hover:bg-secondary/80"
                onclick={() => removeVocab(v)}
                title="Remove mapped-term filter"
            >
                <span class="text-muted-foreground">vocab:</span>{v}
                <XIcon class="size-3 opacity-70" />
            </button>
        {/each}
        <div class="relative min-w-[8rem] flex-1">
        {#if cycling && !paused}
            <span
                class="pointer-events-none absolute inset-y-0 left-0 flex items-center truncate text-sm text-muted-foreground transition-opacity duration-200 {exampleVisible
                    ? 'opacity-100'
                    : 'opacity-0'}"
                aria-hidden="true">{activePlaceholder}</span
            >
        {/if}
        <input
            bind:this={inputEl}
            bind:value
            placeholder={cycling && !paused
                ? ""
                : hasSpatialChip ||
                    activeTags.length > 0 ||
                    activeVocabs.length > 0 ||
                    hasImageChip
                  ? "Add words…"
                  : activePlaceholder}
            {autofocus}
            type="text"
            name="q"
            autocomplete="off"
            role="combobox"
            aria-expanded={dropdownOpen}
            aria-controls="search-mention-list"
            aria-autocomplete="list"
            oninput={onInput}
            onkeydown={onKeydown}
            onfocus={() => (focused = true)}
            onfocusin={() => (focused = true)}
            onblur={onBlur}
            class="w-full min-w-0 border-0 bg-transparent py-1 text-sm placeholder:text-muted-foreground focus:outline-none"
        />
        </div>
        <input
            bind:this={fileInputEl}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/*"
            class="sr-only"
            tabindex="-1"
            aria-hidden="true"
            onchange={onFilePicked}
        />
        {#if shortcutHint && !focused && !hasSpatialChip && activeTags.length === 0}
            <span
                class="pointer-events-none absolute right-11 top-1/2 z-10 flex -translate-y-1/2 items-center gap-0.5 text-[10px] text-muted-foreground/80"
                aria-hidden="true"
            >
                <kbd
                    class="rounded border border-border bg-background/80 px-1.5 py-0.5 font-sans dark:bg-background/40"
                    >{isMac ? "⌘" : "Ctrl"}</kbd
                >
                <kbd
                    class="rounded border border-border bg-background/80 px-1.5 py-0.5 font-sans dark:bg-background/40"
                    >K</kbd
                >
            </span>
        {/if}
        <button
            type="button"
            class="absolute right-2.5 top-1/2 z-10 -translate-y-1/2 rounded-md p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground disabled:opacity-50"
            title="Search by image — click, drop, or paste a photo"
            aria-label="Search by image"
            disabled={imageBusy}
            onclick={(e) => {
                e.stopPropagation();
                openImagePicker();
            }}
        >
            {#if imageBusy}
                <LoaderIcon class="size-4 animate-spin" />
            {:else}
                <ImageIcon class="size-4" />
            {/if}
        </button>
        </div>

        {#if dropdownOpen}
            <div
                id="search-mention-list"
                role="listbox"
                class="absolute left-0 right-0 top-[calc(100%+6px)] z-[1100] overflow-hidden rounded-xl border border-border bg-background shadow-md"
            >
                <div
                    class="border-b border-border px-3 py-1.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground"
                >
                    {#if mentionMode === "kinds" && mentionOpen}
                        Add filter
                    {:else if mentionMode === "tag" && mentionOpen}
                        Tag
                    {:else if mentionMode === "vocab" && mentionOpen}
                        Vocab
                    {:else if mentionMode === "place" && mentionOpen}
                        Place
                    {:else}
                        Places
                    {/if}
                </div>
                <div class="max-h-64 overflow-y-auto p-1">
                    {#if (loading || loadingPlaces) && menuItems.length === 0}
                        <p class="px-2.5 py-3 text-xs text-muted-foreground">
                            Loading…
                        </p>
                    {:else if menuItems.length === 0}
                        <p class="px-2.5 py-3 text-xs text-muted-foreground">
                            {#if mentionMode === "tag"}
                                {mentionQuery
                                    ? "No matching tags"
                                    : "Keep typing a tag…"}
                            {:else if mentionMode === "vocab"}
                                {mentionQuery
                                    ? "No matching mapped terms"
                                    : "Keep typing a mapped term…"}
                            {:else if mentionMode === "place"}
                                {mentionQuery
                                    ? "No matching Pleiades places"
                                    : "Keep typing a place…"}
                            {:else}
                                Type to filter, or choose Place / Tag / Vocab
                            {/if}
                        </p>
                    {:else}
                        {#each menuItems as item, i (item.kind === "place" ? `place:${item.place.id}` : `${item.kind}:${item.id}`)}
                            <button
                                type="button"
                                role="option"
                                aria-selected={i === highlight}
                                class="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm transition-colors {i ===
                                highlight
                                    ? 'bg-muted'
                                    : 'hover:bg-muted/70'}"
                                onmousedown={(e) => e.preventDefault()}
                                onmouseenter={() => (highlight = i)}
                                onclick={() => selectItem(item)}
                            >
                                {#if item.kind === "kind"}
                                    {#if item.id === "tag"}
                                        <TagIcon
                                            class="size-3.5 shrink-0 text-muted-foreground"
                                        />
                                    {:else if item.id === "vocab"}
                                        <BookMarkedIcon
                                            class="size-3.5 shrink-0 text-muted-foreground"
                                        />
                                    {:else}
                                        <GlobeIcon
                                            class="size-3.5 shrink-0 text-muted-foreground"
                                        />
                                    {/if}
                                    <span class="min-w-0 flex-1">
                                        <span class="font-medium"
                                            >{item.label}</span
                                        >
                                        <span
                                            class="mt-0.5 block text-[11px] text-muted-foreground"
                                            >{item.hint}</span
                                        >
                                    </span>
                                {:else if item.kind === "place"}
                                    <GlobeIcon
                                        class="size-3.5 shrink-0 text-muted-foreground"
                                    />
                                    <span class="min-w-0 flex-1">
                                        <span class="font-medium"
                                            >{item.place.title}</span
                                        >
                                        <span
                                            class="mt-0.5 block truncate text-[11px] text-muted-foreground"
                                            >{item.place.types[0]?.replace(
                                                /_/g,
                                                " ",
                                            ) || "place"}{item.place
                                                .description
                                                ? ` · ${item.place.description}`
                                                : ""}</span
                                        >
                                    </span>
                                {:else}
                                    <span
                                        class="w-10 shrink-0 text-[10px] font-medium uppercase tracking-wide text-muted-foreground"
                                        >{item.mode}</span
                                    >
                                    <span class="truncate font-medium"
                                        >{item.label}</span
                                    >
                                {/if}
                            </button>
                        {/each}
                    {/if}
                </div>
                <div
                    class="border-t border-border px-3 py-1.5 text-[10px] text-muted-foreground"
                >
                    {#if !mentionOpen}
                        ↑↓ places · Enter searches ·
                        <a
                            href="https://pleiades.stoa.org/"
                            class="underline-offset-2 hover:underline"
                            target="_blank"
                            rel="noreferrer">Pleiades</a
                        >
                    {:else}
                        ↑↓ navigate · Enter select · Esc cancel
                        {#if mentionMode === "place" || mentionMode === "kinds"}
                            ·
                            <a
                                href="https://pleiades.stoa.org/"
                                class="underline-offset-2 hover:underline"
                                target="_blank"
                                rel="noreferrer">Pleiades</a
                            >
                        {/if}
                    {/if}
                </div>
            </div>
        {/if}
    </form>
</div>
