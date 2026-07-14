#!/usr/bin/env node
/**
 * Front door for Tailscale Funnel demos.
 *
 * Proxies:
 *   /api/v1, /media              → tinyowl-server (8080)
 *   /auth/v1, /rest/v1, …        → local Supabase (54321)
 *   everything else              → SvelteKit adapter-node (4174)
 *
 * Usage:
 *   TINYOWL_ADAPTER=node npm run build
 *   PORT=4174 ORIGIN=https://desktop….ts.net node build
 *   node scripts/demo-serve.mjs
 */
import http from "node:http";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import fs from "node:fs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const port = Number(process.env.PORT || 4173);
const appPort = Number(process.env.DEMO_APP_PORT || 4174);
const apiTarget = process.env.TINYOWL_CORE_URL || "http://127.0.0.1:8080";
const supabaseTarget = process.env.SUPABASE_URL || "http://127.0.0.1:54321";
const appTarget = process.env.DEMO_APP_URL || `http://127.0.0.1:${appPort}`;
const origin =
  process.env.ORIGIN ||
  process.env.DEMO_ORIGIN ||
  `http://127.0.0.1:${port}`;
const autoStartApp = process.env.DEMO_NO_SPAWN !== "1";

function proxyTarget(urlPath) {
  if (urlPath.startsWith("/api/v1") || urlPath.startsWith("/media")) {
    return apiTarget;
  }
  if (
    urlPath.startsWith("/auth/v1") ||
    urlPath.startsWith("/rest/v1") ||
    urlPath.startsWith("/storage/v1") ||
    urlPath.startsWith("/realtime/v1")
  ) {
    return supabaseTarget;
  }
  return appTarget;
}

function proxy(req, res, targetBase) {
  const target = new URL(req.url || "/", targetBase);
  const headers = { ...req.headers, host: target.host };
  // Tell adapter-node the public origin when behind Funnel / this proxy.
  if (targetBase === appTarget) {
    headers["x-forwarded-host"] = req.headers.host || new URL(origin).host;
    headers["x-forwarded-proto"] = origin.startsWith("https") ? "https" : "http";
  }
  delete headers["connection"];

  const upstream = http.request(
    {
      protocol: target.protocol,
      hostname: target.hostname,
      port: target.port,
      path: target.pathname + target.search,
      method: req.method,
      headers,
      timeout: 120_000,
    },
    (upRes) => {
      res.writeHead(upRes.statusCode || 502, upRes.headers);
      upRes.pipe(res);
    },
  );
  upstream.on("error", (err) => {
    if (!res.headersSent) {
      res.writeHead(502, { "content-type": "text/plain" });
    }
    res.end(`Bad gateway (${targetBase}): ${err.message}`);
  });
  req.pipe(upstream);
}

function startApp() {
  const entry = path.join(root, "build", "index.js");
  if (!fs.existsSync(entry)) {
    console.error(
      `Missing ${entry}\nBuild with: TINYOWL_ADAPTER=node npm run build`,
    );
    process.exit(1);
  }
  const child = spawn(process.execPath, [entry], {
    cwd: root,
    env: {
      ...process.env,
      PORT: String(appPort),
      HOST: "127.0.0.1",
      ORIGIN: origin,
      PROTOCOL_HEADER: "x-forwarded-proto",
      HOST_HEADER: "x-forwarded-host",
    },
    stdio: ["ignore", "inherit", "inherit"],
  });
  child.on("exit", (code, signal) => {
    console.error(`adapter-node exited code=${code} signal=${signal}`);
    process.exit(code || 1);
  });
  return child;
}

let appChild = null;
if (autoStartApp) {
  appChild = startApp();
}

const server = http.createServer((req, res) => {
  const urlPath = req.url || "/";
  proxy(req, res, proxyTarget(urlPath));
});

server.listen(port, "0.0.0.0", () => {
  console.log(`TinyOwl demo front door: http://0.0.0.0:${port}/`);
  console.log(`  /api/v1 /media     → ${apiTarget}`);
  console.log(`  /auth/v1 /rest/v1… → ${supabaseTarget}`);
  console.log(`  app (SSR + /api/*) → ${appTarget}`);
  console.log(`  ORIGIN=${origin}`);
});

function shutdown() {
  server.close();
  if (appChild) appChild.kill("SIGTERM");
  process.exit(0);
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
