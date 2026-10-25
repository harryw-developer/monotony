-- Expire codes: delete ended games after an hour and idle games after 24 hours.
create extension if not exists pg_cron;

select cron.schedule('monotony-cleanup', '17 * * * *', $$select private.cleanup()$$);
