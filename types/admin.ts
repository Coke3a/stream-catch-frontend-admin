export type AdminUserRow = {
  id: string;
  created_at: string;
  email: string | null;
  role: string | null;
  last_sign_in_at?: string | null;
  email_confirmed_at?: string | null;
  is_admin?: boolean | null;
  total_count?: number | null;
};

export type PlanRow = {
  id: string;
  name: string | null;
  features?: Record<string, unknown> | null;
};

export type SubscriptionRow = {
  id: string;
  user_id: string;
  status: string;
  starts_at: string;
  ends_at: string;
  billing_mode: string;
  cancel_at_period_end: boolean;
  plan?: PlanRow | null;
};

export type LiveAccountRow = {
  id: string;
  platform: string;
  account_id?: string;
  canonical_url: string;
  status: string;
  created_at: string;
  updated_at: string;
};

export type FollowRow = {
  user_id: string;
  live_account_id: string;
  status: string;
  created_at: string;
  live_accounts?: LiveAccountRow | null;
};

export type RecordingRow = {
  id: string;
  live_account_id: string;
  recording_key?: string | null;
  status: string;
  started_at: string;
  ended_at?: string | null;
  duration_sec?: number | null;
  size_bytes?: number | null;
  storage_path?: string | null;
  live_accounts?: LiveAccountRow | null;
};

export type SupportTicketRow = {
  id: string;
  user_id: string;
  email: string | null;
  category: string;
  subject: string;
  message: string;
  severity: string | null;
  status: string;
  context?: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
};
