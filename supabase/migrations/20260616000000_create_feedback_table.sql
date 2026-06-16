create table if not exists public.ledgerlite_feedback (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  type text not null check (type in ('bug', 'feature', 'general')),
  subject text not null,
  description text not null,
  email text,
  user_id uuid references auth.users(id) on delete set null,
  user_agent text
);

alter table public.ledgerlite_feedback enable row level security;

grant insert on public.ledgerlite_feedback to anon;
grant insert on public.ledgerlite_feedback to authenticated;

drop policy if exists "Anyone can submit feedback." on public.ledgerlite_feedback;
create policy "Anyone can submit feedback."
on public.ledgerlite_feedback
for insert
to anon, authenticated
with check (true);
