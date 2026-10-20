-- Read-only cutover observations. No application/PIN/password/token rows.
-- Compare observations of the SAME project before/after capture and before
-- expand. Equality detects no observable drift; it does not freeze the provider.
begin transaction read only;
set local statement_timeout = '15s';
set local search_path = pg_catalog;
set local timezone = 'UTC';
set local datestyle = 'ISO, YMD';

with namespaces as (
  select oid,nspname,nspowner,nspacl from pg_namespace
  -- Include non-system schemas so a newly introduced application namespace is
  -- observable too; system catalogs themselves are not frozen by this check.
  where left(nspname,3)<>'pg_' and nspname<>'information_schema'
), relations as (
  select c.oid,c.relnamespace,n.nspname,c.relname,c.relkind,c.relowner,c.relacl,
         c.relrowsecurity,c.relforcerowsecurity,c.relpersistence,c.relreplident,
         c.relispartition,c.reloptions
  from pg_class c join namespaces n on n.oid=c.relnamespace
  where c.relkind in ('r','p','S','v','m','f')
), catalog_records as (
  select 'namespace' as kind,nspname as identity,
         jsonb_build_array(nspname,nspowner,nspacl) as definition from namespaces
  union all
  select 'relation',nspname||'.'||relname,
         jsonb_build_array(nspname,relname,relkind,relowner,relacl,relrowsecurity,
                           relforcerowsecurity,relpersistence,relreplident,relispartition,reloptions)
  from relations
  union all
  select 'view_definition',r.oid::text,to_jsonb(pg_get_viewdef(r.oid,true))
  from relations r where r.relkind in ('v','m')
  union all
  select 'type',t.oid::text,to_jsonb(t) from pg_type t
  where t.typnamespace in (select oid from namespaces)
  union all
  select 'enum_label',e.oid::text,to_jsonb(e) from pg_enum e
  where e.enumtypid in (select oid from pg_type where typnamespace in (select oid from namespaces))
  union all
  select 'rule',w.oid::text,to_jsonb(w) from pg_rewrite w
  where w.ev_class in (select oid from relations)
  union all
  select 'event_trigger',e.oid::text,to_jsonb(e) from pg_event_trigger e
  union all
  select 'column',r.nspname||'.'||r.relname||'.'||a.attnum,
         jsonb_build_array(a.attname,a.atttypid,a.atttypmod,a.attnotnull,a.attidentity,
                           a.attgenerated,a.attcollation,a.attacl,
                           pg_get_expr(d.adbin,d.adrelid))
  from relations r join pg_attribute a on a.attrelid=r.oid
  left join pg_attrdef d on d.adrelid=a.attrelid and d.adnum=a.attnum
  where a.attnum>0 and not a.attisdropped
  union all
  select 'constraint',k.oid::text,
         jsonb_build_array(k.conname,k.conrelid,k.confrelid,k.convalidated,
                           pg_get_constraintdef(k.oid))
  from pg_constraint k where k.connamespace in (select oid from namespaces)
  union all
  select 'index',i.indexrelid::text,to_jsonb(i)
  from pg_index i where i.indrelid in (select oid from relations)
  union all
  select 'trigger',t.oid::text,jsonb_build_array(t.tgenabled,pg_get_triggerdef(t.oid))
  from pg_trigger t where t.tgrelid in (select oid from relations)
  union all
  select 'policy',p.oid::text,to_jsonb(p) from pg_policy p
  where p.polrelid in (select oid from relations)
  union all
  select 'function',p.oid::text,
         jsonb_build_array(p.pronamespace,p.proname,p.proowner,p.proacl,p.prosecdef,
                           p.provolatile,p.proconfig,pg_get_functiondef(p.oid))
  from pg_proc p where p.pronamespace in (select oid from namespaces) and p.prokind in ('f','p')
  union all
  select 'sequence_definition',s.seqrelid::text,to_jsonb(s) from pg_sequence s
  where s.seqrelid in (select oid from relations)
  union all
  select 'default_acl',a.oid::text,to_jsonb(a) from pg_default_acl a
  union all
  select 'role',r.rolname,
         jsonb_build_array(r.rolsuper,r.rolinherit,r.rolcreaterole,r.rolcreatedb,
                           r.rolcanlogin,r.rolreplication,r.rolbypassrls,r.rolconnlimit,r.rolvaliduntil)
  from pg_roles r
  union all
  select 'membership',jsonb_build_array(m.roleid,m.member,m.grantor)::text,to_jsonb(m)
  from pg_auth_members m
  union all
  -- Configuration names/presence only: never read/export credential GUC values.
  -- Value drift is outside this hash; Auth control-plane comparison is separate.
  select 'role_setting_names',jsonb_build_array(s.setdatabase,s.setrole)::text,
         (select jsonb_agg(split_part(v,'=',1) order by split_part(v,'=',1) collate "C")
          from unnest(s.setconfig) v)
  from pg_db_role_setting s
  union all
  select 'extension',e.extname,jsonb_build_array(e.extversion,e.extowner,e.extnamespace)
  from pg_extension e
  union all
  select 'database',d.datname,
         jsonb_build_array(d.datdba,d.encoding,d.datlocprovider,d.datcollate,d.datctype,
                           d.datlocale,d.datcollversion,pg_database_collation_actual_version(d.oid),
                           d.datacl,d.datconnlimit,d.datallowconn)
  from pg_database d where d.datname=current_database()
  union all
  select 'publication',p.pubname,to_jsonb(p) from pg_publication p
  union all
  select 'publication_relation',p.oid::text,to_jsonb(p) from pg_publication_rel p
), metadata_records as (
  select 'auth_migration' as kind,to_jsonb(t) as definition from auth.schema_migrations t
  union all select 'storage_migration',to_jsonb(t) from storage.migrations t
  union all select 'vector_bucket',to_jsonb(t) from storage.buckets_vectors t
  union all select 'vector_index',to_jsonb(t) from storage.vector_indexes t
), sequence_observations as (
  -- pg_sequences exposes last_value but not is_called; explicit sequence
  -- last_value/is_called verification and cache treatment belong to the holder.
  -- int8 is text so a JSON/JavaScript observer cannot round sequence bounds.
  select schemaname,sequencename,sequenceowner,data_type::text,start_value::text,min_value::text,
         max_value::text,increment_by::text,cycle,cache_size::text,last_value::text
  from pg_sequences where schemaname in ('public','private','auth')
)
select json_build_object(
  'format_version',1,'database',current_database(),'server_version',current_setting('server_version'),
  'catalog_record_count',(select count(*) from catalog_records),
  'catalog_sha256',(select encode(sha256(convert_to(coalesce(string_agg(
       jsonb_build_array(kind,identity,definition)::text,chr(10)
       order by kind collate "C",identity collate "C"),''),'UTF8')),'hex') from catalog_records),
  'managed_record_count',(select count(*) from metadata_records),
  'managed_sha256',(select encode(sha256(convert_to(coalesce(string_agg(
       jsonb_build_array(kind,definition)::text,chr(10)
       order by kind collate "C",definition::text collate "C"),''),'UTF8')),'hex') from metadata_records),
  'sequence_observations',(select coalesce(json_agg(s order by schemaname collate "C",sequencename collate "C"),'[]'::json) from sequence_observations s),
  'auth_refresh_sequence',(select json_build_object('last_value',s.last_value::text,'is_called',s.is_called,
       'operator_select',has_sequence_privilege(current_user,'auth.refresh_tokens_id_seq','SELECT'))
       from auth.refresh_tokens_id_seq s),
  'configuration_values_compared',false,
  'provider_writers_frozen',false
);
rollback;
