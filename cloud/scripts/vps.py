#!/usr/bin/env python3
"""Minimal VPS helper for Hills Lite Cloud deploy (问11).

Credentials come from env vars (never hardcode/commit):
  VPS_HOST, VPS_USER, VPS_PASS  [, VPS_PORT=22]

Usage:
  python scripts/vps.py inventory      # read-only: docker/resources snapshot
  python scripts/vps.py run "<cmd>"    # run an arbitrary remote command
  python scripts/vps.py upload <local_dir> <remote_dir>
"""
import os
import sys
import stat
import posixpath

import paramiko

HOST = os.environ.get("VPS_HOST")
USER = os.environ.get("VPS_USER", "root")
PASS = os.environ.get("VPS_PASS")
PORT = int(os.environ.get("VPS_PORT", "22"))

IGNORE = {"node_modules", "dist", ".git", ".env", ".tmp", "__pycache__"}


def connect() -> paramiko.SSHClient:
    if not HOST or not PASS:
        sys.exit("Missing VPS_HOST / VPS_PASS env vars")
    c = paramiko.SSHClient()
    c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    c.connect(HOST, port=PORT, username=USER, password=PASS, timeout=20, banner_timeout=20)
    return c


def run(client: paramiko.SSHClient, cmd: str):
    stdin, stdout, stderr = client.exec_command(cmd, timeout=120)
    out = stdout.read().decode("utf-8", "replace")
    err = stderr.read().decode("utf-8", "replace")
    code = stdout.channel.recv_exit_status()
    return code, out, err


def inventory(client: paramiko.SSHClient):
    cmds = [
        ("uname", "uname -a"),
        ("os", "cat /etc/os-release | head -n 2"),
        ("cpu", "nproc"),
        ("mem", "free -m | head -n 2"),
        ("disk", "df -h / | tail -n 1"),
        ("docker", "docker --version 2>&1 || echo NO_DOCKER"),
        ("compose", "docker compose version 2>&1 || docker-compose version 2>&1 || echo NO_COMPOSE"),
        ("ps", "docker ps -a --format '{{.ID}} | {{.Image}} | {{.Status}} | {{.Names}} | {{.Ports}}' 2>&1"),
        ("images", "docker images --format '{{.Repository}}:{{.Tag}} ({{.Size}})' 2>&1 | head -n 30"),
        ("ports", "ss -ltnp 2>/dev/null | head -n 30 || netstat -ltnp 2>/dev/null | head -n 30"),
    ]
    for label, cmd in cmds:
        code, out, err = run(client, cmd)
        print(f"\n===== {label} (exit {code}) =====")
        print((out or err).rstrip())


def upload(client: paramiko.SSHClient, local_dir: str, remote_dir: str):
    sftp = client.open_sftp()

    def _mkdirs(remote):
        parts = remote.strip("/").split("/")
        cur = ""
        for p in parts:
            cur += "/" + p
            try:
                sftp.stat(cur)
            except IOError:
                sftp.mkdir(cur)

    def _put(local, remote):
        for name in os.listdir(local):
            if name in IGNORE:
                continue
            lp = os.path.join(local, name)
            rp = posixpath.join(remote, name)
            if os.path.isdir(lp):
                try:
                    sftp.stat(rp)
                except IOError:
                    sftp.mkdir(rp)
                _put(lp, rp)
            else:
                sftp.put(lp, rp)
                print("put", rp)

    _mkdirs(remote_dir)
    _put(local_dir, remote_dir)
    sftp.close()


def main():
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    action = sys.argv[1]
    client = connect()
    try:
        if action == "inventory":
            inventory(client)
        elif action == "run":
            code, out, err = run(client, sys.argv[2])
            print(out.rstrip())
            if err.strip():
                print("[stderr]", err.rstrip())
            sys.exit(code)
        elif action == "upload":
            upload(client, sys.argv[2], sys.argv[3])
        else:
            sys.exit(f"unknown action: {action}")
    finally:
        client.close()


if __name__ == "__main__":
    main()
