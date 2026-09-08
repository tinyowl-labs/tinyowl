<script lang="ts">
    import SearchIcon from "@lucide/svelte/icons/search";
    import XIcon from "@lucide/svelte/icons/x";
    import TagIcon from "@lucide/svelte/icons/tag";
    import BookMarkedIcon from "@lucide/svelte/icons/book-marked";
    import LayersIcon from "@lucide/svelte/icons/layers";
    import Table2Icon from "@lucide/svelte/icons/table-2";
    import ImageIcon from "@lucide/svelte/icons/image";
    import LoaderIcon from "@lucide/svelte/icons/loader";
    import GlobeIcon from "@lucide/svelte/icons/globe";
    import CalendarRangeIcon from "@lucide/svelte/icons/calendar-range";
    import MapIcon from "@lucide/svelte/icons/map";
    import CrosshairIcon from "@lucide/svelte/icons/crosshair";
    import FolderKanbanIcon from "@lucide/svelte/icons/folder-kanban";
    import { onMount } from "svelte";
    import { slide } from "svelte/transition";
    import { goto } from "$app/navigation";
    import { page } from "$app/stores";
    import { currentChord, formatChordParts, keyboardPrefs } from "$lib/shortcuts";
    import { projectLayersSearchHref, projectLayerHref, projectArtefactHref, projectLayersPlaceHref, entityLayersHref } from "$lib/project/entityLink";
    import {
        searchHref,
        formatBBox,
        formatDateSpan,
        formatLatLng,
        formatRadius,
        parseRadius,
        DEFAULT_SEARCH_RADIUS,
        type SearchBBox,
    } from "$lib/search/params";
    import { searchMergedPlaces } from "$lib/search/photon";
    import { labelMatchRank, type PlaceHit } from "$lib/search/placeHit";
    import {
        searchTerms,
        formatTermYears,
        periodSpatialQuery,
        pickPeriodPlace,
        type TermHit,
    } from "$lib/search/terms";
    import {
        searchOmnibox,
        searchProjectsByText,
        type ProjectHit,
    } from "$lib/search/projects";
    import {
        searchProjectScope,
        searchProjectLayers,
        searchProjectArtefacts,
        searchProjectEntities,
        listProjectColumns,
        type ArtefactHit,
        type ColumnHit,
        type EntityHit,
        type LayerHit,
        type ValueHit,
    } from "$lib/search/projectScope";
    import {
        SLASH_KINDS,
        ROW_OP_HINTS,
        displayLayerName,
        formatRowToken,
        harvestSlashLayers,
        harvestSlashRows,
        isNumericRowOp,
        mergeRowPredicates,
        parseRowDraft,
        parseRowPredicate,
        stripIncompleteSlashDraft,
        stripTrailingFilterToken,
        type RowPredicate,
        type SlashKindId,
    } from "$lib/search/queryTokens";
    import {
        clearImageQuery,
        loadImageQuery,
        postSimilarByImage,
        previewDataUrlFromFile,
        saveImageQuery,
    } from "$lib/search/imageQuery";
    import { browserThumbUrl } from "$lib/project/mediaUrl";
    import FilterChip from "$lib/components/search/FilterChip.svelte";
    import TermInspectButton from "$lib/components/search/TermInspectButton.svelte";

    type MentionMode =
        | "kinds"
        | "slash"
        | "tag"
        | "vocab"
        | "place"
        | "project"
        | "entity"
        | "layer"
        | "artefact"
        | "row";

    type KindItem = {
        kind: "kind";
        id: "tag" | "vocab" | "place" | "project" | "entity";
        label: string;
        hint: string;
    };
    type SlashItem = {
        kind: "slash";
        id: SlashKindId;
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
    type PeriodItem = { kind: "period"; hit: TermHit };
    type ConceptItem = { kind: "concept"; hit: TermHit };
    type ProjectItem = { kind: "project"; project: ProjectHit };
    type LayerItem = { kind: "layer"; layer: LayerHit };
    type ArtefactItem = { kind: "artefact"; artefact: ArtefactHit };
    type EntityItem = { kind: "entity"; entity: EntityHit };
    type CellItem = { kind: "cell"; cell: ValueHit };
    type RowColItem = { kind: "rowcol"; column: ColumnHit };
    type RowOpItem = {
        kind: "rowop";
        op: (typeof ROW_OP_HINTS)[number]["op"];
        label: string;
        hint: string;
    };
    type MenuItem =
        | KindItem
        | SlashItem
        | ValueItem
        | PlaceItem
        | PeriodItem
        | ConceptItem
        | ProjectItem
        | LayerItem
        | ArtefactItem
        | EntityItem
        | CellItem
        | RowColItem
        | RowOpItem;

    type Props = {
        value?: string;
        tags?: string[];
        vocabularies?: string[];
        /** Project slug chips (`?project=`). */
        projects?: string[];
        /** Titles for project chips, keyed by slug (from search results). */
        projectLabels?: Record<string, string>;
        /** Layer name chips (`?layer=`), project-scoped. */
        layers?: string[];
        /** `/row:` predicate tokens (`?row=`), project-scoped. */
        rows?: string[];
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
        /** ISO A2 country polygon (`?cc=`). */
        countryCode?: string | null;
        /** PeriodO ARK restored from `?term=` */
        termUri?: string | null;
        /** PeriodO prefLabel restored from `?period=` */
        periodLabel?: string | null;
        /** AAT URI restored from `?concept=` */
        conceptUri?: string | null;
        /** AAT prefLabel restored from `?subject=` */
        subjectLabel?: string | null;
        /** Opt-in closeMatch expansion (`?match=close`). */
        matchClose?: boolean;
        /** Opt-in narrower expansion (`?match=narrower`). */
        matchNarrower?: boolean;
        /** Combobox listbox id (overlay vs page to avoid duplicate ids). */
        listboxId?: string;
        /**
         * Command-palette host: always `goto` results (do not apply place
         * only to unbound local state).
         */
        palette?: boolean;
        /** Page host: chips expand in-flow so the pill and panel slide down. */
        bare?: boolean;
        /** True while typeahead is open — host should hide competing chrome. */
        suggesting?: boolean;
        class?: string;
    };

    let {
        value = $bindable(""),
        tags = [],
        vocabularies = [],
        projects = [],
        projectLabels = {},
        layers = [],
        rows = [],
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
        placeholder = "Search projects or places…  @ filters · # tag · /layer · /row",
        examples = [],
        shortcutHint = false,
        placeLabel = null,
        countryCode = $bindable(null),
        termUri = null,
        periodLabel = null,
        conceptUri = null,
        subjectLabel = null,
        matchClose = false,
        matchNarrower = false,
        listboxId = "search-mention-list",
        palette = false,
        bare = false,
        suggesting = $bindable(false),
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
            hint: "Project tag — also #",
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

    let hashMention = $state(false);
    let slashMention = $state(false);
    let mentionOpen = $state(false);
    let mentionMode = $state<MentionMode>("kinds");
    let mentionQuery = $state("");
    let highlight = $state(-1);
    let tagSuggestions = $state<string[]>([]);
    let termSuggestions = $state<string[]>([]);
    let placeHits = $state<PlaceHit[]>([]);
    let periodHits = $state.raw<TermHit[]>([]);
    let conceptHits = $state.raw<TermHit[]>([]);
    let projectHits = $state<ProjectHit[]>([]);
    let layerHits = $state<LayerHit[]>([]);
    let artefactHits = $state<ArtefactHit[]>([]);
    let entityHits = $state<EntityHit[]>([]);
    let cellHits = $state<ValueHit[]>([]);
    let columnHits = $state<ColumnHit[]>([]);
    let loading = $state(false);
    let loadingPlaces = $state(false);
    let debounceTimer: ReturnType<typeof setTimeout> | undefined;
    let placesTimer: ReturnType<typeof setTimeout> | undefined;
    let placesReq = 0;
    let mentionReq = 0;
    let periodApplyGen = 0;
    let placeChip = $state<{
        title: string;
        lat?: number;
        lng?: number;
    } | null>(null);
    const periodChip = $derived(
        periodLabel ? { title: periodLabel, uri: termUri ?? "" } : null,
    );
    const conceptChip = $derived(
        subjectLabel
            ? { title: subjectLabel, uri: conceptUri ?? "" }
            : null,
    );
    let pendingMatchURI = $state("");
    let pendingMatchClose = $state(false);
    let pendingMatchNarrower = $state(false);
    let appliedPlaceLabel = $state<string | null>(null);
    let projectChipTitles = $state<Record<string, string>>({});
    /** Mentions chipped locally (e.g. `@slug `) before Enter navigates. */
    let extraProjects = $state<string[]>([]);
    /** Hash-tag chips harvested locally (`#pottery `) before Enter. */
    let extraTags = $state<string[]>([]);
    /** `/layer:name` chips harvested locally before Enter. */
    let extraLayers = $state<string[]>([]);
    /** `/row:height>50` chips harvested locally before Enter. */
    let extraRows = $state<RowPredicate[]>([]);
    /** Auto-scope chips the user dismissed in the overlay. */
    let omittedProjects = $state<string[]>([]);
    let omittedLayers = $state<string[]>([]);
    let omittedRows = $state<string[]>([]);

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

    const activeTags = $derived(mergeSlugs(tags, extraTags));
    const activeVocabs = $derived(vocabularies);
    const activeLayers = $derived.by(() => {
        const omit = new Set(omittedLayers.map((s) => s.toLowerCase()));
        if (extraLayers.length > 0) {
            return extraLayers.filter((s) => !omit.has(s.toLowerCase())).slice(-1);
        }
        return layers.filter((s) => !omit.has(s.toLowerCase())).slice(-1);
    });
    const activeLayer = $derived(activeLayers[0] ?? null);
    const propRows = $derived(
        rows
            .map((raw) => parseRowPredicate(raw))
            .filter((p): p is RowPredicate => p != null),
    );
    const activeRows = $derived.by(() => {
        const omit = new Set(omittedRows.map((s) => s.toLowerCase()));
        const base = extraRows.length > 0 ? extraRows : propRows;
        return base.filter((p) => !omit.has(formatRowToken(p).toLowerCase()));
    });
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
        bbox != null || Boolean(countryCode) || (lat != null && lng != null),
    );
    const hasChips = $derived(
        hasImageChip ||
            hasSpatialChip ||
            Boolean(periodChip) ||
            Boolean(conceptChip) ||
            activeTags.length > 0 ||
            activeVocabs.length > 0 ||
            activeLayers.length > 0 ||
            activeRows.length > 0 ||
            activeProjects.length > 0,
    );
    const periodChipHint = $derived.by(() => {
        if (!periodChip) return "Period filter";
        const from =
            dateFrom === "" || dateFrom == null ? null : Number(dateFrom);
        const to = dateTo === "" || dateTo == null ? null : Number(dateTo);
        const span = formatDateSpan(
            from != null && Number.isFinite(from) ? from : null,
            to != null && Number.isFinite(to) ? to : null,
        );
        const bits = [periodChip.title];
        if (span) bits.push(span);
        return bits.join(" · ");
    });
    /** Chips use the same surface material as other chrome (glass / tinted / none). */
    const chipBtn =
        "surface inline-flex shrink-0 items-center gap-1 rounded-md border border-border px-1.5 py-0.5 text-[11px] font-medium text-foreground shadow-sm hover:bg-accent";
    const scopedSlug = $derived(
        activeProjects.length === 1 ? activeProjects[0]! : null,
    );
    const kindMenu = $derived(
        scopedSlug
            ? KINDS
            : KINDS.filter((k) => k.id !== "entity"),
    );
    const atSearch = $derived($page.url.pathname === "/");
    const cycling = $derived(examples.length > 0);
    const placesMenuOpen = $derived(
        !mentionOpen &&
            value.trim().length >= 2 &&
            (placeHits.length > 0 ||
                periodHits.length > 0 ||
                conceptHits.length > 0 ||
                projectHits.length > 0 ||
                layerHits.length > 0 ||
                artefactHits.length > 0 ||
                cellHits.length > 0 ||
                loadingPlaces),
    );
    const dropdownOpen = $derived(mentionOpen || placesMenuOpen);
    $effect(() => {
        suggesting = dropdownOpen;
    });
    let chipRow = $state<HTMLDivElement | null>(null);
    let chipFadeLeft = $state(false);
    let chipFadeRight = $state(false);

    function syncChipFade() {
        const el = chipRow;
        if (!el) {
            chipFadeLeft = false;
            chipFadeRight = false;
            return;
        }
        chipFadeLeft = el.scrollLeft > 2;
        chipFadeRight =
            el.scrollLeft + el.clientWidth < el.scrollWidth - 2;
    }

    function onChipWheel(e: WheelEvent) {
        const el = chipRow;
        if (!el || el.scrollWidth <= el.clientWidth) return;
        if (Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;
        e.preventDefault();
        el.scrollLeft += e.deltaY;
        syncChipFade();
    }

    $effect(() => {
        void activeTags.length;
        void activeVocabs.length;
        void activeLayers.length;
        void activeRows.length;
        void activeProjects.length;
        void hasImageChip;
        void hasSpatialChip;
        void periodChip;
        void conceptChip;
        const el = chipRow;
        if (!el) {
            chipFadeLeft = false;
            chipFadeRight = false;
            return;
        }
        syncChipFade();
        const ro = new ResizeObserver(syncChipFade);
        ro.observe(el);
        return () => ro.disconnect();
    });

    const paused = $derived(
        focused ||
            value.trim().length > 0 ||
            dropdownOpen ||
            hasImageChip ||
            hasSpatialChip ||
            Boolean(periodChip) ||
            Boolean(conceptChip) ||
            activeTags.length > 0 ||
            activeVocabs.length > 0 ||
            activeLayers.length > 0 ||
            activeRows.length > 0 ||
            activeProjects.length > 0,
    );
    const activePlaceholder = $derived(
        cycling ? (examples[exampleIndex] ?? placeholder) : placeholder,
    );
    const seedThumbUrl = $derived.by(() => {
        if (imageSession?.previewDataUrl) return imageSession.previewDataUrl;
        if (!activeMediaHash) return null;
        return browserThumbUrl(`/media/${activeMediaHash}`, {
            hash: activeMediaHash,
            accessToken,
        });
    });

    function placeItems(): PlaceItem[] {
        return placeHits.map((p) => ({ kind: "place" as const, place: p }));
    }

    function periodItems(): PeriodItem[] {
        return periodHits.map((hit) => ({ kind: "period" as const, hit }));
    }

    function conceptItems(): ConceptItem[] {
        return conceptHits.map((hit) => ({ kind: "concept" as const, hit }));
    }

    function periodSubtitle(hit: TermHit): string {
        const years = formatTermYears(hit);
        return [hit.spatial, years].filter(Boolean).join(" · ");
    }

    function conceptSubtitle(hit: TermHit): string {
        return hit.context || hit.kind.replaceAll("_", " ");
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

    function cellItems(): CellItem[] {
        return cellHits.map((c) => ({ kind: "cell" as const, cell: c }));
    }

    function rowItems(): MenuItem[] {
        const draft = parseRowDraft(mentionQuery);
        if (draft?.op) return [];
        const typed = mentionQuery.trim();
        const exact = columnHits.find(
            (c) => c.name.toLowerCase() === typed.toLowerCase(),
        );
        if (exact) {
            return ROW_OP_HINTS.map((o) => ({
                kind: "rowop" as const,
                op: o.op,
                label: o.label,
                hint: o.hint,
            }));
        }
        return columnHits.map((c) => ({
            kind: "rowcol" as const,
            column: c,
        }));
    }

    function omniboxItemLabel(item: MenuItem): string {
        if (item.kind === "place") return item.place.label;
        if (item.kind === "period") return item.hit.label;
        if (item.kind === "concept") return item.hit.label;
        if (item.kind === "project") return item.project.title;
        if (item.kind === "layer") return item.layer.label;
        if (item.kind === "artefact") return item.artefact.label;
        if (item.kind === "entity") return item.entity.id;
        if (item.kind === "cell") return item.cell.match;
        if (item.kind === "kind" || item.kind === "slash" || item.kind === "value") {
            return item.label;
        }
        return "";
    }

    function omniboxKindRank(item: MenuItem): number {
        if (item.kind === "place" && item.place.kind === "country") return 0;
        if (item.kind === "place" && item.place.kind === "admin") return 1;
        if (item.kind === "project" && item.project.via === "name") return 2;
        if (item.kind === "place") return 3;
        if (item.kind === "period" || item.kind === "concept") return 4;
        if (item.kind === "project") return 5;
        return 6;
    }

    function sortByCloseness(items: MenuItem[], q = value.trim()): MenuItem[] {
        return [...items].sort((a, b) => {
            const ra = labelMatchRank(q, omniboxItemLabel(a));
            const rb = labelMatchRank(q, omniboxItemLabel(b));
            if (ra !== rb) return ra - rb;
            return omniboxKindRank(a) - omniboxKindRank(b);
        });
    }

    function mixedOmniboxItems(): MenuItem[] {
        if (scopedSlug) {
            return sortByCloseness([
                ...layerItems(),
                ...artefactItems(),
                ...cellItems(),
                ...periodItems(),
                ...conceptItems(),
                ...placeItems(),
                ...projectItems("name"),
                ...projectItems("geo"),
            ]);
        }
        return sortByCloseness([
            ...projectItems("name"),
            ...periodItems(),
            ...conceptItems(),
            ...placeItems(),
            ...projectItems("geo"),
        ]);
    }

    const menuItems = $derived.by((): MenuItem[] => {
        if (!mentionOpen) return mixedOmniboxItems();
        if (mentionMode === "slash") {
            const q = mentionQuery.trim().toLowerCase();
            const kinds = q
                ? SLASH_KINDS.filter(
                      (k) =>
                          k.id.startsWith(q) ||
                          k.label.toLowerCase().startsWith(q),
                  )
                : [...SLASH_KINDS];
            const kindItems: SlashItem[] = kinds.map((k) => ({
                kind: "slash",
                id: k.id,
                label: k.label,
                hint: k.hint,
            }));
            if (q.length >= 2 && kinds.length === 0) {
                return sortByCloseness(
                    [
                        ...layerItems(),
                        ...entityItems(),
                        ...artefactItems(),
                        ...placeItems(),
                    ],
                    q,
                );
            }
            return [
                ...kindItems,
                ...(q.length >= 2
                    ? sortByCloseness(
                          [
                              ...layerItems(),
                              ...entityItems(),
                              ...artefactItems(),
                              ...placeItems(),
                          ],
                          q,
                      )
                    : []),
            ];
        }
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
            // Bare `@slug` (no kind prefix) — project hits first so Tab chips the project
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
        if (mentionMode === "layer") return layerItems();
        if (mentionMode === "artefact") return artefactItems();
        if (mentionMode === "row") return rowItems();
        return [
            ...conceptItems(),
            ...termSuggestions.map((t) => ({
                kind: "value" as const,
                id: `vocab:${t}`,
                label: t,
                mode: "vocab" as const,
            })),
        ];
    });

    function ghostFill(item: MenuItem): string | null {
        if (mentionOpen && hashMention) {
            const prefix = value.replace(/#[^\s]*$/, "");
            if (item.kind === "value" && item.mode === "tag") {
                return `${prefix}#${item.label}`;
            }
            return null;
        }
        if (mentionOpen && slashMention) {
            const prefix = value.replace(/\/[^\s]*$/, "");
            if (item.kind === "slash") return `${prefix}/${item.id}:`;
            if (item.kind === "layer") return `${prefix}/layer:${item.layer.name}`;
            if (item.kind === "entity") {
                return `${prefix}/entity:${item.entity.id}`;
            }
            if (item.kind === "artefact") {
                return `${prefix}/artefact:${item.artefact.hash}`;
            }
            if (item.kind === "place") {
                return `${prefix}/place:${item.place.label}`;
            }
            if (item.kind === "rowcol") {
                return `${prefix}/row:${item.column.name}`;
            }
            if (item.kind === "rowop") {
                const draft = parseRowDraft(mentionQuery);
                const col = draft?.column || mentionQuery.trim();
                if (!col) return null;
                return `${prefix}/row:${col}${item.op}`;
            }
            return null;
        }
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
            if (item.kind === "layer") return `${prefix}/layer:${item.layer.name}`;
            if (item.kind === "artefact") return `${prefix}${item.artefact.label}`;
            if (item.kind === "entity") return `${prefix}@entity:${item.entity.id}`;
            if (item.kind === "cell") return `${prefix}${item.cell.match}`;
            if (item.kind === "concept") return item.hit.label;
            return null;
        }
        if (item.kind === "place") return item.place.label;
        if (item.kind === "period") return item.hit.label;
        if (item.kind === "concept") return item.hit.label;
        if (item.kind === "project") return item.project.title;
        if (item.kind === "layer") return item.layer.label;
        if (item.kind === "artefact") return item.artefact.label;
        if (item.kind === "entity") return item.entity.id;
        if (item.kind === "cell") return item.cell.match;
        return null;
    }

    const ghostTarget = $derived.by((): MenuItem | null => {
        if (menuItems.length === 0) return null;
        if (highlight >= 0 && highlight < menuItems.length) {
            return menuItems[highlight]!;
        }
        return menuItems[0]!;
    });

    const ghostSuffix = $derived.by((): string | null => {
        if (!focused || !ghostTarget) return null;
        const fill = ghostFill(ghostTarget);
        if (!fill) return null;
        const typed = value;
        if (!typed) return null;
        if (!fill.toLowerCase().startsWith(typed.toLowerCase())) return null;
        if (fill.length <= typed.length) return null;
        return fill.slice(typed.length);
    });

    function caretToEnd() {
        queueMicrotask(() => {
            const el = inputEl;
            if (!el) return;
            el.focus({ preventScroll: true });
            const n = el.value.length;
            el.setSelectionRange(n, n);
        });
    }

    function onComposerTab(e: KeyboardEvent) {
        if (e.key !== "Tab" || e.shiftKey) return;
        if (e.isComposing) return;
        if (e.target !== inputEl) return;
        const listOpen = mentionOpen || placesMenuOpen;
        if (acceptCompletion()) {
            e.preventDefault();
            e.stopPropagation();
            return;
        }
        if (listOpen) {
            e.preventDefault();
            e.stopPropagation();
        }
    }

    /** Tab completes the ghost / highlighted token. Never navigates. */
    function acceptCompletion(): boolean {
        const item = ghostTarget;
        if (!item) return false;
        if (item.kind === "kind") {
            enterKind(item.id);
            return true;
        }
        if (item.kind === "slash") {
            enterSlashKind(item.id);
            return true;
        }
        if (item.kind === "layer") {
            const fill = ghostFill(item);
            const typed = value;
            const prefixOk =
                Boolean(fill) &&
                fill!.toLowerCase().startsWith(typed.toLowerCase());
            if (!mentionOpen && typed && !prefixOk) return false;
            chipLayer(item.layer.name);
            return true;
        }
        if (item.kind === "rowcol") {
            fillRowDraft(item.column.name);
            return true;
        }
        if (item.kind === "rowop") {
            const draft = parseRowDraft(mentionQuery);
            const col = draft?.column || mentionQuery.trim();
            if (!col) return false;
            fillRowDraft(`${col}${item.op}`);
            return true;
        }
        const fill = ghostFill(item);
        if (!fill) return false;
        if (
            !mentionOpen &&
            !fill.toLowerCase().startsWith(value.toLowerCase())
        ) {
            return false;
        }
        const chipable =
            (item.kind === "project" && mentionOpen) ||
            (item.kind === "value" && item.mode === "tag");
        value = chipable && !fill.endsWith(" ") ? `${fill} ` : fill;
        chipCompletedProjectMentions();
        chipCompletedHashTags();
        chipCompletedSlashLayers();
        chipCompletedSlashRows();
        syncMentionFromValue(value);
        if (!mentionOpen) schedulePlacesFetch(value);
        caretToEnd();
        return true;
    }

    let isMac = $state(false);
    const searchChordParts = $derived.by(() => {
        void keyboardPrefs.chords;
        return formatChordParts(currentChord("search-toggle"), isMac);
    });

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
                commitSearch();
                return;
            }

            // ⌘K / Ctrl+K is owned by SearchOverlay (root layout).
        };
        window.addEventListener("keydown", onGlobalKey, true);
        window.addEventListener("keydown", onComposerTab, true);

        return () => {
            mq.removeEventListener("change", syncMotion);
            window.removeEventListener("keydown", onGlobalKey, true);
            window.removeEventListener("keydown", onComposerTab, true);
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
        if (bbox || countryCode) {
            if (placeLabel && !placeChip) {
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

    const activeHighlight = $derived(
        highlight >= 0 && highlight < menuItems.length ? highlight : -1,
    );

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
        countryCode?: string | null;
        keepFocus?: boolean;
        rows?: RowPredicate[];
        dateFrom?: number | null;
        dateTo?: number | null;
        termUri?: string | null;
        periodLabel?: string | null;
        conceptUri?: string | null;
        subjectLabel?: string | null;
        matchClose?: boolean;
        matchNarrower?: boolean;
    }) {
        const nextBBox = next.bbox !== undefined ? next.bbox : bbox;
        const nextLat = next.lat !== undefined ? next.lat : lat;
        const nextLng = next.lng !== undefined ? next.lng : lng;
        const nextCountryCode =
            next.countryCode !== undefined ? next.countryCode : countryCode;
        const nextProjects = next.projects ?? activeProjects;
        const nextQ = next.q ?? value;
        const nextDateFrom =
            next.dateFrom !== undefined ? next.dateFrom : dateFrom;
        const nextDateTo = next.dateTo !== undefined ? next.dateTo : dateTo;
        const applyingDates =
            next.dateFrom !== undefined || next.dateTo !== undefined;
        const applyingPeriod =
            next.termUri !== undefined || next.periodLabel !== undefined;
        const applyingConcept =
            next.conceptUri !== undefined || next.subjectLabel !== undefined;
        const applyingMatch =
            next.matchClose !== undefined || next.matchNarrower !== undefined;
        const nextMatchClose =
            next.matchClose !== undefined
                ? next.matchClose
                : applyingConcept
                  ? false
                  : matchClose;
        const nextMatchNarrower =
            next.matchNarrower !== undefined
                ? next.matchNarrower
                : applyingConcept
                  ? false
                  : matchNarrower;
        if (
            nextProjects.length === 1 &&
            !applyingDates &&
            !applyingPeriod &&
            !applyingConcept &&
            !applyingMatch
        ) {
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
                        source: nextCountryCode ? "naturalearth" : "geonames",
                        kind: nextCountryCode ? "country" : "place",
                        label:
                            next.placeName !== undefined
                                ? (next.placeName ?? "")
                                : (placeChip?.title ?? ""),
                        detail: "",
                        geom,
                        cc: nextCountryCode ?? undefined,
                    }),
                );
                return;
            }
            void goto(
                projectLayersSearchHref(slug, nextQ, {
                    layer: activeLayer,
                    rows: next.rows ?? activeRows,
                }),
            );
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
                countryCode: nextCountryCode,
                dateFrom: nextDateFrom,
                dateTo: nextDateTo,
                termUri:
                    next.termUri !== undefined
                        ? next.termUri
                        : (periodChip?.uri || termUri || null),
                periodLabel:
                    next.periodLabel !== undefined
                        ? next.periodLabel
                        : (periodChip?.title ?? periodLabel ?? null),
                conceptUri:
                    next.conceptUri !== undefined
                        ? next.conceptUri
                        : (conceptChip?.uri || conceptUri || null),
                subjectLabel:
                    next.subjectLabel !== undefined
                        ? next.subjectLabel
                        : (conceptChip?.title ?? subjectLabel ?? null),
                matchClose: nextMatchClose,
                matchNarrower: nextMatchNarrower,
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
            { keepFocus: next.keepFocus !== false, noScroll: true },
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

    /** Strip the active @mention, #tag, or /filter token from the free-text query. */
    function stripMention(raw: string): string {
        return stripTrailingFilterToken(raw);
    }

    function closeMention() {
        mentionOpen = false;
        hashMention = false;
        slashMention = false;
        mentionMode = "kinds";
        mentionQuery = "";
        highlight = -1;
        tagSuggestions = [];
        termSuggestions = [];
        projectHits = [];
        layerHits = [];
        artefactHits = [];
        cellHits = [];
        entityHits = [];
        columnHits = [];
    }

    /** Drop typeahead I/O so Enter/Escape never leave the menu stuck on Loading… */
    function abortSuggestions() {
        clearTimeout(placesTimer);
        clearTimeout(debounceTimer);
        placesReq += 1;
        mentionReq += 1;
        loadingPlaces = false;
        loading = false;
        placeHits = [];
        periodHits = [];
        conceptHits = [];
        projectHits = [];
        layerHits = [];
        artefactHits = [];
        cellHits = [];
        entityHits = [];
        highlight = -1;
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

    function harvestHashTags(
        raw: string,
        opts?: { completedOnly?: boolean },
    ): { q: string; tags: string[] } {
        const found: string[] = [];
        const keepTrailingSpace = /\s$/.test(raw);
        const re = opts?.completedOnly
            ? /(^|\s)#([^\s#]+)(?=\s)/g
            : /(^|\s)#([^\s#]+)/g;
        const stripped = raw.replace(
            re,
            (full, lead: string, token: string) => {
                if (!token || token.includes(":")) return full;
                if (
                    !found.some(
                        (t) => t.toLowerCase() === token.toLowerCase(),
                    )
                ) {
                    found.push(token);
                }
                return lead;
            },
        );
        let q = stripped.replace(/\s+/g, " ").trim();
        if (keepTrailingSpace && q) q += " ";
        return { q, tags: found };
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

    function chipCompletedHashTags() {
        const harvested = harvestHashTags(value, { completedOnly: true });
        if (harvested.tags.length === 0) return;
        extraTags = mergeSlugs(extraTags, harvested.tags);
        if (harvested.q === value) return;
        value = harvested.q;
        closeMention();
    }

    function chipCompletedSlashLayers() {
        const harvested = harvestSlashLayers(value, { completedOnly: true });
        if (harvested.layers.length === 0) return;
        extraLayers = harvested.layers.slice(-1);
        omittedLayers = omittedLayers.filter(
            (s) =>
                !extraLayers.some(
                    (l) => l.toLowerCase() === s.toLowerCase(),
                ),
        );
        if (harvested.q === value) return;
        value = harvested.q;
        closeMention();
    }

    function chipCompletedSlashRows() {
        const harvested = harvestSlashRows(value, { completedOnly: true });
        if (harvested.rows.length === 0) return;
        extraRows = mergeRowPredicates(activeRows, harvested.rows);
        omittedRows = omittedRows.filter(
            (s) =>
                !harvested.rows.some(
                    (p) => formatRowToken(p).toLowerCase() === s.toLowerCase(),
                ),
        );
        if (harvested.q === value) return;
        value = harvested.q;
        closeMention();
    }

    function fillRowDraft(token: string) {
        value = value.replace(/(^|\s)\/?row:[^\s]*$/i, `$1/row:${token}`);
        if (!/\/row:/i.test(value)) {
            value = value.replace(/(^|\s)\/[^\s]*$/, `$1/row:${token}`);
        }
        syncMentionFromValue(value);
        caretToEnd();
    }

    function chipLayer(name: string) {
        extraLayers = [name];
        omittedLayers = omittedLayers.filter(
            (s) => s.toLowerCase() !== name.toLowerCase(),
        );
        const cleaned = stripMention(value);
        value = cleaned;
        closeMention();
        abortSuggestions();
        if (cleaned.trim().length >= 2) schedulePlacesFetch(cleaned);
        caretToEnd();
    }

    function commitSearch() {
        const harvested = harvestProjectMentions(value);
        rememberProjectHits(harvested.hits);
        const hashed = harvestHashTags(harvested.q);
        const slashed = harvestSlashLayers(hashed.q);
        const rowed = harvestSlashRows(slashed.q);
        const nextProjects = mergeSlugs(activeProjects, harvested.slugs);
        const nextTags = mergeSlugs(activeTags, hashed.tags);
        extraProjects = [];
        extraTags = [];
        if (slashed.layers.length > 0) extraLayers = slashed.layers.slice(-1);
        extraRows = mergeRowPredicates(activeRows, rowed.rows);
        omittedProjects = [];
        let nextQ = stripIncompleteSlashDraft(rowed.q);
        if (/^\/[a-z]*:?$/i.test(nextQ.trim())) nextQ = "";
        value = nextQ;
        closeMention();
        abortSuggestions();
        focused = false;
        inputEl?.blur();
        navigate({
            q: nextQ,
            projects: nextProjects,
            tags: nextTags,
            rows: extraRows.length > 0 ? extraRows : activeRows,
            keepFocus: false,
        });
    }

    function handleSubmit(e: SubmitEvent) {
        e.preventDefault();
        commitSearch();
    }

    function removeTag(tag: string) {
        extraTags = extraTags.filter(
            (t) => t.toLowerCase() !== tag.toLowerCase(),
        );
        const next = mergeSlugs(tags, extraTags).filter(
            (t) => t.toLowerCase() !== tag.toLowerCase(),
        );
        if (!palette) {
            navigate({ tags: next });
        }
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
            cellHits = [];
            extraLayers = [];
            extraRows = [];
        } else if (value.trim().length >= 2 && !mentionOpen) {
            schedulePlacesFetch(value);
        }
        if (!palette) {
            navigate({ projects: next });
        }
    }

    function removeLayer(name: string) {
        extraLayers = extraLayers.filter(
            (s) => s.toLowerCase() !== name.toLowerCase(),
        );
        if (layers.some((s) => s.toLowerCase() === name.toLowerCase())) {
            omittedLayers = mergeSlugs(omittedLayers, [name]);
        }
        if (value.trim().length >= 2 && !mentionOpen) {
            schedulePlacesFetch(value);
        }
        if (!palette && scopedSlug) {
            navigate({ q: value });
        }
    }

    function removeRow(pred: RowPredicate) {
        const key = formatRowToken(pred).toLowerCase();
        const next = activeRows.filter(
            (p) => formatRowToken(p).toLowerCase() !== key,
        );
        extraRows = next;
        if (propRows.some((p) => formatRowToken(p).toLowerCase() === key)) {
            omittedRows = mergeSlugs(omittedRows, [formatRowToken(pred)]);
        }
        if (scopedSlug) {
            navigate({ q: value, rows: next });
        }
    }

    function updateRow(pred: RowPredicate, nextValue: string): boolean {
        const trimmed = nextValue.trim();
        if (!trimmed) {
            removeRow(pred);
            return true;
        }
        if (isNumericRowOp(pred.op) && !Number.isFinite(Number(trimmed))) {
            return false;
        }
        const nextPred: RowPredicate = { ...pred, value: trimmed };
        const key = formatRowToken(pred).toLowerCase();
        const next = activeRows.map((p) =>
            formatRowToken(p).toLowerCase() === key ? nextPred : p,
        );
        extraRows = next;
        omittedRows = omittedRows.filter(
            (s) => s.toLowerCase() !== formatRowToken(nextPred).toLowerCase(),
        );
        if (scopedSlug) {
            navigate({ q: value, rows: next });
        }
        return true;
    }

    function updateRadius(raw: string): boolean {
        const next = parseRadius(raw, radius ?? DEFAULT_SEARCH_RADIUS);
        if (next == null) return false;
        radius = next;
        if (lat != null && lng != null) {
            navigate({ radius: next, lat, lng });
        }
        return true;
    }

    function updateTag(from: string, to: string): boolean {
        const nextVal = to.trim();
        if (!nextVal) {
            removeTag(from);
            return true;
        }
        extraTags = extraTags.map((t) =>
            t.toLowerCase() === from.toLowerCase() ? nextVal : t,
        );
        const next = activeTags.map((t) =>
            t.toLowerCase() === from.toLowerCase() ? nextVal : t,
        );
        navigate({ tags: next });
        return true;
    }

    function updateVocab(from: string, to: string): boolean {
        const nextVal = to.trim();
        if (!nextVal) {
            removeVocab(from);
            return true;
        }
        const next = activeVocabs.map((v) =>
            v.toLowerCase() === from.toLowerCase() ? nextVal : v,
        );
        navigate({ vocabularies: next });
        return true;
    }

    function applyTag(tag: string) {
        const next = [...activeTags];
        if (!next.some((t) => t.toLowerCase() === tag.toLowerCase())) {
            next.push(tag);
        }
        const cleaned = stripMention(value);
        value = cleaned;
        closeMention();
        abortSuggestions();
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
        abortSuggestions();
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
        abortSuggestions();
        navigate({
            q: cleaned,
            projects: mergeSlugs(activeProjects, [project.slug]),
        });
    }

    function applyPlace(place: PlaceHit) {
        closeMention();
        abortSuggestions();
        value = "";
        const geom = place.geom;
        const isCountry = place.kind === "country";
        countryCode = isCountry ? (place.cc ?? null) : null;
        if (isCountry) {
            bbox = null;
            lat = null;
            lng = null;
            placeChip = { title: place.label };
        } else if (geom.type === "bbox") {
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
                lat: isCountry || geom.type === "bbox" ? null : geom.lat,
                lng: isCountry || geom.type === "bbox" ? null : geom.lng,
                radius: isCountry || geom.type === "bbox" ? null : geom.radius,
                bbox: isCountry || geom.type !== "bbox" ? null : bbox,
                placeName: place.label,
                countryCode: isCountry ? (place.cc ?? null) : null,
            });
        }
        queueMicrotask(() => inputEl?.focus());
    }

    async function resolvePeriodPlace(
        spatial: string | undefined,
    ): Promise<PlaceHit | null> {
        const q = periodSpatialQuery(spatial);
        if (!q) return null;
        try {
            const places = await searchMergedPlaces(q, 8);
            return pickPeriodPlace(q, places);
        } catch {
            return null;
        }
    }

    async function applyPeriod(hit: TermHit) {
        closeMention();
        abortSuggestions();
        value = "";
        const hasDates = hit.start_year != null || hit.end_year != null;
        const spatialQ = periodSpatialQuery(hit.spatial);
        const gen = ++periodApplyGen;
        if (!hasDates && !spatialQ) {
            queueMicrotask(() => inputEl?.focus());
            return;
        }
        if ((atSearch || palette) && hasDates) {
            navigate({
                q: "",
                dateFrom: hit.start_year ?? null,
                dateTo: hit.end_year ?? null,
                termUri: hit.uri,
                periodLabel: hit.label,
            });
        }
        queueMicrotask(() => inputEl?.focus());
        const place = await resolvePeriodPlace(hit.spatial);
        if (gen !== periodApplyGen) return;
        const geom = place?.geom.type === "bbox" ? place.geom : null;
        if (!hasDates && !geom) return;
        if (geom && place) {
            const isCountry = place.kind === "country";
            countryCode = isCountry ? (place.cc ?? null) : null;
            if (isCountry) {
                bbox = null;
            } else {
                bbox = {
                    west: geom.west,
                    south: geom.south,
                    east: geom.east,
                    north: geom.north,
                };
            }
            lat = null;
            lng = null;
            placeChip = { title: place.label };
            appliedPlaceLabel = place.label;
        }
        if ((atSearch || palette) && geom && place) {
            navigate({
                q: "",
                dateFrom: hasDates ? (hit.start_year ?? null) : undefined,
                dateTo: hasDates ? (hit.end_year ?? null) : undefined,
                lat: null,
                lng: null,
                radius: null,
                bbox: place.kind === "country" ? null : geom,
                placeName: place.label,
                countryCode: place.kind === "country" ? (place.cc ?? null) : null,
                termUri: hit.uri,
                periodLabel: hit.label,
            });
        }
    }

    function applyConcept(hit: TermHit) {
        closeMention();
        abortSuggestions();
        value = "";
        const pending = pendingMatchURI === hit.uri;
        if (atSearch || palette) {
            navigate({
                q: "",
                conceptUri: hit.hub_uri || hit.uri,
                subjectLabel: hit.label,
                matchClose: pending ? pendingMatchClose : false,
                matchNarrower: pending ? pendingMatchNarrower : false,
            });
        }
        pendingMatchURI = "";
        pendingMatchClose = false;
        pendingMatchNarrower = false;
        queueMicrotask(() => inputEl?.focus());
    }

    function removeConcept() {
        if (atSearch) {
            navigate({
                conceptUri: null,
                subjectLabel: null,
                matchClose: false,
                matchNarrower: false,
            });
        }
        pendingMatchURI = "";
        pendingMatchClose = false;
        pendingMatchNarrower = false;
    }

    function removePeriod() {
        if (atSearch) {
            navigate({
                dateFrom: null,
                dateTo: null,
                termUri: null,
                periodLabel: null,
            });
        }
    }

    function applyProject(project: ProjectHit) {
        closeMention();
        abortSuggestions();
        value = "";
        void goto(`/${project.slug}`);
    }

    function removeSpatial() {
        placeChip = null;
        appliedPlaceLabel = placeLabel;
        bbox = null;
        lat = null;
        lng = null;
        countryCode = null;
        radius = DEFAULT_SEARCH_RADIUS;
        if (atSearch) {
            navigate({
                lat: null,
                lng: null,
                radius: null,
                bbox: null,
                placeName: null,
                countryCode: null,
            });
        }
    }

    function enterKind(id: "tag" | "vocab" | "place" | "project" | "entity") {
        mentionMode = id;
        mentionQuery = "";
        highlight = -1;
        slashMention = false;
        hashMention = false;
        // Rewrite the in-progress mention so further typing filters that kind
        value = value.replace(/(^|\s)@[^\s]*$/, `$1@${id}:`);
        tagSuggestions = [];
        termSuggestions = [];
        if (id !== "place") placeHits = [];
        projectHits = [];
        caretToEnd();
    }

    function enterSlashKind(id: SlashKindId) {
        slashMention = true;
        hashMention = false;
        highlight = -1;
        mentionQuery = "";
        mentionMode =
            id === "place"
                ? "place"
                : id === "entity"
                  ? "entity"
                  : id;
        mentionOpen = true;
        value = value.replace(/(^|\s)\/[^\s]*$/, `$1/${id}:`);
        tagSuggestions = [];
        termSuggestions = [];
        if (id !== "place") placeHits = [];
        if (id !== "layer") layerHits = [];
        if (id !== "artefact") artefactHits = [];
        if (id !== "entity") entityHits = [];
        if (id !== "row") columnHits = [];
        projectHits = [];
        if (scopedSlug && (id === "layer" || id === "artefact" || id === "row")) {
            scheduleFetch();
        }
        caretToEnd();
    }

    function selectItem(item: MenuItem) {
        if (item.kind === "kind") {
            enterKind(item.id);
            return;
        }
        if (item.kind === "slash") {
            enterSlashKind(item.id);
            return;
        }
        if (item.kind === "place") {
            applyPlace(item.place);
            return;
        }
        if (item.kind === "period") {
            void applyPeriod(item.hit);
            return;
        }
        if (item.kind === "concept") {
            applyConcept(item.hit);
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
        if (item.kind === "cell") {
            if (!scopedSlug) return;
            void goto(
                entityLayersHref(scopedSlug, {
                    layer: item.cell.layer,
                    highlight: item.cell.id,
                    view: "map",
                }),
            );
            return;
        }
        if (item.kind === "rowcol") {
            fillRowDraft(item.column.name);
            return;
        }
        if (item.kind === "rowop") {
            const draft = parseRowDraft(mentionQuery);
            const col = draft?.column || mentionQuery.trim();
            if (!col) return;
            fillRowDraft(`${col}${item.op}`);
            return;
        }
        if (item.mode === "tag") applyTag(item.label);
        else applyVocab(item.label);
    }

    /**
     * Parse the trailing @token, #tag, or /filter from the main input.
     * Forms: `@` | `@pot` | `@tag:pot` | `#` | `#pot` | `/` | `/layer:trenches`
     */
    function syncMentionFromValue(raw: string) {
        const at = /(^|\s)@([^\s]*)$/.exec(raw);
        const hash = /(^|\s)#([^\s]*)$/.exec(raw);
        const slash = scopedSlug ? /(^|\s)\/([^\s]*)$/.exec(raw) : null;
        const bareRow = scopedSlug
            ? /(^|\s)row:([^\s]*)$/i.exec(raw)
            : null;
        const atIdx = at?.index ?? -1;
        const hashIdx = hash?.index ?? -1;
        const slashIdx = slash?.index ?? -1;
        const bareRowIdx =
            slashIdx >= 0 && slash![2]?.toLowerCase().startsWith("row")
                ? -1
                : (bareRow?.index ?? -1);
        const last = Math.max(atIdx, hashIdx, slashIdx, bareRowIdx);
        if (last < 0) {
            if (mentionOpen) closeMention();
            return;
        }

        if (!mentionOpen) {
            highlight = -1;
            placesReq += 1;
            clearTimeout(placesTimer);
        }
        mentionOpen = true;

        if (bareRowIdx === last) {
            hashMention = false;
            slashMention = true;
            mentionMode = "row";
            mentionQuery = bareRow![2] ?? "";
            scheduleFetch();
            return;
        }

        if (slashIdx === last) {
            hashMention = false;
            slashMention = true;
            const token = slash![2] ?? "";
            const lower = token.toLowerCase();
            if (lower.startsWith("layer:")) {
                mentionMode = "layer";
                mentionQuery = token.slice(6);
                scheduleFetch();
                return;
            }
            if (lower.startsWith("entity:")) {
                mentionMode = "entity";
                mentionQuery = token.slice(7);
                scheduleFetch();
                return;
            }
            if (
                lower.startsWith("artefact:") ||
                lower.startsWith("artifact:")
            ) {
                mentionMode = "artefact";
                mentionQuery = token.slice(token.indexOf(":") + 1);
                scheduleFetch();
                return;
            }
            if (lower.startsWith("place:")) {
                mentionMode = "place";
                mentionQuery = token.slice(6);
                scheduleFetch();
                return;
            }
            if (lower.startsWith("row:")) {
                mentionMode = "row";
                mentionQuery = token.slice(4);
                scheduleFetch();
                return;
            }
            mentionMode = "slash";
            mentionQuery = token;
            if (token.length >= 2) scheduleFetch();
            else {
                layerHits = [];
                artefactHits = [];
                entityHits = [];
                placeHits = [];
            }
            return;
        }

        slashMention = false;

        if (hashIdx === last) {
            hashMention = true;
            mentionMode = "tag";
            mentionQuery = hash![2] ?? "";
            scheduleFetch();
            return;
        }

        hashMention = false;
        const token = at![2] ?? "";
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
        chipCompletedHashTags();
        chipCompletedSlashLayers();
        chipCompletedSlashRows();
        syncMentionFromValue(value);
        if (!mentionOpen) schedulePlacesFetch(value);
        else {
            clearTimeout(placesTimer);
            if (
                mentionMode !== "place" &&
                mentionMode !== "kinds" &&
                mentionMode !== "slash"
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
                mentionMode !== "kinds" &&
                mentionMode !== "slash"
            ) {
                entityHits = [];
            }
            if (
                mentionMode !== "layer" &&
                mentionMode !== "slash"
            ) {
                layerHits = [];
            }
            if (
                mentionMode !== "artefact" &&
                mentionMode !== "slash"
            ) {
                artefactHits = [];
            }
            if (mentionMode !== "row") {
                columnHits = [];
            }
        }
    }

    function popLastChip() {
        if (hasSpatialChip) {
            removeSpatial();
            return;
        }
        if (periodChip) {
            removePeriod();
            return;
        }
        if (conceptChip) {
            removeConcept();
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
        if (activeRows.length > 0) {
            removeRow(activeRows[activeRows.length - 1]!);
            return;
        }
        if (activeLayers.length > 0) {
            removeLayer(activeLayers[activeLayers.length - 1]!);
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
                Boolean(periodChip) ||
                Boolean(conceptChip) ||
                activeTags.length > 0 ||
                activeVocabs.length > 0 ||
                activeLayers.length > 0 ||
                activeRows.length > 0 ||
                activeProjects.length > 0 ||
                hasImageChip)
        ) {
            e.preventDefault();
            popLastChip();
            return;
        }

        const listOpen = mentionOpen || placesMenuOpen;

        if (e.key === "Tab" && !e.shiftKey) {
            // Capture handler `onComposerTab` owns Tab (beats dialog focus trap).
            return;
        }

        if (e.key === "Enter" && !e.repeat && !e.metaKey && !e.ctrlKey && !e.altKey) {
            if (e.isComposing) return;
            e.preventDefault();
            if (activeHighlight >= 0) {
                const item = menuItems[activeHighlight];
                if (item) {
                    selectItem(item);
                    return;
                }
            }
            commitSearch();
            return;
        }

        if (e.key === "Escape") {
            if (ghostSuffix || listOpen) {
                e.preventDefault();
                e.stopPropagation();
            }
            if (mentionOpen) {
                value = stripMention(value);
                closeMention();
                abortSuggestions();
                return;
            }
            if (listOpen) {
                abortSuggestions();
            }
            return;
        }

        if (!listOpen) return;

        if (e.key === "ArrowDown") {
            e.preventDefault();
            if (menuItems.length === 0) return;
            highlight =
                activeHighlight + 1 >= menuItems.length
                    ? -1
                    : activeHighlight + 1;
            return;
        }

        if (e.key === "ArrowUp") {
            e.preventDefault();
            if (menuItems.length === 0) return;
            highlight =
                activeHighlight <= -1
                    ? menuItems.length - 1
                    : activeHighlight - 1;
            return;
        }
    }

    function schedulePlacesFetch(raw: string) {
        clearTimeout(placesTimer);
        const prefix = raw.trim();
        if (prefix.length < 2) {
            placesReq += 1;
            placeHits = [];
            periodHits = [];
            conceptHits = [];
            projectHits = [];
            layerHits = [];
            artefactHits = [];
            cellHits = [];
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
            const [omnibox, scoped, periods, concepts] = await Promise.all([
                searchOmnibox(prefix, { accessToken }),
                slug
                    ? searchProjectScope(slug, prefix, {
                          accessToken,
                          layer: activeLayer,
                      })
                    : Promise.resolve({ layers: [], artefacts: [], values: [] }),
                searchTerms(prefix, { kind: "period", limit: 8 }),
                searchTerms(prefix, { kind: "concept", limit: 8 }),
            ]);
            if (req !== placesReq) return;
            placeHits = omnibox.places;
            periodHits = periods;
            conceptHits = concepts;
            projectHits = slug
                ? omnibox.projects.filter(
                      (p) => p.slug.toLowerCase() !== slug.toLowerCase(),
                  )
                : omnibox.projects;
            layerHits = scoped.layers;
            artefactHits = scoped.artefacts;
            cellHits = scoped.values;
        } catch {
            if (req !== placesReq) return;
            placeHits = [];
            periodHits = [];
            conceptHits = [];
            projectHits = [];
            layerHits = [];
            artefactHits = [];
            cellHits = [];
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
        const wantSlashHits = mentionMode === "slash";
        const wantTags = mentionMode === "tag" || mentionMode === "kinds";
        const wantTerms = mentionMode === "vocab" || mentionMode === "kinds";
        const wantConcepts = mentionMode === "vocab";
        const wantPlaces =
            mentionMode === "place" ||
            mentionMode === "kinds" ||
            wantSlashHits;
        const wantProjects =
            mentionMode === "project" || mentionMode === "kinds";
        const wantEntities =
            Boolean(scopedSlug) &&
            (mentionMode === "entity" ||
                mentionMode === "kinds" ||
                wantSlashHits);
        const wantLayers =
            Boolean(scopedSlug) &&
            (mentionMode === "layer" || wantSlashHits);
        const wantArtefacts =
            Boolean(scopedSlug) &&
            (mentionMode === "artefact" || wantSlashHits);
        const wantColumns =
            Boolean(scopedSlug) && mentionMode === "row";

        if (
            !prefix &&
            mentionMode !== "layer" &&
            mentionMode !== "artefact" &&
            mentionMode !== "row"
        ) {
            mentionReq += 1;
            tagSuggestions = [];
            termSuggestions = [];
            if (mentionMode === "place") placeHits = [];
            if (mentionMode === "project") projectHits = [];
            if (mentionMode === "entity") entityHits = [];
            if (mentionMode === "vocab") conceptHits = [];
            return;
        }

        loading = true;
        const req = ++mentionReq;
        try {
            const jobs: Promise<void>[] = [];
            if (wantTags && prefix) {
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
            if (wantTerms && prefix) {
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
            if (wantConcepts && prefix.length >= 2) {
                jobs.push(
                    (async () => {
                        conceptHits = await searchTerms(prefix, {
                            kind: "concept",
                            limit: 8,
                        });
                    })(),
                );
            } else if (mentionMode === "vocab") {
                conceptHits = [];
            }
            if (wantPlaces && prefix.length >= 2) {
                jobs.push(
                    (async () => {
                        placeHits = await searchMergedPlaces(prefix, 10);
                    })(),
                );
            } else if (mentionMode === "place" || wantSlashHits) {
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
            if (
                wantEntities &&
                (mentionMode === "entity" || prefix.length >= 2)
            ) {
                jobs.push(
                    (async () => {
                        const hits = await searchProjectEntities(
                            scopedSlug!,
                            prefix,
                            { accessToken, layer: activeLayer },
                        );
                        entityHits = hits;
                    })(),
                );
            } else if (mentionMode === "entity") {
                entityHits = [];
            }
            if (wantLayers) {
                jobs.push(
                    (async () => {
                        const hits = await searchProjectLayers(
                            scopedSlug!,
                            prefix,
                            {
                                accessToken,
                                minLength: 0,
                                limit: 8,
                                layer:
                                    mentionMode === "layer"
                                        ? null
                                        : activeLayer,
                            },
                        );
                        layerHits = hits;
                    })(),
                );
            } else if (mentionMode !== "kinds") {
                layerHits = [];
            }
            if (wantArtefacts) {
                jobs.push(
                    (async () => {
                        const hits = await searchProjectArtefacts(
                            scopedSlug!,
                            prefix,
                            {
                                accessToken,
                                minLength: 0,
                                limit: 8,
                                layer: activeLayer,
                            },
                        );
                        artefactHits = hits;
                    })(),
                );
            } else if (mentionMode !== "kinds") {
                artefactHits = [];
            }
            if (wantColumns) {
                jobs.push(
                    (async () => {
                        const draft = parseRowDraft(prefix);
                        const colQ = draft?.op ? draft.column : prefix;
                        const hits = await listProjectColumns(
                            scopedSlug!,
                            colQ,
                            {
                                accessToken,
                                limit: 12,
                                layer: activeLayer,
                            },
                        );
                        columnHits = hits;
                    })(),
                );
            } else if (mentionMode !== "kinds") {
                columnHits = [];
            }
            await Promise.all(jobs);
        } catch {
            if (wantTags) tagSuggestions = [];
            if (wantTerms) termSuggestions = [];
            if (wantConcepts) conceptHits = [];
            if (wantPlaces) placeHits = [];
            if (wantProjects) projectHits = [];
            if (wantEntities) entityHits = [];
            if (wantLayers) layerHits = [];
            if (wantArtefacts) artefactHits = [];
            if (wantColumns) columnHits = [];
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
                abortSuggestions();
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
        class="relative flex w-full shrink-0 flex-col overflow-visible"
        ondragover={onDragOver}
        ondragleave={onDragLeave}
        ondrop={onDrop}
        onpaste={onPaste}
    >
        {#if hasChips}
            <div
                class="search-chip-tray mb-1.5"
                transition:slide={{
                    duration: reduceMotion ? 0 : 200,
                    axis: "y",
                }}
            >
                <div
                    bind:this={chipRow}
                    onscroll={syncChipFade}
                    onwheel={onChipWheel}
                    class="chip-scroller flex min-h-7 w-full flex-nowrap items-center gap-1"
                    style:--chip-fade-left={chipFadeLeft ? "1.25rem" : "0px"}
                    style:--chip-fade-right={chipFadeRight ? "1.25rem" : "0px"}
                >
                    {#if hasImageChip}
                        <button
                            type="button"
                            tabindex="-1"
                            class={chipBtn}
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
                                <ImageIcon class="size-3 text-muted-foreground" />
                            {/if}
                            <XIcon class="size-3 text-muted-foreground" />
                        </button>
                    {/if}
                    {#if bbox}
                        <button
                            type="button"
                            tabindex="-1"
                            class="{chipBtn} max-w-[16rem]"
                            onclick={removeSpatial}
                            title="Remove map area filter"
                        >
                            {#if placeChip}
                                <GlobeIcon class="size-3 text-muted-foreground" />
                                <span class="truncate">{placeChip.title}</span>
                            {:else}
                                <MapIcon class="size-3 text-muted-foreground" />
                                <span class="truncate tabular-nums"
                                    >{formatLatLng(bbox.south, bbox.west)}
                                    → {formatLatLng(bbox.north, bbox.east)}</span
                                >
                            {/if}
                            <XIcon class="size-3 text-muted-foreground" />
                        </button>
                    {:else if countryCode}
                        <button
                            type="button"
                            tabindex="-1"
                            class="{chipBtn} max-w-[16rem]"
                            onclick={removeSpatial}
                            title="Remove country filter"
                        >
                            <GlobeIcon class="size-3 text-muted-foreground" />
                            <span class="truncate">{placeChip?.title || countryCode}</span>
                            <XIcon class="size-3 text-muted-foreground" />
                        </button>
                    {:else if lat != null && lng != null}
                        <FilterChip
                            class="{chipBtn} max-w-[16rem]"
                            label={placeChip?.title ?? ""}
                            value={formatRadius(radius ?? DEFAULT_SEARCH_RADIUS)}
                            title="Distance from point"
                            onCommit={updateRadius}
                            onRemove={removeSpatial}
                        >
                            {#if placeChip}
                                <GlobeIcon class="size-3 shrink-0 text-muted-foreground" />
                            {:else}
                                <CrosshairIcon class="size-3 shrink-0 text-muted-foreground" />
                            {/if}
                        </FilterChip>
                    {/if}
                    {#if periodChip}
                        <span class="{chipBtn} max-w-[16rem] pr-0.5">
                            <TermInspectButton
                                uri={termUri || periodChip.uri}
                                label={periodChip.title}
                                class="min-w-0 max-w-[13rem] hover:bg-transparent"
                            >
                                <CalendarRangeIcon
                                    class="size-3 shrink-0 text-muted-foreground"
                                />
                                <span class="truncate">{periodChip.title}</span>
                            </TermInspectButton>
                            <button
                                type="button"
                                tabindex="-1"
                                class="inline-flex items-center"
                                onclick={removePeriod}
                                title={periodChipHint}
                            >
                                <XIcon class="size-3 text-muted-foreground" />
                            </button>
                        </span>
                    {/if}
                    {#if conceptChip}
                        <span class="{chipBtn} max-w-[16rem] pr-0.5">
                            <TermInspectButton
                                uri={conceptChip.uri}
                                label={conceptChip.title}
                                title="Inspect subject"
                                class="min-w-0 max-w-[13rem] hover:bg-transparent"
                                allowMatch
                                {matchClose}
                                {matchNarrower}
                                onMatchChange={(next) =>
                                    navigate({
                                        matchClose: next.close,
                                        matchNarrower: next.narrower,
                                    })}
                            >
                                <BookMarkedIcon
                                    class="size-3 shrink-0 text-muted-foreground"
                                />
                                <span class="truncate">{conceptChip.title}</span>
                            </TermInspectButton>
                            <button
                                type="button"
                                tabindex="-1"
                                class="inline-flex items-center"
                                onclick={removeConcept}
                                title="Remove subject filter"
                            >
                                <XIcon class="size-3 text-muted-foreground" />
                            </button>
                        </span>
                    {/if}
                    {#each activeTags as tag (tag.toLowerCase())}
                        <FilterChip
                            class={chipBtn}
                            label="#"
                            value={tag}
                            title="Tag filter"
                            onCommit={(next) => updateTag(tag, next)}
                            onRemove={() => removeTag(tag)}
                        />
                    {/each}
                    {#each activeVocabs as v (v.toLowerCase())}
                        <FilterChip
                            class="{chipBtn} max-w-[16rem]"
                            value={v}
                            title="Mapped-term filter"
                            onCommit={(next) => updateVocab(v, next)}
                            onRemove={() => removeVocab(v)}
                        >
                            <BookMarkedIcon class="size-3 shrink-0 text-muted-foreground" />
                        </FilterChip>
                    {/each}
                    {#each activeLayers as name (name.toLowerCase())}
                        <button
                            type="button"
                            tabindex="-1"
                            class="{chipBtn} max-w-[16rem]"
                            onclick={() => removeLayer(name)}
                            title="Remove layer filter"
                        >
                            <LayersIcon class="size-3 shrink-0 text-muted-foreground" />
                            <span class="truncate">{displayLayerName(name)}</span>
                            <XIcon class="size-3 text-muted-foreground" />
                        </button>
                    {/each}
                    {#each activeRows as pred (formatRowToken(pred).toLowerCase())}
                        <FilterChip
                            class="{chipBtn} max-w-[18rem]"
                            label="{displayLayerName(pred.column)} {pred.op === "~" ? "?" : pred.op}"
                            value={pred.value}
                            title="Column filter"
                            onCommit={(next) => updateRow(pred, next)}
                            onRemove={() => removeRow(pred)}
                        >
                            <Table2Icon class="size-3 shrink-0 text-muted-foreground" />
                        </FilterChip>
                    {/each}
                    {#each activeProjects as slug (slug.toLowerCase())}
                        <button
                            type="button"
                            tabindex="-1"
                            class="{chipBtn} max-w-[16rem]"
                            onclick={() => removeProject(slug)}
                            title="Remove project filter"
                        >
                            <FolderKanbanIcon class="size-3 shrink-0 text-muted-foreground" />
                            <span class="truncate">{projectChipLabel(slug)}</span>
                            <XIcon class="size-3 text-muted-foreground" />
                        </button>
                    {/each}
                </div>
            </div>
        {/if}
        <div
            class="search-vt-bar relative z-10 flex w-full min-h-11 items-center rounded-xl border border-border py-1.5 pl-10 pr-12 surface shadow-lg focus-within:border-primary {dragOver
                ? 'ring-2 ring-primary/40'
                : ''} {klass}"
            onclick={() => inputEl?.focus()}
        >
        <SearchIcon
            class="pointer-events-none absolute left-3.5 top-1/2 z-10 size-4 -translate-y-1/2 text-muted-foreground"
        />
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
                    activeLayers.length > 0 ||
                    activeRows.length > 0 ||
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
        {#if shortcutHint && !focused && !hasSpatialChip && activeTags.length === 0 && activeVocabs.length === 0 && activeLayers.length === 0 && activeRows.length === 0 && activeProjects.length === 0}
            <span
                class="pointer-events-none absolute right-11 top-1/2 z-10 flex -translate-y-1/2 items-center gap-0.5 text-[10px] text-muted-foreground/80"
                aria-hidden="true"
            >
                {#each searchChordParts as part, i (i)}
                <kbd
                    class="rounded border border-border bg-background/80 px-1.5 py-0.5 font-sans dark:bg-background/40"
                    >{part}</kbd
                >
                {/each}
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
                class="surface absolute left-0 right-0 top-full z-[1100] mt-1 overflow-hidden rounded-xl border border-border shadow-lg"
                transition:slide={{
                    duration: reduceMotion ? 0 : 220,
                    axis: "y",
                }}
            >
                {#if mentionOpen}
                    <div
                        class="border-b border-border px-3 py-1.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground"
                    >
                        {#if mentionMode === "kinds" && mentionOpen}
                            Add filter
                        {:else if mentionMode === "slash" && mentionOpen}
                            In this project
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
                        {:else if mentionMode === "layer" && mentionOpen}
                            Layer
                        {:else if mentionMode === "artefact" && mentionOpen}
                            Artefact
                        {:else if mentionMode === "row" && mentionOpen}
                            Column
                        {:else if scopedSlug}
                            Layers, values & places
                        {:else}
                            Projects & places
                        {/if}
                    </div>
                {/if}
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
                            {:else if mentionMode === "layer"}
                                {mentionQuery
                                    ? "No matching layers"
                                    : "Keep typing a layer…"}
                            {:else if mentionMode === "artefact"}
                                {mentionQuery
                                    ? "No matching artefacts"
                                    : "Keep typing an artefact…"}
                            {:else if mentionMode === "row"}
                                {parseRowDraft(mentionQuery)?.op &&
                                !parseRowDraft(mentionQuery)?.value
                                    ? "Type a value, then space or Enter"
                                    : parseRowDraft(mentionQuery)?.op
                                      ? "Enter to apply this filter"
                                      : mentionQuery
                                        ? "No matching columns"
                                        : "Choose a column"}
                            {:else if mentionMode === "slash"}
                                Type to filter, or choose Layer / Row / Entity / Artefact / Place
                            {:else}
                                Type to filter, or choose Place / Project / Tag / Vocab
                            {/if}
                        </p>
                    {:else}
                        {#each menuItems as item, i (item.kind === "period"
                            ? `period:${item.hit.uri}`
                            : item.kind === "concept"
                            ? `concept:${item.hit.uri}`
                            : item.kind === "place"
                            ? `place:${item.place.id}`
                            : item.kind === "project"
                              ? `project:${item.project.slug}`
                              : item.kind === "layer"
                                ? `layer:${item.layer.name}`
                                : item.kind === "artefact"
                                  ? `artefact:${item.artefact.hash}`
                                  : item.kind === "entity"
                                    ? `entity:${item.entity.layer}:${item.entity.id}`
                                    : item.kind === "cell"
                                      ? `cell:${item.cell.layer}:${item.cell.id}:${item.cell.column}`
                                      : item.kind === "slash"
                                        ? `slash:${item.id}`
                                        : item.kind === "rowcol"
                                          ? `rowcol:${item.column.name}`
                                          : item.kind === "rowop"
                                            ? `rowop:${item.op}`
                                            : `${item.kind}:${item.id}`)}
                            {#if item.kind === "period" || item.kind === "concept"}
                                <div
                                    role="group"
                                    class="flex w-full items-center gap-0.5 rounded-lg {i ===
                                    activeHighlight
                                        ? 'selected'
                                        : 'hover:bg-muted/70'}"
                                    onmouseenter={() => (highlight = i)}
                                >
                                    <button
                                        type="button"
                                        role="option"
                                        aria-selected={i === activeHighlight}
                                        class="flex min-w-0 flex-1 items-center gap-2.5 px-2.5 py-2 text-left text-sm"
                                        in:slide={{
                                            duration: reduceMotion ? 0 : 160,
                                            delay: reduceMotion
                                                ? 0
                                                : Math.min(i, 8) * 24,
                                            axis: "y",
                                        }}
                                        onmousedown={(e) => e.preventDefault()}
                                        onclick={() => selectItem(item)}
                                    >
                                        {#if item.kind === "period"}
                                            <CalendarRangeIcon
                                                class="size-3.5 shrink-0 text-muted-foreground"
                                            />
                                            <span class="min-w-0 flex-1">
                                                <span class="font-medium"
                                                    >{item.hit.label}</span
                                                >
                                                <span
                                                    class="mt-0.5 block truncate text-[11px] text-muted-foreground"
                                                    >{periodSubtitle(item.hit) ||
                                                        "Period"}</span
                                                >
                                            </span>
                                        {:else}
                                            <BookMarkedIcon
                                                class="size-3.5 shrink-0 text-muted-foreground"
                                            />
                                            <span class="min-w-0 flex-1">
                                                <span class="font-medium"
                                                    >{item.hit.label}</span
                                                >
                                                <span
                                                    class="mt-0.5 block truncate text-[11px] text-muted-foreground"
                                                    >{conceptSubtitle(
                                                        item.hit,
                                                    ) || "Concept"}</span
                                                >
                                            </span>
                                        {/if}
                                    </button>
                                    <TermInspectButton
                                        uri={item.hit.uri}
                                        label={item.hit.label}
                                        class="mr-1.5"
                                        allowMatch={item.kind !== "period"}
                                        matchClose={
                                            pendingMatchURI === item.hit.uri
                                                ? pendingMatchClose
                                                : false
                                        }
                                        matchNarrower={
                                            pendingMatchURI === item.hit.uri
                                                ? pendingMatchNarrower
                                                : false
                                        }
                                        onOpen={(inspectUri) => {
                                            pendingMatchURI = inspectUri;
                                            pendingMatchClose = false;
                                            pendingMatchNarrower = false;
                                        }}
                                        onMatchChange={(next) => {
                                            pendingMatchURI = item.hit.uri;
                                            pendingMatchClose = next.close;
                                            pendingMatchNarrower = next.narrower;
                                        }}
                                    />
                                </div>
                            {:else}
                            <button
                                type="button"
                                role="option"
                                aria-selected={i === activeHighlight}
                                class="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm {i ===
                                activeHighlight
                                    ? 'selected'
                                    : 'hover:bg-muted/70'}"
                                in:slide={{
                                    duration: reduceMotion ? 0 : 160,
                                    delay: reduceMotion
                                        ? 0
                                        : Math.min(i, 8) * 24,
                                    axis: "y",
                                }}
                                onmousedown={(e) => e.preventDefault()}
                                onmouseenter={() => (highlight = i)}
                                onclick={() => selectItem(item)}
                            >
                                {#if item.kind === "kind" || item.kind === "slash"}
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
                                    {:else if item.id === "layer"}
                                        <LayersIcon
                                            class="size-3.5 shrink-0 text-muted-foreground"
                                        />
                                    {:else if item.id === "artefact"}
                                        <ImageIcon
                                            class="size-3.5 shrink-0 text-muted-foreground"
                                        />
                                    {:else if item.id === "row"}
                                        <Table2Icon
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
                                            >{item.kind === "slash"
                                                ? `/${item.id} · ${item.hint}`
                                                : item.hint}</span
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
                                {:else if item.kind === "cell"}
                                    <Table2Icon
                                        class="size-3.5 shrink-0 text-muted-foreground"
                                    />
                                    <span class="min-w-0 flex-1">
                                        <span class="font-medium"
                                            >{item.cell.label}</span
                                        >
                                        <span
                                            class="mt-0.5 block truncate text-[11px] text-muted-foreground"
                                            >{item.cell.detail}</span
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
                                {:else if item.kind === "rowcol"}
                                    <Table2Icon
                                        class="size-3.5 shrink-0 text-muted-foreground"
                                    />
                                    <span class="min-w-0 flex-1">
                                        <span class="font-medium"
                                            >{item.column.label}</span
                                        >
                                        <span
                                            class="mt-0.5 block truncate text-[11px] text-muted-foreground"
                                            >{item.column.detail}</span
                                        >
                                    </span>
                                {:else if item.kind === "rowop"}
                                    <span
                                        class="w-4 shrink-0 text-center font-mono text-sm font-medium text-muted-foreground"
                                        aria-hidden="true">{item.label}</span
                                    >
                                    <span class="min-w-0 flex-1">
                                        <span class="font-medium"
                                            >{item.label}</span
                                        >
                                        <span
                                            class="mt-0.5 block text-[11px] text-muted-foreground"
                                            >{item.hint}</span
                                        >
                                    </span>
                                {:else}
                                    {#if item.mode === "tag"}
                                        <span
                                            class="w-4 shrink-0 text-sm font-medium text-muted-foreground"
                                            aria-hidden="true">#</span
                                        >
                                    {:else}
                                        <BookMarkedIcon
                                            class="size-3.5 shrink-0 text-muted-foreground"
                                        />
                                    {/if}
                                    <span class="truncate font-medium"
                                        >{item.label}</span
                                    >
                                {/if}
                            </button>
                            {/if}
                        {/each}
                    {/if}
                </div>
            </div>
        {/if}
    </form>
</div>

<style>
    .chip-scroller {
        overflow-x: auto;
        scrollbar-width: none;
        -ms-overflow-style: none;
        overscroll-behavior-x: contain;
        mask-image: linear-gradient(
            to right,
            transparent 0,
            #000 var(--chip-fade-left, 0px),
            #000 calc(100% - var(--chip-fade-right, 0px)),
            transparent 100%
        );
    }
    .chip-scroller::-webkit-scrollbar {
        display: none;
    }
</style>
