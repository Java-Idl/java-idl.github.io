const canvas = document.getElementById('connections');
const ctx = canvas.getContext('2d');
const scene = document.getElementById('scene-container');

const chipSearch = document.getElementById('chip-search');
const chipMode = document.getElementById('chip-mode');
const chipMotion = document.getElementById('chip-motion');
const searchPopover = document.getElementById('search-popover');
const searchInput = document.getElementById('search-input');
const listSheet = document.getElementById('list-sheet');
const closeSheetBtn = document.getElementById('close-sheet');
const projectListUl = document.getElementById('project-list');
const statusLive = document.getElementById('status-live');
const mainPanel = document.getElementById('main-panel');
const appShell = document.getElementById('app-shell');

const previewSidebar = document.getElementById('preview-sidebar');
const previewFrame = document.getElementById('preview-frame');
const previewTitle = document.getElementById('preview-title');
const previewLink = document.getElementById('preview-link');
const closePreviewBtn = document.getElementById('close-preview');
const retryPreviewBtn = document.getElementById('retry-preview');
const fullscreenPreviewBtn = document.getElementById('fullscreen-preview');
const resizeHandle = document.getElementById('resize-handle');
const searchResizeHandle = document.getElementById('search-resize-handle');
const sheetResizeHandle = document.getElementById('sheet-resize-handle');
const previewContent = document.querySelector('.preview-content');

const config = {
    sphereRadius: 280,
    baseRotationSpeed: 0.0002,
    mouseSensitivity: 0.000008,
    perspective: 800,
    connectionDistanceSq: 120 * 120,
    targetFrameMs: 1000 / 45,
    isPaused: false
};

const state = {
    points: [],
    visiblePoints: [],
    focusedPoint: null,
    searchedPoint: null,
    navigationIndex: -1,
    currentRotX: 0,
    currentRotY: 0,
    lastFrameTime: 0,
    isMouseOver: false,
    mouseX: window.innerWidth / 2,
    mouseY: window.innerHeight / 2,
    width: 0,
    height: 0,
    cx: 0,
    cy: 0,
    loopId: null,
    liveTimer: null,
    lastNavAt: 0,
    pendingResizeFrame: 0,
    needsRender: true,
    isResizing: false,
    isSearchResizing: false,
    isSheetResizing: false,
    lastResizeEndedAt: 0,
    isSearchOpen: false,
    isSheetOpen: false,
    searchWidth: 360,
    sheetHeight: 360,
    previewRequestId: 0,
    previewTimeoutId: null,
    currentPreviewUrl: ''
};

const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
if (mediaQuery.matches) {
    config.isPaused = true;
}

updateMotionChipUI();
updateSheetChipUI();
updateSearchChipUI();

fetch('links.yaml')
    .then(response => response.text())
    .then(text => {
        const loaded = jsyaml.load(text);
        if (!Array.isArray(loaded)) throw new Error('links.yaml must be an array');
        init(loaded);
    })
    .catch(error => {
        console.error('Error loading links.yaml:', error);
        announceStatus('Failed to load project list.');
    });

