let matrixInterval;
let canvas, ctx;
let drops = [];
let columns = 0;
let glitchTimer = 0;
let glitchActive = false;
let glitchType = 0;
let scanlineOffset = 0;
const fontSize = 14;

const chars = 'アァカサタナハマヤャラワガザダバパイィキシチニヒミリヰギジヂビピウゥクスツヌフムユュルグズブヅプエェケセテネヘメレヱゲゼデベペオォコソトノホモヨョロヲゴゾドボポヴッン0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ@#$%^&*(){}[]|;:<>?/~`';
const glitchChars = '!@#$%^&*()_+-=[]{}|;:,.<>?/~`░▒▓█▄▀■□▪▫●○◑◒◓';

function initMatrixCanvas() {
    canvas = document.getElementById('matrixCanvas');
    if (!canvas) return;
    ctx = canvas.getContext('2d');
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);
}

function resizeCanvas() {
    if (!canvas || !ctx) return;
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    const newColumns = Math.floor(canvas.width / fontSize);
    if (newColumns > columns) {
        for (let i = columns; i < newColumns; i++) {
            drops[i] = { y: Math.random() * -100, speed: random(0.3, 0.8), skip: 0 };
        }
    } else if (newColumns < columns) {
        drops = drops.slice(0, newColumns);
    }
    columns = newColumns;
}

function random(min, max) {
    return Math.random() * (max - min) + min;
}

function startMatrixRain() {
    if (!canvas || !ctx) initMatrixCanvas();
    if (drops.length === 0) {
        for (let i = 0; i < columns; i++) {
            drops[i] = { y: Math.random() * -100, speed: random(0.3, 0.8), skip: 0 };
        }
    }
    if (matrixInterval) clearInterval(matrixInterval);
    matrixInterval = setInterval(draw, 33); // ~30 FPS
}

function stopMatrixRain() {
    if (matrixInterval) {
        clearInterval(matrixInterval);
        matrixInterval = null;
    }
    if (ctx && canvas) ctx.clearRect(0, 0, canvas.width, canvas.height);
}

function draw() {
    // 1. Затухающий след (полупрозрачный черный прямоугольник)
    ctx.fillStyle = 'rgba(0, 0, 0, 0.06)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // 2. Случайные глобальные глитчи (мерцание экрана)
    glitchTimer++;
    if (glitchTimer > random(150, 400)) {
        glitchActive = true;
        glitchType = Math.floor(random(0, 3));
        glitchTimer = 0;
        setTimeout(() => { glitchActive = false; }, random(50, 150));
    }

    // Эффект мерцания яркости всего экрана
    if (glitchActive && glitchType === 0) {
        ctx.fillStyle = 'rgba(0, 255, 70, 0.05)';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
    }

    ctx.font = `bold ${fontSize}px monospace`;

    // 3. Отрисовка символов с хроматической аберрацией
    for (let i = 0; i < drops.length; i++) {
        const drop = drops[i];
        
        // Случайное "зависание" потока
        if (drop.skip > 0) {
            drop.skip--;
            continue;
        }
        if (Math.random() < 0.015) {
            drop.skip = Math.floor(random(1, 5));
        }

        const x = i * fontSize;
        const y = drop.y * fontSize;

        // Случайное искажение столбца (глитч)
        let drawX = x;
        let aberration = false;
        if (Math.random() < 0.008 || glitchActive) {
            drawX += Math.floor(random(-3, 3));
            aberration = true;
        }

        const char = chars.charAt(Math.floor(Math.random() * chars.length));
        const isGlitchChar = Math.random() < 0.012;
        const isLeader = Math.random() < 0.025; // Яркий "головной" символ потока

        if (isLeader) {
            // Белый яркий лидер с зеленым свечением
            ctx.fillStyle = '#ffffff';
            ctx.shadowColor = '#00ff41';
            ctx.shadowBlur = 10;
        } else if (isGlitchChar || aberration) {
            // Хроматическая аберрация: рисуем красный и циановый следы
            ctx.shadowBlur = 0;
            ctx.fillStyle = 'rgba(255, 0, 60, 0.7)';
            ctx.fillText(char, drawX - 2, y);
            ctx.fillStyle = 'rgba(0, 255, 255, 0.7)';
            ctx.fillText(char, drawX + 2, y);
            ctx.fillStyle = '#0f0'; // Основной цвет
        } else {
            // Обычный зеленый с градиентом яркости
            const brightness = 0.5 + Math.random() * 0.5;
            ctx.fillStyle = `rgba(0, ${Math.floor(200 + 55 * brightness)}, ${Math.floor(50 * brightness)}, ${brightness})`;
            ctx.shadowBlur = 0;
        }

        ctx.fillText(char, drawX, y);
        ctx.shadowBlur = 0; // Сброс свечения

        // Сброс капли
        if (y > canvas.height && Math.random() > 0.975) {
            drop.y = Math.random() * -20;
            drop.speed = random(0.3, 0.8);
        }
        
        drop.y += drop.speed;
    }

    // 4. Отрисовка полос развертки (Scanlines) прямо на canvas
    ctx.fillStyle = 'rgba(0, 0, 0, 0.15)';
    scanlineOffset = (scanlineOffset + 1) % 4;
    for (let y = scanlineOffset; y < canvas.height; y += 4) {
        ctx.fillRect(0, y, canvas.width, 1);
    }

    // 5. Случайная горизонтальная полоса помех (как на старом ТВ)
    if (Math.random() < 0.02) {
        const noiseY = Math.floor(random(0, canvas.height));
        const noiseH = Math.floor(random(2, 8));
        ctx.fillStyle = 'rgba(0, 255, 0, 0.1)';
        ctx.fillRect(0, noiseY, canvas.width, noiseH);
    }
}

document.addEventListener('DOMContentLoaded', initMatrixCanvas);