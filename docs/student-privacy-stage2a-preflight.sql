-- STAGE 2A PRE-DEPLOYMENT INSPECTION ONLY. Each numbered block is one SELECT.
-- Paste/run ONE numbered block at a time as the SQL Editor project-owner role.
-- These queries inspect metadata/bucket configuration; they call no app RPCs.
-- No writes, role changes, explicit locks, migration execution or schema-cache reloads.
-- Prepared from the supplied original audit and the owner's Stage 1 exports.
-- Do not run the migration if any STOP condition occurs. Remaining read-only
-- blocks may still be collected for diagnosis. Do not repair/reseed/drop objects
-- merely to make checks pass. No SQL was executed when preparing this file.
-- Checksums are normalized catalog-text drift screens, not runtime proofs.
-- A mismatch can reflect definition formatting/search_path as well as real drift:
-- STOP and compare the definitions with the audit before deciding what to do.

-- 1. VERSION / OPERATOR
-- EXPECT: known live 17.11/major_version=17, operator_role=postgres.
-- Runtime suites passed on 17.12 and 18.0. Review any unexpected live-version
-- or operator change before deployment; confirm the intended project in the UI.
select version() as server_version,
       current_setting('server_version_num')::integer / 10000 as major_version,
       current_user as operator_role, current_database() as database_name,
       current_setting('search_path') as search_path;

-- 2. REQUIRED AUDITED TABLE SHAPES + STAGE 1 SETTINGS/BLOCK STORAGE
-- EXPECT: 16 rows, all PASS, owner=postgres. Covers exact column order/types,
-- nullability/defaults, RLS and FORCE RLS against audit + Stage 1 continuation.
-- In particular: is_private=false, dm_permission='eligible_students',
-- allow_group_additions=true, allow_new_dms=true; all non-null defaults.
-- Blocker/blocked UUIDs and created_at timestamptz NOT NULL DEFAULT now().
-- STOP: any STOP status or missing table. No student row values are read.
with expected(relation_name,column_count,column_md5,rls,forced_rls) as (values
 ('private.group_mutation_receipts',4,'0ffdb5a54cfb4713950b1a4b0586511a',true,false),
 ('public.course_enrollments',14,'f3f629d521f8daeb45b034ae29d8ab9f',true,false),
 ('public.dm_conversations',6,'922c8d6941c8660c528b180f6e3b480b',true,false),
 ('public.dm_messages',7,'11769e01a15c3f63bdeea77e3ed8aa16',true,false),
 ('public.dm_read_positions',3,'200015ae0bd3aabd61292aac1cd2297b',true,false),
 ('public.friend_requests',7,'799ab82c64b93adb03b861704db79440',true,false),
 ('public.friendships',3,'832664f237bd3c4944fc2ccb530304b1',true,false),
 ('public.group_conversations',7,'6591a6302cfe36113bb5b93d644d818f',true,false),
 ('public.group_members',5,'50d5669e23f11b291152ced3d1189f4d',true,false),
 ('public.group_messages',7,'38130666bc1d5221623f222f02c08269',true,false),
 ('public.profiles',17,'ade5892afc06801e5cfc5d97431c08aa',true,false),
 ('public.study_group_availability',7,'b7c12abb3420ab30ce42656d2b520a5b',true,false),
 ('public.study_group_members',6,'5030de97b5fbfc2e6c596db14ded3fa8',true,false),
 ('public.study_group_tasks',7,'c0bb54e0dc1f0ceeab7a0c487449eca7',true,false),
 ('public.study_groups',6,'c9c96989361884079043ed9164d2fd23',true,false),
 ('public.student_blocks',3,'0fb7bd795be02c55af5f6ef69185d657',true,false)
)
select e.relation_name, pg_get_userbyid(c.relowner) as owner,
       c.relrowsecurity as rls, c.relforcerowsecurity as forced_rls,
       a.column_count,
       case when c.oid is null then 'STOP: missing table'
            when c.relkind<>'r' or pg_get_userbyid(c.relowner)<>'postgres'
              or c.relrowsecurity<>e.rls or c.relforcerowsecurity<>e.forced_rls
              or a.column_count<>e.column_count or md5(a.layout)<>e.column_md5
            then 'STOP: table drift' else 'PASS' end as status,
       case when md5(a.layout) is distinct from e.column_md5 then a.layout end as differing_layout
