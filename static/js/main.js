const consoleOutput = document.getElementById('console-output');
const deviceContainer = document.getElementById('device-list-container');
const adbPathInput = document.getElementById('adb-path');
const saveConfigBtn = document.getElementById('save-config');
const clearLogBtn = document.getElementById('clear-log-btn');
const connectionStatus = document.getElementById('connection-status');
const statusText = document.getElementById('status-text');
const editLayoutBtn = document.getElementById('edit-layout-btn');
const buttonGrid = document.getElementById('button-grid');
const adbStatus = document.getElementById('adb-status');
const fastbootStatus = document.getElementById('fastboot-status');
const refreshToolsBtn = document.getElementById('refresh-tools-btn');
const refreshDevicesBtn = document.getElementById('refresh-devices-btn');
const themeToggle = document.getElementById('theme-toggle');
const meteorContainer = document.getElementById('meteor-container');
const mouseTracker = document.getElementById('mouse-tracker');
const terminalToggle = document.getElementById('terminal-toggle');
const fastbootToggle = document.getElementById('fastboot-toggle');
const closeFastboot = document.getElementById('close-fastboot');
const fastbootPanel = document.getElementById('fastboot-panel');
const partitionSelect = document.getElementById('partition-select');
const refreshPartitionsBtn = document.getElementById('refresh-partitions');
const flashFilePathInput = document.getElementById('flash-file-path');
const startFlashBtn = document.getElementById('start-flash');
const terminalInput = document.getElementById('terminal-input');
const stopCommandBtn = document.getElementById('stop-command-btn');
const consoleSection = document.querySelector('.console-section');
const suggestionList = document.getElementById('suggestion-list');
const aiChatToggle = document.getElementById('ai-chat-toggle');
// AI Chat elements are now dynamic, references removed from top level
const aiEnabledCheckbox = document.getElementById('ai-enabled');
const aiApiKeyInput = document.getElementById('ai-api-key');
const aiBaseUrlInput = document.getElementById('ai-base-url');
const aiModelInput = document.getElementById('ai-model');
const saveAiConfigBtn = document.getElementById('save-ai-config');
// AI History elements are also dynamic now

let selectedDeviceId = null;
let isEditMode = false;
let activeCallbacks = new Map();
let currentUIConfig = {};
let currentAIConfig = {};
let chatMessages = [];
let conversationHistory = []; // Array of conversation objects {user: "", assistant: ""}
let historyViewIndex = -1;
let isDraggingInternal = false;
let meteorInterval = null;
let commandHistory = [];
let historyIndex = -1;
let commandSuggestions = []; // Will be used for simple fallback
let currentSuggestionIndex = -1;

// Mouse Tracker Logic
document.addEventListener('mousemove', (e) => {
    if (mouseTracker) {
        // Use requestAnimationFrame for smoother cursor tracking
        requestAnimationFrame(() => {
            mouseTracker.style.left = e.clientX + 'px';
            mouseTracker.style.top = e.clientY + 'px';
        });
        
        // Real-time Aero Calculation
        const centerX = window.innerWidth / 2;
        const centerY = window.innerHeight / 2;
        const distance = Math.sqrt(Math.pow(e.clientX - centerX, 2) + Math.pow(e.clientY - centerY, 2));
        const maxDist = Math.sqrt(Math.pow(centerX, 2) + Math.pow(centerY, 2));
        const factor = 1 - (distance / maxDist);
        
        document.documentElement.style.setProperty('--aero-factor', factor.toFixed(2));
    }
});

// Card Tilt Effect
let lastTiltCard = null;
function initCardTilt() {
    document.addEventListener('mousemove', (e) => {
        const card = e.target.closest('.card, .device-item');
        
        if (lastTiltCard && lastTiltCard !== card) {
            lastTiltCard.style.transform = 'perspective(1000px) rotateX(0deg) rotateY(0deg) translateY(0) scale(1)';
            lastTiltCard = null;
        }
        
        if (!card || isEditMode) return;
        
        lastTiltCard = card;
        const rect = card.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        
        const centerX = rect.width / 2;
        const centerY = rect.height / 2;
        
        const rotateX = ((y - centerY) / centerY) * -2;
        const rotateY = ((x - centerX) / centerX) * 2;
        
        requestAnimationFrame(() => {
            if (lastTiltCard === card) { // Double check
                card.style.transform = `perspective(1000px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) translateY(-8px) scale(1.02)`;
            }
        });
    });
}

// Initialize SocketIO
const socket = io();

socket.on('connect', () => {
    connectionStatus.classList.add('connected');
    statusText.innerText = '系统就绪';
    addLogLine('System: 后端 Socket 连接已就绪.', 'system');
    loadButtonOrder();
});

socket.on('disconnect', () => {
    connectionStatus.classList.remove('connected');
    statusText.innerText = '正在重连...';
    addLogLine('Error: 与后端的连接已断开.', 'error');
});

