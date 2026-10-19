import { supabase } from "@/lib/supabase";

/**
 * Returns authorization headers containing the user's Supabase access token.
 */
export async function getAuthHeaders(): Promise<Record<string, string>> {
  try {
    const { data } = await supabase.auth.getSession();
    if (data.session?.access_token) {
      return {
        Authorization: `Bearer ${data.session.access_token}`,
      };
    }
  } catch {
    // Session retrieval failed
  }
  return {};
}

/**
 * Authenticated fetch wrapper for admin API endpoints.
 */
export async function authenticatedFetch(
  url: string,
  options: RequestInit = {},
): Promise<Response> {
  const authHeaders = await getAuthHeaders();
  const headers = {
    ...authHeaders,
    ...(options.headers ?? {}),
  };

  return fetch(url, {
    ...options,
    headers,
  });
}
