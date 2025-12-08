const canvas = document.getElementById('connections');
const ctx = canvas.getContext('2d');
const scene = document.getElementById('scene-container');
const motionBtn = document.getElementById('toggle-motion');
const searchInput = document.getElementById('search-input');

// --- Configuration ---
const config = {
    sphereRadius: 280,
    baseRotationSpeed: 0.002,
    mouseSensitivity: 0.00008, 
    perspective: 800,
    connectionDistance: 120,
    isPaused: false
};

const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
if (mediaQuery.matches) {
    config.isPaused = true;
    motionBtn.textContent = "Resume Motion";
    motionBtn.setAttribute('aria-pressed', 'true');
}

let links = [];
let points = [];
let width, height, cx, cy;
let mouseX = window.innerWidth / 2;
let mouseY = window.innerHeight / 2;
let isMouseOver = false;
let focusedPoint = null; 
let searchedPoint = null; 
let isSearchHovering = false; 
let currentRotX = 0;
let currentRotY = 0;

// --- Load Data ---
fetch('links.yaml')
    .then(response => response.text())
    .then(yamlText => {
        links = jsyaml.load(yamlText);
        init();
    })
    .catch(error => console.error('Error loading links.yaml:', error));

class Point {
    constructor(data, id, total) {
        this.data = data;
        const phi = Math.acos(1 - 2 * (id + 0.5) / total);
        const theta = Math.PI * (1 + Math.sqrt(5)) * (id + 0.5);
        this.x = config.sphereRadius * Math.sin(phi) * Math.cos(theta);
        this.y = config.sphereRadius * Math.sin(phi) * Math.sin(theta);
        this.z = config.sphereRadius * Math.cos(phi);
        this.screenX = 0;
        this.screenY = 0;
        this.alpha = 1;

        this.element = document.createElement('a');
        this.element.href = data.url;
        this.element.className = 'node-link';
        this.element.target = "_blank";
        this.element.setAttribute('aria-label', `Visit ${data.text}`);
        
        this.element.innerHTML = `
            <div class="node-dot"></div>
            <span class="node-text">${data.text}</span>
        `;

        this.element.addEventListener('focus', () => {
            focusedPoint = this;
            config.isPaused = true; 
        });

        this.element.addEventListener('blur', () => {
            focusedPoint = null;
            if (!mediaQuery.matches && motionBtn.innerText === "PAUSE MOTION") {
                config.isPaused = false;
            }
        });

        scene.appendChild(this.element);
    }

    rotate(angleX, angleY) {
        let cosY = Math.cos(angleY);
        let sinY = Math.sin(angleY);
        let x1 = this.x * cosY - this.z * sinY;
        let z1 = this.z * cosY + this.x * sinY;
        let cosX = Math.cos(angleX);
        let sinX = Math.sin(angleX);
        let y1 = this.y * cosX - z1 * sinX;
        let z2 = z1 * cosX + this.y * sinX;
        this.x = x1;
        this.y = y1;
        this.z = z2;
    }

    updateDOM() {
        const scale = config.perspective / (config.perspective - this.z);
        this.screenX = this.x * scale; 
        this.screenY = this.y * scale; 
        this.alpha = Math.max(0.2, (this.z + config.sphereRadius) / (2 * config.sphereRadius));

        this.element.style.transform = `translate3d(${this.screenX}px, ${this.screenY}px, 0) scale(${scale}) translate(-50%, -50%)`;
        this.element.style.opacity = this.alpha;
        this.element.style.zIndex = Math.floor(this.z + config.sphereRadius) + 100;
        
        const blurAmount = Math.max(0, (config.sphereRadius - this.z) / 80);
        this.element.style.filter = `blur(${blurAmount}px)`;
        this.element.style.visibility = 'visible';
    }
}

function init() {
    resize();
    points = links.map((link, i) => new Point(link, i, links.length));
    loop();
}

function resize() {
    width = canvas.width = window.innerWidth;
    height = canvas.height = window.innerHeight;
    cx = width / 2;
    cy = height / 2;
    const isPortrait = width < height;
    const multiplier = isPortrait ? 0.42 : 0.35;
    config.sphereRadius = Math.min(width, height) * multiplier;
    if (!isMouseOver) {
        mouseX = cx;
        mouseY = cy;
    }
}