socket.on('log_update', (data) => {
    if (data.message === 'CLEAR_CONSOLE') {
        consoleOutput.innerHTML = '<div class="line system">Console cleared.</div>';
    } else {
        addLogLine(data.message, data.type);
    }
});

socket.on('device_list', (devices) => {
    updateDeviceList(devices);
});

socket.on('tool_status', (tools) => {
    updateToolStatus(tools);
});

socket.on('command_complete', (data) => {
    onCommandComplete(data.callback_id, data.success);
});

socket.on('ui_config', (config) => {
    currentUIConfig = config;
    applyUIConfig(config);
});

socket.on('ai_config', (config) => {
    currentAIConfig = config;
    applyAIConfig(config);
});

    socket.on('ai_response', (data) => {
        addAiMessage('assistant', data.content);
        
        // Add to history
        if (chatMessages.length > 0 && chatMessages[chatMessages.length - 1].role === 'user') {
            conversationHistory.push({
                user: chatMessages[chatMessages.length - 1].content,
                assistant: data.content
            });
            historyViewIndex = conversationHistory.length - 1;
            saveConversationHistory(); // Persistent save
            if (typeof window.updateHistoryUI === 'function') {
                window.updateHistoryUI();
            }
        }
    });

socket.on('partition_list', (partitions) => {
    updatePartitionList(partitions);
});

socket.on('command_suggestions', (suggestions) => {
    commandSuggestions = suggestions;
});

// Create toast container if it doesn't exist
if (!document.getElementById('toast-container')) {
    const container = document.createElement('div');
    container.id = 'toast-container';
    document.body.appendChild(container);
}

// Functions
function addLogLine(text, type = '') {
    const line = document.createElement('div');
    line.className = `line ${type}`;
    line.innerText = text;
    consoleOutput.appendChild(line);
    consoleOutput.scrollTop = consoleOutput.scrollHeight;
}

