export async function fetchJson<T>(input: RequestInfo | URL, init?: RequestInit) {
  const response = await fetch(input, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(init?.headers || {}),
    },
  });

  const payload = (await response.json().catch(() => null)) as T | { error?: string } | null;

  if (response.status === 401 && typeof window !== "undefined") {
    window.location.href = '/login'
    throw new Error("Unauthorized");
  }

  if (!response.ok) {
    const message = payload && typeof payload === "object" && "error" in payload ? payload.error : "Request failed";
    throw new Error(message || "Request failed");
  }

  return payload as T;
}
