# -*- coding: utf-8 -*-
import webview
import threading
import time
import sys
import os
from app import app, socketio

def run_flask():
    # 启动 Flask-SocketIO 服务器
    socketio.run(app, port=5000, debug=False, use_reloader=False, allow_unsafe_werkzeug=True)

def start_ui():
    # 创建 webview 窗口
    window = webview.create_window(
        'GHikari Toolbox - Android Flashing Master',
        'http://127.0.0.1:5000',
        width=1000,
        height=750,
        resizable=True,
        min_size=(800, 600)
    )
    
    # 启动 webview
    webview.start()

if __name__ == '__main__':
    print("="*60)
    print("正在启动 GHikari 独立窗口模式...")
    print("Launching GHikari in standalone window mode...")
    print("="*60)
    
    # 启动 Flask 线程
    flask_thread = threading.Thread(target=run_flask, daemon=True)
    flask_thread.start()
    
    # 等待服务器就绪
    time.sleep(2)
    
    # 启动 UI 窗口
    try:
        start_ui()
    except Exception as e:
        print(f"窗口启动失败: {e}")
        print("Falling back to browser mode...")
        import webbrowser
        webbrowser.open("http://127.0.0.1:5000")
        try:
            while True:
                time.sleep(1)
        except KeyboardInterrupt:
            pass