from expected e
left join pg_class c on c.oid=to_regclass(e.relation_name)
left join lateral (
 select count(*) as column_count,
        string_agg(a.attname||':'||format_type(a.atttypid,a.atttypmod)||':'||
          a.attnotnull::text||':'||coalesce(pg_get_expr(d.adbin,d.adrelid),'<none>'),
          '|' order by a.attnum) as layout
 from pg_attribute a left join pg_attrdef d
   on d.adrelid=a.attrelid and d.adnum=a.attnum
 where a.attrelid=c.oid and a.attnum>0 and not a.attisdropped
) a on true
order by e.relation_name;

-- 3. EFFECTIVE STAGE 1 CLIENT PRIVILEGES (RLS still restricts rows)
-- EXPECT: four rows. profiles: anon all false; authenticated CRUD=true.
-- authenticated column SELECT/INSERT/UPDATE=true; extra_privileges=false.
-- Both client roles must have superuser=false and bypass_rls=false.
-- student_blocks: anon all false; authenticated SELECT=true, writes=false.
-- STOP: any difference. any_column_* catches column-only grants as well.
-- The sole profile_owner and student_blocks_owner_read policies are checked in 6.
with roles(role_name) as (values ('anon'),('authenticated')),
     tables(relation_name) as (values ('public.profiles'),('public.student_blocks'))
select role_name, relation_name, r.rolsuper as superuser, r.rolbypassrls as bypass_rls,
       has_table_privilege(role_name,to_regclass(relation_name),'SELECT') as can_select,
       has_table_privilege(role_name,to_regclass(relation_name),'INSERT') as can_insert,
       has_table_privilege(role_name,to_regclass(relation_name),'UPDATE') as can_update,
       has_any_column_privilege(role_name,to_regclass(relation_name),'SELECT') as any_column_select,
       has_any_column_privilege(role_name,to_regclass(relation_name),'INSERT') as any_column_insert,
       has_any_column_privilege(role_name,to_regclass(relation_name),'UPDATE') as any_column_update,
       has_table_privilege(role_name,to_regclass(relation_name),'DELETE') as can_delete,
       (has_table_privilege(role_name,to_regclass(relation_name),'TRUNCATE') or
        has_table_privilege(role_name,to_regclass(relation_name),'TRIGGER') or
        has_any_column_privilege(role_name,to_regclass(relation_name),'REFERENCES')) as extra_privileges
from roles cross join tables join pg_roles r on r.rolname=roles.role_name
order by relation_name,role_name;

