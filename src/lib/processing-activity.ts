export type ProcessingActivity = {
  schema_version: number;
  monitor_version: string;
  job_id: string;
  engine_task_uuid: string;
  sampled_at: string;
  state: string;
  phase: string;
  engine_progress: number | null;
  engine_status: number;
  last_change_at: string | null;
  depth_maps: number | null;
  depth_maps_added: number | null;
  depth_maps_truncated?: boolean;
  latest_file: {name: string; modified_at: string} | null;
  cpu_percent: number | null;
  memory: string | null;
  resources_scope: string;
  files_available: boolean;
  resources_available: boolean;
  events: {at: string; message: string}[];
  history: {at: string; depth_maps: number | null; cpu_percent: number | null}[];
};

export function activityFresh(sample: ProcessingActivity | null | undefined, task: string | null, now: number): boolean {
  if (!sample || sample.schema_version !== 1 || !task || sample.engine_task_uuid !== task || !now) return false;
  const at = Date.parse(sample.sampled_at);
  return Number.isFinite(at) && now - at >= -10_000 && now - at <= 45_000;
}

export function since(value: string | null | undefined, now: number): string {
  const at = value ? Date.parse(value) : NaN;
  if (!now || !Number.isFinite(at) || at > now + 10_000) return 'ainda não medido';
  const seconds = Math.max(0, Math.floor((now - at) / 1000));
  return seconds < 60 ? `há ${seconds} s` : `há ${Math.floor(seconds / 60)} min ${seconds % 60} s`;
}
