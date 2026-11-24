-- Email the owner whenever feedback arrives: an AFTER INSERT trigger posts the new row's id
-- to the notify-feedback edge function through pg_net (async, so a slow or failing email
-- never blocks or fails the user's submission).
create extension if not exists pg_net with schema extensions;

alter table public.ledgerlite_feedback add column if not exists notified_at timestamptz;

create or replace function public.ledgerlite_feedback_notify()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  perform net.http_post(
    url := 'https://hgzacqveqrccnvjwumkz.supabase.co/functions/v1/notify-feedback',
    body := jsonb_build_object('id', new.id),
    headers := '{"Content-Type": "application/json"}'::jsonb,
    timeout_milliseconds := 10000
  );
  return new;
end;
$$;

revoke all on function public.ledgerlite_feedback_notify() from public, anon, authenticated;

drop trigger if exists ledgerlite_feedback_notify on public.ledgerlite_feedback;
create trigger ledgerlite_feedback_notify
after insert on public.ledgerlite_feedback
for each row execute function public.ledgerlite_feedback_notify();
