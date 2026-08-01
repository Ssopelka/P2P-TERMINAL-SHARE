import os
import sys
import json
import secrets
import urllib.parse
import io
import base64
from datetime import datetime
from contextlib import asynccontextmanager

import qrcode
import uvicorn
from fastapi import FastAPI, UploadFile, File, Form, HTTPException, WebSocket, WebSocketDisconnect, Query
from fastapi.responses import HTMLResponse, Response, FileResponse
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.concurrency import run_in_threadpool
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from pydantic import BaseModel

from config import HOST, PORT, UPLOAD_DIR
from storage import storage, delete_share
from scheduler import start_scheduler


def resource_path(relative_path: str) -> str:
    """Возвращает корректный путь к ресурсу как в dev-режиме, так и внутри PyInstaller .exe."""
    base_path = getattr(sys, "_MEIPASS", os.path.dirname(os.path.abspath(__file__)))
    return os.path.join(base_path, relative_path)


# Надежная функция форматирования размера файла
def format_size(size_in_bytes: int) -> str:
    if size_in_bytes == 0:
        return "0 B"
    k = 1024
    sizes = ['B', 'KB', 'MB', 'GB', 'TB']
    i = 0
    while size_in_bytes >= k and i < len(sizes) - 1:
        size_in_bytes /= k
        i += 1
    return f"{size_in_bytes:.2f} {sizes[i]}"


# Современный способ инициализации событий в FastAPI (убирает DeprecationWarning)
@asynccontextmanager
async def lifespan(app: FastAPI):
    # Запуск фонового сборщика мусора при старте
    start_scheduler()
    yield
    # Здесь можно добавить логику корректного завершения, если нужно


app = FastAPI(title="P2P TERMINAL SHARE", lifespan=lifespan)

# Включаем GZip-сжатие трафика
app.add_middleware(GZipMiddleware, minimum_size=1000)

# Монтирование статики (resource_path нужен, чтобы путь работал и в собранном .exe)
app.mount("/static", StaticFiles(directory=resource_path("static")), name="static")

# --- P2P (WebRTC) СИГНАЛЬНЫЙ РЕЕСТР КОМНАТ ---
# Сервер НЕ хранит и НЕ видит содержимое файлов в этом режиме — только
# пересылает служебные SDP/ICE-сообщения между отправителем и получателем,
# после чего они общаются напрямую по RTCDataChannel (DTLS-шифрование WebRTC).
p2p_rooms: dict[str, dict] = {}


# --- СТАТИЧЕСКИЕ СТРАНИЦЫ ---

@app.get("/", response_class=HTMLResponse)
def index():
    return FileResponse(resource_path("static/index.html"))


@app.get("/share/{share_id}", response_class=HTMLResponse)
def download_page(share_id: str):
    if share_id not in storage:
        return HTMLResponse(
            "<body style='background:#000; color:#f00; font-family:monospace; text-align:center; margin-top:50px;'>"
            "<h2>[ СИСТЕМНАЯ ОШИБКА: ДАННЫЕ УНИЧТОЖЕНЫ ]</h2></body>", 
            status_code=404
        )
    return FileResponse(resource_path("static/download.html"))


@app.get("/p2p/{room_id}", response_class=HTMLResponse)
def p2p_page(room_id: str):
    """Страница получателя для прямой P2P-передачи (WebRTC)."""
    if room_id not in p2p_rooms:
        return HTMLResponse(
            "<body style='background:#000; color:#f00; font-family:monospace; text-align:center; margin-top:50px;'>"
            "<h2>[ КОМНАТА НЕ НАЙДЕНА ИЛИ ОТПРАВИТЕЛЬ ОТКЛЮЧИЛСЯ ]</h2></body>",
            status_code=404
        )
    return FileResponse(resource_path("static/p2p.html"))


# --- API МОДЕЛИ ---

class ShareInit(BaseModel):
    limit: int
    comment: str = ""
    ttl_hours: int = 24


class FileInit(BaseModel):
    filename: str
    preview_type: str = ""
    preview_data: str = ""


class KeyModel(BaseModel):
    key: str


