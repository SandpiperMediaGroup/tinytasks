"""Wrap the locally built review bundle with an isolated sample store; never installs it."""
from pathlib import Path
import plistlib, shlex, shutil, subprocess, sys
root=Path(__file__).resolve().parents[1]
source=root/('target/debug/bundle/macos/TinyTasks Review.app' if '--debug' in sys.argv else 'target/release/bundle/macos/TinyTasks Review.app')
folder=root/'artifacts/review'
target=folder/'TinyTasks Review.app'
assert source.is_dir(),'Build the review bundle first.'
assert (folder/'sample-data/tasks.md').is_file(),'Seed sample data first.'
shutil.copytree(source,target,dirs_exist_ok=True)
info=plistlib.loads((target/'Contents/Info.plist').read_bytes())
exe=target/'Contents/MacOS'/info['CFBundleExecutable']
real=exe.with_name(exe.name+'-bin')
exe.replace(real)
exe.write_text('#!/bin/sh\nexport TINYTASKS_DATA_DIR='+shlex.quote(str(folder/'sample-data/state'))+'\nexport TINYTASKS_FILE='+shlex.quote(str(folder/'sample-data/tasks.md'))+'\nexec "$(dirname "$0")/'+real.name+'" "$@"\n')
exe.chmod(0o755)
subprocess.run(['codesign','--force','--deep','--sign','-',str(target)],check=True)
subprocess.run(['codesign','--verify','--deep','--strict',str(target)],check=True)
print(target)
