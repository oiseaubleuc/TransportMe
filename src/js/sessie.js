/**
 * Client voor /api/login|logout|session. Credentials = cookies, geen token in opslag.
 */

async function leesJson(res) {
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(body.error || "Mislukt");
    err.status = res.status;
    err.body = body;
    throw err;
  }
  return body;
}

export async function apiLogin(pin) {
  const res = await fetch("/api/login", {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ pin }),
  });
  return leesJson(res);
}

export async function apiLogout() {
  try {
    await fetch("/api/logout", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: "{}",
    });
  } catch {
    /* lokale kluis gaat toch dicht */
  }
}

export async function apiSessie() {
  const res = await fetch("/api/session", {
    method: "GET",
    credentials: "same-origin",
    headers: { Accept: "application/json" },
  });
  if (res.status === 401) return null;
  return leesJson(res);
}