# Хранилище превью (in-memory)
file_previews = {}


# --- API ЭНДПОИНТЫ ---

@app.post("/api/share/init")
def init_share(payload: ShareInit):
    # Ограничиваем TTL от 1 часа до 720 часов (30 дней)
    ttl = max(1, min(payload.ttl_hours, 720))
    
    share_id = secrets.token_urlsafe(16)
    key = AESGCM.generate_key(bit_length=256)
    storage[share_id] = {
        "key": key.hex(),
        "limit": payload.limit,
        "comment": payload.comment,
        "ttl_hours": ttl,
        "created_at": datetime.now(),
        "files": {}
    }
    return {"share_id": share_id, "key": key.hex()}


@app.post("/api/share/{share_id}/init_file")
def init_file(share_id: str, payload: FileInit):
    if share_id not in storage:
        raise HTTPException(status_code=404, detail="Share not found")
    
    file_id = secrets.token_urlsafe(8)
    storage[share_id]["files"][file_id] = {
        "filename": payload.filename,
        "status": "uploading",
        "downloads_left": storage[share_id]["limit"],
        "file_size": "0 B"
    }
    
    if payload.preview_type and payload.preview_data:
        file_previews[file_id] = {
            "type": payload.preview_type,
            "data": payload.preview_data,
        }
    
    filepath = os.path.join(UPLOAD_DIR, f"{share_id}_{file_id}.tmp")
    open(filepath, "wb").close()
    return {"file_id": file_id}


@app.post("/api/share/{share_id}/{file_id}/chunk")
async def upload_chunk(
    share_id: str, 
    file_id: str, 
    chunk: UploadFile = File(...)
):
    filepath = os.path.join(UPLOAD_DIR, f"{share_id}_{file_id}.tmp")
    chunk_data = await chunk.read()
    with open(filepath, "ab") as f:
        f.write(chunk_data)
    return {"status": "ok"}


@app.post("/api/share/{share_id}/{file_id}/finish")
async def finish_file(share_id: str, file_id: str):
    filepath = os.path.join(UPLOAD_DIR, f"{share_id}_{file_id}.tmp")
    enc_filepath = os.path.join(UPLOAD_DIR, f"{share_id}_{file_id}.enc")

    if not os.path.exists(filepath):
        raise HTTPException(status_code=404, detail="Файл не найден")

    # Получаем размер файла до шифрования для отображения
    file_size = os.path.getsize(filepath)
    
    with open(filepath, "rb") as f:
        file_bytes = f.read()

    key = bytes.fromhex(storage[share_id]["key"])
    aesgcm = AESGCM(key)
    nonce = secrets.token_bytes(12)
    
    encrypted_data = await run_in_threadpool(aesgcm.encrypt, nonce, file_bytes, None)

    with open(enc_filepath, "wb") as f:
        f.write(encrypted_data)
    
    os.remove(filepath)

    storage[share_id]["files"][file_id]["nonce"] = nonce
    storage[share_id]["files"][file_id]["filepath"] = enc_filepath
    storage[share_id]["files"][file_id]["status"] = "ready"
    storage[share_id]["files"][file_id]["file_size"] = format_size(file_size)
    
    return {"status": "ok"}


@app.get("/api/share/{share_id}")
def get_share_info(share_id: str):
    if share_id not in storage:
        raise HTTPException(status_code=404, detail="Share not found")
    
    files_info = []
    for fid, fobj in storage[share_id]["files"].items():
        if fobj.get("status") == "ready":
            preview = file_previews.get(fid, {})
            files_info.append({
                "id": fid,
                "filename": fobj["filename"],
                "downloads_left": fobj["downloads_left"],
                "file_size": fobj.get("file_size", "НЕИЗВЕСТНО"),
                "preview_type": preview.get("type", ""),
                "preview_data": preview.get("data", "")
            })
            
    return {
        "files": files_info,
        "comment": storage[share_id].get("comment", "")
    }


@app.post("/api/p2p/create")
def create_p2p_room():
    """Создаёт комнату для прямой P2P-передачи. Никакие файлы тут не сохраняются."""
    room_id = secrets.token_urlsafe(12)
    p2p_rooms[room_id] = {"sender": None, "receiver": None}
    return {"room_id": room_id}


