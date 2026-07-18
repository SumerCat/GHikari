import os
import subprocess
import sys
import zipfile
import urllib.request
import shutil
import time

def get_venv_python():
    """Returns the path to the virtual environment's python interpreter if it exists."""
    current_dir = os.path.dirname(os.path.abspath(__file__))
    if sys.platform == "win32":
        venv_python = os.path.join(current_dir, "venv", "Scripts", "python.exe")
    else:
        venv_python = os.path.join(current_dir, "venv", "bin", "python")
    
    if os.path.exists(venv_python):
        return venv_python
    return None


def check_requirements(python_exe):
    """Checks if Flask and Flask-SocketIO are already installed."""
    try:
        subprocess.run([python_exe, "-c", "import flask, flask_socketio"], capture_output=True, check=True)
        return True
    except:
        return False

def run_pip(venv_python, args):
    """Executes pip with the given arguments, targeting the venv."""
    # Try using the venv's pip module directly first
    try:
        res = subprocess.run([venv_python, "-m", "pip"] + args, capture_output=True, text=True)
        if res.returncode == 0:
            return True
    except:
        pass

    # Backup: Use system pip to install into venv (requires pip 22.3+)
    try:
        res = subprocess.run([sys.executable, "-m", "pip", "install", "--python", venv_python] + args, capture_output=True, text=True)
        return res.returncode == 0
    except:
        return False

def download_platform_tools():
    """Downloads and extracts Android Platform Tools (ADB/Fastboot)."""
    print("\n[!] ADB/Fastboot not found. Attempting to download Android Platform Tools...")

    urls = {
        "win32": "https://dl.google.com/android/repository/platform-tools-latest-windows.zip",
        "linux": "https://dl.google.com/android/repository/platform-tools-latest-linux.zip",
        "darwin": "https://dl.google.com/android/repository/platform-tools-latest-darwin.zip"
    }

    url = urls.get(sys.platform)
    if not url:
        print(f"Unsupported platform for automatic download: {sys.platform}")
        return False

    current_dir = os.path.dirname(os.path.abspath(__file__))
    bin_dir = os.path.join(current_dir, "bin")
    if not os.path.exists(bin_dir):
        os.makedirs(bin_dir)

    zip_path = os.path.join(bin_dir, "platform-tools.zip")

    try:
        print(f"Downloading from {url}...")
        # Use a more robust download with progress or just simple retrieve
        urllib.request.urlretrieve(url, zip_path)

        print("Extracting to 'bin/' directory...")
        with zipfile.ZipFile(zip_path, 'r') as zip_ref:
            zip_ref.extractall(bin_dir)

        os.remove(zip_path)
        print("Download and extraction complete.\n")

        # On Linux/macOS, we need to ensure the binaries are executable
        if sys.platform != "win32":
            pt_dir = os.path.join(bin_dir, "platform-tools")
            for tool in ["adb", "fastboot"]:
                tool_path = os.path.join(pt_dir, tool)
                if os.path.exists(tool_path):
                    os.chmod(tool_path, 0o755)

        return True
    except Exception as e:
        print(f"Error downloading platform tools: {e}")
        return False


def ensure_tools_available():
    """Ensures adb and fastboot are available, downloading them if necessary."""
    adb_path = shutil.which("adb")
    fastboot_path = shutil.which("fastboot")

    if adb_path and fastboot_path:
        print(f"System Check: ADB found at {adb_path}")
        print(f"System Check: Fastboot found at {fastboot_path}")
        return True

    current_dir = os.path.dirname(os.path.abspath(__file__))
    local_pt_dir = os.path.join(current_dir, "bin", "platform-tools")

    # Check if they already exist in local bin (maybe from previous run)
    local_adb = os.path.join(local_pt_dir, "adb.exe" if sys.platform == "win32" else "adb")
    local_fastboot = os.path.join(local_pt_dir, "fastboot.exe" if sys.platform == "win32" else "fastboot")

    if os.path.exists(local_adb) and os.path.exists(local_fastboot):
        print(f"System Check: Using local Platform Tools from {local_pt_dir}")
        # Add to PATH for current process
        os.environ["PATH"] = local_pt_dir + os.pathsep + os.environ["PATH"]
        return True

    # Not found anywhere, download them
    if download_platform_tools():
        if os.path.exists(local_adb) and os.path.exists(local_fastboot):
            os.environ["PATH"] = local_pt_dir + os.pathsep + os.environ["PATH"]
            print(f"System Check: Platform Tools downloaded and added to PATH.")
            return True

    print("\n[!] Error: ADB and Fastboot are required but could not be found or downloaded.")
    if sys.platform == "linux":
        print("Suggestion: Run 'sudo apt install adb fastboot' to install them manually.")
    elif sys.platform == "win32":
        print("Suggestion: Manually download Platform Tools and add to your PATH.")
    return False


