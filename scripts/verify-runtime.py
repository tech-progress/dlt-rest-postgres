import importlib.metadata
import hashlib
import json
from pathlib import Path
import shutil
import subprocess

import dlt
import psycopg2
from psycopg2 import extensions


def verify():
    assert dlt.__version__ == "1.30.0"
    assert importlib.metadata.version("psycopg2") == "2.9.13"
    try:
        importlib.metadata.version("psycopg2-binary")
    except importlib.metadata.PackageNotFoundError:
        pass
    else:
        raise AssertionError("Bundled psycopg2-binary must not be installed")
    assert extensions.libpq_version() == 150019
    for executable in ("uv", "uvx", "gcc", "cc", "pg_config"):
        assert shutil.which(executable) is None, executable
    assert not Path("/bin/uv").exists()
    assert "MIT License" in Path("/app/LICENSE").read_text()
    assert "psycopg2 2.9.13" in Path("/app/THIRD_PARTY_NOTICES.md").read_text()
    notices = importlib.metadata.distribution("psycopg2").files
    installed_grant = next(path for path in notices if str(path).endswith(".dist-info/licenses/LICENSE"))
    installed_path = importlib.metadata.distribution("psycopg2").locate_file(installed_grant)
    assert hashlib.sha256(installed_path.read_bytes()).digest() == hashlib.sha256(Path("/app/licenses/psycopg2-LICENSE.txt").read_bytes()).digest()
    assert "GNU LESSER GENERAL PUBLIC LICENSE" in Path("/app/licenses/psycopg2-COPYING.LESSER.txt").read_text()
    package = subprocess.check_output(
        ["dpkg-query", "-W", "-f=${Version}", "libpq5"], text=True
    )
    assert package == "15.19-0+deb12u1"
    assert Path("/usr/share/doc/libpq5/copyright").is_file()
    print(json.dumps({"dlt": dlt.__version__, "psycopg2": "2.9.13", "libpq": extensions.libpq_version(), "buildToolsAbsent": True}))


if __name__ == "__main__":
    verify()
