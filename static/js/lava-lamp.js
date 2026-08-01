// Генерация реалистичных капель лавовой лампы с медленным хаотичным движением
document.addEventListener('DOMContentLoaded', function() {
    const wrapper = document.getElementById('blobsWrapper');
    if (!wrapper) return;

    // Определяем количество капель в зависимости от размера экрана
    function getBlobCount() {
        const width = window.innerWidth;
        const height = window.innerHeight;
        const area = width * height;
        
        // Базовое количество: 1 капля на ~100000 пикселей (меньше капель)
        let count = Math.floor(area / 100000);
        
        // Ограничения
        count = Math.max(6, Math.min(count, 18));
        
        return count;
    }

    // Случайное число в диапазоне
    function random(min, max) {
        return Math.random() * (max - min) + min;
    }

    // Создание капли
    function createBlob(index, total) {
        const blob = document.createElement('div');
        blob.className = 'blob';
        
        // Размер капли (разный для разнообразия)
        const size = random(80, 200);
        blob.style.width = size + 'px';
        blob.style.height = size + 'px';
        
        // Начальная позиция (распределены по экрану)
        const startX = random(5, 90);
        const startY = random(10, 90);
        blob.style.left = startX + '%';
        blob.style.top = startY + '%';
        
        // Параметры движения - УМЕНЬШЕНА СКОРОСТЬ (меньшие диапазоны, больше duration)
        // Горизонтальное движение (влево-вправо) - МЕДЛЕННЕЕ
        const moveX1 = random(-20, 20);
        const moveX2 = random(-25, 25);
        const moveX3 = random(-18, 18);
        const moveX4 = random(-22, 22);
        const moveX5 = random(-15, 15);
        
        // Вертикальное движение (вверх-вниз) - МЕДЛЕННЕЕ
        const moveY1 = random(-25, 25);
        const moveY2 = random(-30, 30);
        const moveY3 = random(-22, 22);
        const moveY4 = random(-28, 28);
        const moveY5 = random(-20, 20);
        
        // Длительность анимации - УВЕЛИЧЕНА (медленнее движение)
        const duration = random(30, 60);
        
        // Отрицательная задержка - анимация начинается сразу с активной фазы
        const negativeDelay = -random(10, 30);
        
        // Масштабирование (капли меняют размер) - более плавно
        const scale1 = random(0.8, 1.2);
        const scale2 = random(0.75, 1.15);
        const scale3 = random(0.85, 1.25);
        const scale4 = random(0.8, 1.2);
        
        // Деформация (растяжение по осям) - более плавное
        const stretchX1 = random(0.9, 1.15);
        const stretchY1 = random(0.85, 1.15);
        const stretchX2 = random(0.88, 1.18);
        const stretchY2 = random(0.9, 1.15);
        const stretchX3 = random(0.92, 1.12);
        const stretchY3 = random(0.88, 1.12);
        
        // Вращение - более плавное
        const rotate1 = random(-15, 15);
        const rotate2 = random(-20, 20);
        const rotate3 = random(-10, 10);
        
        // Применяем CSS переменные
        blob.style.setProperty('--move-x1', moveX1 + 'vw');
        blob.style.setProperty('--move-x2', moveX2 + 'vw');
        blob.style.setProperty('--move-x3', moveX3 + 'vw');
        blob.style.setProperty('--move-x4', moveX4 + 'vw');
        blob.style.setProperty('--move-x5', moveX5 + 'vw');
        blob.style.setProperty('--move-y1', moveY1 + 'vh');
        blob.style.setProperty('--move-y2', moveY2 + 'vh');
        blob.style.setProperty('--move-y3', moveY3 + 'vh');
        blob.style.setProperty('--move-y4', moveY4 + 'vh');
        blob.style.setProperty('--move-y5', moveY5 + 'vh');
        blob.style.setProperty('--scale1', scale1);
        blob.style.setProperty('--scale2', scale2);
        blob.style.setProperty('--scale3', scale3);
        blob.style.setProperty('--scale4', scale4);
        blob.style.setProperty('--stretch-x1', stretchX1);
        blob.style.setProperty('--stretch-y1', stretchY1);
        blob.style.setProperty('--stretch-x2', stretchX2);
        blob.style.setProperty('--stretch-y2', stretchY2);
        blob.style.setProperty('--stretch-x3', stretchX3);
        blob.style.setProperty('--stretch-y3', stretchY3);
        blob.style.setProperty('--rotate1', rotate1 + 'deg');
        blob.style.setProperty('--rotate2', rotate2 + 'deg');
        blob.style.setProperty('--rotate3', rotate3 + 'deg');
        
        // Анимация с ОТРИЦАТЕЛЬНОЙ задержкой (начинается сразу)
        const morphDuration = random(12, 20);
        const morphNegativeDelay = -random(5, 12);
        
        blob.style.animation = `
            blobMove${index % 4} ${duration}s ${negativeDelay}s infinite ease-in-out alternate,
            blobMorph ${morphDuration}s ${morphNegativeDelay}s infinite ease-in-out alternate
        `;
        
        // Разные оттенки зелёного для разнообразия
        const hue = random(100, 140);
        const saturation = random(70, 100);
        const lightness = random(30, 60);
        blob.style.background = `radial-gradient(circle at 30% 30%, 
            hsl(${hue}, ${saturation}%, ${lightness + 20}%), 
            hsl(${hue}, ${saturation}%, ${lightness}%), 
            hsl(${hue}, ${saturation - 20}%, ${lightness - 20}%))`;
        
        blob.style.boxShadow = `0 0 ${random(30, 60)}px rgba(0, 255, 0, ${random(0.4, 0.8)}), 
            inset 0 0 ${random(15, 30)}px rgba(0, 255, 0, ${random(0.6, 1)})`;
        
        wrapper.appendChild(blob);
    }

    // Создаём keyframes динамически с ПЛАВНЫМ движением
    function createKeyframes() {
        const styleSheet = document.createElement('style');
        styleSheet.textContent = `
            @keyframes blobMove0 {
                0% { transform: translate(0, 0) scale(var(--scale1)) scaleX(var(--stretch-x1)) scaleY(var(--stretch-y1)) rotate(0deg); }
                15% { transform: translate(var(--move-x1), var(--move-y1)) scale(var(--scale2)) scaleX(var(--stretch-x2)) scaleY(var(--stretch-y2)) rotate(var(--rotate1)); }
                30% { transform: translate(var(--move-x3), var(--move-y3)) scale(var(--scale1)) scaleX(var(--stretch-x3)) scaleY(var(--stretch-y3)) rotate(var(--rotate2)); }
                50% { transform: translate(var(--move-x2), var(--move-y2)) scale(var(--scale3)) scaleX(var(--stretch-x1)) scaleY(var(--stretch-y1)) rotate(var(--rotate3)); }
                70% { transform: translate(var(--move-x4), var(--move-y4)) scale(var(--scale2)) scaleX(var(--stretch-x2)) scaleY(var(--stretch-y2)) rotate(var(--rotate1)); }
                85% { transform: translate(var(--move-x5), var(--move-y5)) scale(var(--scale4)) scaleX(var(--stretch-x3)) scaleY(var(--stretch-y3)) rotate(var(--rotate2)); }
                100% { transform: translate(calc(var(--move-x1) * 0.5), calc(var(--move-y1) * 0.5)) scale(var(--scale2)) scaleX(var(--stretch-x1)) scaleY(var(--stretch-y1)) rotate(0deg); }
            }
            
            @keyframes blobMove1 {
                0% { transform: translate(0, 0) scale(var(--scale2)) scaleX(var(--stretch-x2)) scaleY(var(--stretch-y2)) rotate(0deg); }
                20% { transform: translate(var(--move-x2), var(--move-y2)) scale(var(--scale1)) scaleX(var(--stretch-x1)) scaleY(var(--stretch-y1)) rotate(var(--rotate2)); }
                40% { transform: translate(var(--move-x4), var(--move-y4)) scale(var(--scale3)) scaleX(var(--stretch-x3)) scaleY(var(--stretch-y3)) rotate(var(--rotate1)); }
                60% { transform: translate(var(--move-x3), var(--move-y3)) scale(var(--scale2)) scaleX(var(--stretch-x2)) scaleY(var(--stretch-y2)) rotate(var(--rotate3)); }
                80% { transform: translate(var(--move-x5), var(--move-y5)) scale(var(--scale4)) scaleX(var(--stretch-x1)) scaleY(var(--stretch-y1)) rotate(var(--rotate2)); }
                100% { transform: translate(var(--move-x1), var(--move-y1)) scale(var(--scale2)) scaleX(var(--stretch-x1)) scaleY(var(--stretch-y1)) rotate(0deg); }
            }
            
            @keyframes blobMove2 {
                0% { transform: translate(0, 0) scale(var(--scale3)) scaleX(var(--stretch-x1)) scaleY(var(--stretch-y2)) rotate(0deg); }
                12% { transform: translate(var(--move-x3), var(--move-y1)) scale(var(--scale1)) scaleX(var(--stretch-x2)) scaleY(var(--stretch-y1)) rotate(var(--rotate1)); }
                25% { transform: translate(var(--move-x5), var(--move-y3)) scale(var(--scale2)) scaleX(var(--stretch-x3)) scaleY(var(--stretch-y2)) rotate(var(--rotate3)); }
                37% { transform: translate(var(--move-x1), var(--move-y5)) scale(var(--scale4)) scaleX(var(--stretch-x1)) scaleY(var(--stretch-y3)) rotate(var(--rotate2)); }
                50% { transform: translate(var(--move-x2), var(--move-y2)) scale(var(--scale3)) scaleX(var(--stretch-x2)) scaleY(var(--stretch-y1)) rotate(var(--rotate1)); }
                62% { transform: translate(var(--move-x4), var(--move-y4)) scale(var(--scale1)) scaleX(var(--stretch-x3)) scaleY(var(--stretch-y2)) rotate(var(--rotate3)); }
                75% { transform: translate(var(--move-x3), var(--move-y1)) scale(var(--scale2)) scaleX(var(--stretch-x1)) scaleY(var(--stretch-y3)) rotate(var(--rotate2)); }
                87% { transform: translate(var(--move-x5), var(--move-y5)) scale(var(--scale4)) scaleX(var(--stretch-x2)) scaleY(var(--stretch-y1)) rotate(var(--rotate1)); }
                100% { transform: translate(calc(var(--move-x2) * 0.7), calc(var(--move-y3) * 0.7)) scale(var(--scale1)) scaleX(var(--stretch-x1)) scaleY(var(--stretch-y2)) rotate(0deg); }
            }
            
            @keyframes blobMove3 {
                0% { transform: translate(0, 0) scale(var(--scale1)) scaleX(var(--stretch-x3)) scaleY(var(--stretch-y1)) rotate(0deg); }
                18% { transform: translate(var(--move-x4), var(--move-y2)) scale(var(--scale3)) scaleX(var(--stretch-x1)) scaleY(var(--stretch-y2)) rotate(var(--rotate2)); }
                36% { transform: translate(var(--move-x1), var(--move-y4)) scale(var(--scale2)) scaleX(var(--stretch-x2)) scaleY(var(--stretch-y3)) rotate(var(--rotate1)); }
                54% { transform: translate(var(--move-x5), var(--move-y1)) scale(var(--scale4)) scaleX(var(--stretch-x3)) scaleY(var(--stretch-y1)) rotate(var(--rotate3)); }
                72% { transform: translate(var(--move-x2), var(--move-y5)) scale(var(--scale1)) scaleX(var(--stretch-x1)) scaleY(var(--stretch-y2)) rotate(var(--rotate2)); }
                90% { transform: translate(var(--move-x3), var(--move-y3)) scale(var(--scale3)) scaleX(var(--stretch-x2)) scaleY(var(--stretch-y3)) rotate(var(--rotate1)); }
                100% { transform: translate(calc(var(--move-x4) * 0.6), calc(var(--move-y2) * 0.6)) scale(var(--scale2)) scaleX(var(--stretch-x3)) scaleY(var(--stretch-y1)) rotate(0deg); }
            }
            
            @keyframes blobMorph {
                0% { border-radius: 50% 50% 50% 50%; }
                15% { border-radius: 45% 55% 50% 50%; }
                30% { border-radius: 50% 50% 55% 45%; }
                45% { border-radius: 55% 45% 50% 50%; }
                60% { border-radius: 48% 52% 52% 48%; }
                75% { border-radius: 52% 48% 45% 55%; }
                90% { border-radius: 47% 53% 53% 47%; }
                100% { border-radius: 50% 50% 50% 50%; }
            }
        `;
        document.head.appendChild(styleSheet);
    }

    // Инициализация
    createKeyframes();
    
    const blobCount = getBlobCount();
    for (let i = 0; i < blobCount; i++) {
        createBlob(i, blobCount);
    }

    // ИСПРАВЛЕНИЕ: При resize не пересоздаём пузырьки, а только добавляем/удаляем лишние
    // Это сохраняет текущую анимацию существующих пузырьков
    let resizeTimer;
    window.addEventListener('resize', function() {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(function() {
            const newCount = getBlobCount();
            const currentBlobs = wrapper.querySelectorAll('.blob');
            const currentCount = currentBlobs.length;
            
            if (newCount > currentCount) {
                // Добавляем недостающие пузырьки
                for (let i = currentCount; i < newCount; i++) {
                    createBlob(i, newCount);
                }
            } else if (newCount < currentCount) {
                // Удаляем лишние пузырьки (с конца)
                for (let i = currentCount - 1; i >= newCount; i--) {
                    if (currentBlobs[i]) {
                        currentBlobs[i].remove();
                    }
                }
            }
            // Если количество не изменилось - ничего не делаем, анимация продолжается
        }, 500);
    });
});