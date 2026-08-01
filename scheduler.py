from apscheduler.schedulers.background import BackgroundScheduler
from storage import cleanup_expired_files

scheduler = BackgroundScheduler()

def start_scheduler():
    # Запуск авто-очистки каждый час
    scheduler.add_job(cleanup_expired_files, 'interval', hours=1)
    scheduler.start()