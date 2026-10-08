#!/usr/bin/env python3
"""Run over a verified SSH connection, as the target user. No root required."""
import getpass
import json
import os
import pathlib
import plistlib
import re
import shutil
import subprocess
import sys
import time

home = pathlib.Path.home()
base = home / '.local/share/mini-ssh-wasm'
base.mkdir(parents=True, exist_ok=True, mode=0o700)
os.chmod(base, 0o700)
source = pathlib.Path(sys.argv[1])
assets = base / 'client'
assets.mkdir(exist_ok=True, mode=0o700)
# No secret/config files live in the HTTP document root.
for entry in source.iterdir():
    if entry.name != 'mini-ssh-gateway':
        shutil.copy2(entry, assets / entry.name)
binary = base / 'mini-ssh-gateway'
shutil.copy2(source / binary.name, base / 'mini-ssh-gateway.next')
os.chmod(base / 'mini-ssh-gateway.next', 0o700)
os.replace(base / 'mini-ssh-gateway.next', binary)
ca = base / 'user-ca'
if not ca.exists():
    subprocess.run([str(binary), '-init-ca', str(ca)], check=True)
public = subprocess.check_output([str(binary), '-ca-public', str(ca)], text=True).strip()
user = getpass.getuser()
if not re.fullmatch(r'[a-zA-Z0-9_-]+', user):
    raise RuntimeError('Unsupported SSH username')
authorized = home / '.ssh/authorized_keys'
old = authorized.read_text() if authorized.exists() else ''
line = f'cert-authority,principals="{user}" {public} mini-wasm-user-ca'
if line not in old.splitlines():
    if authorized.exists():
        shutil.copy2(authorized, home / f'.ssh/authorized_keys.before-mini-wasm-{int(time.time())}')
    with authorized.open('a') as f:
        if old and not old.endswith('\n'):
            f.write('\n')
        f.write(line + '\n')
os.chmod(authorized, 0o600)
status = json.loads(subprocess.check_output(['/opt/homebrew/bin/tailscale', 'status', '--json']))
self_node = status['Self']
owner = status['User'][str(self_node['UserID'])]['LoginName']
host = self_node['DNSName'].rstrip('.')
origin = f'https://{host}:8443'
config = dict(listen='127.0.0.1:8022', origin=origin, owner=owner, username=user,
              hostKey=pathlib.Path('/etc/ssh/ssh_host_ed25519_key.pub').read_text().strip(),
              caKey=str(ca), docroot=str(assets),
              command="sh -lc 'LANG=en_US.UTF-8 LC_CTYPE=en_US.UTF-8; exec /opt/homebrew/bin/tmux -u new -A -s mini'")
config_file = base / 'config.json'
config_file.write_text(json.dumps(config, indent=2) + '\n')
os.chmod(config_file, 0o600)
agent_dir = home / 'Library/LaunchAgents'
agent_dir.mkdir(parents=True, exist_ok=True)
label = 'com.ryou.mini-ssh-wasm'
plist = agent_dir / f'{label}.plist'
with plist.open('wb') as f:
    plistlib.dump(dict(Label=label, ProgramArguments=[str(binary), '-config', str(config_file)],
                      RunAtLoad=True, KeepAlive=True, ThrottleInterval=5,
                      WorkingDirectory=str(base), StandardOutPath=str(base/'gateway.log'),
                      StandardErrorPath=str(base/'gateway.log')), f)
os.chmod(plist, 0o600)
subprocess.run(['launchctl', 'bootout', f'gui/{os.getuid()}/{label}'], capture_output=True)
subprocess.run(['launchctl', 'bootstrap', f'gui/{os.getuid()}', str(plist)], check=True)
print(json.dumps(dict(origin=origin, state=str(base), launchAgent=str(plist))))
