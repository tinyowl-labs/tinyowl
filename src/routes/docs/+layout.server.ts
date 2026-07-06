export const load = () => ({
  nav: [
    {
      section: "Getting Started",
      items: [
        { href: "/docs", label: "Introduction" },
        { href: "/docs/getting-started", label: "Quick Start" },
        { href: "/docs/concepts", label: "Core Concepts" },
      ],
    },
    {
      section: "CLI",
      items: [
        { href: "/docs/cli", label: "Overview" },
        { href: "/docs/cli/diff", label: "Diff" },
        { href: "/docs/cli/export", label: "Export" },
        { href: "/docs/cli/import", label: "Import" },
        { href: "/docs/cli/serve", label: "Serve" },
        { href: "/docs/cli/validate", label: "Validate" },
      ],
    },
    {
      section: "API",
      items: [
        { href: "/docs/api", label: "Overview" },
        { href: "/docs/api/entities", label: "Entities" },
        { href: "/docs/api/collections", label: "Collections" },
        { href: "/docs/api/relations", label: "Relations" },
        { href: "/docs/api/vocabularies", label: "Vocabularies" },
        { href: "/docs/api/classifications", label: "Classifications" },
        { href: "/docs/api/dates", label: "Dates" },
        { href: "/docs/api/czml", label: "CZML" },
        { href: "/docs/api/ogc", label: "OGC" },
        { href: "/docs/api/import", label: "Import" },
      ],
    },
    {
      section: "Guides",
      items: [
        { href: "/docs/guides/import-csv", label: "Import CSV" },
        { href: "/docs/guides/import-geojson", label: "Import GeoJSON" },
        { href: "/docs/guides/ogc-qgis", label: "OGC / QGIS" },
        { href: "/docs/guides/migration", label: "Migration" },
      ],
    },
    {
      section: "Configuration",
      items: [
        { href: "/docs/config/tinyowl-toml", label: "tinyowl.toml" },
      ],
    },
    {
      section: "Deployment",
      items: [
        { href: "/docs/deployment/docker", label: "Docker" },
        { href: "/docs/deployment/cloud-run", label: "Cloud Run" },
      ],
    },
    {
      section: "SDK",
      items: [
        { href: "/docs/sdk/js", label: "JavaScript" },
      ],
    },
  ],
});
