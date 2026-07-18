import os
import shlex
import subprocess
import threading
import time
import json
import sys
import configparser
import requests

try:
    from flask import Flask, render_template
    from flask_socketio import SocketIO, emit
except ImportError:
    print("\n[!] 错误: 找不到 Flask 或相关依赖。")
    print("    请确保您已经运行了 'python3 strap-up.py' 来配置环境。")
    print("    Error: Flask or dependencies not found. Please run 'python3 strap-up.py'.\n")
    sys.exit(1)

# Monkeypatch for Flask 3.1+ and Flask-SocketIO compatibility
# This fixes "AttributeError: property 'session' of 'RequestContext' object has no setter"
try:
    from flask.ctx import RequestContext
    if hasattr(RequestContext, 'session'):
        prop = RequestContext.session
        if not hasattr(prop, 'fset') or prop.fset is None:
            def _set_session(self, value):
                self._session = value
            RequestContext.session = property(prop.fget, _set_session)
except (ImportError, AttributeError):
    pass

from gettools import ToolManager
from config import Config
import concurrent.futures
import webbrowser
import platform
import socket

# Ensure local bin/platform-tools is in PATH for any shell calls
local_pt_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "bin", "platform-tools")
if os.path.exists(local_pt_dir):
    os.environ["PATH"] = local_pt_dir + os.pathsep + os.environ["PATH"]

app = Flask(__name__)
app.config['SECRET_KEY'] = Config.SECRET_KEY
socketio = SocketIO(app, async_mode='threading', cors_allowed_origins="*")

