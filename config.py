import os
import shutil
import sys

def get_local_tool(name):
    """Try to find tool in local bin directory."""
    ext = ".exe" if sys.platform == "win32" else ""
    local_path = os.path.join(os.path.dirname(__file__), "bin", "platform-tools", f"{name}{ext}")
    if os.path.exists(local_path):
        return local_path
    return ""

class Config:
    SECRET_KEY = os.environ.get('SECRET_KEY', 'ghikari_secret_default_change_me')
    DEVICE_MONITOR_INTERVAL = 3  # seconds
    ADB_PATH = shutil.which('adb') or get_local_tool('adb')
    FASTBOOT_PATH = shutil.which('fastboot') or get_local_tool('fastboot')
    PORT = 5000
    DEBUG = False
    AUTO_OPEN_BROWSER = True
