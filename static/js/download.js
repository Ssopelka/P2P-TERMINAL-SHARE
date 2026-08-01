let currentShareData = null; // Глобальная переменная для хранения данных о файлах

document.addEventListener("DOMContentLoaded", loadFileList);

function formatSize(bytes) {
    if (!bytes || bytes === 0) return '0 B';
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

function showError(msg, title = "СИСТЕМНАЯ ОШИБКА") {
    document.getElementById('modalTitle').innerText = "> " + title;
    document.getElementById('modalText').innerText = msg;
    document.getElementById('errorModal').style.display = 'flex';
}

async function loadFileList() {
    const shareId = window.location.pathname.split('/').pop();
    const listDiv = document.getElementById('fileList');
    const statusIndicator = document.querySelector('.status-indicator');
    const statusText = document.getElementById('statusText');

    try {
        const res = await fetch(`/api/share/${shareId}`);
        if (!res.ok) {
            statusIndicator.className = 'status-indicator error';
            statusText.innerText = '[ ОШИБКА: ДАННЫЕ УДАЛЕНЫ ИЛИ ЛИМИТ ИСЧЕРПАН ]';
            listDiv.innerHTML = '<div class="error-message">[ КРИТИЧЕСКАЯ ОШИБКА: ПАКЕТ НЕ НАЙДЕН ]</div>';
            return;
        }

        const data = await res.json();
        currentShareData = data; // Сохраняем для функции скачивания всех файлов
        
        statusIndicator.className = 'status-indicator connected';
        statusText.innerText = '[ СОЕДИНЕНИЕ УСТАНОВЛЕНО ]';

        if (data.comment) {
            const commentSection = document.getElementById('commentSection');
            const commentText = document.getElementById('commentText');
            commentText.innerText = data.comment;
            commentSection.style.display = 'block';
        }

        if (data.files.length === 0) {
            listDiv.innerHTML = '<div class="error-message">[ ПАКЕТ ПУСТ ]</div>';
            return;
        }

        // Показываем кнопку "Скачать всё", если файлов больше одного
        if (data.files.length > 1) {
            document.getElementById('downloadAllContainer').style.display = 'block';
        }

        let html = '';
        data.files.forEach((f, idx) => {
            let limitText = f.downloads_left === 0 ? "∞" : f.downloads_left;
            
            let previewHtml = '';
            if (f.preview_type === 'image') {
                previewHtml = `<div class="file-preview"><img src="${f.preview_data}" alt="preview"></div>`;
            } else if (f.preview_type === 'text') {
                previewHtml = `<div class="file-preview"><pre>${f.preview_data.replace(/</g, '&lt;')}...</pre></div>`;
            }

            html += `
                <div class="file-item">
                    <div class="file-header">
                        <div class="file-info">
                            <span class="file-name">> ${f.filename}</span>
                            <div class="file-meta">
                                <span class="file-size">[ РАЗМЕР: ${f.file_size || 'НЕИЗВЕСТНО'} ]</span>
                                <span class="file-downloads">[ ОСТАЛОСЬ: ${limitText} ]</span>
                            </div>
                        </div>
                        <div class="file-actions">
                            <button id="btn-${idx}" onclick="downloadFile('${f.id}', 'btn-${idx}', 'prog-${idx}')">[ СКАЧАТЬ ]</button>
                        </div>
                    </div>
                    ${previewHtml}
                    <div id="prog-${idx}" class="download-progress">
                        <div class="progress-bar-wrapper">
                            <div id="bar-${idx}" class="progress-bar"></div>
                        </div>
                        <div class="progress-stats">
                            <span id="pct-${idx}">0%</span>
                            <span id="spd-${idx}">0 B/s</span>
                        </div>
                    </div>
                </div>
            `;
        });
        
        listDiv.innerHTML = html;

    } catch (e) {
        statusIndicator.className = 'status-indicator error';
        statusText.innerText = '[ СБОЙ СЕТИ ]';
        listDiv.innerHTML = '<div class="error-message">[ КРИТИЧЕСКАЯ ОШИБКА: НЕ УДАЛОСЬ ПОДКЛЮЧИТЬСЯ ]</div>';
    }
}

// === НОВАЯ ФУНКЦИЯ: СКАЧАТЬ ВСЁ КАК ZIP ===
async function downloadAllAsZip() {
    if (!currentShareData || !currentShareData.files.length) return;

    const btn = document.getElementById('downloadAllBtn');
    const progressDiv = document.getElementById('zipProgress');
    const zipBar = document.getElementById('zipBar');
    const statusText = document.getElementById('zipStatusText');
    const shareId = window.location.pathname.split('/').pop();
    const keyHex = window.location.hash.substring(1);

    if (!keyHex) {
        showError('ОТСУТСТВУЕТ КЛЮЧ ДЕКРИПТОВАНИЯ В URL', 'ОШИБКА');
        return;
    }

    btn.disabled = true;
    btn.innerText = '[ ОБРАБОТКА... ]';
    progressDiv.style.display = 'block';
    zipBar.style.width = '0%';

    const zip = new JSZip();
    const totalFiles = currentShareData.files.length;

    try {
        for (let i = 0; i < totalFiles; i++) {
            const file = currentShareData.files[i];
            statusText.innerText = `[ ЗАГРУЗКА: ${file.filename} (${i + 1}/${totalFiles}) ]`;
            zipBar.style.width = `${((i) / totalFiles) * 50}%`; // Первые 50% прогресса - загрузка

            const res = await fetch(`/api/decrypt/${shareId}/${file.id}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ key: keyHex })
            });

            if (!res.ok) throw new Error(`Отказ в доступе к файлу: ${file.filename}`);

            const arrayBuffer = await res.arrayBuffer();
            zip.file(file.filename, arrayBuffer);
        }

        statusText.innerText = '[ СЖАТИЕ В ZIP АРХИВ... ]';
        
        // Генерация ZIP с отслеживанием прогресса (оставшиеся 50%)
        const content = await zip.generateAsync({ type: "blob" }, (metadata) => {
            const totalProgress = 50 + (metadata.percent / 2);
            zipBar.style.width = `${totalProgress}%`;
            statusText.innerText = `[ СЖАТИЕ: ${metadata.percent.toFixed(0)}% ]`;
        });

        // Триггер скачивания
        const url = window.URL.createObjectURL(content);
        const a = document.createElement('a');
        a.href = url;
        a.download = `p2p_share_${shareId.substring(0, 8)}.zip`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        window.URL.revokeObjectURL(url);

        statusText.innerText = '[ АРХИВ УСПЕШНО СОЗДАН И СКАЧАН ]';
        zipBar.style.width = '100%';
        
        setTimeout(() => {
            btn.disabled = false;
            btn.innerText = '[ СКАЧАТЬ ВСЁ АРХИВОМ (ZIP) ]';
            progressDiv.style.display = 'none';
            zipBar.style.width = '0%';
        }, 3000);

    } catch (e) {
        showError('КРИТИЧЕСКАЯ ОШИБКА ПРИ СОЗДАНИИ АРХИВА: ' + e.message, 'ОШИБКА ZIP');
        btn.disabled = false;
        btn.innerText = '[ СКАЧАТЬ ВСЁ АРХИВОМ (ZIP) ]';
        progressDiv.style.display = 'none';
    }
}

// === СТАНДАРТНОЕ СКАЧИВАНИЕ ОДНОГО ФАЙЛА ===
async function downloadFile(fileId, btnId, progId) {
    const btn = document.getElementById(btnId);
    btn.innerText = '[ РАСШИФРОВКА... ]';
    btn.disabled = true;

    const progContainer = document.getElementById(progId);
    const bar = document.getElementById(progId.replace('prog-', 'bar-'));
    const pctText = document.getElementById(progId.replace('prog-', 'pct-'));
    const spdText = document.getElementById(progId.replace('prog-', 'spd-'));
    progContainer.style.display = 'block';

    try {
        const keyHex = window.location.hash.substring(1);
        if (!keyHex) throw new Error('ОТСУТСТВУЕТ КЛЮЧ ДЕКРИПТОВАНИЯ');

        const shareId = window.location.pathname.split('/').pop();
        const res = await fetch(`/api/decrypt/${shareId}/${fileId}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ key: keyHex })
        });
        
        if (!res.ok) throw new Error('ОТКАЗ В ДОСТУПЕ');

        const disp = res.headers.get('Content-Disposition');
        let filename = "downloaded_file";
        if (disp && disp.includes("filename*=utf-8''")) {
            filename = decodeURIComponent(disp.split("filename*=utf-8''")[1]);
        }

        const contentLength = res.headers.get('Content-Length');
        const total = contentLength ? parseInt(contentLength, 10) : 0;

        const reader = res.body.getReader();
        let loaded = 0;
        const chunks = [];
        const startTime = Date.now();

        while (true) {
            const {done, value} = await reader.read();
            if (done) break;
            chunks.push(value);
            loaded += value.length;

            if (total > 0) {
                const pct = (loaded / total) * 100;
                bar.style.width = pct + '%';
                pctText.innerText = pct.toFixed(1) + '%';
                spdText.innerText = formatSpeed(loaded / ((Date.now() - startTime) / 1000 || 0.1));
            }
        }

        const blob = new Blob(chunks);
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
        window.URL.revokeObjectURL(url);

        btn.innerText = '[ УСПЕШНО ]';
        btn.style.borderColor = '#0f0';
        btn.style.color = '#0f0';
        
        setTimeout(loadFileList, 1500);
    } catch (e) {
        showError('КРИТИЧЕСКАЯ ОШИБКА: ' + e.message, 'ОШИБКА СКАЧИВАНИЯ');
        btn.innerText = '[ СБОЙ ]';
        btn.disabled = false;
        progContainer.style.display = 'none';
    }
}