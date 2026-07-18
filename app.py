# -*- coding: utf-8 -*-
from flask import Flask, render_template, jsonify, request
from flask_socketio import SocketIO, emit
import subprocess
import threading
import time
import sys
import os
import shutil
import webbrowser

# 导入原有的工具管理逻辑
from gettools import ToolManager, DesignLinkage

app = Flask(__name__)
app.config['SECRET_KEY'] = 'ghikari_secret'
socketio = SocketIO(app, cors_allowed_origins="*")

# 初始化联动系统
linkage = DesignLinkage()
tool_manager = ToolManager(linkage)

# 全局状态
class GlobalState:
    adb_path = shutil.which('adb') or ""
    selected_device = ""
    
state = GlobalState()

def log_to_web(message):
    socketio.emit('log_update', {'data': message})

def execute_adb_command(command, is_device_check=False):
    """执行 ADB 命令并发送结果到 Web"""
    try:
        # 处理设备选择
        if not is_device_check and state.selected_device:
            if "adb" in command and "-s" not in command:
                command = command.replace("adb", f"adb -s {state.selected_device}", 1)
        
        # 处理 ADB 路径
        if state.adb_path:
            full_command = command.replace("adb", f'"{state.adb_path}"', 1)
        else:
            full_command = command
            
        if not is_device_check:
            log_to_web(f"\n> {full_command}")

        process = subprocess.Popen(
            full_command,
            shell=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True
        )

        output_lines = []
        for line in iter(process.stdout.readline, ''):
            if line:
                output_lines.append(line)
                if not is_device_check:
                    log_to_web(line.strip())
        
        process.stdout.close()
        process.wait()
        
        return "".join(output_lines)
    except Exception as e:
        error_msg = f"Error: {str(e)}"
        if not is_device_check:
            log_to_web(error_msg)
        return error_msg

def device_monitor():
    """后台监控设备连接情况"""
    while True:
        output = execute_adb_command("adb devices", is_device_check=True)
        devices = []
        if output:
            lines = output.strip().split('\n')
            for line in lines[1:]:
                if line.strip() and '\t' in line:
                    device_id, status = line.strip().split('\t')
                    devices.append({'id': device_id, 'status': status})
        
        socketio.emit('device_update', {'devices': devices})
        time.sleep(3)

@app.route('/')
def index():
    return render_template('index.html')

@socketio.on('run_command')
def handle_command(data):
    cmd = data.get('command')
    if cmd:
        threading.Thread(target=execute_adb_command, args=(cmd,)).start()

@socketio.on('update_config')
def handle_config(data):
    new_path = data.get('adb_path')
    if new_path is not None:
        state.adb_path = new_path
        log_to_web(f"ADB 路径更新为: {new_path}")

@socketio.on('select_device')
def handle_select_device(data):
    state.selected_device = data.get('device_id', "")
    log_to_web(f"已选中设备: {state.selected_device or '无'}")

if __name__ == '__main__':
    # 启动设备监控线程
    monitor_thread = threading.Thread(target=device_monitor, daemon=True)
    monitor_thread.start()
    
    # 启动服务器
    socketio.run(app, port=5000, debug=False, allow_unsafe_werkzeug=True)
