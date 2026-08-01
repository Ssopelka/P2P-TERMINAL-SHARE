import os
import shutil
from datetime import datetime
from config import UPLOAD_DIR, FILE_TTL_HOURS

# Оперативное хранилище сессий
storage = {}

def cleanup_expired_files():
    """Фоновая очистка пакетов, пролежавших больше заданного времени."""
    now = datetime.now()
    expired_shares = []
    
    for share_id, data in storage.items():
        created_at = data.get("created_at")
        if created_at:
            # Берём TTL из сессии, если есть, иначе дефолт
            ttl_hours = data.get("ttl_hours", FILE_TTL_HOURS)
            delta = (now - created_at).total_seconds() / 3600
            if delta >= ttl_hours:
                expired_shares.append(share_id)
    
    for share_id in expired_shares:
        delete_share(share_id)

def delete_share(share_id: str):
    """Удаление всей сессии и связанных зашифрованных файлов с диска."""
    if share_id in storage:
        for file_id, file_info in storage[share_id]["files"].items():
            filepath = file_info.get("filepath")
            tmp_filepath = os.path.join(UPLOAD_DIR, f"{share_id}_{file_id}.tmp")
            for path in [filepath, tmp_filepath]:
                if path and os.path.exists(path):
                    try:
                        os.remove(path)
                    except OSError:
                        pass
        del storage[share_id]