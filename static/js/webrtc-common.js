// Общая конфигурация для P2P (WebRTC) передачи файлов.
// Сервер участвует ТОЛЬКО в сигнализации (обмен SDP/ICE) — сам файл
// никогда не проходит через backend, он идёт напрямую между браузерами
// по зашифрованному (DTLS) RTCDataChannel.

const ICE_SERVERS = {
    iceServers: [
        { urls: "stun:stun.l.google.com:19302" },
        { urls: "stun:stun1.l.google.com:19302" },
        { urls: "stun:stun.cloudflare.com:3478" }
        // Если оба пира за "жёстким" (symmetric) NAT — STUN не поможет и
        // соединение не установится. Для гарантированной работы добавьте
        // сюда свой TURN-сервер, например:
        // { urls: "turn:your-turn-server.com:3478", username: "user", credential: "pass" }
    ]
};

const P2P_CHUNK_SIZE = 64 * 1024;                 // 64KB — размер одного куска данных
const P2P_BUFFERED_AMOUNT_LOW = 4 * 1024 * 1024;  // порог для backpressure (4MB)

function p2pSignalUrl(roomId, role) {
    const proto = location.protocol === "https:" ? "wss:" : "ws:";
    return `${proto}//${location.host}/ws/signal/${roomId}?role=${role}`;
}

function p2pFormatSize(bytes) {
    if (!bytes) return "0 B";
    const k = 1024, sizes = ["B", "KB", "MB", "GB", "TB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}

function p2pFormatSpeed(bytesPerSec) {
    if (!isFinite(bytesPerSec) || bytesPerSec <= 0) return "0 B/s";
    return p2pFormatSize(bytesPerSec) + "/s";
}
