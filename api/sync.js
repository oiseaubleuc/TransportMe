import process from "node:process";
import { handleSyncRequest } from "../server/syncHttp.mjs";

void process.env.SESSION_SECRET;
void process.env.AUTH_PIN_HASH;
void process.env.AUTH_PIN_SALT;
void process.env.AUTH_PEPPER;
void process.env.BLOB_READ_WRITE_TOKEN;

export const config = { runtime: "nodejs", maxDuration: 10 };

export default async function handler(req, res) {
  req.url = "/api/sync";
  return handleSyncRequest(req, res);
}
