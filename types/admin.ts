export type AdminUserRow = {
  id: string;
  created_at: string;
  updated_at?: string | null;
  email: string | null;
  role: string | null;
  last_sign_in_at?: string | null;
  email_confirmed_at?: string | null;
  last_seen_at?: string | null;
  status?: string | null;
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
  follower_count?: number | null;
  total_count?: number | null;
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
  storage_provider?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
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

export type JobRow = {
  id: string;
  type: string;
  payload?: Record<string, unknown> | null;
  run_at: string;
  attempts: number;
  locked_at?: string | null;
  locked_by?: string | null;
  error?: string | null;
  status: string;
  created_at: string;
};

export type InvoiceRow = {
  id: string;
  user_id: string;
  subscription_id?: string | null;
  plan_id: string;
  amount_minor: number;
  currency: string;
  period_start: string;
  period_end: string;
  due_at: string;
  status: string;
  created_at: string;
  paid_at?: string | null;
  plans?: PlanRow | PlanRow[] | null;
};

export type PaymentRow = {
  id: string;
  invoice_id: string;
  user_id: string;
  provider: string;
  method_type: string;
  payment_method_id?: string | null;
  amount_minor: number;
  currency: string;
  status: string;
  provider_payment_id?: string | null;
  provider_session_ref?: string | null;
  error?: string | null;
  created_at: string;
  updated_at: string;
};

export type PaymentMethodRow = {
  id: string;
  user_id: string;
  provider: string;
  brand?: string | null;
  last4?: string | null;
  exp_month?: number | null;
  exp_year?: number | null;
  is_default: boolean;
  created_at: string;
};

export type DeliveryRow = {
  id: string;
  recording_id: string;
  user_id: string;
  via: string;
  delivered_at?: string | null;
  status: string;
  error?: string | null;
};

export type TelemetryEventRow = {
  id: string;
  received_at: string;
  user_id: string;
  session_id?: string | null;
  event_id?: string | null;
  name: string;
  page?: string | null;
  source?: string | null;
  plan?: string | null;
  platform?: string | null;
  recording_id?: string | null;
  live_account_id?: string | null;
  props?: Record<string, unknown> | null;
  client_ts?: string | null;
};

export type DownloadQuotaRow = {
  user_id: string;
  week_start: string;
  count: number;
  updated_at: string;
};

export type LiveAccountStatsRow = {
  live_account_id: string;
  global_follow_count: number;
  recordings_count: number;
  latest_recording_started_at?: string | null;
};

export type LiveAccountCountryStatsRow = {
  live_account_id: string;
  country_code: string;
  follow_count: number;
  country_region_map?: CountryRegionRow | CountryRegionRow[] | null;
};

export type CountryRegionRow = {
  country_code: string;
  region: string;
};

export type SubscriptionFullRow = SubscriptionRow & {
  canceled_at?: string | null;
  provider_subscription_id?: string | null;
};
