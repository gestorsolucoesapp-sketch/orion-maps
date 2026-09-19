import { getSupabaseConfig } from "./config";

export type Profile = {
  full_name: string | null;
  avatar_url: string | null;
};

export async function getProfile(userId: string, accessToken: string): Promise<Profile | null> {
  const { url, publishableKey } = getSupabaseConfig();
  const response = await fetch(
    `${url}/rest/v1/profiles?id=eq.${encodeURIComponent(userId)}&select=full_name,avatar_url&limit=1`,
    {
      cache: "no-store",
      headers: {
        apikey: publishableKey,
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/json",
      },
    },
  );

  if (!response.ok) return null;
  const profiles = (await response.json()) as Profile[];
  return profiles[0] ?? null;
}
