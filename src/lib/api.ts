// Minimal real-backend client, seeded here for the auth wiring work.
// Talks to uat-backend (POS/uat-backend) - the only backend this design
// currently has anything real to call. Session is a cookie the backend
// sets (httpOnly), so every call needs credentials: "include".
export const API_BASE_URL = import.meta.env["VITE_API_BASE_URL"] ?? "http://localhost:4000";

export class ApiError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ApiError";
  }
}

// uat-backend's error()/success() helpers (responce/res.js) shape every
// response as { error: boolean, results: {...}, code }. Most error paths
// never call res.status(...) before res.json(...), so the HTTP status is
// commonly 200 even on auth failure - `error`/`results` are the only
// reliable signal, not res.ok.
type ApiEnvelope<T> = { error: boolean; results: T };

async function apiPost<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  const json = (await res.json().catch(() => null)) as ApiEnvelope<T> | null;

  if (!json || json.error) {
    const message =
      json?.results && typeof json.results === "object" && "message" in json.results
        ? String((json.results as { message?: unknown }).message)
        : "Request failed";
    throw new ApiError(message);
  }

  return json.results;
}

export const authApi = {
  pinLogin: (mobile: string, pin: string, deviceId: string) =>
    apiPost<{ message?: string; token?: string }>("/pinLogin", {
      mobile,
      pin,
      device_id: deviceId,
    }),
  restaurantLogin: (mobile: string, password: string, deviceId: string) =>
    apiPost<{ message?: string; token?: string }>("/restaurantLogin", {
      mobile,
      password,
      device_id: deviceId,
    }),
};