class BackendManager:
    def __init__(self):
        self.config = Config()
        self.ui_config_path = os.path.join(os.path.dirname(__file__), 'config.conf')
        self.ui_config = self.load_ui_config()
        self.ai_config = self.load_ai_config()
        self.tool_manager = ToolManager()
        self.selected_device = ""
        self.executor = concurrent.futures.ThreadPoolExecutor(max_workers=5)
        self.current_process = None
        self._stop_monitor = threading.Event()

    def load_ui_config(self):
        config = configparser.ConfigParser(interpolation=None)
        if os.path.exists(self.ui_config_path):
            config.read(self.ui_config_path, encoding='utf-8')
        
        # Default values if not present
        if 'UI' not in config:
            config['UI'] = {}
        
        defaults = {
            'background_gradient': 'linear-gradient(-45deg, #f5f7fa, #c3cfe2, #a1c4fd, #c2e9fb)',
            'card_border_radius': '16px',
            'dark_mode': 'false',
            'show_meteors': 'true',
            'primary_color': '#0063b1'
        }
        
        for key, value in defaults.items():
            if key not in config['UI']:
                config['UI'][key] = value
            elif key == 'background_gradient' and '135deg' in config['UI'][key]:
                # Upgrade legacy static gradient to new dynamic one
                config['UI'][key] = value
        
        return {k: v for k, v in config['UI'].items()}

    def save_ui_config(self, new_config):
        config = configparser.ConfigParser(interpolation=None)
        if os.path.exists(self.ui_config_path):
            config.read(self.ui_config_path, encoding='utf-8')
        
        if 'UI' not in config:
            config['UI'] = {}
        
        for key, value in new_config.items():
            config['UI'][key] = str(value)
        
        with open(self.ui_config_path, 'w', encoding='utf-8') as f:
            config.write(f)
        self.ui_config = {k: v for k, v in config['UI'].items()}

    def load_ai_config(self):
        config = configparser.ConfigParser(interpolation=None)
        if os.path.exists(self.ui_config_path):
            config.read(self.ui_config_path, encoding='utf-8')
        
        if 'AI' not in config:
            config['AI'] = {}
            
        defaults = {
            'enabled': 'false',
            'api_key': '',
            'base_url': 'https://api.openai.com/v1',
            'model': 'gpt-3.5-turbo',
            'system_prompt': '你是一个专业的 Android 调试助手，专注于 ADB 和 Fastboot 命令。请直接给出建议的命令，并简要说明作用。'
        }
        
        for key, value in defaults.items():
            if key not in config['AI']:
                config['AI'][key] = value
        
        return {k: v for k, v in config['AI'].items()}

    def save_ai_config(self, new_config):
        config = configparser.ConfigParser(interpolation=None)
        if os.path.exists(self.ui_config_path):
            config.read(self.ui_config_path, encoding='utf-8')
        
        if 'AI' not in config:
            config['AI'] = {}
            
        for key, value in new_config.items():
            config['AI'][key] = str(value)
            
        with open(self.ui_config_path, 'w', encoding='utf-8') as f:
            config.write(f)
        self.ai_config = {k: v for k, v in config['AI'].items()}

    def ask_ai(self, messages):
        if self.ai_config.get('enabled') != 'true':
            return "AI 功能未启用，请在配置中开启。"
            
        api_key = self.ai_config.get('api_key')
        base_url = self.ai_config.get('base_url')
        model = self.ai_config.get('model')
        system_prompt = self.ai_config.get('system_prompt')
        
        if not api_key:
            return "未配置 API Key。"

        try:
            headers = {
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json"
            }
            
            payload = {
                "model": model,
                "messages": [{"role": "system", "content": system_prompt}] + messages,
                "stream": False
            }
            
            response = requests.post(f"{base_url}/chat/completions", headers=headers, json=payload, timeout=30)
            response.raise_for_status()
            result = response.json()
            return result['choices'][0]['message']['content']
        except Exception as e:
            return f"AI 请求失败: {str(e)}"

    def log_to_web(self, message, type=''):
        """Pushes a log message to the UI via SocketIO."""
        print(f"LOG [{type}]: {message.strip()}")
        socketio.emit('log_update', {'message': message, 'type': type})

    def execute_adb_command(self, args, is_device_check=False, callback_id=None):
        """Executes an ADB command safely."""
        try:
            if isinstance(args, str):
                cmd_args = shlex.split(args)
            else:
                cmd_args = list(args)

            if not cmd_args:
                return "Error: Empty command"

            # Internal commands
            if cmd_args[0].lower() in ['cls', 'clear']:
                socketio.emit('log_update', {'message': 'CLEAR_CONSOLE', 'type': 'system'})
                return "Console cleared"
            
            if cmd_args[0].lower() == 'help':
                tools = self.tool_manager.tools
                help_text = f"""
GHikari Terminal Help:
- adb [args]: Run Android Debug Bridge commands
- fastboot [args]: Run Fastboot commands
- scrcpy [args]: Start screen mirroring
- cls/clear: Clear the terminal output
- help: Show this help message

Shortcuts:
- Ctrl + /: Toggle Terminal
- Ctrl + J: Focus Terminal
- Ctrl + C: Stop current command
- Ctrl + B: Toggle Fastboot Panel
- Ctrl + I: Toggle AI Chat
- Ctrl + L: Clear Logs
- Ctrl + R: Refresh Tools/Devices
- Ctrl + E: Edit Layout
- Escape: Close panels/suggestions

Environment:
- ADB: {"Ready" if tools['adb']['available'] else "Missing"} ({self.config.ADB_PATH or 'N/A'})
- Fastboot: {"Ready" if tools['fastboot']['available'] else "Missing"} ({self.config.FASTBOOT_PATH or 'N/A'})
"""
                self.log_to_web(help_text, 'system')
                return help_text

            if cmd_args[0] == 'adb' and self.config.ADB_PATH:
                cmd_args[0] = self.config.ADB_PATH
            elif cmd_args[0] == 'fastboot' and self.config.FASTBOOT_PATH:
                cmd_args[0] = self.config.FASTBOOT_PATH

            if cmd_args[0] == 'scrcpy':
                # scrcpy usually doesn't need -s if only one device is connected,
                # but we add it for consistency if a device is selected.
                if self.selected_device and '-s' not in cmd_args:
                    cmd_args.insert(1, '-s')
                    cmd_args.insert(2, self.selected_device)
                
                # For scrcpy, we don't want to capture stdout as a pipe because it's a GUI app
                # that might stay open. We'll run it as a detached process if possible,
                # or just use Popen without pipe for output if we don't need it.
                # However, to keep it simple and consistent with execute_adb_command:
                self.log_to_web("Starting scrcpy...", 'system')
                subprocess.Popen(cmd_args)
                if callback_id:
                    socketio.emit('command_complete', {'callback_id': callback_id, 'success': True})
                return "scrcpy launched"

            if not is_device_check and self.selected_device:
                # Add device serial if not already present, only for adb/fastboot
                is_adb = cmd_args[0] == 'adb' or (self.config.ADB_PATH and cmd_args[0] == self.config.ADB_PATH)
                is_fastboot = cmd_args[0] == 'fastboot' or (self.config.FASTBOOT_PATH and cmd_args[0] == self.config.FASTBOOT_PATH)
                
                if (is_adb or is_fastboot) and len(cmd_args) > 1 and '-s' not in cmd_args:
                    cmd_args.insert(1, '-s')
                    cmd_args.insert(2, self.selected_device)

            if not is_device_check:
                quoted_cmd = ' '.join(shlex.quote(arg) for arg in cmd_args)
                self.log_to_web(f"\n> {quoted_cmd}", 'system')

            with subprocess.Popen(
                cmd_args,
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                text=True,
                bufsize=1,
                universal_newlines=True
            ) as process:
                if not is_device_check:
                    self.current_process = process
                
                output_lines = []
                if process.stdout:
                    for line in process.stdout:
                        output_lines.append(line)
                        if not is_device_check:
                            self.log_to_web(line.strip())
                
                process.wait()
                if not is_device_check and self.current_process == process:
                    self.current_process = None
                
                if callback_id:
                    success = process.returncode == 0
                    socketio.emit('command_complete', {'callback_id': callback_id, 'success': success})
                
                return "".join(output_lines)

        except Exception as e:
            error_msg = f"Error: {str(e)}"
            if not is_device_check:
                self.log_to_web(error_msg, 'error')
            
            if callback_id:
                socketio.emit('command_complete', {'callback_id': callback_id, 'success': False})
            
            return error_msg

    def stop_current_process(self):
        """Terminates the currently running terminal process."""
        if self.current_process and self.current_process.poll() is None:
            self.log_to_web("System: 正在终止当前命令...", "system")
            try:
                self.current_process.terminate()
                return True
            except Exception as e:
                self.log_to_web(f"Error terminating process: {e}", "error")
        return False

    def device_monitor(self):
        """Background thread to monitor connected devices."""
        while not self._stop_monitor.is_set():
            try:
                output = self.execute_adb_command(["adb", "devices"], is_device_check=True)
                devices = []
                if output:
                    lines = output.strip().split('\n')
                    for line in lines[1:]:
                        if line.strip() and '\t' in line:
                            parts = line.strip().split('\t')
                            if len(parts) == 2:
                                device_id, status = parts
                                devices.append({'id': device_id, 'status': status})
                
                socketio.emit('device_list', devices)
            except Exception as e:
                print(f"LOG [error]: Device monitor error: {e}")
            
            socketio.sleep(self.config.DEVICE_MONITOR_INTERVAL)

    def start_background_tasks(self):
        tools = self.tool_manager.check_all_tools(self.config.ADB_PATH, self.config.FASTBOOT_PATH)
        
        # Auto-download if tools are missing
        if not tools['adb']['available'] or not tools['fastboot']['available']:
            self.log_to_web("System: ADB/Fastboot 未找到，正在尝试自动内置工具...", "system")
            if self.tool_manager.download_platform_tools():
                # Refresh paths in config
                from config import get_local_tool
                local_adb = get_local_tool('adb')
                local_fastboot = get_local_tool('fastboot')
                if local_adb: self.config.ADB_PATH = local_adb
                if local_fastboot: self.config.FASTBOOT_PATH = local_fastboot
                
                # Re-check tools
                tools = self.tool_manager.check_all_tools(self.config.ADB_PATH, self.config.FASTBOOT_PATH)
                socketio.emit('tool_status', tools)
                self.log_to_web("System: 工具已自动内置并加载。", "system")
            else:
                self.log_to_web("System: 自动内置工具失败，请检查网络或手动安装。", "error")

        # Start device monitor in a background thread
        socketio.start_background_task(self.device_monitor)

    def get_fastboot_partitions(self):
        """Fetches partition list from fastboot getvar all."""
        output = self.execute_adb_command(["fastboot", "getvar", "all"], is_device_check=True)
        partitions = []
        if output:
            import re
            # Look for partition-size:PARTNAME:SIZE or partition-type:PARTNAME:TYPE
            matches = re.findall(r"partition-(?:size|type):(.*?):", output)
            if matches:
                partitions = sorted(list(set(matches)))
        
        # Fallback to common partitions if none found
        if not partitions:
            partitions = ["boot", "recovery", "system", "vendor", "userdata", "vbmeta", "dtbo"]
            
        return partitions

