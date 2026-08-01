let fileQueue = [];
let shareId = null;
let shareKey = null;
let uploadingCount = 0;
let isProcessingFolder = false; // Флаг защиты от двойной обработки

// Устанавливается из index.html в момент старта P2P-передачи (p2pStarted).
// Пока она активна — запрещено добавлять/удалять/менять файлы в очереди.
function isTransferLocked() {
    if (typeof p2pStarted !== 'undefined' && p2pStarted === true) {
        showAlert('ПЕРЕДАЧА P2P УЖЕ НАЧАТА. ИЗМЕНЕНИЕ СПИСКА ФАЙЛОВ ЗАБЛОКИРОВАНО ДО ЕЁ ЗАВЕРШЕНИЯ ИЛИ СБРОСА.', 'ДЕЙСТВИЕ ЗАБЛОКИРОВАНО');
        return true;
    }
    return false;
}

const dropZone = document.getElementById('dropZone');
const slider = document.getElementById('limitSlider');
const display = document.getElementById('limitDisplay');
const ttlSlider = document.getElementById('ttlSlider');
const ttlDisplay = document.getElementById('ttlDisplay');

slider.addEventListener('input', function() {
    display.innerText = this.value === "0" ? "∞ (БЕЗЛИМИТ)" : this.value;
});

// Форматирование TTL: часы -> дни/часы
function formatTTL(hours) {
    const h = parseInt(hours);
    if (h >= 24 && h % 24 === 0) {
        const days = h / 24;
        return days === 1 ? '1 ДЕНЬ' : `${days} ДНЯ(ЕЙ)`;
    }
    if (h >= 24) {
        const days = Math.floor(h / 24);
        const remainHours = h % 24;
        return `${days} Д. ${remainHours} Ч.`;
    }
    return `${h} ЧАС(ОВ)`;
}

ttlSlider.addEventListener('input', function() {
    ttlDisplay.innerText = formatTTL(this.value);
});

function showAlert(msg, title = "СИСТЕМНАЯ ОШИБКА") {
    document.getElementById('modalTitle').innerText = "> " + title;
    document.getElementById('modalText').innerText = msg;
    document.getElementById('customModal').style.display = 'flex';
}

function closeModal() {
    document.getElementById('customModal').style.display = 'none';
}

// --- Drag & Drop ---
let dragCounter = 0;
window.addEventListener('dragover', (e) => e.preventDefault(), false);
window.addEventListener('drop', (e) => e.preventDefault(), false);

dropZone.addEventListener('dragenter', (e) => {
    e.preventDefault();
    dragCounter++;
    dropZone.classList.add('dragover');
});
dropZone.addEventListener('dragover', (e) => e.preventDefault());
dropZone.addEventListener('dragleave', (e) => {
    e.preventDefault();
    dragCounter--;
    if (dragCounter === 0) dropZone.classList.remove('dragover');
});
dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dragCounter = 0;
    dropZone.classList.remove('dragover');
    if (e.dataTransfer && e.dataTransfer.files.length > 0) handleFiles(e.dataTransfer.files);
});
dropZone.addEventListener('click', () => document.getElementById('fileInput').click());

