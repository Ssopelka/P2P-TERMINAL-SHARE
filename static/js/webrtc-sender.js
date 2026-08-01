// P2PSender — открывает WebRTC-соединение через сигнальный WebSocket
// сервера и передаёт файлы напрямую по RTCDataChannel получателю.

class P2PSender {
    constructor(roomId, callbacks = {}) {
        this.roomId = roomId;
        this.ws = null;
        this.pc = null;
        this.controlChannel = null;
        this.dataChannel = null;
        this.queue = [];          // [{file, id}]
        this.sending = false;
        this.cancelled = false;

        // callbacks: onPeerJoined, onPeerLeft, onWaitingAccept(id), onFileAccepted(id), onFileRejected(id),
        // onWaitingReceiptConfirm(id), onProgress(id, sentBytes, speed, total), onFileDone(id), onAllDone(),
        // onError(msg), onStateChange(state)
        this.cb = callbacks;
    }

    connect() {
        return new Promise((resolve, reject) => {
            this.ws = new WebSocket(p2pSignalUrl(this.roomId, "sender"));
            this.ws.onopen = () => resolve();
            this.ws.onerror = () => reject(new Error("Не удалось подключиться к сигнальному серверу"));
            this.ws.onmessage = (ev) => this._onSignal(JSON.parse(ev.data));
            this.ws.onclose = () => this.cb.onStateChange && this.cb.onStateChange("signal-closed");
        });
    }

    async _onSignal(msg) {
        try {
            if (msg.type === "peer-joined") {
                await this._startConnection();
            } else if (msg.type === "answer") {
                await this.pc.setRemoteDescription({ type: "answer", sdp: msg.sdp });
            } else if (msg.type === "ice") {
                if (msg.candidate) {
                    await this.pc.addIceCandidate(msg.candidate).catch(() => {});
                }
            } else if (msg.type === "peer-left") {
                this.cb.onPeerLeft && this.cb.onPeerLeft();
            }
        } catch (e) {
            this.cb.onError && this.cb.onError(e.message);
        }
    }

    async _startConnection() {
        this.pc = new RTCPeerConnection(ICE_SERVERS);

        this.pc.onicecandidate = (ev) => {
            if (ev.candidate) {
                this._send({ type: "ice", candidate: ev.candidate.toJSON() });
            }
        };
        this.pc.onconnectionstatechange = () => {
            this.cb.onStateChange && this.cb.onStateChange(this.pc.connectionState);
        };

        this.controlChannel = this.pc.createDataChannel("control", { ordered: true });
        this.dataChannel = this.pc.createDataChannel("data", { ordered: true });
        this.dataChannel.binaryType = "arraybuffer";

        this.controlChannel.onopen = () => this._maybeStartSending();
        this.controlChannel.onmessage = (ev) => this._onControlMessage(JSON.parse(ev.data));
        this.dataChannel.onopen = () => this._maybeStartSending();

        const offer = await this.pc.createOffer();
        await this.pc.setLocalDescription(offer);
        this._send({ type: "offer", sdp: offer.sdp });
    }