function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerText = message;
    container.appendChild(toast);

    setTimeout(() => {
        toast.style.opacity = '0';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

function saveConversationHistory() {
    localStorage.setItem('ghikari_conversation_history', JSON.stringify(conversationHistory));
    localStorage.setItem('ghikari_chat_messages', JSON.stringify(chatMessages));
}

function loadConversationHistory() {
    const savedHistory = localStorage.getItem('ghikari_conversation_history');
    const savedMessages = localStorage.getItem('ghikari_chat_messages');
    if (savedHistory) {
        try {
            conversationHistory = JSON.parse(savedHistory);
            const aiMessages = document.getElementById('ai-chat-messages');
            if (aiMessages && conversationHistory.length > 0) {
                aiMessages.innerHTML = '';
                conversationHistory.forEach(item => {
                    addAiMessage('user', item.user, false); // false to avoid recursive speak
                    addAiMessage('assistant', item.assistant, false);
                });
            }
            historyViewIndex = conversationHistory.length - 1;
            if (typeof window.updateHistoryUI === 'function') window.updateHistoryUI();
        } catch (e) { console.error("Failed to load history", e); }
    }
    if (savedMessages) {
        try {
            chatMessages = JSON.parse(savedMessages);
        } catch (e) { console.error("Failed to load messages", e); }
    }
}

function clearConversationHistory() {
    conversationHistory = [];
    chatMessages = [];
    historyViewIndex = -1;
    localStorage.removeItem('ghikari_conversation_history');
    localStorage.removeItem('ghikari_chat_messages');
    if (typeof window.updateHistoryUI === 'function') window.updateHistoryUI();
    const aiMessages = document.getElementById('ai-chat-messages');
    if (aiMessages) {
        aiMessages.innerHTML = '<div class="ai-message assistant">你好！我是 GHikari AI 助手。有什么我可以帮你的吗？</div>';
    }
    showToast('对话历史已清空', 'info');
}

function updateToolStatus(tools) {
    if (tools.adb.available) {
        adbStatus.innerText = tools.adb.version;
        adbStatus.className = 'tool-val success';
    } else {
        adbStatus.innerText = '未找到';
        adbStatus.className = 'tool-val error';
    }

    if (tools.fastboot.available) {
        fastbootStatus.innerText = tools.fastboot.version;
        fastbootStatus.className = 'tool-val success';
    } else {
        fastbootStatus.innerText = '未找到';
        fastbootStatus.className = 'tool-val error';
    }
}

function updateDeviceList(devices) {
    if (devices.length === 0) {
        deviceContainer.innerHTML = '<p class="empty-msg">未发现可用设备</p>';
        return;
    }

    let html = '';
    devices.forEach(device => {
        const isSelected = device.id === selectedDeviceId;
        html += `
            <div class="device-item ${isSelected ? 'selected' : ''}" onclick="selectDevice('${device.id}')">
                <div class="device-info">
                    <span class="device-dot ${device.status === 'device' ? 'online' : ''}"></span>
                    <strong>${device.id}</strong>
                </div>
                <span class="status-tag ${device.status === 'device' ? 'online' : ''}">${device.status}</span>
            </div>
        `;
    });
    deviceContainer.innerHTML = html;
    // Re-initialize tilt for new items if they are cards (device-item is not a card currently but we can add it)
}

function selectDevice(id) {
    selectedDeviceId = id === selectedDeviceId ? null : id;
    socket.emit('select_device', { device_id: selectedDeviceId });
    
    const items = document.querySelectorAll('.device-item');
    items.forEach(item => {
        if (item.querySelector('strong').innerText === id) {
            item.classList.toggle('selected');
        } else {
            item.classList.remove('selected');
        }
    });
}

function runCommand(cmd, btnElement) {
    if (isEditMode) return;

    const callbackId = 'cb_' + Date.now() + '_' + Math.floor(Math.random() * 1000);
    
    if (btnElement) {
        btnElement.classList.add('loading');
        activeCallbacks.set(callbackId, btnElement);
        
        // Character reaction to button click
        if (typeof showMessage === 'function') {
            const btnName = btnElement.innerText || "命令";
            showMessage(`正在尝试执行: ${btnName}`, 2000, 9);
        } else {
            const tips = document.getElementById('waifu-tips');
            if (tips) {
                const btnName = btnElement.innerText || "命令";
                tips.innerHTML = `正在尝试执行: ${btnName}`;
                tips.style.opacity = 1;
                setTimeout(() => { tips.style.opacity = 0; }, 2000);
            }
        }
    }

    socket.emit('run_command', { command: cmd, callback_id: callbackId });
}

function runCommandWithInput(baseCmd, promptText, btnElement) {
    if (isEditMode) return;
    const input = prompt(promptText);
    if (input !== null && input.trim() !== "") {
        runCommand(`${baseCmd} ${input.trim()}`, btnElement);
    }
}

function onCommandComplete(callbackId, success) {
    const btn = activeCallbacks.get(callbackId);
    if (btn) {
        btn.classList.remove('loading');
        activeCallbacks.delete(callbackId);
        
        if (success) {
            showToast('命令执行成功', 'success');
        } else {
            showToast('命令执行失败', 'error');
        }
    }
}

// Layout Editor Logic
editLayoutBtn.addEventListener('click', () => {
    isEditMode = !isEditMode;
    document.body.classList.toggle('editing', isEditMode);
    
    if (isEditMode) {
        editLayoutBtn.innerHTML = '<svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg> 完成';
        enableDragAndDrop();
        addLogLine('System: 进入编辑模式，拖拽按键调整位置.', 'system');
    } else {
        editLayoutBtn.innerHTML = '<svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z"></path></svg> 布局';
        disableDragAndDrop();
        saveButtonOrder();
        addLogLine('System: 布局已保存.', 'system');
    }
    editLayoutBtn.classList.toggle('primary', isEditMode);
});

function enableDragAndDrop() {
    const buttons = buttonGrid.querySelectorAll('.btn');
    buttons.forEach(btn => {
        btn.draggable = true;
        btn.addEventListener('dragstart', handleDragStart);
        btn.addEventListener('dragover', handleDragOver);
        btn.addEventListener('drop', handleDrop);
        btn.addEventListener('dragend', handleDragEnd);
    });
}

function disableDragAndDrop() {
    const buttons = buttonGrid.querySelectorAll('.btn');
    buttons.forEach(btn => {
        btn.draggable = false;
        btn.removeEventListener('dragstart', handleDragStart);
        btn.removeEventListener('dragover', handleDragOver);
        btn.removeEventListener('drop', handleDrop);
        btn.removeEventListener('dragend', handleDragEnd);
    });
}

let draggedItem = null;

function handleDragStart(e) {
    draggedItem = this;
    e.dataTransfer.effectAllowed = 'move';
    this.style.opacity = '0.4';
}

function handleDragOver(e) {
    if (e.preventDefault) e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    return false;
}

function handleDrop(e) {
    if (e.stopPropagation) e.stopPropagation();
    if (draggedItem !== this) {
        // Swap elements
        const allButtons = Array.from(buttonGrid.children);
        const draggedIdx = allButtons.indexOf(draggedItem);
        const targetIdx = allButtons.indexOf(this);
        
        if (draggedIdx < targetIdx) {
            this.after(draggedItem);
        } else {
            this.before(draggedItem);
        }
    }
    return false;
}

function handleDragEnd() {
    this.style.opacity = '1';
    draggedItem = null;
}

function saveButtonOrder() {
    const order = Array.from(buttonGrid.children).map(btn => btn.getAttribute('data-id'));
    localStorage.setItem('ghikari_button_order', JSON.stringify(order));
}

function loadButtonOrder() {
    const savedOrder = localStorage.getItem('ghikari_button_order');
    if (savedOrder) {
        const order = JSON.parse(savedOrder);
        const buttons = Array.from(buttonGrid.children);
        order.forEach(id => {
            const btn = buttons.find(b => b.getAttribute('data-id') === id);
            if (btn) buttonGrid.appendChild(btn);
        });
    } else {
        // If no saved order, we might want to ensure new buttons are visible
        // even if they were added after the last save.
        // The default HTML order will be used.
    }
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

refreshToolsBtn.addEventListener('click', () => {
    adbStatus.innerText = '检测中...';
    fastbootStatus.innerText = '检测中...';
    socket.emit('refresh_tools');
});

refreshDevicesBtn.addEventListener('click', () => {
    deviceContainer.innerHTML = '<p class="empty-msg">正在扫描设备...</p>';
});

// Terminal Interaction Logic
function quickInput(cmd) {
    if (consoleSection.classList.contains('minimized')) {
        terminalToggle.click();
    }
    terminalInput.value = cmd;
    terminalInput.focus();
    updateSuggestions();
}

terminalInput.addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.key.toLowerCase() === 'c') {
        socket.emit('stop_command');
        e.preventDefault();
        return;
    }

    if (suggestionList.style.display === 'block') {
        if (e.key === 'ArrowUp') {
            e.preventDefault();
            navigateSuggestions(-1);
            return;
        } else if (e.key === 'ArrowDown') {
            e.preventDefault();
            navigateSuggestions(1);
            return;
        } else if (e.key === 'Enter') {
            e.preventDefault();
            selectCurrentSuggestion();
            return;
        } else if (e.key === 'Escape') {
            hideSuggestions();
            return;
        }
    }

    if (e.key === 'Enter') {
        const cmd = terminalInput.value.trim();
        if (cmd) {
            // Internal 'say' command for character speech
            if (cmd.toLowerCase().startsWith('say ')) {
                const text = cmd.substring(4).trim();
                if (text && typeof showMessage === 'function') {
                    showMessage(text, 5000, 9);
                    addLogLine(`Character: ${text}`, 'system');
                }
                terminalInput.value = '';
                return;
            }

            runCommand(cmd);
            commandHistory.push(cmd);
            if (commandHistory.length > 50) commandHistory.shift();
            historyIndex = commandHistory.length;
            terminalInput.value = '';
            hideSuggestions();
        }
    } else if (e.key === 'ArrowUp') {
        if (historyIndex > 0) {
            historyIndex--;
            terminalInput.value = commandHistory[historyIndex];
            updateSuggestions();
        }
        e.preventDefault();
    } else if (e.key === 'ArrowDown') {
        if (historyIndex < commandHistory.length - 1) {
            historyIndex++;
            terminalInput.value = commandHistory[historyIndex];
            updateSuggestions();
        } else {
            historyIndex = commandHistory.length;
            terminalInput.value = '';
            hideSuggestions();
        }
        e.preventDefault();
    } else if (e.key === 'Tab') {
        e.preventDefault();
        if (suggestionList.style.display === 'block') {
            selectCurrentSuggestion();
        } else {
            updateSuggestions();
        }
    }
});

