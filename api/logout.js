import { handleAuthRequest } from "../server/authHttp.mjs";

export default async function handler(req, res) {
  req.url = "/api/logout";
  return handleAuthRequest(req, res);
}