-- 4. CURRENT SIGNATURES / DEFINITIONS / EFFECTIVE EXECUTE
-- EXPECT: 42 rows, all PASS. Includes all 26 replaced routines and 16 helpers/
-- wrappers. Full definition checksums include argument names/defaults, return
-- types, volatility, SECURITY DEFINER and search_path. Extra overloads are shown.
-- EXECUTE flags are ordered anon/authenticated/service_role: 011=client+service,
-- 001=service only, 010=authenticated only, 000=owner only in the supplied audit.
-- BEFORE deployment, the six legacy overloads are STILL callable as audited;
-- Stage 2A will retire them. Do not require their post-deployment ACLs yet.
-- STOP: missing/changed/extra routine, non-postgres owner, or changed privileges.
with expected(signature,definition_md5,execute_flags) as (values
 ('private.can_view_classmate(uuid,uuid,text)','73240d47e68df09974f8cfa56d9d2690','000'),
 ('private.can_view_classmate_in_section(uuid,uuid,text,text)','25b734e12581978114e0c367c56035ad','000'),
 ('private.can_view_classmate_with_professor(uuid,uuid,text,text,text,text)','67b86af5dea685feabc34026f656ef1a','000'),
 ('private.dm_code(text)','3e0c1d89b3c2e8b7d58cb4ebcdf6b558','000'),
 ('private.dm_contact(uuid,uuid,text)','a3051b4b71a8d5362422edd442f458d4','000'),
 ('private.dm_eligible(uuid)','b6bfa59a09cfff41469a89e882b0f5a8','000'),
 ('private.group_floor(uuid)','9f4cf0b7bd34d5c0dc2a212823772340','010'),
 ('private.group_mutate(uuid,uuid[],text,uuid)','c3c129fed5b9394b5e1e9ad6e68b8d6f','000'),
 ('private.group_name(uuid)','51911d0c8ef3c2e901663ce11f56fce2','000'),
 ('private.is_current_course_member(uuid,text)','6ed9a87f698922fb0ada799894852662','000'),
 ('private.is_current_course_professor_member(uuid,text,text,text,text)','6d8a2d34329bb500f76ebc7c2b0fb969','000'),
 ('private.is_current_course_section_member(uuid,text,text)','b90d530c1e2f484c32198a300f3f663a','000'),
 ('private.is_eligible()','8939eb7b7add9252c00c549caeb8d4c0','010'),
 ('private.resolve_current_semester(timestamp with time zone)','ea3632897fdd6fc9b354e8010dd4f2ff','000'),
 ('public.course_friend_relationships(text,text)','9b6a995152a35bac55a6a3702db5cc4c','011'),
 ('public.course_friend_relationships_by_professor(text,text,text,text)','6486deab7b2642a9fe320d9f7b332fa9','011'),
 ('public.course_recommendation_profiles(text,text)','a0fe9be3403d6146a5ec7c42189ccc64','011'),
 ('public.course_recommendation_profiles_by_professor(text,text,text,text)','f8cf688c82972ee48dee15479b0b41be','011'),
 ('public.create_study_group(text,text,text,uuid[])','44c07cef4e851e4a690af36b50a922e4','011'),
 ('public.dm_contact_state(uuid,text)','67fa476d094ece4d4254b96090a974e5','011'),
 ('public.dm_send_message(uuid,text,uuid,text)','8beff515b158e20f3a4d2f7d257ec160','011'),
 ('public.find_classmates(text,text)','223c819c3ef7f699e5f1da42581e925f','011'),
 ('public.find_classmates_by_professor(text,text,text,text)','4943baa325ab4ba9578169dee1c05a94','011'),
 ('public.friend_directory()','79b4828920cfec378ad1ab168bf74d70','011'),
 ('public.friend_request_inbox()','83b658943fd68793988863100de8f23b','011'),
 ('public.friends_in_course(text)','7aa9593f6e6278bce17af9ff69cba27e','011'),
 ('public.get_classmate_profile(text,text,uuid)','f73fd003fc4238fd6643317d10f4fab4','011'),
 ('public.get_classmate_profile_by_professor(text,text,text,text,uuid)','5b3413c65934433e2fadd9fde1963d9a','011'),
 ('public.get_discoverable_profile(uuid)','c1559f06d8753c473712e46387273a79','011'),
 ('public.get_friend_profile(uuid)','a01a49f8d90fa1ba96f2bdcbcf534124','011'),
 ('public.group_add_members(uuid,uuid[],uuid)','73dfd8b7cee95b3387d4b73353f12e05','011'),
 ('public.group_create(uuid[],uuid,text)','e51951d0ddf64aae404d531c4ee11b04','011'),
 ('public.group_detail(uuid)','1a5510264a032d2f012f35ba22faf007','011'),
 ('public.leave_study_group(uuid)','c68d4b5c103547b8a3b18ae9964be2ed','011'),
 ('public.resolve_classmate_avatar(uuid,uuid,text,text)','ce859893545e52fb975082f59ab5541d','001'),
 ('public.resolve_classmate_avatar_by_professor(uuid,uuid,text,text,text,text)','fd72bd55407c70ec7e02e83fce08ed85','001'),
 ('public.resolve_friend_avatar(uuid,uuid)','0a5d7ffece0c1278c265313afcfeb560','001'),
 ('public.respond_to_friend_request(uuid,text)','c3137528298d19ac453aef282db6c31f','011'),
 ('public.respond_to_study_group_invite(uuid,boolean)','ce72ffd57dfae9457bb9e2fd8b87c322','011'),
 ('public.send_friend_request(text,text,uuid)','21fb7f3cefcd7d5fcd16203c8c375bc7','011'),
 ('public.send_friend_request_to_classmate(text,text,text,text,uuid)','2225035c4dab21d62fc23d7f0573ce02','011'),
 ('public.send_friend_request_to_student(uuid)','0372d5246984e0c0ddb40e3e78838bc7','011')
), scoped as (
 select p.* from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname||'.'||p.proname in
       (select split_part(signature,'(',1) from expected)
), inspected as (
 select e.*,p.oid,p.proowner,p.prosecdef,p.proconfig,p.prokind,
        case when p.oid is not null and p.prokind in('f','p') then md5(replace(pg_get_functiondef(p.oid),chr(13),'')) end as actual_md5,
        case when p.oid is not null then
          (has_function_privilege('anon',p.oid,'EXECUTE')::integer)::text||
          (has_function_privilege('authenticated',p.oid,'EXECUTE')::integer)::text||
          (has_function_privilege('service_role',p.oid,'EXECUTE')::integer)::text
        end as actual_flags
 from expected e full join scoped p on p.oid=to_regprocedure(e.signature)
)
select coalesce(signature,oid::regprocedure::text) as signature,
       pg_get_userbyid(proowner) as owner, prosecdef as security_definer,
       proconfig, actual_flags as execute_anon_authenticated_service,
       execute_flags as expected_execute_flags,
       case when signature is null then 'STOP: unexpected overload'
            when oid is null then 'STOP: missing routine'
            when pg_get_userbyid(proowner)<>'postgres' or prokind<>'f'
              or actual_md5 is distinct from definition_md5
              or actual_flags is distinct from execute_flags
            then 'STOP: definition/privilege drift' else 'PASS' end as status