class Point {
    constructor(data, id, total) {
        this.id = id;
        this.text = `${data?.text || 'Untitled Project'}`;
        this.url = `${data?.url || ''}`;
        this.safeUrl = normalizeSafeUrl(this.url);

        const phi = Math.acos(1 - 2 * (id + 0.5) / total);
        const theta = Math.PI * (1 + Math.sqrt(5)) * (id + 0.5);

        this.x = config.sphereRadius * Math.sin(phi) * Math.cos(theta);
        this.y = config.sphereRadius * Math.sin(phi) * Math.sin(theta);
        this.z = config.sphereRadius * Math.cos(phi);
        this.screenX = 0;
        this.screenY = 0;
        this.alpha = 1;
        this.hidden = false;

        this.element = document.createElement('a');
        this.element.className = 'node-link';
        this.element.href = this.safeUrl || '#';
        this.element.target = '_blank';
        this.element.rel = 'noopener noreferrer';
        this.element.setAttribute('aria-label', `Open project: ${this.text}`);

        const dot = document.createElement('div');
        dot.className = 'node-dot';
        const label = document.createElement('span');
        label.className = 'node-text';
        label.textContent = this.text;
        this.element.appendChild(dot);
        this.element.appendChild(label);

        this.element.addEventListener('click', event => {
            event.preventDefault();
            selectPoint(this, true);
        });

        scene.appendChild(this.element);

        this.listItem = document.createElement('li');
        this.listItem.className = 'list-item';
        this.listItem.setAttribute('role', 'button');
        this.listItem.setAttribute('tabindex', '0');

        const listText = document.createElement('span');
        listText.className = 'list-item-text';
        listText.textContent = this.text;

        const listArrow = document.createElement('span');
        listArrow.className = 'list-item-arrow';
        listArrow.textContent = 'OPEN >';

        this.listItem.appendChild(listText);
        this.listItem.appendChild(listArrow);

        this.listItem.addEventListener('click', () => selectPoint(this, true));
        this.listItem.addEventListener('keydown', event => {
            if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                selectPoint(this, true);
            }
        });

        projectListUl.appendChild(this.listItem);
    }

    rotate(angleX, angleY) {
        const cosY = Math.cos(angleY);
        const sinY = Math.sin(angleY);
        const x1 = this.x * cosY - this.z * sinY;
        const z1 = this.z * cosY + this.x * sinY;

        const cosX = Math.cos(angleX);
        const sinX = Math.sin(angleX);
        const y1 = this.y * cosX - z1 * sinX;
        const z2 = z1 * cosX + this.y * sinX;

        this.x = x1;
        this.y = y1;
        this.z = z2;
    }

    updateDOM() {
        this.element.style.display = 'flex';

        const scale = config.perspective / (config.perspective - this.z);
        this.screenX = this.x * scale;
        this.screenY = this.y * scale;
        this.alpha = Math.max(0.1, (this.z + config.sphereRadius) / (2 * config.sphereRadius));

        this.element.style.transform = `translate3d(${this.screenX}px, ${this.screenY}px, 0) scale(${scale}) translate(-50%, -50%)`;
        this.element.style.opacity = this.alpha;
        this.element.style.zIndex = Math.floor(this.z + config.sphereRadius) + 100;
    }
}

function normalizeSafeUrl(rawUrl) {
    if (!rawUrl || typeof rawUrl !== 'string') return null;
    try {
        const parsed = new URL(rawUrl, window.location.href);
        if (parsed.protocol === 'http:' || parsed.protocol === 'https:') return parsed.href;
        return null;
    } catch {
        return null;
    }
}

function announceStatus(message) {
    if (!statusLive) return;
    clearTimeout(state.liveTimer);
    state.liveTimer = setTimeout(() => {
        statusLive.textContent = message;
    }, 40);
}

function markNeedsRender() {
    state.needsRender = true;
}

function init(links) {
    state.points = links.map((link, index) => new Point(link, index, links.length));
    state.visiblePoints = [...state.points];
    resizeSphere();
    applyFilter('');
    markNeedsRender();
    startLoop();
}

function updateSearchChipUI() {
    chipSearch.setAttribute('aria-expanded', String(state.isSearchOpen));
}

function updateSheetChipUI() {
    chipMode.setAttribute('aria-pressed', String(state.isSheetOpen));
}

function updateMotionChipUI() {
    chipMotion.textContent = config.isPaused ? 'RESUME' : 'PAUSE';
    chipMotion.setAttribute('aria-pressed', String(config.isPaused));
}

function beginResizeSession(cursor, className) {
    document.body.style.cursor = cursor;
    document.body.style.userSelect = 'none';
    document.body.classList.add('dragging-resize', className);
}

