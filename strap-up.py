# -*- coding: utf-8 -*-

"""
警告：该项目使用了少量的AI加工，不代表最终品质
CAUTION: This project uses very little AI processing; it is not final quality and may contain many bugs.
"""

"""
ADB 运行环境检查器
ADB Runtime Environment Checker
"""

import subprocess
import platform
import sys
import os


class ADBChecker:
    """
    检查 ADB 运行条件，不扫描文件系统
    Check ADB runtime conditions without scanning the file system.
    """

    def __init__(self):
        # 操作系统类型 / OS type
        self.os_type = platform.system()
        self.adb_path = None
        self.is_available = False

    def check_adb_availability(self):
        """
        通过执行 adb version 命令检测 ADB 是否可用
        Check ADB availability by running 'adb version'.
        """
        try:
            result = subprocess.run(
                ['adb', 'version'],
                capture_output=True,
                text=True,
                timeout=3
            )

            if result.returncode == 0:
                self.is_available = True
                version_info = result.stdout.strip().split('\n')[0]
                print(f"have adb: {version_info}")
                return True
            else:
                print("can't run adb command")
                return False

        except FileNotFoundError:
            print("Oops! not found adb")
            return False
        except subprocess.TimeoutExpired:
            print("Oops! get adb timeout")
            return False
        except Exception as e:
            print(f"Oops! check ADB has errors: {e}")
            return False

    def check_adb_detailed(self):
        """
        详细检查 ADB 运行条件，返回包含详细结果的字典
        Perform a detailed check and return a dict with results.
        """
        results = {
            'available': False,
            'path': None,
            'version': None,
            'devices': [],
            'errors': []
        }

        # 1. 检查 adb 是否在 PATH 中 / Check if adb is in PATH
        try:
            import shutil
            adb_path = shutil.which('adb')
            if adb_path:
                results['path'] = adb_path
                print(f"OK! adb path at there: {adb_path}")
            else:
                results['errors'].append("adb not have the path")
                print("Oh No.... Can't find the adb path......")
        except:
            pass

        # 2. 获取 ADB 版本 / Get ADB version
        try:
            result = subprocess.run(
                ['adb', 'version'],
                capture_output=True,
                text=True,
                timeout=3
            )
            if result.returncode == 0:
                results['available'] = True
                results['version'] = result.stdout.strip().split('\n')[0]
                print(f"OK! adb version: {results['version']}")
            else:
                results['errors'].append("adb version can't run")
        except Exception as e:
            results['errors'].append(f"adb version has errors: {str(e)}")

        # 3. 检查已连接的设备 / Check connected devices
        if results['available']:
            try:
                result = subprocess.run(
                    ['adb', 'devices'],
                    capture_output=True,
                    text=True,
                    timeout=5
                )
                if result.returncode == 0:
                    lines = result.stdout.strip().split('\n')[1:]  # 跳过标题 / skip header
                    for line in lines:
                        if line.strip() and '\t' in line:
                            device_id, status = line.strip().split('\t')
                            results['devices'].append({
                                'id': device_id,
                                'status': status
                            })
                    print(f"found {len(results['devices'])} devices")
            except Exception as e:
                results['errors'].append(f"can't find devices: {str(e)}")

        return results


# ========== 主执行逻辑 / Main Execution ==========
checker = ADBChecker()

if checker.check_adb_availability():
    try:
        # 启动嵌入式 UI 窗口 / Start Embedded UI Window
        print("Launching GHikari Toolbox UI...")
        subprocess.run(
            [sys.executable, 'ui.py']
        )
    except FileNotFoundError:
        print("can't find python or ui.py")
    except subprocess.TimeoutExpired:
        print("ui.py running timeout")
else:
    print("can't run adb command")