terminalInput.addEventListener('input', () => {
    updateSuggestions();
});

terminalInput.addEventListener('blur', () => {
    setTimeout(hideSuggestions, 200);
});

function updateSuggestions() {
    const val = terminalInput.value;
    const matches = getSuggestions(val);
    
    if (matches.length > 0) {
        renderSuggestions(matches);
    } else {
        hideSuggestions();
    }
}

function renderSuggestions(matches) {
    suggestionList.innerHTML = '';
    matches.forEach((match, index) => {
        const item = document.createElement('div');
        item.className = 'suggestion-item';
        if (index === 0) item.classList.add('active');
        
        item.innerHTML = `
            <span class="cmd-text">${match.cmd}</span>
            <span class="cmd-desc">${match.desc}</span>
        `;
        
        item.onclick = () => {
            terminalInput.value = match.cmd;
            terminalInput.focus();
            hideSuggestions();
        };
        
        suggestionList.appendChild(item);
    });
    
    suggestionList.style.display = 'block';
    currentSuggestionIndex = 0;
}

function navigateSuggestions(step) {
    const items = suggestionList.querySelectorAll('.suggestion-item');
    if (items.length === 0) return;
    
    items[currentSuggestionIndex].classList.remove('active');
    currentSuggestionIndex = (currentSuggestionIndex + step + items.length) % items.length;
    items[currentSuggestionIndex].classList.add('active');
    items[currentSuggestionIndex].scrollIntoView({ block: 'nearest' });
}

function selectCurrentSuggestion() {
    const items = suggestionList.querySelectorAll('.suggestion-item');
    if (items[currentSuggestionIndex]) {
        const cmdText = items[currentSuggestionIndex].querySelector('.cmd-text').innerText;
        terminalInput.value = cmdText;
        hideSuggestions();
    }
}

function hideSuggestions() {
    suggestionList.style.display = 'none';
    currentSuggestionIndex = -1;
}

stopCommandBtn.addEventListener('click', () => {
    socket.emit('stop_command');
});