function endResizeSession() {
    let didResize = false;

    if (state.isResizing) {
        state.isResizing = false;
        didResize = true;
    }

    if (state.isSearchResizing) {
        state.isSearchResizing = false;
        didResize = true;
    }

    if (state.isSheetResizing) {
        state.isSheetResizing = false;
        didResize = true;
    }

    if (!didResize) return;

    document.body.style.cursor = '';
    document.body.style.userSelect = '';
    document.body.classList.remove('dragging-resize', 'resizing-preview', 'resizing-search', 'resizing-sheet');
    state.lastResizeEndedAt = performance.now();
    scheduleSphereResize();
    markNeedsRender();
}

function setSearchWidth(width) {
    const minWidth = 240;
    const maxWidth = Math.floor(window.innerWidth * 0.8);
    state.searchWidth = Math.max(minWidth, Math.min(maxWidth, width));
    appShell.style.setProperty('--search-width', `${state.searchWidth}px`);
}

function setSheetHeight(height) {
    const minHeight = 220;
    const maxHeight = Math.floor(window.innerHeight * 0.8);
    state.sheetHeight = Math.max(minHeight, Math.min(maxHeight, height));
    appShell.style.setProperty('--sheet-height', `${state.sheetHeight}px`);
}

function openSearchPopover() {
    state.isSearchOpen = true;
    searchPopover.classList.add('active');
    searchPopover.setAttribute('aria-hidden', 'false');
    updateSearchChipUI();
    searchInput.focus();
}

function closeSearchPopover() {
    state.isSearchOpen = false;
    searchPopover.classList.remove('active');
    searchPopover.setAttribute('aria-hidden', 'true');
    updateSearchChipUI();
}

function toggleSearchPopover() {
    if (state.isSearchOpen) {
        closeSearchPopover();
    } else {
        openSearchPopover();
    }
}

function openSheet() {
    state.isSheetOpen = true;
    listSheet.classList.add('active');
    listSheet.setAttribute('aria-hidden', 'false');
    updateSheetChipUI();
}

function closeSheet() {
    state.isSheetOpen = false;
    listSheet.classList.remove('active');
    listSheet.setAttribute('aria-hidden', 'true');
    updateSheetChipUI();
}

function toggleSheet() {
    if (state.isSheetOpen) {
        closeSheet();
    } else {
        openSheet();
    }
}

function setActiveStyles(activePoint) {
    state.points.forEach(point => {
        point.element.classList.toggle('is-active', point === activePoint);
        point.listItem.classList.toggle('is-selected', point === activePoint);
    });
}

function setMatchStyles(matchValue) {
    const query = (matchValue || '').toLowerCase().trim();
    const canMatch = query.length >= 2;

    state.points.forEach(point => {
        const matched = canMatch && point.text.toLowerCase().includes(query);
        point.element.classList.toggle('is-match', matched);
    });
}

function selectPoint(point, openPreview) {
    if (!point) return;

    state.focusedPoint = point;
    state.navigationIndex = state.visiblePoints.indexOf(point);
    setActiveStyles(point);
    markNeedsRender();

    if (state.isSheetOpen) {
        point.listItem.scrollIntoView({ behavior: 'auto', block: 'nearest' });
    }

    config.isPaused = true;
    updateMotionChipUI();

    if (openPreview) {
        openPreviewFor(point);
    } else {
        announceStatus(`Selected ${point.text}. Press Enter to open.`);
    }
}

function clearSelection() {
    state.focusedPoint = null;
    state.searchedPoint = null;
    state.navigationIndex = -1;
    if (!searchInput.value) {
        setMatchStyles('');
    }
    setActiveStyles(null);
    markNeedsRender();
}

