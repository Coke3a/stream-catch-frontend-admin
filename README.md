# StreamRokuo Admin

Minimal, read-only admin console for StreamRokuo. The UI reads directly from Supabase
(anon key + RLS) and uses the backend only for signed watch URLs.

## Setup

1) Copy env config:

```bash
cp env.example .env.local
```

2) Fill in:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `NEXT_PUBLIC_BACKEND_BASE_URL`
- `NEXT_PUBLIC_ADMIN_APP_NAME` (optional)

3) Start dev server:

```bash
npm install
npm run dev
```

## Admin access

- Admins are identified via `app_metadata.is_admin` in the Supabase JWT.
- Set `is_admin` to `true` on the user in Supabase (Auth > Users > app_metadata)
  or via SQL:

```sql
update auth.users
set raw_app_meta_data = jsonb_set(raw_app_meta_data, '{is_admin}', 'true'::jsonb, true)
where id = '<user-uuid>';
```

## RLS policies (required)

This app expects admin read policies on the following tables:
- `subscriptions`, `plans`, `follows`, `live_accounts`, `recordings`

Run the backend migrations in `stream-catch/` to install the admin SELECT policies:

```bash
diesel migration run
```

Admin user lists are served via a secure RPC that reads from `auth.users`.
The migration `2025-12-30-0008_admin_users_rpc` must be applied.

## Security notes

- Never use `service_role` keys in frontend environments.
- RLS must remain enabled. Admin access is granted only via `app_metadata.is_admin`.
- Signed watch URLs are fetched from the backend with the Supabase access token.
# stream-catch-frontend-admin
