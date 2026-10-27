import { handleAuthRequest } from "../server/authHttp.mjs";

export const config = { maxDuration: 10 };

export default async function handler(req, res) {
  req.url = "/api/session";
  return handleAuthRequest(req, res);
}
