/** Tiny JSON HTTP helper with injectable fetch (unit tests stub this). */

export type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

export let httpFetch: FetchLike = (url, init) => fetch(url, init);

/** Test seam: replace the transport (returns a restore function). */
export function setHttpFetch(impl: FetchLike): () => void {
  const prev = httpFetch;
  httpFetch = impl;
  return () => {
    httpFetch = prev;
  };
}

export async function getJson<T>(
  url: string,
  init: RequestInit & { errorLabel: string },
): Promise<T> {
  const res = await httpFetch(url, init);
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`${init.errorLabel} failed (${res.status}): ${text.slice(0, 300)}`);
  }
  return JSON.parse(text) as T;
}
