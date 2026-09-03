export const SETTINGS_PAGES = [
    { id: "general", label: "General" },
    { id: "visibility", label: "Visibility" },
    { id: "licence", label: "Licence" },
    { id: "embargo", label: "Embargo" },
    { id: "qfieldcloud", label: "QFieldCloud", separatorBefore: true },
    { id: "members", label: "Members" },
] as const;

export type SettingsPageId = (typeof SETTINGS_PAGES)[number]["id"];

/** Old `?tab=` values on `/[project]/settings`. */
export const LEGACY_TAB_TO_PAGE: Record<string, SettingsPageId> = {
    general: "general",
    visibility: "visibility",
    licence: "licence",
    embargo: "embargo",
    qfieldcloud: "qfieldcloud",
    members: "members",
};

export const SELECT_CLASS =
    "flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm";
