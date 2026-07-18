const socket = io();

// UI Elements
const consoleOutput = document.getElementById('console-output');
const deviceContainer = document.getElementById('device-list-container');
const adbPathInput = document.getElementById('adb-path');
const saveConfigBtn = document.getElementById('save-config');
const clearLogBtn = document.getElementById('clear-log-btn');
const connectionStatus = document.getElementById('connection-status');
const statusText = document.getElementById('status-text');

let selectedDeviceId = null;

// Socket Events
socket.on('connect', () => {
    connectionStatus.classList.add('connected');
    statusText.innerText = '服务器已连接';
    addLogLine('System: 连接到后端服务器成功.', 'system');
});

socket.on('disconnect', () => {
    connectionStatus.classList.remove('connected');
    statusText.innerText = '服务器已断开';
    addLogLine('System: 与后端服务器断开连接.', 'system');
});

socket.on('log_update', (data) => {
    addLogLine(data.data);
});

socket.on('device_update', (data) => {
    updateDeviceList(data.devices);
});

// Functions
function addLogLine(text, type = '') {
    const line = document.createElement('div');
    line.className = `line ${type}`;
    line.innerText = text;
    consoleOutput.appendChild(line);
    consoleOutput.scrollTop = consoleOutput.scrollHeight;
}

function updateDeviceList(devices) {
    if (devices.length === 0) {
        deviceContainer.innerHTML = '<p class="empty-msg">🚫 未发现可用设备</p>';
        return;
    }

    let html = '';
    devices.forEach(device => {
        const isSelected = device.id === selectedDeviceId;
        html += `
            <div class="device-item ${isSelected ? 'selected' : ''}" onclick="selectDevice('${device.id}')">
                <div class="device-info">
                    <span>📱</span>
                    <strong>${device.id}</strong>
                </div>
                <span class="status-tag ${device.status === 'device' ? 'online' : ''}">${device.status}</span>
            </div>
        `;
    });
    deviceContainer.innerHTML = html;
}

function selectDevice(id) {
    selectedDeviceId = id === selectedDeviceId ? null : id;
    socket.emit('select_device', { device_id: selectedDeviceId });
    // UI 立即反馈，等待下一次 device_update 刷新
    const items = document.querySelectorAll('.device-item');
    items.forEach(item => {
        if (item.querySelector('strong').innerText === id) {
            item.classList.toggle('selected');
        } else {
            item.classList.remove('selected');
        }
    });
}

function runCommand(cmd) {
    socket.emit('run_command', { command: cmd });
}

// Event Listeners
saveConfigBtn.addEventListener('click', () => {
    const path = adbPathInput.value.trim();
    socket.emit('update_config', { adb_path: path });
    addLogLine(`System: 正在尝试更新 ADB 路径为 ${path || '系统默认'}`, 'system');
});

clearLogBtn.addEventListener('click', () => {
    consoleOutput.innerHTML = '<div class="line system">Console cleared.</div>';
});

// Initialize
window.onload = () => {
    addLogLine('Welcome to GHikari Toolbox Web Edition.', 'system');
};
