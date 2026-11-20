"""Build a SCOPED disposable baseline from owner-supplied catalog CSVs.

Not a migration or a live restore. No connection code. Supporting columns absent
from the truncated audit are documented below; all relevant audited constraints,
indexes, policies, grants, trigger bodies and RPC definitions take precedence.
"""
import csv
import hashlib
import re
from collections import defaultdict
from pathlib import Path

FILES = {
    'columns': 'Supabase Snippet Check what tables and fields exist 11_18.csv',
    'functions': 'Supabase Snippet Audit 3_ Inspect RPC Functions.csv',
    'constraints': 'Supabase Snippet Audit 4.1_Constraints.csv',
    'indexes': 'Supabase Snippet Audit 4.2_ Indexes.csv',
    'triggers': 'Supabase Snippet Audit 4.3_ Triggers.csv',
    'rls': 'Supabase Snippet Audit 2.1_ Check if RLS is enabled 11_18.csv',
    'policies': 'Supabase Snippet Audit 2.2_ Check RLS Policies .csv',
    'grants': 'Supabase Snippet Audit 2.3_ Check Table Privileges .csv',
    'column_grants': 'Supabase Snippet Audit 2.4_ Column Privileges.csv',
}

# Only column definitions not present in the truncated 100-row column export.
# Sources: accounts (20261016), course_reviews (20261017), semester-aware
# enrollments (20261025), plus the owner's three study_groups continuation rows.
# Constraints/ACLs/RLS on these tables are still restored from the live exports.
SUPPORT = {
    ('public', 'user_courses'): 'id uuid not null default gen_random_uuid(),user_id uuid not null,course_code text not null,created_at timestamptz not null default now(),updated_at timestamptz not null default now()',
    ('public', 'user_course_sections'): 'user_course_id uuid not null,section text not null',
    ('public', 'course_offerings'): 'id text not null,course_code text not null,course_title text not null,professor_name text not null,semester text not null,academic_year integer not null,course_number text,section text,professor_first_name text,professor_last_name text,catalog_verified boolean not null default false',
    ('public', 'verify_courses'): "id uuid not null default gen_random_uuid(),course_code text not null,course_number text not null,section text not null,professor_first_name text not null,professor_last_name text not null,student_id uuid not null,semester text not null,academic_year integer not null,status text not null default 'pending',submitted_at timestamptz not null default now(),reviewed_at timestamptz",
    ('public', 'semester_calendar'): 'semester text not null,start_month smallint not null,start_day smallint not null,end_month smallint not null,end_day smallint not null',
}


def ident(value):
    return '"' + value.replace('"', '""') + '"'


def relation(schema, table):
    return ident(schema) + '.' + ident(table)


