// P2PReceiver — подключается к сигнальному WebSocket, отвечает на offer
// отправителя и принимает файлы напрямую по RTCDataChannel.
//
// Если браузер поддерживает File System Access API (showSaveFilePicker),
// файл пишется на диск потоково (без ограничений по размеру и без
// расхода оперативной памяти). Иначе — собирается в памяти и отдаётся
// как Blob через обычную ссылку-скачивание (годится для файлов, которые
// помещаются в память браузера).

class P2PReceiver {
    constructor(roomId, callbacks = {}) {
        this.roomId = roomId;
        this.ws = null;
        this.pc = null;
        this.controlChannel = null;
        this.dataChannel = null;

        this.currentMeta = null;   // {id, name, size, mime}
        this.receivedBytes = 0;
        this.writer = null;        // FileSystemWritableFileStream, если доступен
        this.memChunks = null;     // fallback: массив Uint8Array

        // onPeerState, onFileOffer(meta), onFileStart(meta), onProgress(id, receivedBytes, speed, total),
        // onFileDone(meta), onError(msg)
        this.cb = callbacks;

        this._lastTime = 0;
        this._lastBytes = 0;
    }

    connect() {
        return new Promise((resolve, reject) => {
            this.ws = new WebSocket(p2pSignalUrl(this.roomId, "receiver"));
            this.ws.onopen = () => resolve();
            this.ws.onerror = () => reject(new Error("Не удалось подключиться к сигнальному серверу"));
            this.ws.onmessage = (ev) => this._onSignal(JSON.parse(ev.data));
            this.ws.onclose = () => this.cb.onPeerState && this.cb.onPeerState("signal-closed");
        });
    }

    async _onSignal(msg) {
        try {
            if (msg.type === "offer") {
                await this._handleOffer(msg.sdp);
            } else if (msg.type === "ice") {
                if (msg.candidate && this.pc) {
                    await this.pc.addIceCandidate(msg.candidate).catch(() => {});
                }
            } else if (msg.type === "peer-left") {
                this.cb.onPeerState && this.cb.onPeerState("peer-left");
            }
        } catch (e) {
            this.cb.onError && this.cb.onError(e.message);
        }
    }

    async _handleOffer(sdp) {
        this.pc = new RTCPeerConnection(ICE_SERVERS);

        this.pc.onicecandidate = (ev) => {
            if (ev.candidate) this._send({ type: "ice", candidate: ev.candidate.toJSON() });
        };
        this.pc.onconnectionstatechange = () => {
            this.cb.onPeerState && this.cb.onPeerState(this.pc.connectionState);
        };
        this.pc.ondatachannel = (ev) => {
            if (ev.channel.label === "control") {
                this.controlChannel = ev.channel;
                this.controlChannel.onmessage = (e) => this._onControl(JSON.parse(e.data));
            } else if (ev.channel.label === "data") {
                this.dataChannel = ev.channel;
                this.dataChannel.binaryType = "arraybuffer";
                this.dataChannel.onmessage = (e) => this._onData(e.data);
            }
        };

        await this.pc.setRemoteDescription({ type: "offer", sdp });
        const answer = await this.pc.createAnswer();
        await this.pc.setLocalDescription(answer);
        this._send({ type: "answer", sdp: answer.sdp });
    }

    _send(obj) {
        // Сигнальные сообщения (offer/answer/ice) — идут через WebSocket на сервер.
        if (this.ws && this.ws.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(obj));
    }

    _sendControl(obj) {
        // Служебные сообщения о самих файлах (file-accept/file-reject) должны идти
        // НАПРЯМУЮ отправителю по RTCDataChannel, а не через сигнальный сервер —
        // тот их просто не поймёт и не переправит по нужному протоколу.
        if (this.controlChannel && this.controlChannel.readyState === "open") {
            this.controlChannel.send(JSON.stringify(obj));
        }
    }

