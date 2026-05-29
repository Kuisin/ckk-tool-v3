#!/usr/bin/env python3
import subprocess
import os

os.chdir('/workspaces/ckk-tool-v3')
result = subprocess.run(['git', 'rebase', '--continue'], capture_output=True, text=True)
print("STDOUT:")
print(result.stdout)
print("\nSTDERR:")
print(result.stderr)
print("\nReturn code:", result.returncode)