terminalToggle.addEventListener('click', () => {
    consoleSection.classList.toggle('minimized');
    const isMinimized = consoleSection.classList.contains('minimized');
    if (isMinimized) {
        terminalToggle.innerHTML = '<svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><polyline points="4 17 10 11 4 5"></polyline><line x1="12" y1="19" x2="20" y2="19"></line></svg> 终端';
    } else {
        terminalToggle.innerHTML = '<svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><polyline points="18 15 12 9 6 15"></polyline></svg> 隐藏';
        setTimeout(() => terminalInput.focus(), 300);
    }
});

themeToggle.addEventListener('click', () => {
    const isDark = document.body.getAttribute('data-theme') === 'dark';
    const newTheme = isDark ? 'light' : 'dark';
    document.body.setAttribute('data-theme', newTheme);
    
    // Update config on backend
    socket.emit('update_config', { ui: { dark_mode: (!isDark).toString() } });
    addLogLine(`System: 切换至${newTheme === 'dark' ? '黑暗' : '明亮'}模式.`, 'system');
});

function applyUIConfig(config) {
    // Apply theme
    const theme = config.dark_mode === 'true' ? 'dark' : 'light';
    document.body.setAttribute('data-theme', theme);
    
    // Update dynamic style
    const dynamicStyle = document.getElementById('dynamic-theme');
    if (dynamicStyle) {
        dynamicStyle.innerHTML = `
            :root {
                --bg-gradient: ${config.background_gradient};
                --border-radius-lg: ${config.card_border_radius};
                --primary-color: ${config.primary_color};
            }
        `;
    }
    
    // Handle meteors
    if (config.show_meteors === 'true') {
        startMeteors();
    } else {
        stopMeteors();
    }
}

function applyAIConfig(config) {
    if (aiEnabledCheckbox) aiEnabledCheckbox.checked = config.enabled === 'true';
    if (aiApiKeyInput) aiApiKeyInput.value = config.api_key || '';
    if (aiBaseUrlInput) aiBaseUrlInput.value = config.base_url || '';
    if (aiModelInput) aiModelInput.value = config.model || '';
}

function toggleAiChat(show) {
    const aiPanel = document.getElementById('waifu-ai-panel');
    if (!aiPanel) return;
    
    const isClosed = aiPanel.classList.contains('closed');
    const shouldShow = show !== undefined ? show : isClosed;
    
    if (shouldShow) {
        aiPanel.classList.remove('closed');
        aiChatToggle.classList.add('primary');
        const aiInput = document.getElementById('ai-input');
        if (aiInput) setTimeout(() => {
            aiInput.focus();
            isDraggingInternal = false;
        }, 400);
    } else {
        aiPanel.classList.add('closed');
        aiChatToggle.classList.remove('primary');
    }
}

function addAiMessage(role, content, shouldSpeak = true) {
    const aiMessages = document.getElementById('ai-chat-messages');
    if (!aiMessages) return;

    const msgDiv = document.createElement('div');
    msgDiv.className = `ai-message ${role}`;
    
    // Process content for commands
    const lines = content.split('\n');
    let htmlContent = '';
    
    lines.forEach(line => {
        const adbMatch = line.match(/(adb\s+[^`\n]+)/);
        const fastbootMatch = line.match(/(fastboot\s+[^`\n]+)/);
        
        if (adbMatch || fastbootMatch) {
            const cmd = (adbMatch || fastbootMatch)[0].trim();
            htmlContent += `${line.replace(cmd, `<code>${cmd}</code>`)}<button class="cmd-btn" onclick="quickInput('${cmd}')">填入终端: ${cmd}</button>`;
        } else {
            htmlContent += line + '<br>';
        }
    });
    
    msgDiv.innerHTML = htmlContent;
    aiMessages.appendChild(msgDiv);
    aiMessages.scrollTop = aiMessages.scrollHeight;
    
    if (role === 'assistant') {
        const sendAiMsgBtn = document.getElementById('send-ai-msg');
        if (sendAiMsgBtn) sendAiMsgBtn.classList.remove('loading');
        
        // Character speaks AI response
        if (shouldSpeak) {
            if (typeof showMessage === 'function') {
                showMessage(content, 5000, 9);
            } else {
                const tips = document.getElementById('waifu-tips');
                if (tips) {
                    tips.innerHTML = content;
                    tips.style.opacity = 1;
                    setTimeout(() => { tips.style.opacity = 0; }, 5000);
                }
            }
        }
    } else if (role === 'user') {
        // Character can also "repeat" or react to user input
        if (shouldSpeak) {
            if (typeof showMessage === 'function') {
                showMessage(content, 3000, 9);
            } else {
                const tips = document.getElementById('waifu-tips');
                if (tips) {
                    tips.innerHTML = content;
                    tips.style.opacity = 1;
                    setTimeout(() => { tips.style.opacity = 0; }, 3000);
                }
            }
        }
    }
}