function formatSize(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024, sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function formatSpeed(bytesPerSec) {
    if (!isFinite(bytesPerSec) || bytesPerSec === 0) return '0 B/s';
    const k = 1024, sizes = ['B/s', 'KB/s', 'MB/s', 'GB/s'];
    const i = Math.floor(Math.log(bytesPerSec) / Math.log(k));
    return parseFloat((bytesPerSec / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function handleFileSelect(e) {
    handleFiles(e.target.files);
    e.target.value = "";
}

async function handleFolderSelect(e) {
    // Защита от двойного вызова
    if (isProcessingFolder) return;
    if (isTransferLocked()) { e.target.value = ""; return; }
    isProcessingFolder = true;
    
    try {
        const files = e.target.files;
        if (!files.length) {
            isProcessingFolder = false;
            return;
        }

        const folderName = files[0].webkitRelativePath.split('/')[0] || "folder";
        const zip = new JSZip();
        
        // Добавляем все файлы в ZIP
        for (let file of files) {
            const path = file.webkitRelativePath.replace(`${folderName}/`, '');
            zip.file(path, file);
        }

        const id = Math.random().toString(36).substr(2, 9);
        const list = document.getElementById('fileList');
        const sysMsg = list.querySelector('.sys-msg');
        if (sysMsg) sysMsg.remove();

        // Создаем UI элемент
        const div = document.createElement('div');
        div.className = 'file-item';
        div.id = `item-${id}`;
        div.innerHTML = `
            <div class="file-info-container">
                <div style="display: flex; justify-content: space-between; margin-bottom: 5px;">
                    <span class="filename" style="font-weight:bold; color:#fff;">> ${folderName}.zip [ZIP ARCHIVE]</span>
                    <span id="status-${id}" style="color:#0ff; font-weight:bold;">УПАКОВКА В ZIP...</span>
                </div>
                <div style="height: 10px; margin-bottom: 5px; border: 1px solid #050; background:rgba(0,0,0,0.8); width: 100%;">
                    <div id="bar-${id}" style="height:100%; width:0%; background:#0ff; transition: width 0.1s linear;"></div>
                </div>
                <div style="display:flex; justify-content:space-between; font-size: 12px; color: #aaa;">
                    <span id="pct-${id}">0%</span>
                    <span id="spd-${id}">СЖАТИЕ...</span>
                </div>
            </div>
            <div class="file-actions" id="actions-${id}">
                <button class="btn-action btn-action-small" style="border-color: #f00; color: #f00;" onclick="removeFile('${id}')" id="btn-del-${id}">[ УДАЛИТЬ ]</button>
            </div>
        `;
        list.appendChild(div);

        // Генерируем ZIP
        const zipBlob = await zip.generateAsync({type: "blob"}, (metadata) => {
            const pct = metadata.percent.toFixed(1);
            const barEl = document.getElementById(`bar-${id}`);
            const pctEl = document.getElementById(`pct-${id}`);
            if (barEl) barEl.style.width = pct + '%';
            if (pctEl) pctEl.innerText = pct + '%';
        });
        
        const zipFile = new File([zipBlob], `${folderName}.zip`, {type: "application/zip"});
        
        // Добавляем в очередь ТОЛЬКО один раз
        fileQueue.push({ 
            id: id, 
            file: zipFile, 
            status: 'pending', 
            uploadedBytes: 0, 
            speed: 0, 
            file_id: null 
        });

        // Обновляем UI
        const statusEl = document.getElementById(`status-${id}`);
        const barEl = document.getElementById(`bar-${id}`);
        const spdEl = document.getElementById(`spd-${id}`);
        const actionsBlock = document.getElementById(`actions-${id}`);
        
        if (statusEl) {
            statusEl.innerText = 'ОЖИДАНИЕ';
            statusEl.style.color = '#888';
        }
        if (barEl) barEl.style.background = '#0f0';
        if (spdEl) spdEl.innerText = '0 B/s';
        
        if (actionsBlock) {
            actionsBlock.insertAdjacentHTML('afterbegin', 
                `<button class="btn-action btn-action-small" onclick="togglePause('${id}')" id="btn-pause-${id}">[ ПАУЗА ]</button>`
            );
        }

        // Очищаем input
        e.target.value = "";
        
    } catch (err) {
        console.error("Ошибка создания ZIP:", err);
        showAlert("Сбой запаковки папки в архив ZIP: " + err.message, "ОШИБКА АРХИВАЦИИ");
        // Удаляем элемент при ошибке
        const id = e.target.getAttribute('data-temp-id');
        if (id) removeFile(id);
    } finally {
        isProcessingFolder = false;
    }
}

function handleFiles(files) {
    if (!files.length) return;
    if (isTransferLocked()) return;
    const list = document.getElementById('fileList');
    const sysMsg = list.querySelector('.sys-msg');
    if (sysMsg) sysMsg.remove();
    for (let f of files) {
        const id = Math.random().toString(36).substr(2, 9);
        addFileToQueue(id, f);
    }
}

async function addFileToQueue(id, file) {
    fileQueue.push({ id: id, file: file, status: 'pending', uploadedBytes: 0, speed: 0, file_id: null });

    // Генерация превью только для изображений и текста
    let previewType = '';
    let previewData = '';

    if (file.type.startsWith('image/')) {
        previewType = 'image';
        previewData = await new Promise((resolve) => {
            const reader = new FileReader();
            reader.onload = (e) => resolve(e.target.result);
            reader.readAsDataURL(file);
        });
        updatePreviewUI(id, previewType, previewData);
    } else if (file.type.startsWith('text/') || file.name.match(/\.(txt|md|json|js|py|html|css|xml|csv|log|ini|cfg|yml|yaml|toml|sh|bat|cmd)$/i)) {
        previewType = 'text';
        previewData = await new Promise((resolve) => {
            const reader = new FileReader();
            reader.onload = (e) => resolve(e.target.result.substring(0, 300));
            reader.readAsText(file);
        });
        updatePreviewUI(id, previewType, previewData);
    }

    file._previewType = previewType;
    file._previewData = previewData;

    const ext = file.name.includes('.') ? file.name.split('.').pop().toUpperCase() : 'FILE';
    const div = document.createElement('div');
    div.className = 'file-item';
    div.id = `item-${id}`;
    div.innerHTML = `
        <div class="file-info-container">
            <div style="display: flex; justify-content: space-between; margin-bottom: 5px;">
                <span class="filename" style="font-weight:bold; color:#fff;">> ${file.name} [${ext}] | ${formatSize(file.size)}</span>
                <span id="status-${id}" style="color:#888; font-weight:bold;">ОЖИДАНИЕ</span>
            </div>
            <div style="height: 10px; margin-bottom: 5px; border: 1px solid #050; background:rgba(0,0,0,0.8); width: 100%;">
                <div id="bar-${id}" style="height:100%; width:0%; background:#0f0; transition: width 0.1s linear;"></div>
            </div>
            <div style="display:flex; justify-content:space-between; font-size: 12px; color: #aaa;">
                <span id="pct-${id}">0%</span>
                <span id="spd-${id}">0 B/s</span>
            </div>
        </div>
        <div class="file-actions" id="actions-${id}">
            <button class="btn-action btn-action-small" onclick="togglePause('${id}')" id="btn-pause-${id}">[ ПАУЗА ]</button>
            <button class="btn-action btn-action-small" style="border-color: #f00; color: #f00;" onclick="removeFile('${id}')" id="btn-del-${id}">[ УДАЛИТЬ ]</button>
        </div>
    `;
    document.getElementById('fileList').appendChild(div);
}

function updatePreviewUI(id, type, data) {
    const container = document.getElementById('previewContainer');
    if (!container) return;
    const div = document.createElement('div');
    div.className = 'preview-item';
    div.id = `preview-${id}`;
    if (type === 'image') {
        div.innerHTML = `<img src="${data}" alt="preview"><div class="filename">IMAGE PREVIEW</div>`;
    } else if (type === 'text') {
        div.innerHTML = `<pre style="font-size:9px;color:#0f0;text-align:left;max-height:100px;overflow:hidden;margin:0;">${data.replace(/</g, '&lt;')}...</pre><div class="filetype">TEXT SNIPPET</div>`;
    }
    container.appendChild(div);
    // Показываем контейнер если есть хотя бы одно превью
    updatePreviewContainerVisibility();
}

// Управление видимостью контейнера превью
function updatePreviewContainerVisibility() {
    const container = document.getElementById('previewContainer');
    if (!container) return;
    if (container.children.length > 0) {
        container.style.display = 'grid';
    } else {
        container.style.display = 'none';
    }
}

function updateFileUI(id) {
    const q = fileQueue.find(f => f.id === id);
    if (!q) return;

    const st = document.getElementById(`status-${id}`);
    const bar = document.getElementById(`bar-${id}`);
    const pb = document.getElementById(`btn-pause-${id}`);
    const db = document.getElementById(`btn-del-${id}`);
    const actionsBlock = document.getElementById(`actions-${id}`);

    let pct = q.file.size > 0 ? (q.uploadedBytes / q.file.size) * 100 : 0;
    if (pct > 100) pct = 100;

    bar.style.width = pct + '%';
    document.getElementById(`pct-${id}`).innerText = pct.toFixed(1) + '%';
    document.getElementById(`spd-${id}`).innerText = formatSpeed(q.speed);

    if (q.status === 'pending') {
        st.innerText = 'ОЖИДАНИЕ'; st.style.color = '#888';
        if (pb) { pb.innerText = '[ ПАУЗА ]'; pb.disabled = true; }
    } else if (q.status === 'uploading') {
        st.innerText = 'ПЕРЕДАЧА...'; st.style.color = '#0f0';
        if (pb) { pb.innerText = '[ ПАУЗА ]'; pb.disabled = false; }
        if (db) db.disabled = true;
        bar.style.background = '#0f0';
    } else if (q.status === 'paused') {
        st.innerText = 'ПАУЗА'; st.style.color = '#ff0';
        if (pb) { pb.innerText = '[ ВОЗОБНОВИТЬ ]'; pb.disabled = false; }
        if (db) db.disabled = false;
        document.getElementById(`spd-${id}`).innerText = '0 B/s';
        bar.style.background = '#ff0';
    } else if (q.status === 'encrypting') {
        st.innerText = 'ШИФРОВАНИЕ...'; st.style.color = '#0ff';
        if (pb) pb.disabled = true;
        bar.style.background = '#0ff';
    } else if (q.status === 'ready') {
        st.innerText = 'УСПЕШНО'; st.style.color = '#0f0';
        if (actionsBlock) actionsBlock.style.display = 'none';
    } else if (q.status === 'error') {
        st.innerText = 'ОШИБКА'; st.style.color = '#f00';
        if (actionsBlock) actionsBlock.style.display = 'none';
        bar.style.background = '#f00';
    }
}

function togglePause(id) {
    if (isTransferLocked()) return;
    const q = fileQueue.find(f => f.id === id);
    if (!q) return;
    if (q.status === 'uploading' || q.status === 'pending') q.status = 'paused';
    else if (q.status === 'paused') { q.status = 'resumed'; processQueue(); }
    updateFileUI(id);
}

function removeFile(id) {
    if (isTransferLocked()) return;
    const idx = fileQueue.findIndex(f => f.id === id);
    if (idx !== -1) {
        fileQueue[idx].status = 'removed';
        fileQueue.splice(idx, 1);
    }
    const itemNode = document.getElementById(`item-${id}`);
    if (itemNode) itemNode.remove();
    const previewNode = document.getElementById(`preview-${id}`);
    if (previewNode) previewNode.remove();

    // Обновляем видимость контейнера превью после удаления
    updatePreviewContainerVisibility();

    if (fileQueue.length === 0 && !document.querySelectorAll('.file-item').length) {
        document.getElementById('fileList').innerHTML = '<span class="sys-msg">ОЖИДАНИЕ ВВОДА ДАННЫХ...</span>';
    }
    checkAllDone();
}

async function executeUpload() {
    if (!fileQueue.length) return showAlert('НЕТ ФАЙЛОВ В ОЧЕРЕДИ ДЛЯ ЗАГРУЗКИ', 'ОШИБКА ВВОДА');

    const btn = document.getElementById('mainUploadBtn');
    btn.innerText = '[ ИНИЦИАЛИЗАЦИЯ КАНАЛА... ]';
    btn.disabled = true;

    try {
        if (!shareId) {
            const comment = document.getElementById('uploadComment') ? document.getElementById('uploadComment').value : '';
            const ttlHours = parseInt(ttlSlider.value);
            const res = await fetch('/api/share/init', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({
                    limit: parseInt(slider.value),
                    comment: comment,
                    ttl_hours: ttlHours
                })
            });
            if (!res.ok) throw new Error('Отказ сервера');
            const data = await res.json();
            shareId = data.share_id;
            shareKey = data.key;
        }
        btn.innerText = '[ АКТИВНОЕ СОЕДИНЕНИЕ ]';
        processQueue();
    } catch (e) {
        showAlert('СИСТЕМНЫЙ СБОЙ: ' + e.message, 'ОШИБКА СВЯЗИ');
        btn.innerText = '>> ИНИЦИАЛИЗИРОВАТЬ ЗАГРУЗКУ <<';
        btn.disabled = false;
    }
}

async function processQueue() {
    if (uploadingCount >= 1) return;

    const nextFile = fileQueue.find(f => f.status === 'pending' || f.status === 'resumed');
    if (!nextFile) { checkAllDone(); return; }

    uploadingCount++;
    nextFile.status = 'uploading';
    updateFileUI(nextFile.id);

    try {
        if (!nextFile.file_id) {
            const fRes = await fetch(`/api/share/${shareId}/init_file`, {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({
                    filename: nextFile.file.name,
                    preview_type: nextFile.file._previewType || '',
                    preview_data: nextFile.file._previewData || ''
                })
            });
            if (!fRes.ok) throw new Error('Сбой инициализации файла');
            nextFile.file_id = (await fRes.json()).file_id;
        }

        await uploadFileChunks(nextFile);

        if (nextFile.status === 'uploading' && nextFile.uploadedBytes >= nextFile.file.size) {
            nextFile.status = 'encrypting';
            updateFileUI(nextFile.id);
            const finRes = await fetch(`/api/share/${shareId}/${nextFile.file_id}/finish`, {method: 'POST'});
            if (!finRes.ok) throw new Error('Ошибка шифрования на сервере');
            nextFile.status = 'ready';
        }
    } catch (e) {
        if (nextFile.status !== 'removed') nextFile.status = 'error';
    }

    uploadingCount--;
    if (nextFile.status !== 'removed') updateFileUI(nextFile.id);
    processQueue();
}

async function uploadFileChunks(q) {
    const chunkSize = 1024 * 1024 * 2;
    while (q.uploadedBytes < q.file.size) {
        if (q.status !== 'uploading') return;

        const chunk = q.file.slice(q.uploadedBytes, q.uploadedBytes + chunkSize);
        const formData = new FormData();
        formData.append('chunk', chunk);

        const startTime = Date.now();
        const res = await fetch(`/api/share/${shareId}/${q.file_id}/chunk`, { method: 'POST', body: formData });
        if (!res.ok) throw new Error('Сбой передачи');

        q.uploadedBytes += chunk.size;
        q.speed = chunk.size / ((Date.now() - startTime) / 1000 || 0.1);
        updateFileUI(q.id);
    }
}

async function checkAllDone() {
    const activeFiles = fileQueue.filter(f => f.status !== 'removed');
    const allDone = activeFiles.every(f => f.status === 'ready' || f.status === 'error');

    if (allDone && activeFiles.some(f => f.status === 'ready')) {
        const resultDiv = document.getElementById('result');
        const fullUrl = window.location.origin + "/share/" + shareId + '#' + shareKey;

        const qrRes = await fetch(`/api/qr?text=${encodeURIComponent(fullUrl)}`);
        const qrData = await qrRes.json();

        resultDiv.innerHTML = `
            > ОПЕРАЦИЯ УСПЕШНА<br>> БЕЗОПАСНЫЙ КАНАЛ СОЗДАН:<br>
            <span class="share-url" id="linkBtn" onclick="copyToClipboard('${fullUrl}')">${fullUrl}</span>
            <span class="sys-msg">(НАЖМИТЕ НА ССЫЛКУ ДЛЯ КОПИРОВАНИЯ)</span>
            <div class="qr-container">
                <img src="${qrData.qr_code}" alt="QR Code">
            </div>
        `;
        resultDiv.style.display = 'block';
        document.getElementById('mainUploadBtn').innerText = '>> ДОБАВИТЬ ЕЩЕ И ЗАГРУЗИТЬ <<';
        document.getElementById('mainUploadBtn').disabled = false;
    }
}

function copyToClipboard(text, btnId = 'linkBtn') {
    const btn = document.getElementById(btnId);
    const oldText = btn ? btn.innerText : '';
    const performSuccess = () => {
        if (btn) {
            btn.innerText = "[ ССЫЛКА СКОПИРОВАНА В БУФЕР ОБМЕНА! ]";
            btn.style.color = "#0f0";
            setTimeout(() => { btn.innerText = oldText; btn.style.color = "#fff"; }, 2000);
        }
    };
    if (navigator.clipboard && window.isSecureContext) {
        navigator.clipboard.writeText(text).then(performSuccess).catch(() => fallbackCopy(text, performSuccess));
    } else {
        fallbackCopy(text, performSuccess);
    }
}

function fallbackCopy(text, callback) {
    const textArea = document.createElement("textarea");
    textArea.value = text;
    textArea.style.position = "fixed";
    textArea.style.left = "-999999px";
    textArea.style.top = "-999999px";
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    try {
        document.execCommand('copy');
        callback();
    } catch (err) {
        showAlert("Не удалось скопировать ссылку автоматически. Скопируйте вручную.", "ОШИБКА БУФЕРА");
    }
    document.body.removeChild(textArea);
}