def build(audit_root: Path, repo: Path):
    rows = {}
    hashes = {}
    for key, filename in FILES.items():
        path = audit_root / filename
        hashes[filename] = hashlib.sha256(path.read_bytes()).hexdigest()
        with path.open(encoding='utf-8-sig', newline='') as stream:
            rows[key] = list(csv.DictReader(stream))
    columns = defaultdict(list)
    for row in rows['columns']:
        kind = row['data_type']
        if kind == 'ARRAY':
            assert row['column_name'] == 'interests' and row['column_default'] == "'{}'::text[]"
            kind = 'text[]'
        definition = ident(row['column_name']) + ' ' + kind
        if row['is_nullable'] == 'NO':
            definition += ' not null'
        if row['column_default'] != 'null':
            definition += ' default ' + row['column_default']
        columns[(row['table_schema'], row['table_name'])].append(definition)
    assert len(rows['columns']) == 100, 'Re-review column coverage when audit changes'
    columns['public', 'study_groups'].extend(['created_by uuid not null', 'created_at timestamptz not null default now()', 'course_section text'])
    audited_tables = set(columns)
    for table, definition in SUPPORT.items():
        assert table not in columns
        columns[table] = [definition]
    tables = set(columns)
    sql = [
        '-- DISPOSABLE SCOPED TEST BASELINE ONLY; not a deployment script.',
        (repo / 'supabase/tests/bootstrap.sql').read_text(),
        'alter role service_role bypassrls;',
        'create schema private; revoke all on schema private from public;',
        'grant usage on schema private to authenticated;',
        'grant usage on schema public,auth,storage to service_role;',
        'set search_path=public,pg_catalog;',
    ]
    for (schema, table), definitions in columns.items():
        sql.append(f'create table {relation(schema, table)} (' + ','.join(definitions) + ');')
    # pg_dump-style dependency staging: SQL functions can reference each other.
    # Revalidate all selected function bodies with checking ON after installation.
    sql.append('set check_function_bodies=off;')
    selected = []
    private_names = {
        'can_view_classmate', 'can_view_classmate_in_section', 'can_view_classmate_with_professor',
        'dm_code', 'dm_contact', 'dm_eligible', 'eligible_account', 'group_floor',
        'group_message_json', 'group_mutate', 'group_name', 'initialize_profile_trigger',
        'is_current_course_member', 'is_current_course_professor_member',
        'is_current_course_section_member', 'is_eligible', 'messaging_rows',
        'prevent_duplicate_course_code_per_term', 'resolve_current_semester',
        'touch_profile', 'touch_updated_at', 'valid_interests',
    }
    public_names = {
        'account_is_eligible', 'ensure_profile', 'find_classmates', 'find_classmates_by_professor',
        'friend_directory', 'friend_request_inbox', 'friends_in_course', 'get_classmate_profile',
        'get_classmate_profile_by_professor', 'get_discoverable_profile', 'get_friend_profile',
        'course_friend_relationships', 'course_friend_relationships_by_professor',
        'course_recommendation_profiles', 'course_recommendation_profiles_by_professor',
        'respond_to_friend_request', 'send_friend_request', 'send_friend_request_to_classmate',
        'send_friend_request_to_student', 'unfriend', 'resolve_friend_avatar',
        'resolve_classmate_avatar', 'resolve_classmate_avatar_by_professor',
        'dm_contact_state', 'dm_history', 'dm_inbox', 'dm_mark_read', 'dm_send_message', 'dm_unread',
        'group_add_members', 'group_create', 'group_detail', 'group_friend_candidates',
        'group_history', 'group_mark_read', 'group_remove_member', 'group_send_message',
        'messaging_inbox', 'messaging_unread', 'create_study_group', 'my_study_groups',
        'respond_to_study_group_invite', 'leave_study_group', 'save_study_group_availability',
        'set_study_group_member_role', 'add_study_group_task', 'delete_study_group_task',
        'set_study_group_task_complete', 'my_current_enrollments',
    }
    for row in rows['functions']:
        name = row['signature'].split('(')[0].split('.')[-1]
        if (row['schema_name'] == 'private' and name in private_names or
                row['schema_name'] == 'public' and name in public_names):
            assert row['owner'] == 'postgres'
            selected.append(row)
            sql.append(row['definition'].strip().rstrip(';') + ';')
    sql.append('set check_function_bodies=on;')
    for row in selected:
        sql.append(row['definition'].strip().rstrip(';') + ';')
    constraints = [r for r in rows['constraints'] if (r['schema_name'], r['relname']) in tables]
    # Referenced primary/unique keys must exist before foreign keys.
    constraints.sort(key=lambda r: r['definition'].startswith('FOREIGN KEY'))
    for row in constraints:
        sql.append(f"alter table {relation(row['schema_name'], row['relname'])} add constraint {ident(row['conname'])} {row['definition']};")
    # Constraint-backed indexes have already been created under their audit names.
    constraint_names = {(r['schema_name'], r['conname']) for r in constraints}
    for row in rows['indexes']:
        if (row['schemaname'], row['tablename']) in tables and (row['schemaname'], row['indexname']) not in constraint_names:
            sql.append(row['indexdef'].rstrip(';') + ';')
    for row in rows['rls']:
        if (row['schema_name'], row['relname']) in tables:
            state = 'enable' if row['relrowsecurity'] == 'true' else 'disable'
            sql.append(f"alter table {relation(row['schema_name'], row['relname'])} {state} row level security;")
            if row['relforcerowsecurity'] == 'true':
                sql.append(f"alter table {relation(row['schema_name'], row['relname'])} force row level security;")
    all_tables = tables | {('storage', 'objects')}
    for table in all_tables:
        sql.append(f'revoke all on {relation(*table)} from public,anon,authenticated,service_role;')
    for row in rows['grants']:
        if (row['table_schema'], row['table_name']) in all_tables and row['grantee'] != 'postgres':
            sql.append(f"grant {row['privilege_type']} on {relation(row['table_schema'], row['table_name'])} to {ident(row['grantee'])};")
    known_columns = {table: {re.match(r'"?([a-z_]+)', part.strip())[1] for definition in definitions for part in definition.split(',')} for table, definitions in columns.items()}
    known_columns['storage', 'objects'] = {'id', 'bucket_id', 'name'}
    skipped_columns = set()
    for row in rows['column_grants']:
        table = row['table_schema'], row['table_name']
        if table in all_tables and row['column_name'] not in known_columns[table]:
            skipped_columns.add('.'.join((*table, row['column_name'])))
            continue
        if table in all_tables and row['grantee'] != 'postgres':
            sql.append(f"grant {row['privilege_type']} ({ident(row['column_name'])}) on {relation(row['table_schema'], row['table_name'])} to {ident(row['grantee'])};")
    for row in selected:
        signature = row['signature']
        if row['schema_name'] == 'public':
            signature = 'public.' + signature
        sql.append(f'revoke all on function {signature} from public,anon,authenticated,service_role;')
        for role in ['anon', 'authenticated', 'service_role']:
            if row[role + '_execute'] == 'true':
                sql.append(f'grant execute on function {signature} to {role};')
    for row in rows['policies']:
        if (row['schemaname'], row['tablename']) in all_tables:
            command = f"create policy {ident(row['policyname'])} on {relation(row['schemaname'], row['tablename'])} as {row['permissive']} for {row['cmd']} to "
            command += ','.join(ident(role) for role in row['roles'].strip('{}').split(','))
            if row['qual'] != 'null':
                command += ' using (' + row['qual'] + ')'
            if row['with_check'] != 'null':
                command += ' with check (' + row['with_check'] + ')'
            sql.append(command + ';')
    # Verify-course approval trigger is out of scope (catalog moderation tables
    # were not exported). It never participates in these fixture operations.
    trigger_tables = tables | {('auth', 'users')}
    for row in rows['triggers']:
        if (row['schema_name'], row['relname']) in trigger_tables and row['tgname'] != 'verify_courses_promote_approved':
            sql.append(row['definition'].rstrip(';') + ';')
    sql.extend([
        "insert into storage.buckets values ('avatars','avatars',false,5242880,array['image/jpeg','image/png']);",
        "insert into public.semester_calendar values ('Fall',8,20,12,20),('Winter',1,2,1,22),('Spring',1,25,5,20),('Summer',5,22,8,14);",
    ])
    return '\n'.join(sql), {
        'audit_hashes': hashes,
        'audited_tables': len(audited_tables), 'audited_columns': 100,
        'owner_supplied_continuation_columns': 3,
        'support_tables': ['.'.join(t) for t in SUPPORT],
        'restored_functions': len(selected), 'restored_constraints': len(constraints),
        'unmodeled_column_grants_skipped': sorted(skipped_columns),
        'scope': 'Social authorization dependency subset, not a complete live database clone',
        'assumptions': ['minimal Auth/Storage stand-ins', 'private avatar bucket test row', 'repository semester calendar test rows', 'supporting columns from reviewed repository DDL', 'no hosted Realtime/PostgREST/Auth/Storage service'],
    }