function sendAiMessage() {
    const aiInput = document.getElementById('ai-input');
    const sendAiMsgBtn = document.getElementById('send-ai-msg');
    if (!aiInput || !sendAiMsgBtn) return;

    const text = aiInput.value.trim();
    if (!text || sendAiMsgBtn.classList.contains('loading')) return;
    
    addAiMessage('user', text);
    chatMessages.push({ role: 'user', content: text });
    
    // Keep context small
    if (chatMessages.length > 10) chatMessages.shift();
    
    saveConversationHistory(); // Save user message immediately
    socket.emit('ai_chat', { messages: chatMessages });
    sendAiMsgBtn.classList.add('loading');
    aiInput.value = '';
    aiInput.style.height = 'auto';
}

function startMeteors() {
    if (meteorInterval) return;
    
    const createMeteor = () => {
        if (currentUIConfig.show_meteors !== 'true') return;
        const meteor = document.createElement('div');
        meteor.className = 'meteor';
        meteor.style.left = Math.random() * 100 + '%';
        meteor.style.top = Math.random() * 50 + '%';
        
        // Use transform for performance
        const scale = Math.random() * 0.5 + 0.5;
        meteor.style.transform = `rotate(215deg) scale(${scale})`;
        
        const duration = Math.random() * 1.5 + 1 + 's';
        meteor.style.animationDuration = duration;
        
        meteorContainer.appendChild(meteor);
        // Clean up
        setTimeout(() => {
            if (meteor.parentNode === meteorContainer) {
                meteor.remove();
            }
        }, 3000);
    };
    
    // Density management
    for(let i=0; i<12; i++) setTimeout(createMeteor, i * 250);
    meteorInterval = setInterval(createMeteor, 700);
}

function stopMeteors() {
    if (meteorInterval) {
        clearInterval(meteorInterval);
        meteorInterval = null;
    }
    meteorContainer.innerHTML = '';
}

// Fastboot Panel Logic
function toggleFastbootPanel(show) {
    const isMinimized = fastbootPanel.classList.contains('minimized');
    const shouldShow = show !== undefined ? show : isMinimized;
    
    if (shouldShow) {
        fastbootPanel.classList.remove('minimized');
        socket.emit('get_partitions');
        fastbootToggle.classList.add('primary');
    } else {
        fastbootPanel.classList.add('minimized');
        fastbootToggle.classList.remove('primary');
    }
}

function updatePartitionList(partitions) {
    partitionSelect.innerHTML = '';
    if (partitions.length === 0) {
        partitionSelect.innerHTML = '<option value="">未找到分区</option>';
        return;
    }
    
    partitions.forEach(p => {
        const option = document.createElement('option');
        option.value = p;
        option.innerText = p;
        partitionSelect.appendChild(option);
    });
}

fastbootToggle.addEventListener('click', () => toggleFastbootPanel());
closeFastboot.addEventListener('click', () => toggleFastbootPanel(false));
refreshPartitionsBtn.addEventListener('click', () => {
    partitionSelect.innerHTML = '<option value="">正在刷新...</option>';
    socket.emit('get_partitions');
});

startFlashBtn.addEventListener('click', () => {
    const partition = partitionSelect.value;
    const filePath = flashFilePathInput.value.trim();
    
    if (!partition) {
        showToast('请选择目标分区', 'error');
        return;
    }
    if (!filePath) {
        showToast('请输入镜像文件路径', 'error');
        return;
    }
    
    if (confirm(`确定要刷写 ${partition} 分区吗？\n文件: ${filePath}`)) {
        const callbackId = 'flash_' + Date.now();
        startFlashBtn.classList.add('loading');
        activeCallbacks.set(callbackId, startFlashBtn);
        
        socket.emit('flash_partition', {
            partition: partition,
            file_path: filePath,
            callback_id: callbackId
        });
        addLogLine(`System: 开始刷写 ${partition} 分区...`, 'system');
    }
});

// Drag and Drop for file path
flashFilePathInput.addEventListener('dragover', (e) => {
    e.preventDefault();
    flashFilePathInput.style.borderColor = 'var(--primary-color)';
});

flashFilePathInput.addEventListener('dragleave', () => {
    flashFilePathInput.style.borderColor = '';
});

flashFilePathInput.addEventListener('drop', (e) => {
    e.preventDefault();
    flashFilePathInput.style.borderColor = '';
    if (e.dataTransfer.files.length > 0) {
        // Note: Browsers usually don't give the full path, but for local use 
        // some browsers or electron environments might. 
        // In standard browsers, this won't give the full path due to security.
        // However, we can at least put the filename or warn the user.
        const file = e.dataTransfer.files[0];
        // If it's a local tool, the user might expect it to work.
        // But since we are in a browser, we can't get the path.
        // We will show a toast informing them they might need to paste the full path.
        showToast('由于浏览器安全限制，请手动粘贴或输入完整文件路径。', 'info');
        flashFilePathInput.value = file.name; 
    }
});

aiChatToggle.addEventListener('click', () => toggleAiChat());

