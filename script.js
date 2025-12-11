const canvas = document.getElementById('connections');
const ctx = canvas.getContext('2d');
const scene = document.getElementById('scene-container');
const motionBtn = document.getElementById('toggle-motion');
const viewBtn = document.getElementById('toggle-view');
const searchInput = document.getElementById('search-input');
const listContainer = document.getElementById('list-container');
const projectListUl = document.getElementById('project-list');

// --- Preview Pane Elements ---
const previewSidebar = document.getElementById('preview-sidebar');
const previewFrame = document.getElementById('preview-frame');
const previewTitle = document.getElementById('preview-title');
const previewLink = document.getElementById('preview-link');
const closePreviewBtn = document.getElementById('close-preview');
const resizeHandle = document.getElementById('resize-handle');
let previewDebounceTimer = null;

// --- Configuration ---
const config = {
    sphereRadius: 280,
    baseRotationSpeed: 0.0002,
    mouseSensitivity: 0.000008, 
    perspective: 800,
    connectionDistance: 120,
    isPaused: false,
    viewMode: '3d' // '3d' or 'list'
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
let navigationIndex = -1; // For J/K Navigation

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
        this.id = id;
        
        // Sphere Math
        const phi = Math.acos(1 - 2 * (id + 0.5) / total);
        const theta = Math.PI * (1 + Math.sqrt(5)) * (id + 0.5);
        this.x = config.sphereRadius * Math.sin(phi) * Math.cos(theta);
        this.y = config.sphereRadius * Math.sin(phi) * Math.sin(theta);
        this.z = config.sphereRadius * Math.cos(phi);
        this.screenX = 0;
        this.screenY = 0;
        this.alpha = 1;

        // 3D DOM Element
        this.element = document.createElement('a');
        this.element.href = data.url;
        this.element.className = 'node-link';
        this.element.target = "_blank"; 
        
        this.element.innerHTML = `
            <div class="node-dot"></div>
            <span class="node-text">${data.text}</span>
        `;

        this.element.addEventListener('click', (e) => {
            e.preventDefault();
            selectProject(this);
        });

        scene.appendChild(this.element);

        // List DOM Element
        this.listItem = document.createElement('li');
        this.listItem.className = 'list-item';
        this.listItem.innerHTML = `
            <span class="list-item-text">${data.text}</span>
            <span class="list-item-arrow">OPEN &gt;</span>
        `;
        this.listItem.addEventListener('click', () => {
            selectProject(this);
        });
        projectListUl.appendChild(this.listItem);
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
        // Only update if in 3D mode
        if (config.viewMode !== '3d') return;

        const scale = config.perspective / (config.perspective - this.z);
        this.screenX = this.x * scale; 
        this.screenY = this.y * scale; 
        this.alpha = Math.max(0.1, (this.z + config.sphereRadius) / (2 * config.sphereRadius));

        this.element.style.transform = `translate3d(${this.screenX}px, ${this.screenY}px, 0) scale(${scale}) translate(-50%, -50%)`;
        this.element.style.opacity = this.alpha;
        this.element.style.zIndex = Math.floor(this.z + config.sphereRadius) + 100;
        
        // PERFORMANCE: Removed dynamic filter: blur(). 
        // We use Opacity and Scale for depth now.
    }
}

function init() {
    resize();
    points = links.map((link, i) => new Point(link, i, links.length));
    loop();
}

function selectProject(point) {
    // Universal Selection Logic (handles both 3D and List clicks)
    focusedPoint = point;
    navigationIndex = point.id;
    
    // Highlight in 3D
    points.forEach(p => p.element.classList.remove('is-active'));
    point.element.classList.add('is-active');

    // Highlight in List
    points.forEach(p => p.listItem.classList.remove('is-selected'));
    point.listItem.classList.add('is-selected');
    point.listItem.scrollIntoView({ behavior: 'smooth', block: 'center' });

    config.isPaused = true;
    motionBtn.textContent = "Resume Motion";
    loadPreviewNow(point.data);
}

// --- J / K Navigation ---
function navigate(direction) {
    if (points.length === 0) return;

    if (direction === 'next') {
        navigationIndex = (navigationIndex + 1) % points.length;
    } else {
        navigationIndex = (navigationIndex - 1 + points.length) % points.length;
    }

    const target = points[navigationIndex];
    selectProject(target);
}

// --- View Toggling ---
viewBtn.addEventListener('click', () => {
    if (config.viewMode === '3d') {
        config.viewMode = 'list';
        viewBtn.textContent = "Switch to Sphere";
        document.body.classList.add('hidden-3d');
        listContainer.classList.remove('hidden');
        listContainer.style.display = 'block';
    } else {
        config.viewMode = '3d';
        viewBtn.textContent = "Switch to List";
        document.body.classList.remove('hidden-3d');
        listContainer.classList.add('hidden');
        setTimeout(() => listContainer.style.display = 'none', 300);
        loop(); // Restart loop if it was paused effectively
    }
});

