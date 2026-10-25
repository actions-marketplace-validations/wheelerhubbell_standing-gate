#!/usr/bin/env python3
from pathlib import Path
import sys

root = Path(__file__).resolve().parent.parent
canonical_root = root / 'CANONICAL.md'
archive_readme = root / 'archive' / 'README.md'
archive_legacy = root / 'archive' / 'legacy' / 'README.md'

allowed = {
    'README.md', 'CANONICAL.md', 'archive', '.github', 'action.yml',
    'gate-check.cjs', 'test', '.gitignore', '.git'
}

violations = []
for child in sorted(root.iterdir()):
    if child.name not in allowed:
        if child.is_dir():
            violations.append(f'directory:{child.name}')
        elif child.is_file():
            violations.append(f'file:{child.name}')

if not canonical_root.exists():
    violations.append('missing:CANONICAL.md')
if not archive_readme.exists():
    violations.append('missing:archive/README.md')
if not archive_legacy.exists():
    violations.append('missing:archive/legacy/README.md')

if violations:
    print('Canonical boundary violation detected:')
    for v in violations:
        print(f' - {v}')
    print('\nOnly the canonical machine may remain in the repo root. Archive non-authoritative material under archive/.')
    sys.exit(1)

print('Canonical boundary OK.')
