import subprocess
import sys
import os
import zipfile
import urllib.request
import shutil
from typing import Dict, List

class ToolManager:
    """Manages external tools like ADB and Fastboot."""

    def __init__(self):
        self.tools = {
            'adb': {'available': False, 'version': None},
            'fastboot': {'available': False, 'version': None},
            'python': {'available': True, 'version': sys.version.split()[0]}
        }

    def check_tool(self, tool_name: str, check_command: List[str]) -> Dict:
        """Checks if a tool is available and returns its info."""
        try:
            result = subprocess.run(
                check_command,
                capture_output=True,
                text=True,
                timeout=3
            )
            if result.returncode == 0:
                # Fastboot version output is on stderr for some versions, but --version usually works on stdout
                output = result.stdout.strip() or result.stderr.strip()
                version = output.split('\n')[0]
                self.tools[tool_name] = {'available': True, 'version': version}
                return self.tools[tool_name]
        except (FileNotFoundError, subprocess.TimeoutExpired, Exception):
            pass
        
        self.tools[tool_name] = {'available': False, 'version': None}
        return self.tools[tool_name]

    def download_platform_tools(self) -> bool:
        """Downloads and extracts Android Platform Tools (ADB/Fastboot)."""
        urls = {
            "win32": "https://dl.google.com/android/repository/platform-tools-latest-windows.zip",
            "linux": "https://dl.google.com/android/repository/platform-tools-latest-linux.zip",
            "darwin": "https://dl.google.com/android/repository/platform-tools-latest-darwin.zip"
        }

        url = urls.get(sys.platform)
        if not url:
            return False

        current_dir = os.path.dirname(os.path.abspath(__file__))
        bin_dir = os.path.join(current_dir, "bin")
        if not os.path.exists(bin_dir):
            os.makedirs(bin_dir)

        zip_path = os.path.join(bin_dir, "platform-tools.zip")

        try:
            print(f"Downloading Platform Tools from {url}...")
            urllib.request.urlretrieve(url, zip_path)
            print("Extracting...")
            with zipfile.ZipFile(zip_path, 'r') as zip_ref:
                zip_ref.extractall(bin_dir)
            os.remove(zip_path)
            print("Platform Tools ready.")

            if sys.platform != "win32":
                pt_dir = os.path.join(bin_dir, "platform-tools")
                for tool in ["adb", "fastboot"]:
                    tool_path = os.path.join(pt_dir, tool)
                    if os.path.exists(tool_path):
                        os.chmod(tool_path, 0o755)
            return True
        except Exception:
            return False

    def check_all_tools(self, adb_path='adb', fastboot_path='fastboot') -> Dict:
        """Checks all configured tools."""
        self.check_tool('adb', [adb_path or 'adb', 'version'])
        self.check_tool('fastboot', [fastboot_path or 'fastboot', '--version'])
        return self.tools
