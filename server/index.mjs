/**
 * Optionele lokale auth-server (zelfde handlers als Vercel /api).
 * Vite gebruikt de plugin in vite.config.js; dit proces is alleen nodig
 * als je de API los wilt draaien: AUTH_PORT=8787 node server/index.mjs
 */
import { createServer } from "node:http";
import { handleAuthRequest } from "./authHttp.mjs";

const PORT = Number(process.env.AUTH_PORT || 8787);

createServer((req, res) => {
  const path = String(req.url || "").split("?")[0];
  if (path === "/api/login" || path === "/api/logout" || path === "/api/session") {
    return handleAuthRequest(req, res);
  }
  res.statusCode = 404;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify({ ok: false, error: "Onbekend." }));
}).listen(PORT, "127.0.0.1", () => {
  console.log(`TransportMe auth op http://127.0.0.1:${PORT}`);
});
