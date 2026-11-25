"""Store credential-bearing JSON using a private temporary file and atomic replace."""
import json
import os
import stat
import tempfile
from pathlib import Path


def write_private_json(path, value):
    path = Path(path)
    path.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
    fd, name = tempfile.mkstemp(dir=path.parent, prefix=".bridge-")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as stream:
            json.dump(value, stream, indent=2, default=str)
        os.replace(name, path)
    finally:
        Path(name).unlink(missing_ok=True)


def read_private_json(path):
    path = Path(path)
    if path.is_symlink():
        raise ValueError("Refusing a linked credential file")
    fd = os.open(path, os.O_RDONLY | getattr(os, "O_NOFOLLOW", 0))
    with os.fdopen(fd, encoding="utf-8") as stream:
        info = os.fstat(fd)
        if not stat.S_ISREG(info.st_mode):
            raise ValueError("Expected a regular configuration file")
        if hasattr(os, "fchmod"):
            if info.st_uid != os.getuid():
                raise PermissionError("Configuration must be owned by this user")
            os.fchmod(fd, 0o600)
        return json.load(stream)
