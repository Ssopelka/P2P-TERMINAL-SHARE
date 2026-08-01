import os
import sys

# Основные настройки
HOST = "0.0.0.0"
PORT = 8000

# Папка для зашифрованных файлов создаётся РЯДОМ с .exe (или со скриптом),
# а не в текущей рабочей директории — так она не потеряется, если сервер
# запущен двойным щелчком из другого места.
if getattr(sys, "frozen", False):
    _base_dir = os.path.dirname(sys.executable)
else:
    _base_dir = os.path.dirname(os.path.abspath(__file__))

UPLOAD_DIR = os.path.join(_base_dir, "secure_storage")

# Максимальное время жизни нескачанного пакета по умолчанию (в часах)
FILE_TTL_HOURS = 24

# Максимально допустимый TTL (30 дней = 720 часов)
MAX_TTL_HOURS = 720

# Создаем папку хранилища, если не существует
os.makedirs(UPLOAD_DIR, exist_ok=True)