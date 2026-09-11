export type MapCommitChange = { tables: string[]; baseCommit: string; commitId: string };

/** Only a known local fast-forward can reuse unaffected layers. */
export function canRefreshChangedLayers(change: MapCommitChange | undefined, loadedCommit: string, currentCommit: string): boolean {
    return Boolean(change?.baseCommit && change.commitId && change.baseCommit === loadedCommit && change.commitId === currentCommit);
}
