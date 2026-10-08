/** Sessietoken + bundel van het ingelogde account. De ritdata staat op de server. */

const TOKEN_KEY = "tm_token";

let token = "";
try {
  token = sessionStorage.getItem(TOKEN_KEY) || "";
} catch {
  token = "";
}

let user = null;
let bundle = { data: { r: [], b: [], o: [], xr: [], xrArch: [] }, factuur: {}, factuurTeller: {}, calcFix: "" };
let queue = Promise.resolve();

function authHeaders() {
  const headers = { "Content-Type": "application/json" };
  if (token) headers.Authorization = "Bearer " + token;
  return headers;
}

async function api(path, opts = {}) {
  const res = await fetch(path, {
    method: opts.method || "GET",
    headers: authHeaders(),
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(body.error || "Mislukt");
    err.status = res.status;
    throw err;
  }
  return body;
}

function remember(nextToken, nextUser, nextBundle) {
  token = nextToken || "";
  user = nextUser || null;
  if (nextBundle) {
    bundle = {
      data: nextBundle.data || { r: [], b: [], o: [], xr: [], xrArch: [] },
      factuur: nextBundle.factuur || {},
      factuurTeller: nextBundle.factuurTeller || {},
      calcFix: nextBundle.calcFix || "",
    };
  }
  try {
    if (token) sessionStorage.setItem(TOKEN_KEY, token);
    else sessionStorage.removeItem(TOKEN_KEY);
  } catch {
    /* ignore */
  }
}

function pushBundle() {
  if (!token) return queue;
  const snap = {
    data: bundle.data,
    factuur: bundle.factuur,
    factuurTeller: bundle.factuurTeller,
    calcFix: bundle.calcFix,
  };
  queue = queue
    .catch(() => {})
    .then(() => api("/api/data", { method: "PUT", body: snap }));
  return queue;
}

export function accountUser() {
  return user;
}

export function accountHasToken() {
  return !!token;
}

export function accountData() {
  return bundle.data;
}

export function accountFactuurActive() {
  return !!user;
}

export function accountFactuur() {
  return bundle.factuur || {};
}

export function accountSetFactuur(next) {
  bundle.factuur = next;
  pushBundle();
}

export function accountTeller() {
  return bundle.factuurTeller || {};
}

export function accountSetTeller(next) {
  bundle.factuurTeller = next;
  pushBundle();
}

export function accountCalcFixed() {
  return bundle.calcFix === "1";
}

export function accountMarkCalcFixed() {
  bundle.calcFix = "1";
  pushBundle();
}

export function accountSaveData(data) {
  bundle.data = data;
  pushBundle();
}

export async function accountFlush() {
  await pushBundle();
}

export async function accountBootstrap() {
  if (!token) return null;
  try {
    const body = await api("/api/auth/me");
    remember(token, body.user, body.bundle);
    return body.user;
  } catch {
    remember("", null, null);
    return null;
  }
}

export async function accountSignup(name, email, password) {
  const body = await api("/api/auth/signup", { method: "POST", body: { name, email, password } });
  remember(body.token, body.user, body.bundle);
  return body.user;
}

export async function accountLogin(email, password) {
  const body = await api("/api/auth/login", { method: "POST", body: { email, password } });
  remember(body.token, body.user, body.bundle);
  return body.user;
}

export async function accountLogout() {
  try {
    if (token) await api("/api/auth/logout", { method: "POST", body: {} });
  } catch {
    /* wis lokaal toch */
  }
  remember("", null, null);
  bundle = { data: { r: [], b: [], o: [], xr: [], xrArch: [] }, factuur: {}, factuurTeller: {}, calcFix: "" };
}

export async function accountForgot(email) {
  return api("/api/auth/forgot", { method: "POST", body: { email } });
}

export async function accountReset(resetToken, password) {
  return api("/api/auth/reset", { method: "POST", body: { token: resetToken, password } });
}
