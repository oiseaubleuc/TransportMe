import { defineConfig } from "vite";
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
}

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: { manualChunks },
    },
  },
});
