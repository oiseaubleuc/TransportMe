import process from "node:process";
import { handleAuthRequest } from "../server/authHttp.mjs";

void process.env.SESSION_SECRET;
void process.env.AUTH_PIN_HASH;
void process.env.AUTH_PIN_SALT;
void process.env.AUTH_PEPPER;

export const config = { runtime: "nodejs", maxDuration: 10 };

export default async function handler(req, res) {
  req.url = "/api/session";
  return handleAuthRequest(req, res);
}