from inspected order by 1;

-- 5. PRIVATE AVATARS BUCKET
-- EXPECT: exactly one avatars row, public=false.
-- STOP: absent row or public=true/null. Limits/MIME values are informational:
-- app picture delivery is bounded to 5 MiB and PNG/JPEG; review incompatible limits.
select id,name,"public",file_size_limit,allowed_mime_types
from storage.buckets where id='avatars';

-- 6. CONSTRAINT / INDEX / POLICY / TRIGGER DRIFT
-- EXPECT: 16 rows, all PASS. Includes profile DM enum CHECK; directed block PK,
-- self-block CHECK, both cascading Auth FKs, reverse index and owner-only policies.
-- All audited constraints/indexes/policies/triggers on the 16 relations are compared.
-- New PostgreSQL NOT NULL catalog entries are ignored here (checked by 2).
-- STOP: any drift, invalid/unready index, unvalidated constraint or disabled trigger.
with expected(relation_name,catalog_md5) as (values
 ('private.group_mutation_receipts','ce88bf3fd573b6ca943bbf96ab7884fe'),
 ('public.course_enrollments','476056c86d37e76979a3951d8e15490a'),
 ('public.dm_conversations','4d99f8cb5e0d4fceb475dd32a2074882'),
 ('public.dm_messages','ae74e5d32f501456a2eb1ba306b9811f'),
 ('public.dm_read_positions','ea6583257ec1669c3cd5373548f9b384'),
 ('public.friend_requests','0b7da32ac5e1334dc0403f56bba7df8c'),
 ('public.friendships','a0fcbdf6255ae26c5190593f94f128a9'),
 ('public.group_conversations','11340943857e6e6ef80a6bb09f8e75e0'),
 ('public.group_members','8f7c07ea7307c88b197d87f0de1ec9e6'),
 ('public.group_messages','ef6788ee3ee5181abaf0b616c24263da'),
 ('public.profiles','014321d3dc8ae6aba6d005e28332b809'),
 ('public.study_group_availability','afcfa5c9c85f9a7da33c3fcc23bd7512'),
 ('public.study_group_members','820d0c3cfe04ffa38b34f029f270f2b7'),
 ('public.study_group_tasks','ee9fc0584edbe6a1a85ff7b5e02c3b63'),
 ('public.study_groups','b9095eee9a3c1666e35d017cfc95676e'),
 ('public.student_blocks','86821ff243cba79907d46b0d76ded13d')
), objects as (
 select e.relation_name,'C|'||c.conname||'|'||pg_get_constraintdef(c.oid) as item
 from expected e join pg_constraint c on c.conrelid=to_regclass(e.relation_name)
 where c.contype<>'n'
 union all
 select e.relation_name,'I|'||i.indexname||'|'||i.indexdef
 from expected e join pg_indexes i on i.schemaname||'.'||i.tablename=e.relation_name
 union all
 select e.relation_name,'P|'||p.policyname||'|'||p.permissive||'|'||p.roles::text||'|'||p.cmd||'|'||
        coalesce(p.qual,'<none>')||'|'||coalesce(p.with_check,'<none>')
 from expected e join pg_policies p on p.schemaname||'.'||p.tablename=e.relation_name
 union all
 select e.relation_name,'T|'||t.tgname||'|'||pg_get_triggerdef(t.oid)
 from expected e join pg_trigger t on t.tgrelid=to_regclass(e.relation_name)
 where not t.tgisinternal
), actual as (
 select relation_name,md5(string_agg(replace(item,chr(13),''),chr(10) order by item collate "C")) as catalog_md5
 from objects group by relation_name
)
select e.relation_name,
       case when a.catalog_md5 is distinct from e.catalog_md5
          or exists(select 1 from pg_index i where i.indrelid=to_regclass(e.relation_name)
                    and (not i.indisvalid or not i.indisready))
          or exists(select 1 from pg_constraint c where c.conrelid=to_regclass(e.relation_name)
                    and not c.convalidated)
          or exists(select 1 from pg_trigger t where t.tgrelid=to_regclass(e.relation_name)
                    and not t.tgisinternal and t.tgenabled<>'O')
       then 'STOP: catalog drift/state' else 'PASS' end as status,
       a.catalog_md5 as actual_md5,e.catalog_md5 as expected_md5