function applyFilter(rawValue) {
    const value = rawValue.toLowerCase().trim();
    setMatchStyles(value);
    state.visiblePoints = [];

    state.points.forEach(point => {
        const visible = value.length === 0 || point.text.toLowerCase().includes(value);
        point.hidden = !visible;
        point.listItem.classList.toggle('is-hidden', !visible);
        if (visible) {
            state.visiblePoints.push(point);
        }
    });

    if (state.visiblePoints.length === 0) {
        state.searchedPoint = null;
        if (!state.focusedPoint) {
            setActiveStyles(null);
        }
        announceStatus('No matching projects.');
        markNeedsRender();
        return;
    }

    if (value.length === 0) {
        state.searchedPoint = null;
        if (state.focusedPoint) {
            setActiveStyles(state.focusedPoint);
            state.navigationIndex = state.visiblePoints.indexOf(state.focusedPoint);
        } else {
            setActiveStyles(null);
        }
        markNeedsRender();
        return;
    }

    if (state.focusedPoint && !state.focusedPoint.hidden) {
        state.navigationIndex = state.visiblePoints.indexOf(state.focusedPoint);
        setActiveStyles(state.focusedPoint);
        markNeedsRender();
        return;
    }

    if (value.length >= 2) {
        state.searchedPoint = state.visiblePoints[0];
        setActiveStyles(state.searchedPoint);
        announceStatus(`Search matched ${state.searchedPoint.text}. Press Enter to open.`);
        markNeedsRender();
    }
}

function navigate(direction) {
    if (state.visiblePoints.length === 0) return;

    if (state.focusedPoint && !state.focusedPoint.hidden) {
        const focusedIndex = state.visiblePoints.indexOf(state.focusedPoint);
        if (focusedIndex >= 0) {
            state.navigationIndex = focusedIndex;
        }
    }

    if (state.navigationIndex < 0) {
        state.navigationIndex = 0;
    } else if (direction === 'next') {
        state.navigationIndex = (state.navigationIndex + 1) % state.visiblePoints.length;
    } else {
        state.navigationIndex = (state.navigationIndex - 1 + state.visiblePoints.length) % state.visiblePoints.length;
    }

    const target = state.visiblePoints[state.navigationIndex];
    selectPoint(target, false);
}

function resizeSphere() {
    const rect = canvas.getBoundingClientRect();
    const width = Math.max(1, Math.floor(rect.width));
    const height = Math.max(1, Math.floor(rect.height));

    state.width = canvas.width = width;
    state.height = canvas.height = height;
    state.cx = width / 2;
    state.cy = height / 2;

    const minDim = Math.min(width, height);
    config.sphereRadius = minDim * 0.36;
}

function scheduleSphereResize() {
    if (state.pendingResizeFrame) return;
    state.pendingResizeFrame = requestAnimationFrame(() => {
        state.pendingResizeFrame = 0;
        resizeSphere();
        markNeedsRender();
    });
}

function drawConnections() {
    if (state.points.length < 2) {
        ctx.clearRect(0, 0, state.width, state.height);
        return;
    }

    ctx.clearRect(0, 0, state.width, state.height);
    ctx.save();
    ctx.translate(state.cx, state.cy);
    ctx.strokeStyle = 'rgba(212, 175, 55, 0.2)';
    ctx.lineWidth = 1;

    const pts = state.points;
    for (let i = 0; i < pts.length; i++) {
        const p1 = pts[i];
        if (p1.alpha < 0.3) continue;

        for (let j = i + 1; j < pts.length; j++) {
            const p2 = pts[j];
            if (p2.alpha < 0.3) continue;

            const dx = p1.x - p2.x;
            const dy = p1.y - p2.y;
            const dz = p1.z - p2.z;
            const distSq = dx * dx + dy * dy + dz * dz;

            if (distSq < config.connectionDistanceSq) {
                ctx.beginPath();
                ctx.moveTo(p1.screenX, p1.screenY);
                ctx.lineTo(p2.screenX, p2.screenY);
                ctx.stroke();
            }
        }
    }

    ctx.restore();
}

