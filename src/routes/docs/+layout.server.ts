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
        { href: "/docs/cli/push", label: "Push" },
        { href: "/docs/cli/diff", label: "Diff" },
        { href: "/docs/cli/export", label: "Export" },
        { href: "/docs/cli/import", label: "Import" },
        { href: "/docs/cli/validate", label: "Validate" },
      ],
    },
    {
      section: "API",
      items: [
        { href: "/docs/api", label: "Overview" },
        { href: "/docs/api/projects", label: "Projects" },
        { href: "/docs/api/tables", label: "Tables & Rows" },
        { href: "/docs/api/members", label: "Members" },
        { href: "/docs/api/column-mappings", label: "Mappings" },
        { href: "/docs/api/search", label: "Search" },
        { href: "/docs/api/readme", label: "Readme" },
        { href: "/docs/api/media", label: "Media" },
        { href: "/docs/api/push-pull", label: "Push & Pull" },
        { href: "/docs/api/diff-clone", label: "Diff & Clone" },
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
      items: [{ href: "/docs/config/tinyowl-toml", label: "tinyowl.toml" }],
    },
    {
      section: "Deployment",
      items: [
        { href: "/docs/deployment/docker", label: "Docker" },
        { href: "/docs/deployment/cloud-run", label: "Cloud Run" },
      ],
    },
  ],
});
