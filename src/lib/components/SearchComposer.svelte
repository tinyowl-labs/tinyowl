<script lang="ts">
    import SearchIcon from "@lucide/svelte/icons/search";
    import XIcon from "@lucide/svelte/icons/x";
    import TagIcon from "@lucide/svelte/icons/tag";
    import BookMarkedIcon from "@lucide/svelte/icons/book-marked";
    import LayersIcon from "@lucide/svelte/icons/layers";
    import ImageIcon from "@lucide/svelte/icons/image";
    import LoaderIcon from "@lucide/svelte/icons/loader";
    import GlobeIcon from "@lucide/svelte/icons/globe";
    import MapIcon from "@lucide/svelte/icons/map";
    import CrosshairIcon from "@lucide/svelte/icons/crosshair";
    import FolderKanbanIcon from "@lucide/svelte/icons/folder-kanban";
    import { onMount } from "svelte";
    import { goto } from "$app/navigation";
    import { page } from "$app/stores";
    import { projectLayersSearchHref, projectLayerHref, projectArtefactHref, projectLayersPlaceHref, entityLayersHref } from "$lib/project/entityLink";
    import {
        searchHref,
        formatBBox,
        formatLatLng,
        formatRadius,
        DEFAULT_SEARCH_RADIUS,
        type SearchBBox,
    } from "$lib/search/params";
    import { searchMergedPlaces } from "$lib/search/photon";
    import type { PlaceHit } from "$lib/search/placeHit";
    import {
        searchOmnibox,
        searchProjectsByText,
        type ProjectHit,
    } from "$lib/search/projects";
    import {
        searchProjectScope,
        searchProjectEntities,
        type ArtefactHit,
        type EntityHit,
        type LayerHit,
    } from "$lib/search/projectScope";
    import {
        clearImageQuery,
        loadImageQuery,
        postSimilarByImage,
        previewDataUrlFromFile,
        saveImageQuery,
    } from "$lib/search/imageQuery";

    type MentionMode = "kinds" | "tag" | "vocab" | "place" | "project" | "entity";

    type KindItem = {
        kind: "kind";
        id: "tag" | "vocab" | "place" | "project" | "entity";
        label: string;
        hint: string;
    };
    type ValueItem = {
        kind: "value";
        id: string;
        label: string;
        mode: "tag" | "vocab";
    };
    type PlaceItem = { kind: "place"; place: PlaceHit };
    type ProjectItem = { kind: "project"; project: ProjectHit };
    type LayerItem = { kind: "layer"; layer: LayerHit };
    type ArtefactItem = { kind: "artefact"; artefact: ArtefactHit };
    type EntityItem = { kind: "entity"; entity: EntityHit };
    type MenuItem =
        | KindItem
        | ValueItem
        | PlaceItem
        | ProjectItem
        | LayerItem
        | ArtefactItem
        | EntityItem;

    type Props = {
        value?: string;
        tags?: string[];
        vocabularies?: string[];
        /** Project slug chips (`?project=`). */
        projects?: string[];
        /** Titles for project chips, keyed by slug (from search results). */
        projectLabels?: Record<string, string>;
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
        /** Show ⌘K / Ctrl K cue. The overlay owns the actual shortcut. */
        shortcutHint?: boolean;
        /** Gazetteer title restored from `?place=` */
        placeLabel?: string | null;
        /** Combobox listbox id (overlay vs page to avoid duplicate ids). */
        listboxId?: string;
        /**
         * Command-palette host: always `goto` results (do not apply place
         * only to unbound local state).
         */
        palette?: boolean;
        class?: string;
    };

    let {
        value = $bindable(""),
        tags = [],
        vocabularies = [],
        projects = [],
        projectLabels = {},
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
        listboxId = "search-mention-list",
        palette = false,
        class: klass = "",
    }: Props = $props();

    const CYCLE_MS = 3200;
    const FADE_MS = 220;
    const KINDS: KindItem[] = [
        {
            kind: "kind",
            id: "place",
            label: "Place",
            hint: "Ancient and modern places",
        },
        {
            kind: "kind",
            id: "entity",
            label: "Entity",
            hint: "Find a record by id",
        },
        {
            kind: "kind",
            id: "project",
            label: "Project",
            hint: "Search in a project",
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

    /** Focus the query field with the caret at the end (do not select chips or text). */
    export function focusField() {
        const el = inputEl;
        if (!el) return;
        el.focus({ preventScroll: true });
        const n = el.value.length;
        el.setSelectionRange(n, n);
    }
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
    let placeHits = $state<PlaceHit[]>([]);
    let projectHits = $state<ProjectHit[]>([]);
    let layerHits = $state<LayerHit[]>([]);
    let artefactHits = $state<ArtefactHit[]>([]);
    let entityHits = $state<EntityHit[]>([]);
    let loading = $state(false);
    let loadingPlaces = $state(false);
    let debounceTimer: ReturnType<typeof setTimeout> | undefined;
    let placesTimer: ReturnType<typeof setTimeout> | undefined;
    let placesReq = 0;
    let placeChip = $state<{
        title: string;
        lat?: number;
        lng?: number;
    } | null>(null);
    let appliedPlaceLabel = $state<string | null>(null);
    let projectChipTitles = $state<Record<string, string>>({});
    /** Mentions chipped locally (e.g. `@slug `) before Enter navigates. */
    let extraProjects = $state<string[]>([]);
    /** Auto-scope chips the user dismissed in the overlay. */
    let omittedProjects = $state<string[]>([]);

    function mergeSlugs(base: string[], more: string[]): string[] {
        const out = [...base];
        for (const slug of more) {
            if (
                slug &&
                !out.some((s) => s.toLowerCase() === slug.toLowerCase())
            ) {
                out.push(slug);
            }
        }
        return out;
    }

    const activeTags = $derived(tags);
    const activeVocabs = $derived(vocabularies);
    const activeProjects = $derived.by(() => {
        const omit = new Set(
            omittedProjects.map((s) => s.toLowerCase()),
        );
        const fromProps = projects.filter(
            (s) => !omit.has(s.toLowerCase()),
        );
        return mergeSlugs(fromProps, extraProjects);
    });

    function projectChipLabel(slug: string): string {
        return projectChipTitles[slug] || projectLabels[slug] || slug;
    }
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
    const scopedSlug = $derived(
        activeProjects.length === 1 ? activeProjects[0]! : null,
    );
    const kindMenu = $derived(
        scopedSlug
            ? KINDS
            : KINDS.filter((k) => k.id !== "entity"),
    );
    const atSearch = $derived($page.url.pathname === "/search");
    const cycling = $derived(examples.length > 0);
    const placesMenuOpen = $derived(
        !mentionOpen &&
            value.trim().length >= 2 &&
            (placeHits.length > 0 ||
                projectHits.length > 0 ||
                layerHits.length > 0 ||
                artefactHits.length > 0 ||
                loadingPlaces),
    );
    const dropdownOpen = $derived(mentionOpen || placesMenuOpen);
    const paused = $derived(
        focused ||
            value.trim().length > 0 ||
            dropdownOpen ||
            hasImageChip ||
            hasSpatialChip ||
            activeTags.length > 0 ||
            activeVocabs.length > 0 ||
            activeProjects.length > 0,
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

    function projectItems(via?: ProjectHit["via"]): ProjectItem[] {
        return projectHits
            .filter((p) => via == null || p.via === via)
            .map((p) => ({ kind: "project" as const, project: p }));
    }

    function layerItems(): LayerItem[] {
        return layerHits.map((l) => ({ kind: "layer" as const, layer: l }));
    }

    function artefactItems(): ArtefactItem[] {
        return artefactHits.map((a) => ({
            kind: "artefact" as const,
            artefact: a,
        }));
    }

    function entityItems(): EntityItem[] {
        return entityHits.map((e) => ({
            kind: "entity" as const,
            entity: e,
        }));
    }

    /** Name matches, then places, then geo-suggested projects. */
    function mixedOmniboxItems(): MenuItem[] {
        if (scopedSlug) {
            return [
                ...layerItems(),
                ...artefactItems(),
                ...placeItems(),
                ...projectItems("name"),
                ...projectItems("geo"),
            ];
        }
        return [
            ...projectItems("name"),
            ...placeItems(),
            ...projectItems("geo"),
        ];
    }

    const menuItems = $derived.by((): MenuItem[] => {
        if (!mentionOpen) return mixedOmniboxItems();
        if (mentionMode === "kinds") {
            const q = mentionQuery.trim().toLowerCase();
            const kinds = q
                ? kindMenu.filter(
                      (k) =>
                          k.id.startsWith(q) ||
                          k.label.toLowerCase().startsWith(q),
                  )
                : kindMenu;
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
            const projects = projectItems();
            const entities = scopedSlug ? entityItems() : [];
            // Bare `@slug` (no kind prefix) — project hits first so Enter chips the project
            if (q.length >= 2 && kinds.length === 0) {
                return [
                    ...entities,
                    ...projects,
                    ...tagHits,
                    ...termHits,
                    ...placeItems(),
                ];
            }
            return [
                ...kinds,
                ...entities,
                ...projects,
                ...tagHits,
                ...termHits,
                ...placeItems(),
            ];
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
        if (mentionMode === "project") return projectItems();
        if (mentionMode === "entity") return entityItems();
        return termSuggestions.map((t) => ({
            kind: "value" as const,
            id: `vocab:${t}`,
            label: t,
            mode: "vocab" as const,
        }));
    });

    function ghostFill(item: MenuItem): string | null {
        if (mentionOpen) {
            const prefix = value.replace(/@[^\s]*$/, "");
            if (item.kind === "kind") return `${prefix}@${item.id}:`;
            if (item.kind === "value") {
                return `${prefix}@${item.mode}:${item.label}`;
            }
            if (item.kind === "place") {
                return `${prefix}@place:${item.place.label}`;
            }
            if (item.kind === "project") {
                if (mentionMode === "project") {
                    return `${prefix}@project:${item.project.slug}`;
                }
                return `${prefix}@${item.project.slug}`;
            }
            if (item.kind === "layer") return `${prefix}${item.layer.label}`;
            if (item.kind === "artefact") return `${prefix}${item.artefact.label}`;
            if (item.kind === "entity") return `${prefix}@entity:${item.entity.id}`;
            return null;
        }
        if (item.kind === "place") return item.place.label;
        if (item.kind === "project") return item.project.title;
        if (item.kind === "layer") return item.layer.label;
        if (item.kind === "artefact") return item.artefact.label;
        if (item.kind === "entity") return item.entity.id;
        return null;
    }

    const ghostSuffix = $derived.by((): string | null => {
        if (!focused || menuItems.length === 0) return null;
        const item =
            highlight >= 0 ? menuItems[highlight]! : menuItems[0]!;
        const fill = ghostFill(item);
        if (!fill) return null;
        const typed = value;
        if (!typed) return null;
        if (!fill.toLowerCase().startsWith(typed.toLowerCase())) return null;
        if (fill.length <= typed.length) return null;
        return fill.slice(typed.length);
    });

    function acceptGhost(): boolean {
        if (!ghostSuffix) return false;
        const item =
            highlight >= 0 ? menuItems[highlight]! : menuItems[0]!;
        const fill = ghostFill(item);
        if (!fill) return false;
        value = fill;
        syncMentionFromValue(fill);
        if (!mentionOpen) schedulePlacesFetch(fill);
        return true;
    }

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
                if (t && t !== inputEl) {
                    const tag = t.tagName;
                    if (
                        tag === "INPUT" ||
                        tag === "TEXTAREA" ||
                        tag === "SELECT" ||
                        tag === "BUTTON" ||
                        t.isContentEditable ||
                        t.closest?.('[role="dialog"]')
                    ) {
                        return;
                    }
                }
                e.preventDefault();
                e.stopPropagation();
                if (trySelectFromMenu()) return;
                commitSearch();
                return;
            }

            // ⌘K / Ctrl+K is owned by SearchOverlay (root layout).
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
        if (bbox) {
            if (
                placeLabel &&
                (!placeChip || placeChip.title !== placeLabel)
            ) {
                placeChip = { title: placeLabel };
                appliedPlaceLabel = placeLabel;
            }
            return;
        }
        if (lat == null || lng == null) {
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
        projects?: string[];
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
        const nextProjects = next.projects ?? activeProjects;
        const nextQ = next.q ?? value;
        if (nextProjects.length === 1) {
            const slug = nextProjects[0]!;
            const placeBBox = nextBBox;
            const placeLat = nextLat;
            const placeLng = nextLng;
            if (placeBBox || (placeLat != null && placeLng != null)) {
                const geom =
                    placeBBox != null
                        ? {
                              type: "bbox" as const,
                              west: placeBBox.west,
                              south: placeBBox.south,
                              east: placeBBox.east,
                              north: placeBBox.north,
                          }
                        : {
                              type: "point" as const,
                              lat: placeLat!,
                              lng: placeLng!,
                              radius:
                                  next.radius !== undefined
                                      ? (next.radius ?? DEFAULT_SEARCH_RADIUS)
                                      : (radius ?? DEFAULT_SEARCH_RADIUS),
                          };
                void goto(
                    projectLayersPlaceHref(slug, {
                        id: "apply",
                        source: "photon",
                        kind: "place",
                        label:
                            next.placeName !== undefined
                                ? (next.placeName ?? "")
                                : (placeChip?.title ?? ""),
                        detail: "",
                        geom,
                    }),
                );
                return;
            }
            void goto(projectLayersSearchHref(slug, nextQ));
            return;
        }
        goto(
            searchHref({
                q: nextQ,
                tags: next.tags ?? activeTags,
                vocabularies: next.vocabularies ?? activeVocabs,
                projects: nextProjects,
                lat: nextLat,
                lng: nextLng,
                radius: next.radius !== undefined ? next.radius : radius,
                bbox: nextBBox,
                placeName:
                    next.placeName !== undefined
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
        projectHits = [];
        layerHits = [];
        artefactHits = [];
        entityHits = [];
    }

    function trySelectFromMenu(): boolean {
        if (mentionOpen && menuItems.length > 0 && highlight >= 0) {
            selectItem(menuItems[highlight]!);
            return true;
        }
        if (
            !mentionOpen &&
            highlight >= 0 &&
            menuItems[highlight]
        ) {
            selectItem(menuItems[highlight]!);
            return true;
        }
        return false;
    }

    function isKindToken(typed: string): boolean {
        const q = typed.trim().toLowerCase();
        if (!q) return false;
        return KINDS.some(
            (k) => k.id === q || k.label.toLowerCase() === q,
        );
    }

    function resolveMentionProject(typed: string): ProjectHit | null {
        const lower = typed.trim().toLowerCase();
        if (lower.length < 2) return null;
        const exact =
            projectHits.find((p) => p.slug.toLowerCase() === lower) ||
            projectHits.find((p) =>
                p.slug.toLowerCase().endsWith(`/${lower}`),
            ) ||
            projectHits.find((p) => p.title.toLowerCase() === lower);
        if (exact) return exact;
        const prefixed = projectHits.filter((p) => {
            const slug = p.slug.toLowerCase();
            const tail = slug.includes("/")
                ? slug.slice(slug.lastIndexOf("/") + 1)
                : slug;
            return (
                slug.startsWith(lower) ||
                tail.startsWith(lower) ||
                p.title.toLowerCase().startsWith(lower)
            );
        });
        if (prefixed.length === 1) return prefixed[0]!;
        return null;
    }

    function projectSlugFromMentionToken(
        token: string,
    ): { slug: string; hit: ProjectHit | null } | null {
        let typed = token.trim();
        if (!typed) return null;
        if (/^project:/i.test(typed)) typed = typed.slice("project:".length);
        else if (
            /^(tag|vocab|place|entity):/i.test(typed) ||
            isKindToken(typed)
        ) {
            return null;
        }
        if (typed.length < 2) return null;
        const hit = resolveMentionProject(typed);
        const slug =
            hit?.slug ??
            (/^[a-z0-9][a-z0-9/_-]*$/i.test(typed) ? typed : "");
        if (!slug) return null;
        return { slug, hit };
    }

    function harvestProjectMentions(
        raw: string,
        opts?: { completedOnly?: boolean },
    ): { q: string; slugs: string[]; hits: ProjectHit[] } {
        const slugs: string[] = [];
        const hits: ProjectHit[] = [];
        const keepTrailingSpace = /\s$/.test(raw);
        const re = opts?.completedOnly
            ? /(^|\s)@([^\s]+)(?=\s)/g
            : /(^|\s)@([^\s]+)/g;
        const stripped = raw.replace(
            re,
            (full, lead: string, token: string) => {
                const got = projectSlugFromMentionToken(token);
                if (!got) return full;
                if (
                    !slugs.some(
                        (s) => s.toLowerCase() === got.slug.toLowerCase(),
                    )
                ) {
                    slugs.push(got.slug);
                    if (got.hit) hits.push(got.hit);
                }
                return lead;
            },
        );
        let q = stripped.replace(/\s+/g, " ").trim();
        if (keepTrailingSpace && q) q += " ";
        return { q, slugs, hits };
    }

    function rememberProjectHits(hits: ProjectHit[]) {
        if (hits.length === 0) return;
        const next = { ...projectChipTitles };
        for (const hit of hits) next[hit.slug] = hit.title;
        projectChipTitles = next;
    }

    function chipCompletedProjectMentions() {
        const harvested = harvestProjectMentions(value, {
            completedOnly: true,
        });
        if (harvested.slugs.length === 0) return;
        extraProjects = mergeSlugs(extraProjects, harvested.slugs);
        rememberProjectHits(harvested.hits);
        if (harvested.q === value) return;
        value = harvested.q;
        closeMention();
    }

    function commitSearch() {
        const harvested = harvestProjectMentions(value);
        rememberProjectHits(harvested.hits);
        const nextProjects = mergeSlugs(activeProjects, harvested.slugs);
        extraProjects = [];
        omittedProjects = [];
        value = harvested.q;
        closeMention();
        placesReq += 1;
        placeHits = [];
        projectHits = [];
        layerHits = [];
        artefactHits = [];
        navigate({ q: harvested.q, projects: nextProjects });
    }

    function handleSubmit(e: SubmitEvent) {
        e.preventDefault();
        if (mentionOpen) {
            if (trySelectFromMenu()) return;
            commitSearch();
            return;
        }
        const inline = harvestProjectMentions(value);
        if (inline.slugs.length > 0) {
            commitSearch();
            return;
        }
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

    function removeProject(slug: string) {
        const next = activeProjects.filter(
            (s) => s.toLowerCase() !== slug.toLowerCase(),
        );
        extraProjects = extraProjects.filter(
            (s) => s.toLowerCase() !== slug.toLowerCase(),
        );
        if (
            projects.some((s) => s.toLowerCase() === slug.toLowerCase())
        ) {
            omittedProjects = mergeSlugs(omittedProjects, [slug]);
        }
        if (next.length !== 1) {
            layerHits = [];
            artefactHits = [];
        } else if (value.trim().length >= 2 && !mentionOpen) {
            schedulePlacesFetch(value);
        }
        if (!palette) {
            navigate({ projects: next });
        }
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

    function applyProjectFilter(project: ProjectHit) {
        extraProjects = mergeSlugs(extraProjects, [project.slug]);
        omittedProjects = omittedProjects.filter(
            (s) => s.toLowerCase() !== project.slug.toLowerCase(),
        );
        projectChipTitles = {
            ...projectChipTitles,
            [project.slug]: project.title,
        };
        const cleaned = stripMention(value);
        value = cleaned;
        closeMention();
        navigate({
            q: cleaned,
            projects: mergeSlugs(activeProjects, [project.slug]),
        });
    }

    function applyPlace(place: PlaceHit) {
        closeMention();
        placesReq += 1;
        placeHits = [];
        projectHits = [];
        layerHits = [];
        artefactHits = [];
        value = "";
        const geom = place.geom;
        if (geom.type === "bbox") {
            bbox = {
                west: geom.west,
                south: geom.south,
                east: geom.east,
                north: geom.north,
            };
            lat = null;
            lng = null;
            placeChip = { title: place.label };
        } else {
            bbox = null;
            lat = geom.lat;
            lng = geom.lng;
            radius = geom.radius;
            placeChip = {
                title: place.label,
                lat: geom.lat,
                lng: geom.lng,
            };
        }
        appliedPlaceLabel = place.label;
        if (scopedSlug) {
            void goto(projectLayersPlaceHref(scopedSlug, place));
            return;
        }
        if (atSearch || palette) {
            navigate({
                q: "",
                lat: geom.type === "bbox" ? null : geom.lat,
                lng: geom.type === "bbox" ? null : geom.lng,
                radius: geom.type === "bbox" ? null : geom.radius,
                bbox: geom.type === "bbox" ? bbox : null,
                placeName: place.label,
            });
        }
        queueMicrotask(() => inputEl?.focus());
    }

    function applyProject(project: ProjectHit) {
        closeMention();
        placesReq += 1;
        placeHits = [];
        projectHits = [];
        value = "";
        void goto(`/${project.slug}`);
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

    function enterKind(id: "tag" | "vocab" | "place" | "project" | "entity") {
        mentionMode = id;
        mentionQuery = "";
        highlight = 0;
        // Rewrite the in-progress mention so further typing filters that kind
        value = value.replace(/(^|\s)@[^\s]*$/, `$1@${id}:`);
        tagSuggestions = [];
        termSuggestions = [];
        if (id !== "place") placeHits = [];
        projectHits = [];
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
        if (item.kind === "project") {
            if (mentionOpen) applyProjectFilter(item.project);
            else applyProject(item.project);
            return;
        }
        if (item.kind === "layer") {
            if (!scopedSlug) return;
            void goto(projectLayerHref(scopedSlug, item.layer.name));
            return;
        }
        if (item.kind === "artefact") {
            if (!scopedSlug) return;
            void goto(projectArtefactHref(scopedSlug, item.artefact.hash));
            return;
        }
        if (item.kind === "entity") {
            if (!scopedSlug) return;
            void goto(
                entityLayersHref(scopedSlug, {
                    layer: item.entity.layer,
                    highlight: item.entity.id,
                    view: "map",
                }),
            );
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
        if (lower.startsWith("project:")) {
            mentionMode = "project";
            mentionQuery = token.slice(8);
            scheduleFetch();
            return;
        }
        if (lower.startsWith("entity:")) {
            mentionMode = "entity";
            mentionQuery = token.slice(7);
            scheduleFetch();
            return;
        }

        // Bare @query — kinds menu, with tag/term/place/project suggestions once 2+ chars
        mentionMode = "kinds";
        mentionQuery = token;
        if (token.length >= 2) scheduleFetch();
        else {
            tagSuggestions = [];
            termSuggestions = [];
            projectHits = [];
            entityHits = [];
        }
    }

    function onInput(e: Event) {
        const el = e.currentTarget as HTMLInputElement;
        value = el.value;
        chipCompletedProjectMentions();
        syncMentionFromValue(value);
        if (!mentionOpen) schedulePlacesFetch(value);
        else {
            clearTimeout(placesTimer);
            if (
                mentionMode !== "place" &&
                mentionMode !== "kinds"
            ) {
                placeHits = [];
            }
            if (
                mentionMode !== "project" &&
                mentionMode !== "kinds"
            ) {
                projectHits = [];
            }
            if (
                mentionMode !== "entity" &&
                mentionMode !== "kinds"
            ) {
                entityHits = [];
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
        if (activeProjects.length > 0) {
            removeProject(activeProjects[activeProjects.length - 1]!);
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
                activeProjects.length > 0 ||
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
            e.stopPropagation();
            if (mentionOpen) {
                value = stripMention(value);
                closeMention();
            } else {
                placeHits = [];
                projectHits = [];
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

        if (e.key === "Tab") {
            if (acceptGhost()) e.preventDefault();
            return;
        }

        if (e.key === "Enter") {
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
            projectHits = [];
            layerHits = [];
            artefactHits = [];
            loadingPlaces = false;
            return;
        }
        placesTimer = setTimeout(() => void runPlacesFetch(prefix), 180);
    }

    async function runPlacesFetch(prefix: string) {
        const req = ++placesReq;
        loadingPlaces = true;
        try {
            const slug = scopedSlug;
            const [omnibox, scoped] = await Promise.all([
                searchOmnibox(prefix, { accessToken }),
                slug
                    ? searchProjectScope(slug, prefix, { accessToken })
                    : Promise.resolve({ layers: [], artefacts: [] }),
            ]);
            if (req !== placesReq) return;
            placeHits = omnibox.places;
            projectHits = slug
                ? omnibox.projects.filter(
                      (p) => p.slug.toLowerCase() !== slug.toLowerCase(),
                  )
                : omnibox.projects;
            layerHits = scoped.layers;
            artefactHits = scoped.artefacts;
        } catch {
            if (req !== placesReq) return;
            placeHits = [];
            projectHits = [];
            layerHits = [];
            artefactHits = [];
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
        const wantProjects =
            mentionMode === "project" || mentionMode === "kinds";
        const wantEntities =
            Boolean(scopedSlug) &&
            (mentionMode === "entity" || mentionMode === "kinds");

        if (!prefix) {
            tagSuggestions = [];
            termSuggestions = [];
            if (mentionMode === "place") placeHits = [];
            if (mentionMode === "project") projectHits = [];
            if (mentionMode === "entity") entityHits = [];
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
                        const hits = await searchMergedPlaces(prefix, 10);
                        placeHits = hits;
                    })(),
                );
            } else if (mentionMode === "place") {
                placeHits = [];
            }
            if (wantProjects && prefix.length >= 2) {
                jobs.push(
                    (async () => {
                        const hits = await searchProjectsByText(prefix, {
                            accessToken,
                        });
                        projectHits = hits;
                    })(),
                );
            } else if (mentionMode === "project") {
                projectHits = [];
            }
            if (wantEntities && (mentionMode === "entity" || prefix.length >= 2)) {
                jobs.push(
                    (async () => {
                        const hits = await searchProjectEntities(
                            scopedSlug!,
                            prefix,
                            { accessToken },
                        );
                        entityHits = hits;
                    })(),
                );
            } else if (mentionMode === "entity") {
                entityHits = [];
            }
            await Promise.all(jobs);
        } catch {
            if (wantTags) tagSuggestions = [];
            if (wantTerms) termSuggestions = [];
            if (wantPlaces) placeHits = [];
            if (wantProjects) projectHits = [];
            if (wantEntities) entityHits = [];
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
                projectHits = [];
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
                tabindex="-1"
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
                tabindex="-1"
                class="inline-flex max-w-[16rem] items-center gap-1 rounded-md bg-primary/10 px-1.5 py-0.5 text-[11px] font-medium text-primary hover:bg-primary/15"
                onclick={removeSpatial}
                title="Remove map area filter"
            >
                {#if placeChip}
                    <GlobeIcon class="size-3 opacity-70" />
                    <span class="truncate">{placeChip.title}</span>
                {:else}
                    <MapIcon class="size-3 opacity-70" />
                    <span class="text-primary/60">area</span>
                    <span class="truncate tabular-nums"
                        >{formatLatLng(bbox.south, bbox.west)}
                        → {formatLatLng(bbox.north, bbox.east)}</span
                    >
                {/if}
                <XIcon class="size-3 opacity-70" />
            </button>
        {:else if lat != null && lng != null}
            <button
                type="button"
                tabindex="-1"
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
                tabindex="-1"
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
                tabindex="-1"
                class="inline-flex items-center gap-1 rounded-md bg-secondary px-1.5 py-0.5 text-[11px] font-medium text-foreground hover:bg-secondary/80"
                onclick={() => removeVocab(v)}
                title="Remove mapped-term filter"
            >
                <span class="text-muted-foreground">vocab:</span>{v}
                <XIcon class="size-3 opacity-70" />
            </button>
        {/each}
        {#each activeProjects as slug (slug.toLowerCase())}
            <button
                type="button"
                tabindex="-1"
                class="inline-flex max-w-[16rem] items-center gap-1 rounded-md bg-primary/10 px-1.5 py-0.5 text-[11px] font-medium text-primary hover:bg-primary/15"
                onclick={() => removeProject(slug)}
                title="Remove project filter"
            >
                <span class="text-primary/60">project:</span>
                <span class="truncate">{projectChipLabel(slug)}</span>
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
        {:else if ghostSuffix}
            <span
                class="pointer-events-none absolute inset-y-0 left-0 flex items-center overflow-hidden text-sm"
                aria-hidden="true"
            >
                <span class="invisible whitespace-pre">{value}</span><span
                    class="whitespace-pre text-muted-foreground/50"
                    >{ghostSuffix}</span
                >
            </span>
        {/if}
        <input
            bind:this={inputEl}
            bind:value
            placeholder={cycling && !paused
                ? ""
                : hasSpatialChip ||
                    activeTags.length > 0 ||
                    activeVocabs.length > 0 ||
                    activeProjects.length > 0 ||
                    hasImageChip
                  ? "Add words…"
                  : activePlaceholder}
            {autofocus}
            type="text"
            name="q"
            autocomplete="off"
            role="combobox"
            aria-expanded={dropdownOpen}
            aria-controls={listboxId}
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
        {#if shortcutHint && !focused && !hasSpatialChip && activeTags.length === 0 && activeVocabs.length === 0 && activeProjects.length === 0}
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
                id={listboxId}
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
                    {:else if mentionMode === "project" && mentionOpen}
                        Project
                    {:else if mentionMode === "entity" && mentionOpen}
                        Entity
                    {:else if scopedSlug}
                        Layers, artefacts & places
                    {:else}
                        Projects & places
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
                                    ? "No matching places"
                                    : "Keep typing a place…"}
                            {:else if mentionMode === "project"}
                                {mentionQuery
                                    ? "No matching projects"
                                    : "Keep typing a project…"}
                            {:else if mentionMode === "entity"}
                                {mentionQuery
                                    ? "No matching ids"
                                    : "Keep typing an entity id…"}
                            {:else}
                                Type to filter, or choose Place / Project / Tag / Vocab
                            {/if}
                        </p>
                    {:else}
                        {#each menuItems as item, i (item.kind === "place"
                            ? `place:${item.place.id}`
                            : item.kind === "project"
                              ? `project:${item.project.slug}`
                              : item.kind === "layer"
                                ? `layer:${item.layer.name}`
                                : item.kind === "artefact"
                                  ? `artefact:${item.artefact.hash}`
                                  : item.kind === "entity"
                                    ? `entity:${item.entity.layer}:${item.entity.id}`
                                    : `${item.kind}:${item.id}`)}
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
                                    {:else if item.id === "project"}
                                        <FolderKanbanIcon
                                            class="size-3.5 shrink-0 text-muted-foreground"
                                        />
                                    {:else if item.id === "entity"}
                                        <CrosshairIcon
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
                                    {#if item.place.geom.type === "bbox"}
                                        <MapIcon
                                            class="size-3.5 shrink-0 text-muted-foreground"
                                        />
                                    {:else}
                                        <GlobeIcon
                                            class="size-3.5 shrink-0 text-muted-foreground"
                                        />
                                    {/if}
                                    <span class="min-w-0 flex-1">
                                        <span class="font-medium"
                                            >{item.place.label}</span
                                        >
                                        <span
                                            class="mt-0.5 block truncate text-[11px] text-muted-foreground"
                                            >{item.place.detail}</span
                                        >
                                    </span>
                                {:else if item.kind === "project"}
                                    <FolderKanbanIcon
                                        class="size-3.5 shrink-0 text-muted-foreground"
                                    />
                                    <span class="min-w-0 flex-1">
                                        <span class="font-medium"
                                            >{item.project.title}</span
                                        >
                                        <span
                                            class="mt-0.5 block truncate text-[11px] text-muted-foreground"
                                            >{item.project.detail}</span
                                        >
                                    </span>
                                {:else if item.kind === "layer"}
                                    <LayersIcon
                                        class="size-3.5 shrink-0 text-muted-foreground"
                                    />
                                    <span class="min-w-0 flex-1">
                                        <span class="font-medium"
                                            >{item.layer.label}</span
                                        >
                                        <span
                                            class="mt-0.5 block truncate text-[11px] text-muted-foreground"
                                            >{item.layer.detail}</span
                                        >
                                    </span>
                                {:else if item.kind === "artefact"}
                                    <ImageIcon
                                        class="size-3.5 shrink-0 text-muted-foreground"
                                    />
                                    <span class="min-w-0 flex-1">
                                        <span class="font-medium"
                                            >{item.artefact.label}</span
                                        >
                                        <span
                                            class="mt-0.5 block truncate text-[11px] text-muted-foreground"
                                            >{item.artefact.detail}</span
                                        >
                                    </span>
                                {:else if item.kind === "entity"}
                                    <CrosshairIcon
                                        class="size-3.5 shrink-0 text-muted-foreground"
                                    />
                                    <span class="min-w-0 flex-1">
                                        <span class="font-medium"
                                            >{item.entity.label}</span
                                        >
                                        <span
                                            class="mt-0.5 block truncate text-[11px] text-muted-foreground"
                                            >{item.entity.detail}</span
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
                        Tab complete · ↑↓ places · Enter searches ·
                        <a
                            href="https://pleiades.stoa.org/"
                            class="underline-offset-2 hover:underline"
                            target="_blank"
                            rel="noreferrer">Pleiades</a
                        >
                        ·
                        <a
                            href="https://www.openstreetmap.org/copyright"
                            class="underline-offset-2 hover:underline"
                            target="_blank"
                            rel="noreferrer">© OSM</a
                        >
                    {:else}
                        Tab complete · ↑↓ navigate · Enter select · Esc cancel
                        {#if mentionMode === "place" || mentionMode === "kinds"}
                            ·
                            <a
                                href="https://pleiades.stoa.org/"
                                class="underline-offset-2 hover:underline"
                                target="_blank"
                                rel="noreferrer">Pleiades</a
                            >
                            ·
                            <a
                                href="https://www.openstreetmap.org/copyright"
                                class="underline-offset-2 hover:underline"
                                target="_blank"
                                rel="noreferrer">© OSM</a
                            >
                        {/if}
                    {/if}
                </div>
            </div>
        {/if}
    </form>
</div>
