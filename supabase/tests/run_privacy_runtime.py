"""Create and stop a NEW loopback-only disposable PostgreSQL cluster on Windows.

Never reads .env, database URLs, pgpass or existing PostgreSQL data directories.
Every psql invocation has explicit local host/port/database/user and -X/-w.
The required audit directory is structural CSV data, not database credentials.
"""
import argparse
import json
import hashlib
import os
import socket
import re
import subprocess
import time
from datetime import datetime, timezone
from pathlib import Path

from privacy_runtime_baseline import build
from privacy_runtime_checks import seed_upgrade, snapshot, negative_migrations, concurrency, require

REPO = Path(__file__).resolve().parents[2]
BIN = Path('C:/Program Files/PostgreSQL/18/bin')
ROOT = (REPO / 'supabase/.temp/privacy-runtime').resolve()


class Disposable:
    def __init__(self, audit, postgres_bin=BIN, expected_major=None):
        self.bin = postgres_bin.resolve()
        self.expected_major = expected_major
        self.directory = ROOT / datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S%fZ')
        self.directory.mkdir(parents=True, exist_ok=False)
        self.data = self.directory / 'data'
        with socket.socket() as listener:
            listener.bind(('127.0.0.1', 0))
            self.port = listener.getsockname()[1]
        # Discard ALL libpq overrides, including hostaddr/service/options/password.
        platform_keys = {'PATH','SYSTEMROOT','WINDIR','COMSPEC','PATHEXT','TEMP','TMP',
                         'USERPROFILE','APPDATA','LOCALAPPDATA','PROGRAMFILES','PROGRAMFILES(X86)',
                         'PROGRAMW6432','SYSTEMDRIVE','HOMEDRIVE','HOMEPATH','NUMBER_OF_PROCESSORS',
                         'PROCESSOR_ARCHITECTURE','OS','USERNAME','USERDOMAIN','LANG','LC_ALL','LC_CTYPE'}
        self.env = {k: v for k, v in os.environ.items() if k.upper() in platform_keys}
        self.env.update(PGPASSFILE=str(self.directory / 'no-password-file'), PGCONNECT_TIMEOUT='3', PGCLIENTENCODING='UTF8')
        self.flags = subprocess.CREATE_NO_WINDOW if os.name == 'nt' else 0
        self.report = {'postgres_bin': str(self.bin), 'expected_major': expected_major, 'directory': str(self.directory), 'host': '127.0.0.1', 'port': self.port, 'database': 'postgres', 'tests': []}
        self.baseline, self.report['baseline'] = build(audit, REPO)
        self.started = False
        self.verified = False

    def command(self, name, arguments, **kwargs):
        if name == 'pg_ctl':
            # Windows server descendants can retain inherited PIPE handles. Use
            # files so pg_ctl completion cannot wait for the server to exit.
            path = self.directory / ('pg_ctl-' + arguments[-1] + '.log')
            with path.open('w', encoding='utf-8') as stream:
                result = subprocess.run([str(self.bin / 'pg_ctl.exe'), *arguments], env=self.env,
                                        creationflags=self.flags, stdout=stream, stderr=subprocess.STDOUT,
                                        timeout=40, **kwargs)
            result.stdout = path.read_text(encoding='utf-8', errors='replace')
            result.stderr = ''
            return result
        return subprocess.run([str(self.bin / (name + '.exe')), *arguments], env=self.env,
                              creationflags=self.flags, capture_output=True, text=True,
                              encoding='utf-8', errors='replace', timeout=60, **kwargs)

    @property
    def psql(self):
        if not self.verified:
            raise RuntimeError('New local postmaster must be verified before SQL')
        return [str(self.bin / 'psql.exe'), '-X', '-w', '-qAt', '-h', '127.0.0.1', '-p', str(self.port), '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-v', 'VERBOSITY=verbose']

    def query(self, sql, check=True):
        result = subprocess.run(self.psql, input=sql, env=self.env, creationflags=self.flags,
                                capture_output=True, text=True, encoding='utf-8', errors='replace', timeout=30)
        if check and result.returncode:
            raise RuntimeError(result.stderr)
        return result

    def file(self, name, content, expected_success=True):
        path = self.directory / (name + '.sql')
        path.write_text(content, encoding='utf-8')
        result = subprocess.run(self.psql + ['-f', str(path)], env=self.env, creationflags=self.flags,
                                capture_output=True, text=True, encoding='utf-8', errors='replace', timeout=60)
        (self.directory / (name + '.stdout.log')).write_text(result.stdout, encoding='utf-8')
        (self.directory / (name + '.stderr.log')).write_text(result.stderr, encoding='utf-8')
        self.report['tests'].append({'name': name, 'exit_code': result.returncode, 'expected_success': expected_success})
        if (result.returncode == 0) != expected_success:
            raise RuntimeError(name + ': ' + result.stderr[-7000:])
        print(name, 'PASS', flush=True)
        return result

    def validate_tools(self):
        versions = {}
        major = self.expected_major
        for tool in ['postgres', 'initdb', 'pg_ctl', 'psql']:
            if not (self.bin / (tool + '.exe')).is_file():
                raise RuntimeError(f'Missing {tool}.exe in selected binary directory: {self.bin}')
            result = self.command(tool, ['--version'])
            match = re.search(r'\(PostgreSQL\)\s+(\d+)\.', result.stdout)
            if result.returncode or not match:
                raise RuntimeError(f'Cannot verify selected {tool} version: {result.stderr}')
            actual = int(match.group(1))
            if major is None:
                major = actual
            if actual != major:
                raise RuntimeError(f'Refusing PostgreSQL {actual} {tool}; expected major {major}. No cluster initialized.')
            versions[tool] = result.stdout.strip()
        self.expected_major = major
        self.report['expected_major'] = major
        self.report['tool_versions'] = versions

    def start(self):
        if not self.directory.is_relative_to(ROOT) or self.data.exists():
            raise RuntimeError('Refusing a reused or non-disposable data directory')
        result = self.command('initdb', ['-D', str(self.data), '-U', 'postgres', '--encoding=UTF8', '--locale=C', '--auth-local=trust', '--auth-host=trust', '--no-sync'])
        (self.directory / 'initdb.log').write_text(result.stdout + result.stderr, encoding='utf-8')
        if result.returncode:
            raise RuntimeError('Isolated initdb failed: ' + result.stderr)
        # No inherited connection strings/config; no Windows service registration.
        with (self.data / 'postgresql.conf').open('a', encoding='utf-8') as config:
            config.write(f"\nlisten_addresses='127.0.0.1'\nport={self.port}\nmax_connections=20\nlog_min_messages=warning\n")
        self.started = True  # finally must stop even a partially successful startup
        result = self.command('pg_ctl', ['-D', str(self.data), '-l', str(self.directory / 'postgres.log'), '-w', '-t', '20', 'start'])
        if result.returncode:
            raise RuntimeError('Isolated server failed to start: ' + result.stdout + result.stderr)
        self.started = True
        pid = (self.data / 'postmaster.pid').read_text().splitlines()
        if Path(pid[1]).resolve() != self.data.resolve() or int(pid[3]) != self.port or pid[5] != '127.0.0.1':
            raise RuntimeError('New postmaster identity does not match disposable configuration')
        self.verified = True
        self.report['new_postmaster_verified'] = True
        returned = self.query("select current_setting('data_directory');").stdout.strip()
        if Path(returned).resolve() != self.data.resolve():
            raise RuntimeError('Connected server is not the new disposable cluster')
        actual_major = int(self.query("select current_setting('server_version_num')::integer / 10000;").stdout.strip())
        if actual_major != self.expected_major:
            raise RuntimeError(f'Unexpected disposable server major {actual_major}; expected {self.expected_major}')
        self.report['version'] = self.query('select version();').stdout.strip()
        print('Verified NEW disposable cluster:', self.directory, 'port', self.port, flush=True)

    def stop(self):
        if self.started:
            result = self.command('pg_ctl', ['-D', str(self.data), '-m', 'fast', '-w', '-t', '20', 'stop'])
            self.report['server_stopped'] = result.returncode == 0
            if result.returncode:
                print('STOP FAILED:', result.stderr, flush=True)
        (self.directory / 'results.json').write_text(json.dumps(self.report, indent=2), encoding='utf-8')


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--audit-directory', required=True, type=Path)
    parser.add_argument('--postgres-bin', type=Path, default=BIN, help='Complete PostgreSQL bin directory (default: installed 18)')
    parser.add_argument('--expected-major', type=int, help='Refuse mismatched/mixed binaries before initdb')
    parser.add_argument('--stage2b', action='store_true', help='Also verify the incremental mutual DM cutover after the unchanged Stage 2A suite')
    options = parser.parse_args()
    db = Disposable(options.audit_directory, options.postgres_bin, options.expected_major)
    try:
        db.validate_tools()
        db.start()
        db.file('baseline', db.baseline)
        migration_path = REPO / 'supabase/migrations/202611190002_student_privacy_authorization.sql'
        migration = migration_path.read_text()
        db.report['stage2a_sha256'] = hashlib.sha256(migration_path.read_bytes()).hexdigest()
        seed_upgrade(db)
        rejected = db.file('reject-missing-stage1', migration, expected_success=False)
        assert 'Verified Stage 1 foundation required' in rejected.stderr
        db.file('stage1', (REPO / 'supabase/migrations/202611190001_student_privacy_foundation.sql').read_text())
        require(db, "select count(*) from public.profiles where is_private or not allow_group_additions or dm_permission<>case when allow_new_dms then 'eligible_students' else 'no_one' end;", '0', 'existing account settings')
        db.query("insert into auth.users(id,email,email_confirmed_at) values('d3000000-0000-0000-0000-000000000005','newaccount@stonybrook.edu',now());")
        require(db, "select not is_private and allow_group_additions and dm_permission='eligible_students' from public.profiles where id='d3000000-0000-0000-0000-000000000005';", 't', 'new account defaults')
        negative_migrations(db, migration)
        before = snapshot(db)
        db.file('stage2a', migration)
        assert before == snapshot(db), 'Stage 2A changed pre-existing table data'
        db.report['populated_upgrade_rows_unchanged'] = True
        db.file('fixtures', (REPO / 'supabase/tests/student_privacy_authorization.sql').read_text())
        assert before == snapshot(db), 'Fixture rollback failed to preserve original data'
        db.report['fixture_rollback_verified'] = True
        concurrency(db)
        if options.stage2b:
            from mutual_dm_runtime_checks import verify_stage2b
            verify_stage2b(db, REPO)
        db.report['outcome'] = 'PASS'
    except Exception as error:
        db.report['outcome'] = 'FAIL'
        db.report['error'] = str(error)
        raise
    finally:
        db.stop()
        print('Results:', db.directory / 'results.json', flush=True)


if __name__ == '__main__':
    main()