function resize() {
    width = canvas.width = window.innerWidth;
    height = canvas.height = window.innerHeight;
    cx = width / 2;
    cy = height / 2;
    const isPortrait = width < height;
    const multiplier = isPortrait ? 0.42 : 0.35;
    config.sphereRadius = Math.min(width, height) * multiplier;
}

function drawConnections() {
    if (config.viewMode !== '3d') return; // Skip in list mode

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

// --- Preview Logic ---
function loadPreviewNow(data) {
    previewTitle.textContent = data.text;
    previewLink.href = data.url;
    previewSidebar.classList.add('active');

    if (previewFrame.getAttribute('src') !== data.url) {
        previewFrame.classList.remove('loaded');
        previewFrame.src = data.url;
        previewFrame.onload = () => {
            previewFrame.classList.add('loaded');
        };
    }
}

function closePreview() {
    previewSidebar.classList.remove('active');
    setTimeout(() => {
        previewFrame.src = ''; 
        previewFrame.classList.remove('loaded');
    }, 500);
}

closePreviewBtn.addEventListener('click', closePreview);

// Close preview when clicking outside
window.addEventListener('click', (e) => {
    const isNode = e.target.closest('.node-link');
    const isList = e.target.closest('.list-item');
    const isSidebar = e.target.closest('#preview-sidebar');
    const isControl = e.target.closest('.controls');
    const isSearch = e.target.closest('.search-container');
    
    if (!isNode && !isSidebar && !isList && !isControl && !isSearch) {
        closePreview();
    }
});

// --- Resizable Sidebar Logic ---
let isResizing = false;

resizeHandle.addEventListener('mousedown', (e) => {
    isResizing = true;
    document.body.style.cursor = 'col-resize';
    e.preventDefault(); // Prevent text selection
});

window.addEventListener('mousemove', (e) => {
    if (!isResizing) return;
    // Calculate new width: Window Width - Mouse X
    let newWidth = window.innerWidth - e.clientX;
    // Constraints
    if (newWidth < 300) newWidth = 300;
    if (newWidth > window.innerWidth * 0.8) newWidth = window.innerWidth * 0.8;
    
    previewSidebar.style.width = `${newWidth}px`;
});

window.addEventListener('mouseup', () => {
    if (isResizing) {
        isResizing = false;
        document.body.style.cursor = '';
    }
});


// --- Loop ---
function loop() {
    if (config.viewMode !== '3d') {
        requestAnimationFrame(loop);
        return;
    }

    let targetRotX = 0;
    let targetRotY = 0;
    const activeTarget = focusedPoint || searchedPoint;
    
    if (activeTarget) {
        const k = 0.05; 
        targetRotY = Math.atan2(activeTarget.x, activeTarget.z) * k;
        targetRotX = Math.atan2(activeTarget.y, activeTarget.z) * k;
    } else if (!config.isPaused) {
        // Auto rotation
        if (isMouseOver) {
             // Gentle mouse influence
            targetRotY = (mouseX - cx) * config.mouseSensitivity;
            targetRotX = (mouseY - cy) * config.mouseSensitivity;
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

// --- Inputs ---
searchInput.addEventListener('input', (e) => {
    const val = e.target.value.toLowerCase().trim();
    points.forEach(p => p.element.classList.remove('is-active'));
    searchedPoint = null;
    if (val.length >= 2) {
        const match = points.find(p => p.data.text.toLowerCase().includes(val));
        if (match) {
            selectProject(match); // Auto select closest match
        }
    }
});

window.addEventListener('resize', resize);
window.addEventListener('mousemove', e => { mouseX = e.clientX; mouseY = e.clientY; isMouseOver = true; });
window.addEventListener('mouseout', () => { isMouseOver = false; });

motionBtn.addEventListener('click', () => {
    config.isPaused = !config.isPaused;
    motionBtn.textContent = config.isPaused ? "Resume Motion" : "Pause Motion";
    motionBtn.setAttribute('aria-pressed', config.isPaused);
});

// Keyboard Navigation
window.addEventListener('keydown', (e) => {
    if (e.target === searchInput) return; // Don't nav while typing

    if (e.key === 'j' || e.key === 'J') {
        navigate('next');
    } else if (e.key === 'k' || e.key === 'K') {
        navigate('prev');
    } else if (e.key === 'Escape') {
        closePreview();
    }
});
