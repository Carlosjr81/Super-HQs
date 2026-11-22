-- Relógio principal do worker: pg_cron chama a função `worker` a cada minuto.
-- O workflow de implantação troca __URL__ e __SEGREDO__ (vindos dos segredos)
-- e manda pela API de gerenciamento do Supabase. Nada disso fica no Git.
create extension if not exists pg_cron;
create extension if not exists pg_net;
select cron.unschedule('jarvis-social-worker') where exists (select 1 from cron.job where jobname = 'jarvis-social-worker');
select cron.schedule('jarvis-social-worker', '* * * * *',
  $f$select net.http_post(url := '__URL__/functions/v1/worker', headers := jsonb_build_object('Content-Type','application/json','x-jarvis-worker','__SEGREDO__'), body := '{}'::jsonb, timeout_milliseconds := 60000);$f$);