function drawConnections() {
    ctx.clearRect(0, 0, width, height);
    ctx.save();
    ctx.translate(cx, cy);
    ctx.strokeStyle = 'rgba(212, 175, 55, 0.2)'; 
    ctx.lineWidth = 1;
    for (let i = 0; i < points.length; i++) {
        const p1 = points[i];
        if (p1.alpha < 0.3) continue; 
        for (let j = i + 1; j < points.length; j++) {
            const p2 = points[j];
            if (p2.alpha < 0.3) continue;
            const dx = p1.x - p2.x;
            const dy = p1.y - p2.y;
            const dz = p1.z - p2.z;
            const dist = Math.sqrt(dx*dx + dy*dy + dz*dz);
            if (dist < config.connectionDistance) {
                ctx.beginPath();
                ctx.moveTo(p1.screenX, p1.screenY);
                ctx.lineTo(p2.screenX, p2.screenY);
                ctx.stroke();
            }
        }
    }
    ctx.restore();
}

searchInput.addEventListener('mouseenter', () => { isSearchHovering = true; });
searchInput.addEventListener('mouseleave', () => { isSearchHovering = false; });
searchInput.addEventListener('touchstart', () => { isSearchHovering = true; }, {passive: true});
searchInput.addEventListener('touchend', () => { setTimeout(() => isSearchHovering = false, 5000); });

searchInput.addEventListener('input', (e) => {
    const val = e.target.value.toLowerCase().trim();
    points.forEach(p => p.element.classList.remove('is-searched'));
    searchedPoint = null;
    if (val.length >= 2) {
        const match = points.find(p => p.data.text.toLowerCase().includes(val));
        if (match) {
            searchedPoint = match;
            match.element.classList.add('is-searched');
        }
    }
});

function loop() {
    let targetRotX = 0;
    let targetRotY = 0;
    const activeTarget = focusedPoint || searchedPoint;
    if (activeTarget) {
        const k = 0.05; 
        targetRotY = Math.atan2(activeTarget.x, activeTarget.z) * k;
        targetRotX = Math.atan2(activeTarget.y, activeTarget.z) * k;
    } else if (isSearchHovering) {
        targetRotY = 0.005; 
        targetRotX = 0; 
    } else if (!config.isPaused) {
        if (isMouseOver) {
            targetRotY = (mouseX - cx) * config.mouseSensitivity;
            targetRotX = (mouseY - cy) * config.mouseSensitivity;
            let nearestDist = Infinity;
            points.forEach(p => {
                if (p.z > 0) { 
                    const dx = mouseX - (cx + p.screenX);
                    const dy = mouseY - (cy + p.screenY);
                    const d = Math.sqrt(dx*dx + dy*dy);
                    if (d < nearestDist) nearestDist = d;
                }
            });
            const brakeThreshold = 120;
            if (nearestDist < brakeThreshold) {
                const brakeFactor = Math.max(0.05, nearestDist / brakeThreshold);
                targetRotY *= brakeFactor;
                targetRotX *= brakeFactor;
            }
        } else {
            targetRotY = config.baseRotationSpeed;
        }
    }
    const smoothness = 0.05;
    currentRotX += (targetRotX - currentRotX) * smoothness;
    currentRotY += (targetRotY - currentRotY) * smoothness;
    points.forEach(p => {
        p.rotate(currentRotX, currentRotY);
        p.updateDOM();
    });
    drawConnections();
    requestAnimationFrame(loop);
}

window.addEventListener('resize', resize);
window.addEventListener('mousemove', e => { mouseX = e.clientX; mouseY = e.clientY; isMouseOver = true; });
window.addEventListener('mouseout', () => { isMouseOver = false; });
window.addEventListener('touchmove', e => { mouseX = e.touches[0].clientX; mouseY = e.touches[0].clientY; isMouseOver = true; }, {passive: true});
window.addEventListener('touchend', () => { isMouseOver = false; });

motionBtn.addEventListener('click', () => {
    config.isPaused = !config.isPaused;
    motionBtn.textContent = config.isPaused ? "Resume Motion" : "Pause Motion";
    motionBtn.setAttribute('aria-pressed', config.isPaused);
});

window.addEventListener('keydown', (e) => {
    if (e.key === 'Tab') {
        const interactiveElements = [searchInput, motionBtn, ...document.querySelectorAll('.node-link')];
        const first = interactiveElements[0];
        const last = interactiveElements[interactiveElements.length - 1];
        if (e.shiftKey) {
            if (document.activeElement === first) { e.preventDefault(); last.focus(); }
        } else {
            if (document.activeElement === last) { e.preventDefault(); first.focus(); }
        }
    }
});