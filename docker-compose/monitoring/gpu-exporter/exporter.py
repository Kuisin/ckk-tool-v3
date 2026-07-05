"""Minimal Prometheus exporter for AMD GPU metrics read from amdgpu sysfs.

No ROCm/kfd needed — just a read-only mount of /sys. Exposes per-card GPU
utilization, VRAM, temperature, power and clocks on :9400/metrics.
"""
import glob
import os
from http.server import BaseHTTPRequestHandler, HTTPServer

SYS = os.environ.get("SYS_ROOT", "/sys")


def _read(path):
    try:
        with open(path) as f:
            return f.read().strip()
    except OSError:
        return None


def _metric(lines, name, help_, typ, samples):
    if not samples:
        return
    lines.append(f"# HELP {name} {help_}")
    lines.append(f"# TYPE {name} {typ}")
    for labels, value in samples:
        lines.append(f"{name}{{{labels}}} {value}")


def collect():
    busy, vused, vtotal, temp, power = [], [], [], [], []
    for dev in sorted(glob.glob(f"{SYS}/class/drm/card*/device")):
        b = _read(os.path.join(dev, "gpu_busy_percent"))
        if b is None:
            continue  # not a compute GPU (e.g. display node)
        card = dev.split("/")[-2]  # cardN
        lbl = f'card="{card}"'
        busy.append((lbl, b))
        u = _read(os.path.join(dev, "mem_info_vram_used"))
        t = _read(os.path.join(dev, "mem_info_vram_total"))
        if u:
            vused.append((lbl, u))
        if t:
            vtotal.append((lbl, t))
        for hw in glob.glob(os.path.join(dev, "hwmon/hwmon*")):
            tc = _read(os.path.join(hw, "temp1_input"))
            if tc:
                temp.append((lbl, int(tc) / 1000.0))
            pw = _read(os.path.join(hw, "power1_average"))
            if pw:
                power.append((lbl, int(pw) / 1_000_000.0))

    lines = []
    _metric(lines, "amdgpu_busy_percent", "GPU utilization (%)", "gauge", busy)
    _metric(lines, "amdgpu_vram_used_bytes", "VRAM used (bytes)", "gauge", vused)
    _metric(lines, "amdgpu_vram_total_bytes", "VRAM total (bytes)", "gauge", vtotal)
    _metric(lines, "amdgpu_temperature_celsius", "GPU temperature (C)", "gauge", temp)
    _metric(lines, "amdgpu_power_watts", "GPU average power (W)", "gauge", power)
    lines.append(f"amdgpu_up {1 if busy else 0}")
    return ("\n".join(lines) + "\n").encode()


class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path not in ("/metrics", "/"):
            self.send_response(404)
            self.end_headers()
            return
        body = collect()
        self.send_response(200)
        self.send_header("Content-Type", "text/plain; version=0.0.4")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *_):
        pass


if __name__ == "__main__":
    HTTPServer(("0.0.0.0", 9400), Handler).serve_forever()