function loop(timestamp = 0) {
    if (document.hidden) {
        state.loopId = null;
        return;
    }

    const elapsed = timestamp - state.lastFrameTime;
    if (state.lastFrameTime !== 0 && elapsed < config.targetFrameMs) {
        state.loopId = requestAnimationFrame(loop);
        return;
    }
    state.lastFrameTime = timestamp;

    let targetRotX = 0;
    let targetRotY = 0;

    const activeTarget = state.focusedPoint || state.searchedPoint;
    const hasMotionDriver = Boolean(activeTarget) || !config.isPaused;

    if (!hasMotionDriver && !state.needsRender) {
        state.loopId = requestAnimationFrame(loop);
        return;
    }

    if (activeTarget) {
        const k = 0.05;
        targetRotY = Math.atan2(activeTarget.x, activeTarget.z) * k;
        targetRotX = Math.atan2(activeTarget.y, activeTarget.z) * k;
    } else if (!config.isPaused) {
        if (state.isMouseOver) {
            targetRotY = (state.mouseX - state.cx) * config.mouseSensitivity;
            targetRotX = (state.mouseY - state.cy) * config.mouseSensitivity;
        } else {
            targetRotY = config.baseRotationSpeed;
        }
    }

    state.currentRotX += (targetRotX - state.currentRotX) * 0.05;
    state.currentRotY += (targetRotY - state.currentRotY) * 0.05;

    state.points.forEach(point => {
        point.rotate(state.currentRotX, state.currentRotY);
        point.updateDOM();
    });

    drawConnections();
    state.needsRender = false;
    state.loopId = requestAnimationFrame(loop);
}

function startLoop() {
    if (document.hidden) return;
    if (!state.loopId) loop();
}

function stopLoop() {
    if (state.loopId) {
        cancelAnimationFrame(state.loopId);
        state.loopId = null;
    }
    state.lastFrameTime = 0;
}

function setPreviewState(value) {
    previewContent.classList.remove('is-loading', 'is-loaded', 'is-error');
    previewContent.classList.add(`is-${value}`);
}

function openPreviewFor(point) {
    previewTitle.textContent = point.text;

    if (!point.safeUrl) {
        previewLink.href = '#';
        previewLink.classList.add('is-disabled');
        previewLink.setAttribute('aria-disabled', 'true');
        mainPanel.classList.add('preview-open');
        setPreviewState('error');
        previewFrame.src = 'about:blank';
        state.currentPreviewUrl = '';
        announceStatus(`Cannot open ${point.text}. Invalid URL.`);
        scheduleSphereResize();
        return;
    }

    previewLink.href = point.safeUrl;
    previewLink.rel = 'noopener noreferrer';
    previewLink.classList.remove('is-disabled');
    previewLink.removeAttribute('aria-disabled');

    mainPanel.classList.add('preview-open');
    scheduleSphereResize();

    if (state.currentPreviewUrl === point.safeUrl && previewFrame.getAttribute('src') === point.safeUrl) {
        setPreviewState('loaded');
        announceStatus(`Opened ${point.text}.`);
        return;
    }

    const requestId = ++state.previewRequestId;
    clearTimeout(state.previewTimeoutId);
    state.currentPreviewUrl = point.safeUrl;
    setPreviewState('loading');

    previewFrame.onload = () => {
        if (requestId !== state.previewRequestId) return;
        clearTimeout(state.previewTimeoutId);
        setPreviewState('loaded');
        announceStatus(`Opened ${point.text}.`);
        try {
            previewFrame.contentWindow.focus();
        } catch {
            console.log('Cannot focus iframe from different origin');
        }
    };

    previewFrame.onerror = () => {
        if (requestId !== state.previewRequestId) return;
        clearTimeout(state.previewTimeoutId);
        setPreviewState('error');
        announceStatus(`Failed to load ${point.text}.`);
    };

    state.previewTimeoutId = setTimeout(() => {
        if (requestId !== state.previewRequestId) return;
        if (!previewContent.classList.contains('is-loaded')) {
            setPreviewState('error');
            announceStatus(`Loading ${point.text} timed out.`);
        }
    }, 12000);

    previewFrame.src = point.safeUrl;
}

function retryPreview() {
    const target = state.focusedPoint || state.searchedPoint;
    if (!target) {
        announceStatus('No project selected to retry.');
        return;
    }
    openPreviewFor(target);
}