saveAiConfigBtn.addEventListener('click', () => {
    const config = {
        enabled: aiEnabledCheckbox.checked.toString(),
        api_key: aiApiKeyInput.value.trim(),
        base_url: aiBaseUrlInput.value.trim(),
        model: aiModelInput.value.trim()
    };
    socket.emit('update_config', { ai: config });
    showToast('AI 配置已尝试保存', 'info');
});

// Initialize
window.onload = () => {
    addLogLine('Welcome to GHikari Toolbox Standalone Edition.', 'system');
    initCardTilt();
    initLive2DDraggable();
    initGlobalShortcuts();
};

function initGlobalShortcuts() {
    document.addEventListener('keydown', (e) => {
        // Handle Escape globally to close things
        if (e.key === 'Escape') {
            if (suggestionList.style.display === 'block') {
                hideSuggestions();
                return;
            }
            if (!fastbootPanel.classList.contains('minimized')) {
                toggleFastbootPanel(false);
                return;
            }
            const aiPanel = document.getElementById('waifu-ai-panel');
            if (aiPanel && !aiPanel.classList.contains('closed')) {
                toggleAiChat(false);
                return;
            }
            if (!consoleSection.classList.contains('minimized')) {
                terminalToggle.click();
                return;
            }
            if (isEditMode) {
                editLayoutBtn.click();
                return;
            }
        }

        // Ignore shortcuts if user is typing in an input (except for specific ones if needed)
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.contentEditable === 'true') {
            return;
        }

        if (e.ctrlKey || e.metaKey) {
            switch (e.key.toLowerCase()) {
                case '/':
                    e.preventDefault();
                    terminalToggle.click();
                    break;
                case 'b':
                    e.preventDefault();
                    fastbootToggle.click();
                    break;
                case 'l':
                    e.preventDefault();
                    clearLogBtn.click();
                    break;
                case 'r':
                    e.preventDefault();
                    refreshToolsBtn.click();
                    refreshDevicesBtn.click();
                    break;
                case 'j':
                    e.preventDefault();
                    if (consoleSection.classList.contains('minimized')) {
                        terminalToggle.click();
                    }
                    terminalInput.focus();
                    break;
                case 'e':
                    e.preventDefault();
                    editLayoutBtn.click();
                    break;
                case 'i':
                    e.preventDefault();
                    aiChatToggle.click();
                    break;
            }
        }
    });
}