from expected e left join actual a using(relation_name)
order by e.relation_name;

-- 7. NEW-OBJECT COLLISIONS / SUPPORTING DEPENDENCIES / SCHEMA DDL ACCESS
-- EXPECT: ZERO rows (SQL Editor: Success. No rows returned).
-- STOP: any row. Existing Stage 2A names may mean already applied/partial work:
-- do not rerun, drop or overwrite them without review.
with new_names(schema_name,function_name) as (values
 ('public','block_student'),('public','unblock_student'),
 ('public','group_member_identity'),('public','resolve_group_avatar'),
 ('private','students_blocked'),('private','student_friend'),
 ('private','student_visible'),('private','student_pair_lock'),
 ('private','dm_block_guard'),('private','group_admission_block_guard'),
 ('private','study_admission_block_guard')
), new_triggers(relation_name,trigger_name) as (values
 ('public.dm_messages','dm_block_guard'),
 ('public.group_members','group_admission_block_guard'),
 ('public.study_group_members','study_admission_block_guard')
), dependencies(relation_name) as (values
 ('auth.users'),('auth.identities'),('storage.buckets'),('storage.objects'),
 ('public.user_courses'),('public.user_course_sections'),
 ('public.course_offerings'),('public.verify_courses'),('public.semester_calendar')
)
select 'Existing Stage 2A routine' as issue,p.oid::regprocedure::text as object_name
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
join new_names x on x.schema_name=n.nspname and x.function_name=p.proname
union all
select 'Existing Stage 2A trigger',x.relation_name||'.'||x.trigger_name
from new_triggers x join pg_trigger t
 on t.tgrelid=to_regclass(x.relation_name) and t.tgname=x.trigger_name
union all
select 'Missing supporting relation',relation_name from dependencies
where to_regclass(relation_name) is null
union all
select 'Missing Auth identity helper','auth.uid()'
where to_regprocedure('auth.uid()') is null
union all
select 'Missing schema CREATE permission',n.nspname
from pg_namespace n where n.nspname in('public','private')
 and not has_schema_privilege(current_user,n.oid,'CREATE')
order by 1,2;

-- Passing metadata checks do not replace hosted Auth/PostgREST/Storage/Realtime
-- smoke checks, nor do they prove the deployed frontend build is compatible.
-- Before manual deployment: deploy the compatible frontend and refresh tabs;
-- pause/drain social writes; run only the complete Stage 2A migration once.
-- Stage 1 is already live. Do not replay Stage 1 or historical scripts.