async function togglePreviewFullscreen() {
    try {
        if (document.fullscreenElement === previewSidebar) {
            await document.exitFullscreen();
        } else {
            await previewSidebar.requestFullscreen();
        }
    } catch {
        announceStatus('Fullscreen is not available for preview.');
    }
    updateFullscreenButtonUI();
}

function updateFullscreenButtonUI() {
    const isFull = document.fullscreenElement === previewSidebar;
    fullscreenPreviewBtn.textContent = isFull ? 'EXIT FULL' : 'FULLSCREEN';
    fullscreenPreviewBtn.setAttribute('aria-pressed', String(isFull));
}

function closePreview() {
    state.previewRequestId += 1;
    clearTimeout(state.previewTimeoutId);
    mainPanel.classList.remove('preview-open');
    setPreviewState('loading');
    previewFrame.src = 'about:blank';
    state.currentPreviewUrl = '';
    if (document.fullscreenElement === previewSidebar) {
        document.exitFullscreen().catch(() => { });
    }
    scheduleSphereResize();
}

function clearSelectionAndResume() {
    clearSelection();
    if (!mediaQuery.matches) {
        config.isPaused = false;
        updateMotionChipUI();
    }
    closePreview();
}

function closePreviewByShortcut(fullDeselect = false) {
    if (mainPanel.classList.contains('preview-open')) {
        if (fullDeselect) {
            clearSelectionAndResume();
        } else {
            closePreview();
        }
        announceStatus('Closed preview.');
        return true;
    }

    if (fullDeselect && state.focusedPoint) {
        clearSelectionAndResume();
        announceStatus('Selection cleared.');
        return true;
    }

    return false;
}

chipSearch.addEventListener('click', () => {
    toggleSearchPopover();
});

chipMode.addEventListener('click', () => {
    toggleSheet();
});

chipMotion.addEventListener('click', () => {
    config.isPaused = !config.isPaused;
    updateMotionChipUI();
    announceStatus(config.isPaused ? 'Motion paused.' : 'Motion resumed.');
    markNeedsRender();
});

closeSheetBtn.addEventListener('click', () => {
    closeSheet();
});

searchInput.addEventListener('input', event => {
    applyFilter(event.target.value || '');
});

closePreviewBtn.addEventListener('click', () => {
    closePreviewByShortcut(true);
});

retryPreviewBtn.addEventListener('click', () => {
    retryPreview();
});

fullscreenPreviewBtn.addEventListener('click', () => {
    togglePreviewFullscreen();
});

previewLink.addEventListener('click', event => {
    if (previewLink.classList.contains('is-disabled')) {
        event.preventDefault();
    }
});

resizeHandle.addEventListener('mousedown', event => {
    if (!mainPanel.classList.contains('preview-open')) return;
    if (window.matchMedia('(max-width: 980px)').matches) return;
    state.isResizing = true;
    beginResizeSession('col-resize', 'resizing-preview');
    event.preventDefault();
    event.stopPropagation();
});

searchResizeHandle.addEventListener('mousedown', event => {
    if (!state.isSearchOpen) return;
    if (window.matchMedia('(max-width: 980px)').matches) return;
    state.isSearchResizing = true;
    beginResizeSession('nwse-resize', 'resizing-search');
    event.preventDefault();
    event.stopPropagation();
});

sheetResizeHandle.addEventListener('mousedown', event => {
    if (!state.isSheetOpen) return;
    if (window.matchMedia('(max-width: 980px)').matches) return;
    state.isSheetResizing = true;
    beginResizeSession('ns-resize', 'resizing-sheet');
    event.preventDefault();
    event.stopPropagation();
});

window.addEventListener('resize', () => {
    setSearchWidth(state.searchWidth);
    setSheetHeight(state.sheetHeight);
    scheduleSphereResize();
});

