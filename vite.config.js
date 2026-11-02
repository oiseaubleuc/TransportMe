import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

/**
 * Splits zware `node_modules` (kleinere chunks, betere cache, minder 500 kB-waarschuwingen).
 * Geen vangnet-`vendor-misc`: dat gaf circular chunks met React.
 */
function manualChunks(id) {
  if (!id.includes("node_modules")) return;
  if (id.includes("react-dom") || id.includes("/react/") || id.includes("\\react\\")) return "vendor-react";
  if (id.includes("chart.js") || id.includes("react-chartjs")) return "vendor-charts";
  if (id.includes("leaflet")) return "vendor-leaflet";
  if (id.includes("maplibre-gl")) return "vendor-maplibre";
  if (id.includes("jspdf")) return "vendor-jspdf";
  if (id.includes("html2canvas") || id.includes("canvg") || id.includes("dompurify")) return "vendor-html-canvas";
  if (id.includes("tesseract")) return "vendor-tesseract";
  if (id.includes("pdfjs-dist")) return "vendor-pdfjs";
  if (id.includes("@zxing")) return "vendor-zxing";
  if (id.includes("exceljs")) return "vendor-exceljs";
}

const SECURITY_HEADERS = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
  "Cross-Origin-Opener-Policy": "same-origin",
};

function laadAuthEnv(mode) {
  const env = loadEnv(mode, process.cwd(), "");
  for (const [k, v] of Object.entries(env)) {
    if (k === "SESSION_SECRET" || k === "BLOB_READ_WRITE_TOKEN" || k === "TM_SYNC_FILE" || k.startsWith("AUTH_")) {
      process.env[k] = v;
    }
  }
}

async function lokaleApi(req, res, next) {
  const url = req.url || "";
  const path = url.split("?")[0];
  if (path === "/api/sync") {
    const { handleSyncRequest } = await import("./server/syncHttp.mjs");
    return handleSyncRequest(req, res);
  }
  if (path !== "/api/login" && path !== "/api/logout" && path !== "/api/session") return next();
  const { handleAuthRequest } = await import("./server/authHttp.mjs");
  return handleAuthRequest(req, res);
}

function localAuthApi() {
  return {
    name: "transportme-auth-api",
    configureServer(server) {
      server.middlewares.use(lokaleApi);
    },
    configurePreviewServer(server) {
      server.middlewares.use(lokaleApi);
    },
  };
}

export default defineConfig(({ mode }) => {
  laadAuthEnv(mode);
  return {
    plugins: [react(), localAuthApi()],
    server: { headers: SECURITY_HEADERS },
    preview: { headers: SECURITY_HEADERS },
    build: {
      chunkSizeWarningLimit: 1000,
      rollupOptions: {
        output: { manualChunks },
      },
    },
  };
});