@app.websocket("/ws/signal/{room_id}")
async def signal_ws(websocket: WebSocket, room_id: str, role: str = Query(...)):
    """Чистый сигнальный релей: пересылает SDP-offer/answer и ICE-кандидаты
    между отправителем и получателем. Само тело файлов сюда никогда не попадает —
    оно идёт напрямую по RTCDataChannel после установления соединения."""
    if role not in ("sender", "receiver"):
        await websocket.close(code=4000)
        return

    await websocket.accept()
    room = p2p_rooms.setdefault(room_id, {"sender": None, "receiver": None})
    room[role] = websocket
    other_role = "receiver" if role == "sender" else "sender"

    if room.get(other_role):
        try:
            await room[other_role].send_text(json.dumps({"type": "peer-joined"}))
        except Exception:
            pass

    try:
        while True:
            msg = await websocket.receive_text()
            peer = room.get(other_role)
            if peer:
                try:
                    await peer.send_text(msg)
                except Exception:
                    pass
    except WebSocketDisconnect:
        pass
    finally:
        if room.get(role) is websocket:
            room[role] = None
        peer = room.get(other_role)
        if peer:
            try:
                await peer.send_text(json.dumps({"type": "peer-left"}))
            except Exception:
                pass
        if not room.get("sender") and not room.get("receiver"):
            p2p_rooms.pop(room_id, None)


@app.get("/api/qr")
def generate_qr(text: str):
    """Генерация base64 QR-кода на лету."""
    qr = qrcode.QRCode(version=1, box_size=4, border=2)
    qr.add_data(text)
    qr.make(fit=True)
    img = qr.make_image(fill_color="black", back_color="white")
    buffer = io.BytesIO()
    img.save(buffer, format="PNG")
    img_str = base64.b64encode(buffer.getvalue()).decode()
    return {"qr_code": f"data:image/png;base64,{img_str}"}


@app.post("/api/decrypt/{share_id}/{file_id}")
async def decrypt_and_deliver(share_id: str, file_id: str, payload: KeyModel):
    if share_id not in storage or file_id not in storage[share_id]["files"]:
        raise HTTPException(status_code=404, detail="Файл не найден")

    file_info = storage[share_id]["files"][file_id]
    filepath = file_info["filepath"]

    with open(filepath, "rb") as f:
        encrypted_data = f.read()

    try:
        key = bytes.fromhex(payload.key)
        aesgcm = AESGCM(key)
        decrypted_data = await run_in_threadpool(
            aesgcm.decrypt, file_info["nonce"], encrypted_data, None
        )
    except Exception:
        raise HTTPException(status_code=400, detail="Неверный ключ шифрования")

    if file_info["downloads_left"] > 0:
        file_info["downloads_left"] -= 1
        if file_info["downloads_left"] == 0:
            try:
                os.remove(filepath)
            except OSError:
                pass
            del storage[share_id]["files"][file_id]
            if not storage[share_id]["files"]:
                del storage[share_id]

    safe_filename = urllib.parse.quote(file_info['filename'])
    return Response(
        content=decrypted_data,
        media_type="application/octet-stream",
        headers={"Content-Disposition": f"attachment; filename*=utf-8''{safe_filename}"}
    )


if __name__ == "__main__":
    # Если запущено как собранный .exe — открываем браузер и печатаем
    # адрес, чтобы было понятно, куда идти (двойной клик не покажет консоль с логами).
    if getattr(sys, "frozen", False):
        import webbrowser
        import threading

        display_host = "127.0.0.1" if HOST == "0.0.0.0" else HOST
        url = f"http://{display_host}:{PORT}/"

        def _open_browser():
            import time
            time.sleep(1.2)
            webbrowser.open(url)

        print(f"P2P TERMINAL SHARE запущен: {url}")
        print("Не закрывайте это окно, пока пользуетесь сервером.")
        threading.Thread(target=_open_browser, daemon=True).start()

    uvicorn.run(app, host=HOST, port=PORT)