window.addEventListener('mousemove', event => {
    state.mouseX = event.clientX;
    state.mouseY = event.clientY;
    state.isMouseOver = true;

    if (state.isResizing) {
        const rect = mainPanel.getBoundingClientRect();
        const availableWidth = Math.max(1, rect.width);
        const minWidth = 320;
        const maxWidth = Math.max(minWidth, Math.floor(availableWidth * 0.82));
        let next = rect.right - event.clientX;

        if (next < minWidth) next = minWidth;
        if (next > maxWidth) next = maxWidth;

        mainPanel.style.setProperty('--preview-width', `${next}px`);
        scheduleSphereResize();
    }

    if (state.isSearchResizing) {
        const popRect = searchPopover.getBoundingClientRect();
        const nextWidth = popRect.right - event.clientX;
        setSearchWidth(nextWidth);
    }

    if (state.isSheetResizing) {
        const sheetRect = listSheet.getBoundingClientRect();
        const nextHeight = sheetRect.bottom - event.clientY;
        setSheetHeight(nextHeight);
    }
});

window.addEventListener('mouseup', () => {
    endResizeSession();
});

window.addEventListener('blur', () => {
    endResizeSession();
});

window.addEventListener('mouseleave', () => {
    endResizeSession();
});

window.addEventListener('mouseout', () => {
    state.isMouseOver = false;
});

document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
        stopLoop();
    } else {
        startLoop();
    }
});

window.addEventListener('keydown', event => {
    const closeKey = event.key === 'Escape' || event.key === 'q' || event.key === 'Q' || event.key === 'x' || event.key === 'X';
    const nextNavKey = event.key === 'j' || event.key === 'J' || event.key === 'd' || event.key === 'D' || event.key === 'ArrowDown' || event.key === 'ArrowRight';
    const prevNavKey = event.key === 'k' || event.key === 'K' || event.key === 'a' || event.key === 'A' || event.key === 'ArrowUp' || event.key === 'ArrowLeft';

    if (event.repeat && (nextNavKey || prevNavKey)) {
        const now = performance.now();
        if (now - state.lastNavAt < 120) {
            event.preventDefault();
            return;
        }
        state.lastNavAt = now;
    }

    if (event.target === searchInput) {
        if (event.key === 'Enter') {
            event.preventDefault();
            const target = state.focusedPoint || state.searchedPoint;
            if (target) {
                openPreviewFor(target);
            }
        }

        if (event.key === 'Escape') {
            searchInput.value = '';
            searchInput.blur();
            applyFilter('');
            closeSearchPopover();
            if (!closePreviewByShortcut()) {
                announceStatus('Search cleared.');
            }
        }
        return;
    }

    if (closeKey) {
        closeSearchPopover();
        closeSheet();
        if (closePreviewByShortcut(true)) {
            event.preventDefault();
            return;
        }
    }

    if (nextNavKey) {
        event.preventDefault();
        navigate('next');
    } else if (prevNavKey) {
        event.preventDefault();
        navigate('prev');
    } else if (event.key === 'Enter') {
        const target = state.focusedPoint || state.searchedPoint;
        if (target) {
            event.preventDefault();
            openPreviewFor(target);
        }
    } else if (event.key === '/') {
        event.preventDefault();
        openSearchPopover();
    }
});

window.addEventListener('click', event => {
    if (performance.now() - state.lastResizeEndedAt < 180) {
        return;
    }

    const isNode = event.target.closest('.node-link');
    const isList = event.target.closest('.list-item');
    const isSidebar = event.target.closest('#preview-sidebar');
    const isHud = event.target.closest('#hud-layer');
    const isSearch = event.target.closest('#search-popover');
    const isSheet = event.target.closest('#list-sheet');

    if (!isNode && !isSidebar && !isList && !isHud && !isSearch && !isSheet) {
        closeSearchPopover();
        closeSheet();
        closePreviewByShortcut(true);
    }
});

document.addEventListener('fullscreenchange', () => {
    updateFullscreenButtonUI();
    scheduleSphereResize();
    markNeedsRender();
});

setPreviewState('loading');
updateFullscreenButtonUI();
setSearchWidth(state.searchWidth);
setSheetHeight(state.sheetHeight);
