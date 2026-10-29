import process from "node:process";
import { handleAuthRequest } from "../server/authHttp.mjs";

void process.env.SESSION_SECRET;

export const config = { runtime: "nodejs", maxDuration: 10 };

export default async function handler(req, res) {
  req.url = "/api/logout";
  return handleAuthRequest(req, res);
}
