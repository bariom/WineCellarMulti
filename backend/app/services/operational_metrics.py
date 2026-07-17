from __future__ import annotations

import os
from datetime import UTC, datetime
from pathlib import Path

import psutil


def _read_int(path: str) -> int | None:
    try:
        return int(Path(path).read_text(encoding="utf-8").strip())
    except (OSError, ValueError):
        return None


def _process_file_descriptors(pid: int) -> int | None:
    try:
        return sum(1 for _ in Path(f"/proc/{pid}/fd").iterdir())
    except OSError:
        return None


def system_snapshot() -> dict[str, object]:
    memory = psutil.virtual_memory()
    disk = psutil.disk_usage("/")
    process = psutil.Process(os.getpid())
    network: dict[str, int | None] = {
        "tcp_established": None,
        "tcp_time_wait": None,
        "tcp_total": None,
    }
    try:
        connections = psutil.net_connections(kind="tcp")
        statuses = [connection.status for connection in connections]
        network = {
            "tcp_established": statuses.count(psutil.CONN_ESTABLISHED),
            "tcp_time_wait": statuses.count(psutil.CONN_TIME_WAIT),
            "tcp_total": len(connections),
        }
    except (psutil.AccessDenied, OSError):
        pass

    allocated_fds = _read_int("/proc/sys/fs/file-nr")
    return {
        "collected_at": datetime.now(UTC).isoformat(),
        "host": {
            "cpu_percent": psutil.cpu_percent(interval=None),
            "memory": {
                "percent": memory.percent,
                "used_bytes": memory.used,
                "total_bytes": memory.total,
            },
            "disk": {"percent": disk.percent, "used_bytes": disk.used, "total_bytes": disk.total},
            "uptime_seconds": round(datetime.now(UTC).timestamp() - psutil.boot_time(), 2),
        },
        "process": {
            "pid": process.pid,
            "memory_rss_bytes": process.memory_info().rss,
            "open_file_descriptors": _process_file_descriptors(process.pid),
        },
        "network": network,
        "conntrack": {
            "count": _read_int("/proc/sys/net/netfilter/nf_conntrack_count"),
            "max": _read_int("/proc/sys/net/netfilter/nf_conntrack_max"),
        },
        "file_descriptors": {"allocated": allocated_fds},
    }
