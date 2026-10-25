-- Pin search_path on every private helper (Supabase linter 0011).
do $$
declare
  f regprocedure;
begin
  for f in select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'private' loop
    execute format('alter function %s set search_path = public, pg_temp', f);
  end loop;
end $$;
