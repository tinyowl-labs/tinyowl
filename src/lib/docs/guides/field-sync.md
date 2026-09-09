# Field sync

Keep phone and tablet capture aligned with a project’s `develop` branch. Settings → **Sync** is the control surface; this page covers how the pieces fit.

## What Sync does

1. **Package** — download a zip at `develop` (feature GeoPackage + project files) for offline work.
2. **Phone sync** — optionally create a private Cloud projection so the phone app syncs normally while echidna keeps `develop` as the source of truth. The bridge publishes the field package and lands deltas back as commits.
3. **Push a package** — if you edited offline without Cloud, upload the GPKG or zip with the package’s `base_commit` and a message. Same envelope as the CLI.

Public `main` does not move until someone promotes.

## Enable sync

On the project: **Settings → Sync → Enable sync**.

You need a connected field Cloud account under account Settings. Collaborator role or higher is required.

Once enabled you can:

- **Sync now** — ask the bridge to land phone edits and refresh the Cloud package from `develop`
- **Disconnect** — stop phone sync for this project (Cloud project is not deleted)

## Download a package

Use **Download** on the Sync page (or `GET /api/v1/projects/{slug}/field-package?ref=develop`). Open the zip in QGIS or a compatible field client. The package includes `tinyowl.json` with `ref` and `base_commit`.

## Push without Cloud

If you collected offline and are not using phone sync:

1. Keep the package’s `base_commit`
2. Edit the GPKG (or the whole zip)
3. From Sync settings (or the API), push with that parent commit and a message

If `develop` moved while you were offline, the commit may land on your personal ref until you rebase.

## Link an existing Cloud project

Prefer **Enable sync** for new work. To attach a project that already lives on a field Cloud, use the project’s Sync API (`PUT …/qfieldcloud-link`) or ask an admin — the hub keeps that path for born-link / pull-only cases. Snapshot imports remain available from account Settings when publishing from an external Cloud.

## Related

- [Push & Pull API](/docs/api/push-pull/) — commit envelope
- [OGC / QGIS](/docs/guides/ogc-qgis/) — browse layers from the web API in QGIS