manager = BackendManager()


@app.route('/')
def index():
    return render_template('index.html', ui_config=manager.ui_config)


@socketio.on('connect')
def handle_connect():
    print("LOG [system]: Client connected via SocketIO")
    manager.log_to_web("System: Connection established with backend.", "system")
    # Send tool status immediately on connect
    tools = manager.tool_manager.check_all_tools(manager.config.ADB_PATH, manager.config.FASTBOOT_PATH)
    socketio.emit('tool_status', tools)
    
    # Send UI config and AI config
    socketio.emit('ui_config', manager.ui_config)
    socketio.emit('ai_config', manager.ai_config)
    
    # Send command suggestions (Legacy / Fallback)
    suggestions = [
        'adb devices', 'adb shell', 'adb logcat', 'adb reboot', 
        'adb reboot recovery', 'adb reboot bootloader', 'adb reboot sideload',
        'adb install ', 'adb uninstall ', 'adb push ', 'adb pull ',
        'fastboot devices', 'fastboot reboot', 'fastboot flash ',
        'scrcpy', 'cls', 'clear', 'help'
    ]
    socketio.emit('command_suggestions', suggestions)
    
    # Send some system info
    info = f"OS: {platform.system()} {platform.release()} | Python: {platform.python_version()}"
    manager.log_to_web(f"System Info: {info}", "system")


