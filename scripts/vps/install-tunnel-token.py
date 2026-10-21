#!/usr/bin/env python3
"""Recibe por stdin SSH únicamente la credencial del túnel autorizado."""
import base64
import json
import os
import re
import sys
from pathlib import Path

os.umask(0o077)
value = json.load(sys.stdin)
token = value.get('token', '')
if not isinstance(token, str) or not re.fullmatch(r'[A-Za-z0-9+/=_-]{80,2000}', token):
    raise RuntimeError('TUNNEL_CREDENTIAL_FORMAT')
identity = json.loads(base64.b64decode(token))
if identity.get('a') != 'a80650839fdd1917a4585c51e5c0522b' or identity.get('t') != '203c451a-71bc-4853-9879-5cf2afbeacd0':
    raise RuntimeError('TUNNEL_IDENTITY_MISMATCH')
path = Path('/opt/comparador-catalog/secrets/tunnel-token')
fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
with os.fdopen(fd, 'w') as stream:
    stream.write(token)
os.chown(path, 65532, 65532)
print('TUNNEL_TOKEN_INSTALLED')
