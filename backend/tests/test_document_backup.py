"""Exercise archive/restore scripts with fake Docker, never production services."""

import os
import shutil
import subprocess
import tarfile
from pathlib import Path

import pytest


@pytest.mark.parametrize("missing", [False, True])
def test_purchase_documents_backup_and_restore(tmp_path, missing):
    bash = shutil.which("bash") or str(Path("C:/Program Files/Git/bin/bash.exe"))
    if not Path(bash).is_file():
        pytest.skip("Bash is required for backup script checks")
    root = Path(__file__).parents[2]
    scripts = tmp_path / "scripts"
    scripts.mkdir()
    for name in ["backup-db.sh", "restore-db.sh", "verify-backup.sh"]:
        (scripts / name).write_text((root / "scripts" / name).read_text(), encoding="utf-8")
    fake = tmp_path / "fakebin"
    fake.mkdir()
    docker = fake / "docker"
    docker.write_text(
        """#!/usr/bin/env bash
case "$*" in
  *pg_dump*) echo 'fake-database-dump';;
  *"column_name = 'document_size'"*) echo 1;;
  *"count(*) FROM purchase_imports"*) echo 1;;
  *information_schema*) echo 0;;
  *"SELECT version_num"*) echo 0119_purchase_documents;;
  *"count(*) FROM users"*) echo 1;;
  *) cat >/dev/null;;
esac
""",
        encoding="utf-8",
    )
    docker.chmod(0o755)
    original = tmp_path / "backend/data/purchase-documents/household/purchase/original"
    if not missing:
        original.parent.mkdir(parents=True)
        original.write_bytes(b"private-pdf-original")
    env = {
        **os.environ,
        "BACKUP_REMOTE_PATH": "",
        "BACKUP_DIR": "backups",
        "WINE_PHOTO_BACKUP_PATH": "backend/data/wine-photos",
        "PURCHASE_DOCUMENT_BACKUP_PATH": "backend/data/purchase-documents",
    }

    def run(command, stdin=None):
        result = subprocess.run(
            [bash, "-c", 'export PATH="$PWD/fakebin:$PATH"; ' + command],
            cwd=tmp_path,
            env=env,
            input=(stdin or "").encode(),
            capture_output=True,
            timeout=45,
        )
        return subprocess.CompletedProcess(
            result.args, result.returncode, result.stdout.decode(), result.stderr.decode()
        )

    backup = run("bash scripts/backup-db.sh", "")
    if missing:
        assert backup.returncode != 0
        assert "Purchase document backup is incomplete" in backup.stderr
        assert not list((tmp_path / "backups").glob("*.tar.gz"))
        return
    assert backup.returncode == 0, backup.stdout + backup.stderr
    bundle = next((tmp_path / "backups").glob("*.tar.gz"))
    with tarfile.open(bundle) as archive:
        assert (
            archive.extractfile("purchase-documents/household/purchase/original").read()
            == b"private-pdf-original"
        )
        assert (
            b"purchase-documents/household/purchase/original"
            in archive.extractfile("manifest.sha256").read()
        )
    original.write_bytes(b"changed after backup")
    verify = run(f"bash scripts/verify-backup.sh backups/{bundle.name}", "")
    assert verify.returncode == 0, verify.stdout + verify.stderr
    restored = run(
        f"bash scripts/restore-db.sh backups/{bundle.name}", "RESTORE winecellarmulti WITH PHOTOS\n"
    )
    assert restored.returncode == 0, restored.stdout + restored.stderr
    assert original.read_bytes() == b"private-pdf-original"
    previous = next(original.parents[2].parent.glob("purchase-documents.pre-restore.*"))
    assert (previous / "household/purchase/original").read_bytes() == b"changed after backup"
