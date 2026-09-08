export type ShortcutScope = "global" | "map" | "tables" | "map-fly";

export type CameraScheme = "globe" | "pivot";

/** A key plus modifiers. `mod` is Ctrl (Win/Linux) or Meta (macOS). */
export type Chord = {
	key: string;
	mod?: boolean;
	shift?: boolean;
	alt?: boolean;
};

export type ShortcutId =
	| "search-toggle"
	| "map-escape"
	| "map-enter"
	| "map-undo"
	| "map-fly-to"
	| "map-home"
	| "map-isolate"
	| "map-exit-isolate"
	| "map-select-click"
	| "map-select-box"
	| "map-select-lasso"
	| "map-measure-toggle"
	| "map-measure-point"
	| "map-measure-length"
	| "map-measure-area"
	| "map-measure-volume"
	| "map-comments-toggle"
	| "map-edit-toggle"
	| "map-add-geometry"
	| "map-graph-toggle"
	| "map-delete"
	| "map-fly-toggle"
	| "tables-edit-toggle"
	| "tables-delete"
	| "fly-forward"
	| "fly-back"
	| "fly-left"
	| "fly-right"
	| "fly-up"
	| "fly-down";

export type CatalogEntry = {
	id: ShortcutId;
	scope: ShortcutScope;
	label: string;
	group: string;
	remappable: boolean;
	defaultChord: Chord;
	/** Extra default matches (e.g. Backspace alongside Delete). Dropped if remapped. */
	aliases?: Chord[];
};

export type KeyboardPreferences = {
	chords: Partial<Record<ShortcutId, Chord>>;
	cameraScheme: CameraScheme;
	flySensitivity: number;
	/** Pivot pinch / ctrl-wheel zoom. 1 = previous default. */
	pivotZoomSensitivity: number;
};