    async _onControl(msg) {
        if (msg.type === "file-offer") {
            // Сервер лишь сообщает о файле — реального приёма ещё не начинаем.
            // Ждём явного клика пользователя (acceptFile), т.к. showSaveFilePicker
            // требует "живого" пользовательского жеста и не может вызываться
            // автоматически по приходу сетевого сообщения.
            this.cb.onFileOffer && this.cb.onFileOffer(msg);
        }
        // "file-end" от отправителя намеренно НЕ используется для завершения приёма:
        // control- и data-каналы — это два независимых RTCDataChannel, и WebRTC
        // гарантирует порядок доставки только ВНУТРИ одного канала, а не между
        // ними. Поэтому "file-end" может прийти раньше, чем последние байты
        // данных — и увидеть, что файл "готов", когда часть его ещё в пути.
        // Правильный сигнал окончания — фактическое количество принятых байт
        // (см. _onData), которое приходит по тому же каналу, что и сами данные.
    }

    /**
     * Вызывается из обработчика клика пользователя по кнопке "Принять".
     * Именно здесь (а не автоматически) запрашивается место сохранения —
     * это обязательное требование File System Access API.
     */
    async acceptFile(offerMeta) {
        this.currentMeta = offerMeta;
        this.receivedBytes = 0;
        this._lastTime = Date.now();
        this._lastBytes = 0;
        this._finishing = false;

        if (window.showSaveFilePicker) {
            try {
                const handle = await window.showSaveFilePicker({ suggestedName: offerMeta.name });
                this.writer = await handle.createWritable();
                this.memChunks = null;
            } catch (e) {
                if (e && e.name === "AbortError") {
                    // Пользователь закрыл диалог выбора файла — считаем, что он всё
                    // равно хочет получить файл, просто примем его в память.
                    this.writer = null;
                    this.memChunks = [];
                } else {
                    this.writer = null;
                    this.memChunks = [];
                }
            }
        } else {
            this.writer = null;
            this.memChunks = [];
        }

        // Только теперь, когда получатель реально готов писать данные,
        // сообщаем отправителю, что можно начинать передачу чанков.
        this._sendControl({ type: "file-accept", id: offerMeta.id });
        this.cb.onFileStart && this.cb.onFileStart(offerMeta);
    }

    rejectFile(id) {
        this._sendControl({ type: "file-reject", id });
    }

    async _onData(buf) {
        if (!this.currentMeta || this._finishing) return;
        const chunk = new Uint8Array(buf);

        if (this.writer) {
            await this.writer.write(chunk);
        } else if (this.memChunks) {
            this.memChunks.push(chunk);
        }

        this.receivedBytes += chunk.byteLength;
        const now = Date.now();
        const isDone = this.receivedBytes >= this.currentMeta.size;
        if (now - this._lastTime > 200 || isDone) {
            const speed = (this.receivedBytes - this._lastBytes) / ((now - this._lastTime) / 1000 || 0.1);
            this.cb.onProgress && this.cb.onProgress(
                this.currentMeta.id, this.receivedBytes, speed, this.currentMeta.size
            );
            this._lastTime = now;
            this._lastBytes = this.receivedBytes;
        }

        if (isDone) {
            this._finishing = true;
            await this._finishCurrentFile();
        }
    }

    async _finishCurrentFile() {
        const meta = this.currentMeta;
        if (this.writer) {
            await this.writer.close();
            this.writer = null;
        } else if (this.memChunks) {
            const blob = new Blob(this.memChunks, { type: meta?.mime || "application/octet-stream" });
            this._triggerDownload(blob, meta?.name || "file");
            this.memChunks = null;
        }
        // Подтверждаем отправителю, что файл реально дозаписан — только после
        // этого он может начинать слать следующий файл из очереди. Это защищает
        // от повторной путаницы между двумя разными каналами (control/data).
        this._sendControl({ type: "file-received", id: meta.id });
        this.cb.onFileDone && this.cb.onFileDone(meta);
        this.currentMeta = null;
        this._finishing = false;
    }

    _triggerDownload(blob, filename) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 30000);
    }

    close() {
        try { this.controlChannel && this.controlChannel.close(); } catch (e) {}
        try { this.dataChannel && this.dataChannel.close(); } catch (e) {}
        try { this.pc && this.pc.close(); } catch (e) {}
        try { this.ws && this.ws.close(); } catch (e) {}
    }
}