def setup_venv():
    """Creates a virtual environment and installs requirements."""
    print("Setting up virtual environment...")
    try:
        # Try to create venv
        result = subprocess.run([sys.executable, "-m", "venv", "venv"], capture_output=True, text=True)
        if result.returncode != 0:
            print(f"Error creating virtual environment: {result.stderr.strip()}")
            if "ensurepip" in result.stderr or "venv" in result.stderr:
                if sys.platform == "linux":
                    py_ver = f"{sys.version_info.major}.{sys.version_info.minor}"
                    print(f"Suggestion: Run 'sudo apt install python{py_ver}-venv' to fix this.")
            return False

        venv_python = get_venv_python()
        if not venv_python:
            print("Failed to create virtual environment.")
            return False
        
        # Check Python version
        if sys.version_info < (3, 7):
            print(f"Error: Virtual environment python version too low: {sys.version}")
            return False

        if check_requirements(venv_python):
            print("Dependencies already satisfied in venv.")
            return True

        print("Installing/Updating dependencies in venv...")
        
        # Install requirements
        success = False
        if os.path.exists("requirements.txt"):
            if run_pip(venv_python, ["install", "-r", "requirements.txt"]):
                success = True
            else:
                print("\nFailed to install dependencies via default PyPI.")
                print("Suggestion: If you are in China, try using a mirror:")
                print(f"  {sys.executable} -m pip install --python {venv_python} -r requirements.txt -i https://pypi.tuna.tsinghua.edu.cn/simple")
                return False
        else:
            print("Warning: requirements.txt not found.")
            success = True
        
        return success
    except Exception as e:
        print(f"Error during setup: {e}")
        return False


def check_and_install_scrcpy():
    """Checks if scrcpy is available and provides instructions if missing."""
    try:
        result = subprocess.run(
            ['scrcpy', '--version'],
            capture_output=True,
            text=True,
            timeout=3
        )
        if result.returncode == 0:
            print("scrcpy is already installed.")
            return True
    except (FileNotFoundError, Exception):
        print("scrcpy not found. This is optional but recommended for screen mirroring.")
        if sys.platform == "linux":
            print("To install on Ubuntu/Debian: sudo apt install scrcpy")
        elif sys.platform == "win32":
            print("To install on Windows: choco install scrcpy (or download from GitHub)")
        elif sys.platform == "darwin":
            print("To install on macOS: brew install scrcpy")
        return False

def sync_requirements(python_exe):
    """Ensures all requirements are installed in the venv."""
    print("Checking/Updating dependencies...")
    
    # Check if pip is available
    try:
        subprocess.run([python_exe, "-m", "pip", "--version"], capture_output=True, check=True)
    except:
        print("Error: pip not found in the target Python environment.")
        return False

    if os.path.exists("requirements.txt"):
        # First try normal install
        if run_pip(python_exe, ["install", "-r", "requirements.txt"]):
            return True
        else:
            print("\n[!] Failed to update dependencies via default PyPI.")
            print("Trying domestic mirrors (China)...")
            mirrors = [
                "https://pypi.tuna.tsinghua.edu.cn/simple",
                "https://pypi.mirrors.ustc.edu.cn/simple",
                "https://mirror.baidu.com/pypi/simple"
            ]
            for mirror in mirrors:
                print(f"Trying mirror: {mirror}")
                if run_pip(python_exe, ["install", "-r", "requirements.txt", "-i", mirror]):
                    return True
            
            print("\n[ERROR] All attempts to install dependencies failed.")
            return False
    return True

if __name__ == '__main__':
    # Python 3.7+ check
    if sys.version_info < (3, 7):
        print("Error: This application requires Python 3.7 or higher.")
        print(f"Current version: {sys.version.major}.{sys.version.minor}.{sys.version.micro}")
        sys.exit(1)

    if not ensure_tools_available():
        sys.exit(1)

    check_and_install_scrcpy()

    python_exe = get_venv_python()
    
    # If no venv, check if system python has what we need
    if not python_exe:
        if check_requirements(sys.executable):
            print("Dependencies found in current environment. Using system Python.")
            python_exe = sys.executable
        else:
            print("Virtual environment not found.")
            if setup_venv():
                python_exe = get_venv_python()
            else:
                print("Could not set up virtual environment. Please install dependencies manually.")
                sys.exit(1)
    else:
        # Check if venv python actually works and has dependencies
        if not sync_requirements(python_exe):
            # If venv is broken, maybe system python is okay?
            if check_requirements(sys.executable):
                print("Virtual environment issues detected. Falling back to system Python.")
                python_exe = sys.executable
            else:
                print("\nError: Required dependencies (Flask, Flask-SocketIO) not found in venv or system Python.")
                print("Suggestion: Install them manually using:")
                print(f"  {sys.executable} -m pip install flask flask-socketio")
                if sys.platform == "linux":
                    print("  Or on Ubuntu/Debian: sudo apt install python3-flask python3-flask-socketio")
                sys.exit(1)

    try:
        print("Launching GHikari Toolbox Web Server...")
        # Run the app using the venv python
        # Add basic retry/redundancy
        max_retries = 3
        for i in range(max_retries):
            process = subprocess.run([python_exe, 'app.py'])
            if process.returncode == 0:
                break
            else:
                print(f"\n[!] Server exited with code {process.returncode}.")
                if i < max_retries - 1:
                    print(f"Retrying in 2 seconds... ({i+1}/{max_retries})")
                    time.sleep(2)
                else:
                    print("Max retries reached. Exit.")
        sys.exit(process.returncode)
    except Exception as e:
        print(f"Failed to launch UI: {e}")
        # Final fallback: try system python if everything else fails
        try:
            print("Attempting emergency fallback to system Python...")
            subprocess.run([sys.executable, 'app.py'])
        except:
            sys.exit(1)
