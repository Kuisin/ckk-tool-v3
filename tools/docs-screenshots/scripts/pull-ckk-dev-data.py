#!/usr/bin/env python3
"""pull-ckk-dev-data.py — overwrite the throwaway local DB's `app` schema with
a read-only snapshot of the real ckk-db-dev data (not the static demo-seed
fixtures), so the Metabase demo dashboards show real, current dev activity
instead of the fixed sample dates baked into shared-db/sql/*-demo-seed.sql.

Column-matched, not table-matched: dev is normally AHEAD of whatever this
worktree's shared-db/prisma/schema is pinned to (this worktree may be behind
the actual `dev` branch HEAD), so a plain `pg_dump --data-only` restore breaks
on any column dev has added since. Instead this reads the LOCAL throwaway
DB's own column list per table and asks the remote side to SELECT only that
subset — safe as long as dev is a superset (columns added, not renamed/
removed), which is the common case for a worktree that's simply behind.

Read-only against the server: one `docker exec ... pg_dump`-free psql COPY per
table, run in a single SSH session, piped to a local tar stream. Nothing is
written to ckk-db-dev. Run this AFTER `pnpm docs:seed` (needs a running
`ckk-shots-db`) and BEFORE the Metabase build step.
"""
import argparse
import subprocess
import sys

LOCAL_CONTAINER = "ckk-shots-db"


def local_psql(args_list, input_data=None):
    return subprocess.run(
        ["docker", "exec", "-i", LOCAL_CONTAINER, "psql", "-U", "postgres", "-d", "ckk", *args_list],
        input=input_data, capture_output=True,
    )


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--ssh-host", default="192.168.50.15")
    ap.add_argument("--dev-container", required=True,
                     help="ckk-db-dev container name on the server (hash-named by Coolify — "
                          "resolve via: ssh HOST docker run --rm --network coolify alpine getent hosts ckk-db-dev, "
                          "then match the IP to a container name)")
    args = ap.parse_args()

    print("[1/4] reading local app-schema column list")
    r = local_psql(["-t", "-A", "-F,", "-c",
                     "select table_name, string_agg(quote_ident(column_name), ',' order by ordinal_position) "
                     "from information_schema.columns where table_schema = 'app' group by table_name order by table_name;"])
    if r.returncode != 0:
        sys.exit(f"could not read local columns (is {LOCAL_CONTAINER} running? run `pnpm docs:seed` first)\n{r.stderr.decode()}")
    table_cols = [line.split(",", 1) for line in r.stdout.decode().strip().splitlines() if line]

    print(f"[2/4] dumping {len(table_cols)} tables from ckk-db-dev (read-only)")
    remote_script_lines = ["mkdir -p /tmp/ckkdump /tmp/ckkdump-err"]
    for table, cols in table_cols:
        sql = f"COPY (SELECT {cols} FROM app.{table}) TO STDOUT WITH (FORMAT csv)".replace('"', '\\"')
        remote_script_lines.append(
            f'docker exec {args.dev_container} psql -U postgres -d ckk -v ON_ERROR_STOP=1 -c "{sql}" '
            f'> /tmp/ckkdump/{table}.csv 2> /tmp/ckkdump-err/{table}.err || echo "FAILED: {table}"'
        )
    remote_script_lines.append('echo "dump complete: $(ls /tmp/ckkdump | wc -l) files"')
    remote_script = "\n".join(remote_script_lines)

    subprocess.run(["ssh", args.ssh_host, "bash -s"], input=remote_script.encode(), check=True)

    print("[3/4] pulling dump down + cleaning up server tmp")
    tar = subprocess.run(["ssh", args.ssh_host, "tar czf - -C /tmp ckkdump"], capture_output=True, check=True)
    subprocess.run(["tar", "xzf", "-", "-C", "/tmp"], input=tar.stdout, check=True)
    subprocess.run(["ssh", args.ssh_host, "rm -rf /tmp/ckkdump /tmp/ckkdump-err"], check=True)

    print("[4/4] truncating + loading local app schema (FK checks deferred)")
    truncate = local_psql(["-t", "-A", "-c",
                            "select string_agg(format('TRUNCATE TABLE app.%I CASCADE;', tablename), ' ') "
                            "from pg_tables where schemaname = 'app';"])
    local_psql(["-v", "ON_ERROR_STOP=1", "-f", "-"], input_data=truncate.stdout)

    ok, failed = 0, []
    for table, cols in table_cols:
        with open(f"/tmp/ckkdump/{table}.csv", "rb") as f:
            data = f.read()
        if not data.strip():
            ok += 1
            continue
        sql = f"SET session_replication_role = replica; COPY app.{table} ({cols}) FROM STDIN WITH (FORMAT csv);"
        r = local_psql(["-v", "ON_ERROR_STOP=1", "-c", sql], input_data=data)
        if r.returncode != 0:
            failed.append((table, r.stderr.decode()[:200]))
        else:
            ok += 1

    print(f"loaded {ok}/{len(table_cols)} tables")
    for t, err in failed:
        # user_permissions (a VIEW, not a table) is expected to fail here —
        # it's derived automatically from the tables that just loaded.
        if t != "user_permissions":
            print(f"  ! {t}: {err}")


if __name__ == "__main__":
    main()
