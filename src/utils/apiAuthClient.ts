/**
 * Client-side API auth bridge that attaches the active Auth0 OIDC ID Token (`__raw`)
 * as an `Authorization: Bearer <jwt>` header on same-origin `/api/*` requests.
 */

type TokenProvider = () => Promise<string | null>;

let activeTokenProvider: TokenProvider | null = null;

export function setApiAuthTokenProvider(provider: TokenProvider | null): void {
  activeTokenProvider = provider;
}

export async function getApiAuthToken(): Promise<string | null> {
  if (!activeTokenProvider) return null;
  try {
    const token = await activeTokenProvider();
    return token && token.trim() ? token.trim() : null;
  } catch {
    return null;
  }
}

export async function buildAuthHeaders(
  baseHeaders?: HeadersInit
): Promise<Headers> {
  const headers = new Headers(baseHeaders);
  if (!headers.has('Authorization')) {
    const token = await getApiAuthToken();
    if (token) {
      headers.set('Authorization', `Bearer ${token}`);
    }
  }
  return headers;
}

export async function apiFetch(
  input: RequestInfo | URL,
  init: RequestInit = {}
): Promise<Response> {
  const headers = await buildAuthHeaders(init.headers);
  return fetch(input, {
    ...init,
    headers,
  });
}