    _send(obj) {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify(obj));
        }
    }

    _onControlMessage(msg) {
        if (msg.type === "file-accept" || msg.type === "file-reject") {
            const resolver = this._pendingAccepts && this._pendingAccepts[msg.id];
            if (resolver) {
                resolver(msg.type === "file-accept");
                delete this._pendingAccepts[msg.id];
            }
        } else if (msg.type === "file-received") {
            const resolver = this._pendingReceived && this._pendingReceived[msg.id];
            if (resolver) {
                resolver();
                delete this._pendingReceived[msg.id];
            }
        }
    }

    /** Возвращает промис, который резолвится true/false, когда получатель ответит на предложение файла. */
    _waitForAccept(id) {
        if (!this._pendingAccepts) this._pendingAccepts = {};
        return new Promise((resolve) => {
            this._pendingAccepts[id] = resolve;
        });
    }

    /** Резолвится, когда получатель подтвердит, что действительно дозаписал файл на диск. */
    _waitForReceived(id) {
        if (!this._pendingReceived) this._pendingReceived = {};
        return new Promise((resolve) => {
            this._pendingReceived[id] = resolve;
        });
    }

    _maybeStartSending() {
        if (this.controlChannel?.readyState === "open" && this.dataChannel?.readyState === "open") {
            this.cb.onStateChange && this.cb.onStateChange("connected");
            this._processQueue();
        }
    }

    /** Добавить файлы в очередь на отправку (можно вызвать до/после установления связи). */
    addFiles(items) {
        // items: [{id, file}]
        this.queue.push(...items);
        this._processQueue();
    }

    async _processQueue() {
        if (this.sending || this.cancelled) return;
        if (!(this.controlChannel?.readyState === "open" && this.dataChannel?.readyState === "open")) return;

        const next = this.queue.shift();
        if (!next) {
            this.cb.onAllDone && this.cb.onAllDone();
            return;
        }

        this.sending = true;
        await this._sendFile(next);
        this.sending = false;
        this._processQueue();
    }

    async _sendFile({ id, file }) {
        // Сообщаем получателю о файле и ждём, пока он подготовит место для сохранения
        // (это требует явного клика пользователя из-за File System Access API)
        // и явно подтвердит готовность — иначе часть чанков может уйти до того,
        // как получатель будет готов их принять.
        this.controlChannel.send(JSON.stringify({
            type: "file-offer", id, name: file.name, size: file.size, mime: file.type || ""
        }));
        this.cb.onWaitingAccept && this.cb.onWaitingAccept(id);

        const accepted = await this._waitForAccept(id);
        if (this.cancelled) return;
        if (!accepted) {
            this.cb.onFileRejected && this.cb.onFileRejected(id);
            return;
        }
        this.cb.onFileAccepted && this.cb.onFileAccepted(id);

        let sentBytes = 0;
        let lastTime = Date.now();
        let lastBytes = 0;
        const dc = this.dataChannel;

        const waitForBuffer = () => new Promise((resolve) => {
            if (dc.bufferedAmount <= P2P_BUFFERED_AMOUNT_LOW) return resolve();
            const check = () => {
                if (dc.bufferedAmount <= P2P_BUFFERED_AMOUNT_LOW) {
                    dc.removeEventListener("bufferedamountlow", check);
                    resolve();
                }
            };
            dc.bufferedAmountLowThreshold = P2P_BUFFERED_AMOUNT_LOW;
            dc.addEventListener("bufferedamountlow", check);
        });

        while (sentBytes < file.size) {
            if (this.cancelled) return;
            const slice = file.slice(sentBytes, sentBytes + P2P_CHUNK_SIZE);
            const buf = await slice.arrayBuffer();

            await waitForBuffer();
            if (dc.readyState !== "open") {
                this.cb.onError && this.cb.onError("Соединение разорвано во время передачи");
                return;
            }
            dc.send(buf);
            sentBytes += buf.byteLength;

            const now = Date.now();
            if (now - lastTime > 200) {
                const speed = ((sentBytes - lastBytes) / ((now - lastTime) / 1000));
                this.cb.onProgress && this.cb.onProgress(id, sentBytes, speed, file.size);
                lastTime = now;
                lastBytes = sentBytes;
            }
        }

        this.cb.onProgress && this.cb.onProgress(id, file.size, 0, file.size);
        this.controlChannel.send(JSON.stringify({ type: "file-end", id }));

        // Ждём, пока получатель реально дозапишет файл на диск, прежде чем
        // переходить к следующему файлу очереди — иначе метаданные
        // следующего файла (control-канал) могут обогнать последние байты
        // текущего (data-канал): это разные независимые каналы, и порядок
        // доставки между ними WebRTC не гарантирует.
        this.cb.onWaitingReceiptConfirm && this.cb.onWaitingReceiptConfirm(id);
        await this._waitForReceived(id);
        if (this.cancelled) return;

        this.cb.onFileDone && this.cb.onFileDone(id);
    }

    close() {
        this.cancelled = true;
        try { this.controlChannel && this.controlChannel.close(); } catch (e) {}
        try { this.dataChannel && this.dataChannel.close(); } catch (e) {}
        try { this.pc && this.pc.close(); } catch (e) {}
        try { this.ws && this.ws.close(); } catch (e) {}
    }
}