function initLive2DDraggable() {
    const startDraggable = () => {
        const checkExist = setInterval(() => {
            const waifu = document.getElementById('waifu');
            if (waifu) {
                clearInterval(checkExist);
                injectAiToWaifu(waifu);
                setupDraggable(waifu);
            }
        }, 500);
    };

    if (document.readyState === 'complete') {
        startDraggable();
    } else {
        window.addEventListener('live2d-loaded', startDraggable);
        // Fallback in case event is missed
        window.addEventListener('load', startDraggable);
    }

    function injectAiToWaifu(waifu) {
        if (document.getElementById('waifu-ai-panel')) return;
        
        const aiHtml = `
            <div id="waifu-ai-panel" class="closed">
                <div class="ai-sidebar-header" style="cursor: move;">
                    <div id="ai-clear-history" title="清空对话" style="cursor: pointer; opacity: 0.6; display: flex; align-items: center;">
                        <svg viewBox="0 0 24 24" width="12" height="12" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                    </div>
                    <h3 style="flex:1; text-align: center; pointer-events: none;">AI 助手</h3>
                    <div id="waifu-ai-panel-close" title="关闭" style="cursor: pointer; opacity: 0.6; display: flex; align-items: center;">
                        <svg viewBox="0 0 24 24" width="12" height="12" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                    </div>
                </div>
                <div class="ai-history-control">
                    <span id="ai-history-prev" class="ai-history-btn">←</span>
                    <span id="ai-history-info">0/0</span>
                    <span id="ai-history-next" class="ai-history-btn">→</span>
                </div>
                <div id="ai-chat-messages" class="ai-messages">
                    <div class="ai-message assistant">你好！我是 GHikari AI 助手。有什么我可以帮你的吗？</div>
                </div>
                <div class="ai-input-area">
                    <textarea id="ai-input" placeholder="输入问题..." rows="1"></textarea>
                    <button id="send-ai-msg" class="btn primary btn-small">发送</button>
                </div>
            </div>
        `;
        waifu.insertAdjacentHTML('beforeend', aiHtml);
        
        // Load history after injection
        loadConversationHistory();

        // Dynamic references for newly injected elements
        const aiMessages = document.getElementById('ai-chat-messages');
        const aiHistoryInfo = document.getElementById('ai-history-info');

        window.loadHistoryToAI = function(index) {
            if (index >= 0 && index < conversationHistory.length) {
                const item = conversationHistory[index];
                if (aiMessages) {
                    aiMessages.innerHTML = '';
                    addAiMessage('user', item.user, false);
                    addAiMessage('assistant', item.assistant, false);
                }
                window.updateHistoryUI();
            }
        };

        window.updateHistoryUI = function() {
            if (!aiHistoryInfo) return;
            if (conversationHistory.length > 0) {
                aiHistoryInfo.innerText = `${historyViewIndex + 1}/${conversationHistory.length}`;
            } else {
                aiHistoryInfo.innerText = `0/0`;
            }
        };

        // Re-bind events for new elements
        const sendBtn = document.getElementById('send-ai-msg');
        const input = document.getElementById('ai-input');
        const prev = document.getElementById('ai-history-prev');
        const next = document.getElementById('ai-history-next');
        const closeBtn = document.getElementById('waifu-ai-panel-close');
        const clearBtn = document.getElementById('ai-clear-history');
        
        if (sendBtn) sendBtn.onclick = sendAiMessage;
        if (closeBtn) closeBtn.onclick = () => toggleAiChat(false);
        if (clearBtn) clearBtn.onclick = clearConversationHistory;
        if (input) {
            input.onfocus = () => { isDraggingInternal = false; };
            input.onkeydown = (e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    sendAiMessage();
                }
            };
            input.oninput = () => {
                input.style.height = 'auto';
                input.style.height = (input.scrollHeight) + 'px';
            };
        }
        if (prev) prev.onclick = () => {
            if (historyViewIndex > 0) {
                historyViewIndex--;
                window.loadHistoryToAI(historyViewIndex);
            }
        };
        if (next) next.onclick = () => {
            if (historyViewIndex < conversationHistory.length - 1) {
                historyViewIndex++;
                window.loadHistoryToAI(historyViewIndex);
            }
        };
    }

    function setupDraggable(el) {
        let dragging = false;
        let startX, startY;
        let initialX, initialY;

        const onMouseDown = (e) => {
            if (e.button !== 0) return; // Only left click

            // 检查点击的是否是排除区域（交互式控件）
            const isInteractive = e.target.closest('button') || 
                                 e.target.closest('input') || 
                                 e.target.closest('textarea') || 
                                 e.target.closest('.ai-history-btn') || 
                                 e.target.closest('#ai-clear-history') ||
                                 e.target.closest('#waifu-ai-panel-close');
            
            if (isInteractive) return;

            // 只要点击的是 #waifu 及其子项（且非交互控件），就允许拖拽
            dragging = true;
            isDraggingInternal = true;
            startX = e.clientX;
            startY = e.clientY;

            const rect = el.getBoundingClientRect();
            initialX = rect.left;
            initialY = rect.top;

            el.style.setProperty('transition', 'none', 'important');
            el.style.setProperty('cursor', 'grabbing', 'important');
            
            // 切换到绝对物理定位
            el.style.setProperty('bottom', 'auto', 'important');
            el.style.setProperty('right', 'auto', 'important');
            el.style.setProperty('left', initialX + 'px', 'important');
            el.style.setProperty('top', initialY + 'px', 'important');
            el.style.setProperty('transform', 'none', 'important');

            document.addEventListener('mousemove', onMouseMove, { passive: false });
            document.addEventListener('mouseup', onMouseUp);
            
            // 只有在点击 AI 面板区域时才阻止默认行为（防止选中文本）
            // 点击角色本体 (canvas) 时不阻止，以便保留 Live2D 原生的点击互动反馈
            if (e.target.closest('#waifu-ai-panel')) {
                e.preventDefault();
            }
        };

        const onMouseMove = (e) => {
            if (!dragging) return;
            
            const dx = e.clientX - startX;
            const dy = e.clientY - startY;
            
            requestAnimationFrame(() => {
                if (!dragging) return;
                el.style.setProperty('left', (initialX + dx) + 'px', 'important');
                el.style.setProperty('top', (initialY + dy) + 'px', 'important');
            });
        };

        const onMouseUp = () => {
            if (!dragging) return;
            dragging = false;
            isDraggingInternal = false;
            
            el.style.setProperty('cursor', '', 'important');
            document.removeEventListener('mousemove', onMouseMove);
            document.removeEventListener('mouseup', onMouseUp);
            
            // 保存位置
            localStorage.setItem('ghikari_live2d_pos', JSON.stringify({
                left: el.style.left,
                top: el.style.top
            }));
        };

        // 使用捕获模式以确保先于库的事件处理
        el.addEventListener('mousedown', onMouseDown, true);

        // 初始恢复位置
        const savedPos = localStorage.getItem('ghikari_live2d_pos');
        if (savedPos) {
            try {
                const pos = JSON.parse(savedPos);
                el.style.setProperty('bottom', 'auto', 'important');
                el.style.setProperty('right', 'auto', 'important');
                el.style.setProperty('left', pos.left, 'important');
                el.style.setProperty('top', pos.top, 'important');
                el.style.setProperty('transform', 'none', 'important');
            } catch (e) {
                console.error("Failed to restore Live2D position", e);
            }
        }
    }
}
