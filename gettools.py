# -*- coding: utf-8 -*-

"""
工具管理与设计联动模块
Tool Management and Design Linkage Module
"""

import subprocess
import sys
import os
from typing import Dict, List, Optional, Callable


class DesignLinkage:
    """
    设计联动核心 - 连接工具检测、UI 和功能模块
    Design Linkage Core - Connects tool detection, UI, and functional modules
    """

    def __init__(self):
        self.callbacks: Dict[str, List[Callable]] = {}
        self.state: Dict[str, any] = {
            'adb_available': False,
            'devices': [],
            'tools_ready': False,
            'ui_initialized': False
        }

    def register_callback(self, event: str, callback: Callable):
        """
        注册事件回调
        Register event callback
        """
        if event not in self.callbacks:
            self.callbacks[event] = []
        self.callbacks[event].append(callback)
        print(f"OK! 注册回调: {event} / Callback registered: {event}")

    def trigger_event(self, event: str, data: any = None):
        """
        触发事件并执行所有注册的回调
        Trigger event and execute all registered callbacks
        """
        if event in self.callbacks:
            print(f"Event: 触发事件: {event} / Triggering event: {event}")
            for callback in self.callbacks[event]:
                try:
                    callback(data)
                except Exception as e:
                    print(f"Error! 回调出错 / Callback error: {e}")

    def update_state(self, key: str, value: any):
        """
        更新状态并触发相应事件
        Update state and trigger corresponding events
        """
        old_value = self.state.get(key)
        self.state[key] = value

        if old_value != value:
            event_name = f"state_changed_{key}"
            self.trigger_event(event_name, value)
            print(f"OK! 状态更新: {key} = {value} / State updated: {key} = {value}")


class ToolManager:
    """
    工具管理器 - 管理外部工具检测与获取
    Tool Manager - Manages external tool detection and acquisition
    """

    def __init__(self, linkage: DesignLinkage):
        self.linkage = linkage
        self.tools = {
            'adb': {'available': False, 'path': None, 'version': None},
            'fastboot': {'available': False, 'path': None, 'version': None},
            'python': {'available': True, 'path': sys.executable, 'version': sys.version}
        }

    def check_tool(self, tool_name: str, command: List[str]) -> bool:
        """
        检查工具是否可用
        Check if tool is available
        """
        try:
            result = subprocess.run(
                command,
                capture_output=True,
                text=True,
                timeout=3
            )
            if result.returncode == 0:
                self.tools[tool_name]['available'] = True
                self.tools[tool_name]['version'] = result.stdout.strip().split('\n')[0]
                print(f"OK! {tool_name} 可用 / available: {self.tools[tool_name]['version']}")
                return True
            return False
        except (FileNotFoundError, subprocess.TimeoutExpired):
            print(f"Error! {tool_name} 不可用 / not available")
            return False

    def check_all_tools(self):
        """
        检查所有工具
        Check all tools
        """
        print("\n=== 开始工具检查 / Tool Check Started ===")
        adb_available = self.check_tool('adb', ['adb', 'version'])
        self.check_tool('fastboot', ['fastboot', '--version'])

        # 更新联动状态
        self.linkage.update_state('adb_available', adb_available)
        self.linkage.update_state('tools_ready', True)

        self.linkage.trigger_event('tools_checked', self.tools)
        print("=== 工具检查完成 / Tool Check Completed ===\n")

        return adb_available

    def get_tools_status(self) -> Dict:
        """
        获取工具状态
        Get tools status
        """
        return self.tools


class UIBridge:
    """
    UI 桥接器 - 连接核心逻辑与 UI 界面
    UI Bridge - Connects core logic and UI interface
    """

    def __init__(self, linkage: DesignLinkage):
        self.linkage = linkage
        self.ui_process = None

        # 注册回调
        self.linkage.register_callback('tools_checked', self.on_tools_checked)
        self.linkage.register_callback('state_changed_devices', self.on_devices_changed)

    def on_tools_checked(self, tools_data: Dict):
        """
        工具检查后的回调
        Callback after tools checked
        """
        print("UI 收到工具状态 / UI received tool status")
        if self.linkage.state.get('adb_available'):
            self.launch_ui()

    def on_devices_changed(self, devices: List):
        """
        设备列表变化时的回调
        Callback when device list changes
        """
        print(f"设备列表更新: {len(devices)} 个设备 / Device list updated: {len(devices)} device(s)")

    def launch_ui(self):
        """
        启动 UI 界面
        Launch UI interface
        """
        try:
            print("正在启动 UI / Launching UI...")
            result = subprocess.run(
                [sys.executable, 'ui.py'],
                capture_output=True,
                text=True,
                timeout=30
            )
            if result.returncode == 0:
                print("OK! UI 启动成功 / UI launched successfully")
                self.linkage.update_state('ui_initialized', True)
            else:
                print(f"Error! UI 启动失败: {result.stderr}")
        except FileNotFoundError:
            print("Error! 未找到 python 或 ui.py / ui.py not found")
        except subprocess.TimeoutExpired:
            print("Error! UI 启动超时 / UI launch timeout")


# ========== 设计联动初始化 / Design Linkage Initialization ==========

def initialize_linkage() -> DesignLinkage:
    """
    初始化设计联动系统
    Initialize design linkage system
    """
    print("\n" + "="*60)
    print("GHikari - 安卓刷机工具箱设计联动系统")
    print("GHikari - Android Flashing Toolbox Design Linkage System")
    print("="*60 + "\n")

    # 初始化设计联动
    linkage = DesignLinkage()

    # 初始化工具管理器
    tool_manager = ToolManager(linkage)

    # 初始化 UI 桥接器
    ui_bridge = UIBridge(linkage)

    # 执行工具检查
    tools_available = tool_manager.check_all_tools()

    # 返回联动对象供后续使用
    return linkage


if __name__ == "__main__":
    linkage = initialize_linkage()
    print("\nOK! 设计联动系统就绪 / Design Linkage System Ready")
