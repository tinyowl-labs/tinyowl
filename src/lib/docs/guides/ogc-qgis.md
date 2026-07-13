# Connecting QGIS

TinyOwl serves table data as GeoJSON via the layers API, allowing direct connections from QGIS and other GIS tools. This guide walks through setting up the connection.

## Prerequisites

- QGIS 3.28 or later
- A running TinyOwl server with data pushed to a project
- Project slug (and org if applicable)

## Step 1: Get the GeoJSON URL

The GeoJSON endpoint follows this pattern:

```
http://localhost:8080/api/v1/projects/{slug}/layers/{table}/geojson
```

Or with an org namespace:

```
http://localhost:8080/api/v1/{org}/{project}/layers/{table}/geojson
```

For example:

```
http://localhost:8080/api/v1/projects/my-excavation/layers/Site_Points/geojson
```

For public projects, no authentication is needed. For private projects, pass your Supabase JWT as a Bearer token (see below).

## Step 2: Connect QGIS

### Method A: Add Vector Layer from URL

1. Open QGIS
2. Go to **Layer** → **Add Layer** → **Add Vector Layer**
3. Set **Source type** to `Protocol: HTTP(S), cloud, etc.`
4. Set **Protocol** to `HTTP/HTTPS`
5. Enter the GeoJSON URL
6. Click **Add**

### Method B: Add WFS / OGC API - Features Layer

1. Go to **Layer** → **Add Layer** → **Add WFS / OGC API - Features Layer**
2. Click **New** to create a new connection
3. Fill in the connection details:

   | Field | Value |
   |---|---|
   | Name | `TinyOwl - My Project` |
   | URL | `http://localhost:8080/api/v1/projects/my-excavation/` |

4. Click **OK** to save the connection
5. Click **Connect** to fetch layers
6. Select the layers you want to add
7. Click **Add**

### Authentication for Private Projects

For private projects, you need to pass your Supabase JWT token:

1. In the connection settings, go to **Authorization**
2. Set **Authorization** to `Bearer` and enter your token

Or append the token as a query parameter if your QGIS version doesn't support headers:

```
http://localhost:8080/api/v1/projects/my-excavation/layers/Site_Points/geojson?token=<token>
```

## What You Can Do

Once connected, you can:

- **View** — See all entity geometries on the map
- **Query** — Click features to see properties
- **Filter** — Use QGIS expressions to filter by property values
- **Style** — Apply symbology based on entity type, period, or any column
- **Label** — Display entity names on the map
- **Export** — Save as Shapefile, GeoPackage, or other formats through QGIS

## Performance Tips

- **Limit features** — The GeoJSON endpoint returns all rows in the table. For large datasets, consider filtering in QGIS after loading
- **Cache locally** — For offline fieldwork, export to GeoPackage through QGIS
- **Use layer-specific URLs** — Load one table at a time rather than trying to load everything

## Troubleshooting

| Problem | Solution |
|---|---|
| "Connection refused" | Ensure the TinyOwl server is running and accessible |
| "Unauthorised" | Check that your JWT token is valid. For public projects, remove the auth header |
| "No features found" | Verify the table name is correct and contains entities with geometries |
| Features don't have geometries | Only entities with WKB geometry in the GeoPackage will appear |
| Slow loading | Export the layer to a local file through QGIS for faster access |

## Connecting to Multiple Tables

You can connect to multiple tables in the same project by adding separate layers:

```
http://localhost:8080/api/v1/projects/my-excavation/layers/Site_Points/geojson
http://localhost:8080/api/v1/projects/my-excavation/layers/Artefacts/geojson
http://localhost:8080/api/v1/projects/my-excavation/layers/Contexts/geojson
```

## Next Steps

- [GeoJSON Import Guide](/docs/guides/import-geojson/) — Import data from QGIS exports
- [CSV Import Guide](/docs/guides/import-csv/) — Import tabular data
- [API Reference](/docs/api/) — Full REST API documentation
