-- Owner-authorized recovery of exactly three assignments from the verified
-- preparatory backup. Not a migration; never include in db push.
-- The reviewed PS executor replaces the single marker with validated base64
-- JSON kept in RAM. No row values or credentials belong in this file.
BEGIN;
SET LOCAL lock_timeout='3s';
SET LOCAL statement_timeout='15s';
SET LOCAL timezone='UTC';
SET LOCAL datestyle='ISO,YMD';
SET LOCAL row_security=off;
LOCK TABLE public.auditoria_diaria,public.empleados,public.rutinas,public.tareas_rutina,public.tareas_urgentes IN SHARE MODE;
LOCK TABLE public.empleado_rutinas IN SHARE ROW EXCLUSIVE MODE;

DO $preconditions$
BEGIN
 IF current_user<>'postgres' OR current_database()<>'postgres' THEN RAISE EXCEPTION 'stage04_wrong_recovery_actor' USING ERRCODE='42501'; END IF;
 IF (SELECT count(*) FROM public.empleado_rutinas)<>0 THEN RAISE EXCEPTION 'stage04_assignment_target_not_empty' USING ERRCODE='40001'; END IF;
 IF (SELECT count(*) FROM pg_attribute WHERE attrelid='public.empleado_rutinas'::regclass AND attnum>0 AND NOT attisdropped)<>3
 OR EXISTS(SELECT 1 FROM pg_attribute WHERE attrelid='public.empleado_rutinas'::regclass AND attnum>0 AND NOT attisdropped
   AND (attname NOT IN ('id','empleado_id','rutina_id') OR atttypid<>'uuid'::regtype))
 OR EXISTS(SELECT 1 FROM pg_attribute WHERE attrelid='public.empleados'::regclass AND attname='auth_user_id' AND NOT attisdropped)
 THEN RAISE EXCEPTION 'stage04_recovery_schema_changed' USING ERRCODE='40001'; END IF;
 IF EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid='public.empleado_rutinas'::regclass AND NOT tgisinternal)
 THEN RAISE EXCEPTION 'stage04_unreviewed_assignment_trigger' USING ERRCODE='40001'; END IF;
END
$preconditions$;

CREATE TEMP TABLE stage04_recovery_before(fingerprint jsonb NOT NULL) ON COMMIT DROP;
CREATE FUNCTION pg_temp.stage04_unchanged_business() RETURNS jsonb LANGUAGE sql STABLE AS $digest$
 WITH records(resource,id,legacy) AS (
 SELECT 'empleados',id::text,jsonb_build_array(id,nombre,rol) FROM public.empleados
 UNION ALL SELECT 'rutinas',id::text,to_jsonb(r)-'archivada_en'-'color' FROM public.rutinas r
 UNION ALL SELECT 'tareas_rutina',id::text,to_jsonb(t)-'archivada_en' FROM public.tareas_rutina t
 UNION ALL SELECT 'auditoria_diaria',id::text,to_jsonb(a)-'anulada_en' FROM public.auditoria_diaria a
 UNION ALL SELECT 'tareas_urgentes',id::text,to_jsonb(u)-'cancelada_en' FROM public.tareas_urgentes u
 ), expected(resource) AS (VALUES ('empleados'),('rutinas'),('tareas_rutina'),('auditoria_diaria'),('tareas_urgentes')),
 hashes AS (
 SELECT e.resource,jsonb_build_array(count(r.id),encode(sha256(convert_to(coalesce(string_agg(r.legacy::text,chr(10) ORDER BY r.id COLLATE "C"),''),'UTF8')),'hex')) AS value
 FROM expected e LEFT JOIN records r ON r.resource=e.resource GROUP BY e.resource
 ) SELECT jsonb_object_agg(resource,value) FROM hashes
$digest$;
INSERT INTO stage04_recovery_before(fingerprint) SELECT pg_temp.stage04_unchanged_business();
CREATE TEMP TABLE stage04_assignment_rows(id uuid PRIMARY KEY,empleado_id uuid NOT NULL,rutina_id uuid NOT NULL,UNIQUE(empleado_id,rutina_id)) ON COMMIT DROP;
INSERT INTO stage04_assignment_rows(id,empleado_id,rutina_id)
 SELECT r.id,r.empleado_id,r.rutina_id FROM jsonb_to_recordset(convert_from(decode('__STAGE04_ROWS_BASE64__','base64'),'UTF8')::jsonb) AS r(id uuid,empleado_id uuid,rutina_id uuid);

DO $validate_original$
BEGIN
 IF (SELECT count(*) FROM stage04_assignment_rows)<>3
 OR (SELECT encode(sha256(convert_to(string_agg(id::text,chr(10) ORDER BY id),'UTF8')),'hex') FROM stage04_assignment_rows)<>'48cf4bd6a0d2b09629e36dcfb9d3be7210edaec5c6b6dbbea2209c723996855f'
 OR (SELECT encode(sha256(convert_to(string_agg(jsonb_build_array(id,empleado_id,rutina_id)::text,chr(10) ORDER BY id),'UTF8')),'hex') FROM stage04_assignment_rows)<>'da48ea43f92199f8de6c21fa881b489f2ed48ef0eb5cf5818543cace32b78d31'
 THEN RAISE EXCEPTION 'stage04_original_assignment_identity_mismatch' USING ERRCODE='22023'; END IF;
 IF EXISTS(SELECT 1 FROM stage04_assignment_rows a LEFT JOIN public.empleados e ON e.id=a.empleado_id
 LEFT JOIN public.rutinas r ON r.id=a.rutina_id WHERE e.id IS NULL OR r.id IS NULL)
 THEN RAISE EXCEPTION 'stage04_assignment_parent_missing' USING ERRCODE='23503'; END IF;
END
$validate_original$;

INSERT INTO public.empleado_rutinas(id,empleado_id,rutina_id) SELECT id,empleado_id,rutina_id FROM stage04_assignment_rows;
SET CONSTRAINTS ALL IMMEDIATE;
DO $verify_before_commit$
BEGIN
 IF (SELECT count(*) FROM public.empleado_rutinas)<>3
 OR (SELECT encode(sha256(convert_to(string_agg(id::text,chr(10) ORDER BY id),'UTF8')),'hex') FROM public.empleado_rutinas)<>'48cf4bd6a0d2b09629e36dcfb9d3be7210edaec5c6b6dbbea2209c723996855f'
 OR (SELECT encode(sha256(convert_to(string_agg(jsonb_build_array(id,empleado_id,rutina_id)::text,chr(10) ORDER BY id),'UTF8')),'hex') FROM public.empleado_rutinas)<>'da48ea43f92199f8de6c21fa881b489f2ed48ef0eb5cf5818543cace32b78d31'
 OR pg_temp.stage04_unchanged_business() IS DISTINCT FROM (SELECT fingerprint FROM stage04_recovery_before)
 THEN RAISE EXCEPTION 'stage04_recovery_integrity_mismatch' USING ERRCODE='40001'; END IF;
END
$verify_before_commit$;
COMMIT;
SELECT json_build_object('kind','stage04.assignment_recovery.v1','row_count',(SELECT count(*) FROM public.empleado_rutinas),
 'uuid_sha256',(SELECT encode(sha256(convert_to(string_agg(id::text,chr(10) ORDER BY id),'UTF8')),'hex') FROM public.empleado_rutinas),
 'uuid_fk_sha256',(SELECT encode(sha256(convert_to(string_agg(jsonb_build_array(id,empleado_id,rutina_id)::text,chr(10) ORDER BY id),'UTF8')),'hex') FROM public.empleado_rutinas),
 'other_business_preserved',true);
