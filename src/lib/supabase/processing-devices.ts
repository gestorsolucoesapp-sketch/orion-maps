import { supabaseRequest } from "./surveys";

export type ProcessingDevice = {
  id: string;
  user_id: string;
  name: string;
  enabled: boolean;
  capabilities: Record<string, unknown>;
  last_seen: string | null;
  created_at: string;
};

export async function listProcessingDevices(token: string) {
  return supabaseRequest<ProcessingDevice[]>(
    "/rest/v1/processing_devices?select=id,user_id,name,enabled,capabilities,last_seen,created_at&order=last_seen.desc.nullslast&limit=20",
    token
  );
}