@socketio.on('refresh_tools')
def handle_refresh_tools():
    tools = manager.tool_manager.check_all_tools(manager.config.ADB_PATH, manager.config.FASTBOOT_PATH)
    socketio.emit('tool_status', tools)
    manager.log_to_web("System: Tools re-scanned.", "system")


@socketio.on('run_command')
def handle_run_command(data):
    cmd = data.get('command')
    callback_id = data.get('callback_id')
    if cmd:
        manager.executor.submit(manager.execute_adb_command, cmd, False, callback_id)


@socketio.on('stop_command')
def handle_stop_command():
    manager.stop_current_process()


@socketio.on('select_device')
def handle_select_device(data):
    device_id = data.get('device_id')
    manager.selected_device = device_id or ""
    manager.log_to_web(f"System: Selected device set to {manager.selected_device or 'None'}", "system")


@socketio.on('update_config')
def handle_update_config(data):
    # Handle UI config updates
    if 'ui' in data:
        manager.save_ui_config(data['ui'])
        socketio.emit('ui_config', manager.ui_config, broadcast=True)
        manager.log_to_web("System: UI configuration updated.", "system")
    
    # Handle AI config updates
    if 'ai' in data:
        manager.save_ai_config(data['ai'])
        socketio.emit('ai_config', manager.ai_config, broadcast=True)
        manager.log_to_web("System: AI configuration updated.", "system")

    # Handle ADB path update
    if 'adb_path' in data:
        adb_path = data.get('adb_path')
        manager.config.ADB_PATH = adb_path
        manager.log_to_web(f"System: ADB path updated to: {adb_path or 'system default'}", "system")
        tools = manager.tool_manager.check_all_tools(manager.config.ADB_PATH, manager.config.FASTBOOT_PATH)
        socketio.emit('tool_status', tools)


@socketio.on('get_partitions')
def handle_get_partitions():
    partitions = manager.get_fastboot_partitions()
    socketio.emit('partition_list', partitions)
    manager.log_to_web("System: 分区列表已更新。", "system")


@socketio.on('flash_partition')
def handle_flash_partition(data):
    partition = data.get('partition')
    file_path = data.get('file_path')
    callback_id = data.get('callback_id')
    
    if not partition or not file_path:
        manager.log_to_web("Error: 分区或文件路径不能为空。", "error")
        if callback_id:
            socketio.emit('command_complete', {'callback_id': callback_id, 'success': False})
        return

    # If it's a local file path
    cmd = ["fastboot", "flash", partition, file_path]
    manager.executor.submit(manager.execute_adb_command, cmd, False, callback_id)


@socketio.on('ai_chat')
def handle_ai_chat(data):
    messages = data.get('messages', [])
    
    def ai_task():
        response = manager.ask_ai(messages)
        socketio.emit('ai_response', {'content': response})
        
    manager.executor.submit(ai_task)


def open_browser():
    """Opens the browser to the application URL after a short delay."""
    socketio.sleep(1.5)
    url = f"http://127.0.0.1:{Config.PORT}"
    print(f"LOG [system]: Automatically opening browser at {url}")
    webbrowser.open(url)

if __name__ == '__main__':
    # Try to find a free port starting from Config.PORT
    original_port = Config.PORT
    actual_port = original_port
    
    # Check if port is available
    for p in range(original_port, original_port + 20):
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            try:
                s.bind(('127.0.0.1', p))
                actual_port = p
                break
            except OSError:
                if p == original_port + 19:
                    print(f"LOG [error]: Could not find a free port after 20 attempts.")
                continue
    
    if actual_port != original_port:
        print(f"LOG [system]: Port {original_port} is busy, using {actual_port} instead.")
        Config.PORT = actual_port
    
    manager.start_background_tasks()
    
    if Config.AUTO_OPEN_BROWSER:
        # Start the browser opener in a background task
        socketio.start_background_task(open_browser)
        
    socketio.run(app, host='127.0.0.1', port=Config.PORT, debug=Config.DEBUG, allow_unsafe_werkzeug=True)
