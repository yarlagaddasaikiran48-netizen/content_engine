-- ============================================================================
--  Migration 002 — the scheduler
--
--  Runs the heartbeat from inside the database, every five minutes, using
--  pg_cron and pg_net. Both are available on Supabase's free tier.
--
--  Why here rather than in Vercel Cron or GitHub Actions:
--    * Vercel's free plan allows one cron job, once per day. That cannot drive
--      two posting slots, let alone slots the operator can change.
--    * The job reads posting_times and cron_secret straight from app_settings,
--      the same table the Settings page writes. Change a posting time in the
--      UI and the next tick obeys it, with nothing to redeploy.
--
--  BEFORE RUNNING: set the site URL and a scheduler secret in the app, at
--  Settings -> Advanced. The job reads both from app_settings and will do
--  nothing useful without them.
--
--  Safe to re-run.
-- ============================================================================

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- ---------------------------------------------------------------------------
-- The heartbeat. Reads its own configuration from app_settings, so nothing
-- about the schedule is duplicated between the database and the app.
--
-- Non-secret rows are stored in clear precisely so this function can read
-- them; see migration 001 and the cron_secret entry in the settings catalogue.
-- ---------------------------------------------------------------------------
create or replace function public.run_tick()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_site   text;
  v_secret text;
begin
  select value_enc into v_site
    from public.app_settings
   where key = 'site_url' and is_secret = false;

  select value_enc into v_secret
    from public.app_settings
   where key = 'cron_secret' and is_secret = false;

  -- No site URL means the app has never been configured. Do nothing rather
  -- than firing requests at a null host every five minutes.
  if v_site is null or v_site = '' then
    return;
  end if;

  perform net.http_get(
    url     := rtrim(v_site, '/') || '/api/cron/tick',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || coalesce(v_secret, ''),
      'Content-Type',  'application/json'
    ),
    -- Generous: a tick that generates a script does real work. The route
    -- holds a four-minute lease, so a slow run cannot overlap the next tick.
    timeout_milliseconds := 55000
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Schedule it. Unscheduling first makes the whole file re-runnable.
--
-- Five minutes is chosen so that a posting slot -- claimable for 55 minutes
-- after its time -- cannot be missed, and so a batch of eight scripts finishes
-- in about forty minutes overnight.
-- ---------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from cron.job where jobname = 'spiritual-engine-tick') then
    perform cron.unschedule('spiritual-engine-tick');
  end if;
end$$;

select cron.schedule(
  'spiritual-engine-tick',
  '*/5 * * * *',
  $$select public.run_tick();$$
);

-- ============================================================================
--  Verify:
--
--    select jobname, schedule, active from cron.job;
--    select public.run_tick();               -- fire one by hand
--    select status, count(*) from public.spiritual_videos group by status;
--
--  Recent HTTP results, newest first:
--    select id, status_code, created
--      from net._http_response order by id desc limit 5;
--
--  To pause publishing without uninstalling anything:
--    select cron.unschedule('spiritual-engine-tick');
-- ============================================================================
