import { SphereEngine, normalizeSafeUrl } from "./sphere-engine.js";

let projects = [];

// Shared inline-markdown renderer (bold + links)
function applyInlineMarkdown(text) {
  return text
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\[(.*?)\]\((.*?)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
}

function parseMarkdown(md, headingOffset = 0) {
  const lines = md.split('\n');
  let html = '';
  let inList = false;

  for (let line of lines) {
    line = line.trim();
    if (!line) {
      if (inList) { html += '</ul>\n'; inList = false; }
      continue;
    }
    if (line === '---') {
      if (inList) { html += '</ul>\n'; inList = false; }
      html += '<hr>\n';
      continue;
    }
    const headingMatch = line.match(/^(#{1,6})\s+(.*)$/);
    if (headingMatch) {
      if (inList) { html += '</ul>\n'; inList = false; }
      const level = headingMatch[1].length;
      const hLevel = Math.min(6, level + headingOffset);
      html += `<h${hLevel}>${headingMatch[2]}</h${hLevel}>\n`;
      continue;
    }
    const listMatch = line.match(/^[\-\*]\s+(.*)$/);
    if (listMatch) {
      if (!inList) { html += '<ul>\n'; inList = true; }
      html += `  <li>${applyInlineMarkdown(listMatch[1])}</li>\n`;
      continue;
    }
    if (inList) { html += '</ul>\n'; inList = false; }
    html += `<p>${applyInlineMarkdown(line)}</p>\n`;
  }
  if (inList) html += '</ul>\n';
  return html;
}

// Local storage key for onboarding
const ONBOARD_STORAGE_KEY = "orbit-onboard-seen";

// State
let activeProject = null; // Currently opened project in preview
let hoveredProjectId = null;
let isListOpen = false;
let isAboutOpen = false;
let timeoutId = null;
let activeFocusTrapCleanup = null;
let lastActiveElement = null;

// DOM Elements
const appEl = document.getElementById("app");
const btnListToggle = document.getElementById("btn-list-toggle");
const btnAboutToggle = document.getElementById("btn-about-toggle");

const onboardHintEl = document.getElementById("onboard-hint");
const btnOnboardDismiss = document.getElementById("btn-onboard-dismiss");

const listSheetEl = document.getElementById("list-sheet");
const listTitleEl = document.getElementById("list-title");
const listSearchInput = document.getElementById("list-search");
const btnListClose = document.getElementById("btn-list-close");
const listGridEl = document.getElementById("list-grid");
const srAnnouncerEl = document.getElementById("sr-announcer");

const previewPanelEl = document.getElementById("preview-panel");
const previewTitleEl = document.getElementById("preview-title");
const btnPreviewRetry = document.getElementById("btn-preview-retry");
const btnPreviewFullscreen = document.getElementById("btn-preview-fullscreen");
const btnPreviewOpenFull = document.getElementById("btn-preview-open-full");
const btnPreviewClose = document.getElementById("btn-preview-close");
const previewFrame = document.getElementById("preview-frame");
const previewContentWrapper = document.getElementById("preview-content-wrapper");
const previewStatusText = document.getElementById("preview-status-text");
const previewStatusBar = document.getElementById("preview-status-bar");

const aboutPanelEl = document.getElementById("about-panel");
const btnAboutClose = document.getElementById("btn-about-close");

// Focus Trap Utility
function enableFocusTrap(container) {
  if (activeFocusTrapCleanup) activeFocusTrapCleanup();

  const selectors = 'a[href], button:not([disabled]), iframe, textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

  const handleKeyDown = (e) => {
    if (e.key !== "Tab") return;

    const focusables = Array.from(container.querySelectorAll(selectors));
    if (focusables.length === 0) return;

    const first = focusables[0];
    const last = focusables[focusables.length - 1];

    if (e.shiftKey) {
      if (document.activeElement === first) {
        last.focus();
        e.preventDefault();
      }
    } else {
      if (document.activeElement === last) {
        first.focus();
        e.preventDefault();
      }
    }
  };

  container.addEventListener("keydown", handleKeyDown);
  activeFocusTrapCleanup = () => {
    container.removeEventListener("keydown", handleKeyDown);
    activeFocusTrapCleanup = null;
  };
}

function disableFocusTrap() {
  if (activeFocusTrapCleanup) {
    activeFocusTrapCleanup();
  }
}

function restoreFocus() {
  if (lastActiveElement && typeof lastActiveElement.focus === "function") {
    lastActiveElement.focus();
  }
  lastActiveElement = null;
}

// Read CSS connection color
const connectionColor = getComputedStyle(document.documentElement)
  .getPropertyValue("--accent-subtle")
  .trim() || undefined;

let sphere = null;

// Update shell class list based on open panels
function updateShellState() {
  // Reset open panel classes
  appEl.classList.remove("shell--panel-open", "shell--preview-open", "shell--about-open", "shell--list-open");

  if (activeProject) {
    appEl.classList.add("shell--panel-open", "shell--preview-open");
  } else if (isAboutOpen) {
    appEl.classList.add("shell--panel-open", "shell--about-open");
  }

  if (isListOpen) {
    appEl.classList.add("shell--list-open");
  }

  // Update button attributes
  btnListToggle.setAttribute("aria-pressed", isListOpen);
  btnListToggle.textContent = isListOpen ? "CLOSE LIST" : "LIST";
  btnAboutToggle.setAttribute("aria-pressed", isAboutOpen);
}

// Select a project and load it in the iframe preview
function handleSelectProject(project) {
  if (!lastActiveElement) {
    lastActiveElement = document.activeElement;
  }
  activeProject = project;
  isListOpen = false;
  isAboutOpen = false;

  // Render project text
  previewTitleEl.textContent = project.text;
  previewTitleEl.title = project.text;

  // Set panel visible
  previewPanelEl.classList.remove("hidden");
  aboutPanelEl.classList.add("hidden");
  listSheetEl.classList.add("hidden");

  updateShellState();
  dismissOnboarding();

  // Load preview iframe
  loadIframe(project.safeUrl);
  sphere.setActive(project.id);

  // Focus close button inside panel
  setTimeout(() => {
    btnPreviewClose.focus();
    enableFocusTrap(previewPanelEl);
  }, 50);
}

// Load iframe source and handle status updates
function loadIframe(url) {
  if (timeoutId) clearTimeout(timeoutId);

  if (!url) {
    setPreviewLoadState("error", "No URL available for this project");
    btnPreviewRetry.disabled = true;
    return;
  }

  btnPreviewRetry.disabled = false;
  setPreviewLoadState("loading", "ESTABLISHING LINK...");
  btnPreviewOpenFull.href = url;
  btnPreviewOpenFull.classList.remove("is-disabled");
  btnPreviewOpenFull.removeAttribute("aria-disabled");

  previewFrame.src = url;

  // Fail-safe load timeout
  timeoutId = setTimeout(() => {
    if (previewContentWrapper.classList.contains("state-loading")) {
      setPreviewLoadState("error", "Unable to load preview. Try OPEN FULL.");
    }
  }, 6000);
}

function setPreviewLoadState(state, message = "") {
  previewContentWrapper.className = `panel-content state-${state}`;
  previewStatusText.textContent = message;

  // Setup loading bar class
  previewStatusBar.className = `status-bar ${state}`;
}

// Iframe onload handler
previewFrame.addEventListener("load", () => {
  if (timeoutId) clearTimeout(timeoutId);
  setPreviewLoadState("loaded");
});

previewFrame.addEventListener("error", () => {
  if (timeoutId) clearTimeout(timeoutId);
  setPreviewLoadState("error", "Unable to load preview. Try OPEN FULL.");
});

// Fullscreen API implementation
async function toggleFullscreen() {
  try {
    const isFullscreen = document.fullscreenElement === previewPanelEl;
    if (isFullscreen) {
      await document.exitFullscreen();
    } else {
      await previewPanelEl.requestFullscreen();
    }
  } catch (err) {
    console.error("Fullscreen toggle failed", err);
  }
}

// Listen to fullscreen changes to update layout buttons
document.addEventListener("fullscreenchange", () => {
  const isFullscreen = document.fullscreenElement === previewPanelEl;
  btnPreviewFullscreen.setAttribute("aria-pressed", isFullscreen);
  btnPreviewFullscreen.textContent = isFullscreen ? "EXIT FULL" : "FULLSCREEN";
});

// Close Preview Panel
function closePreviewPanel() {
  if (timeoutId) clearTimeout(timeoutId);
  activeProject = null;
  previewPanelEl.classList.add("hidden");
  previewFrame.src = "";

  updateShellState();
  sphere.setActive(null);
  disableFocusTrap();
  restoreFocus();
}

// Open About Panel
function openAboutPanel() {
  if (!lastActiveElement) {
    lastActiveElement = document.activeElement;
  }
  activeProject = null;
  isAboutOpen = true;
  isListOpen = false;

  aboutPanelEl.classList.remove("hidden");
  previewPanelEl.classList.add("hidden");
  listSheetEl.classList.add("hidden");

  updateShellState();
  sphere.setActive(null);

  setTimeout(() => {
    btnAboutClose.focus();
    enableFocusTrap(aboutPanelEl);
  }, 50);
}

// Close About Panel
function closeAboutPanel() {
  isAboutOpen = false;
  aboutPanelEl.classList.add("hidden");
  updateShellState();
  disableFocusTrap();
  restoreFocus();
}

// Close List Sheet
function closeListSheet() {
  isListOpen = false;
  listSheetEl.classList.add("hidden");
  updateShellState();
  disableFocusTrap();
  restoreFocus();
}

// Toggle List Sheet
function toggleListSheet() {
  isListOpen = !isListOpen;
  if (isListOpen) {
    if (!lastActiveElement) {
      lastActiveElement = document.activeElement;
    }
    isAboutOpen = false;
    listSheetEl.classList.remove("hidden");

    // Focus search input
    setTimeout(() => {
      listSearchInput.focus();
      enableFocusTrap(listSheetEl);
    }, 50);
  } else {
    closeListSheet();
    return; // updateShellState already called inside closeListSheet
  }
  updateShellState();
}

// Onboarding Hints Overlay
function initOnboarding() {
  const seen = localStorage.getItem(ONBOARD_STORAGE_KEY);
  if (!seen) {
    onboardHintEl.classList.remove("hidden");
    // Announce to screen readers via always-present live region;
    // elements transitioning from display:none don't self-announce via role=status.
    srAnnouncerEl.textContent = "Tip: Click a node to open a project. Drag to rotate sphere. Use LIST for keyboard access.";
  }
}

function dismissOnboarding() {
  if (onboardHintEl.classList.contains("hidden") || onboardHintEl.classList.contains("onboard-hint--hiding")) {
    return;
  }

  onboardHintEl.classList.add("onboard-hint--hiding");
  localStorage.setItem(ONBOARD_STORAGE_KEY, "1");

  setTimeout(() => {
    onboardHintEl.classList.add("hidden");
    onboardHintEl.classList.remove("onboard-hint--hiding");
  }, 290);
}

// Populating and Filtering the Project List
function renderProjectList(filterText = "") {
  const query = filterText.trim().toLowerCase();

  // Filter items
  const filtered = projects.filter(p => !query || p.text.toLowerCase().includes(query));

  // Clear existing items
  listGridEl.innerHTML = "";

  // Render list
  filtered.forEach(project => {
    const li = document.createElement("li");
    const button = document.createElement("button");
    button.type = "button";
    button.className = "list-item";
    if (activeProject && activeProject.id === project.id) {
      button.classList.add("is-active");
      button.setAttribute("aria-pressed", "true");
    }

    button.title = project.text;
    button.setAttribute("aria-label", `Open ${project.text}`);

    const spanText = document.createElement("span");
    spanText.className = "list-item-text";
    spanText.textContent = project.text;

    const spanArrow = document.createElement("span");
    spanArrow.className = "list-item-arrow";
    spanArrow.setAttribute("aria-hidden", "true");
    spanArrow.textContent = "OPEN ›";

    button.appendChild(spanText);
    button.appendChild(spanArrow);

    // List item select click
    button.addEventListener("click", () => {
      handleSelectProject(project);
    });

    // Hover triggers node highlights in sphere
    button.addEventListener("mouseenter", () => {
      hoveredProjectId = project.id;
      if (!activeProject) {
        sphere.setActive(project.id);
      }
    });

    button.addEventListener("mouseleave", () => {
      hoveredProjectId = null;
      if (!activeProject) {
        sphere.setActive(null);
      }
    });

    li.appendChild(button);
    listGridEl.appendChild(li);
  });

  // Empty state handling
  if (filtered.length === 0) {
    const liEmpty = document.createElement("li");
    liEmpty.className = "list-empty";
    liEmpty.setAttribute("role", "status");
    liEmpty.textContent = "NO MATCHING PROJECTS";
    listGridEl.appendChild(liEmpty);
  }

  // Update headers and SR announcers
  listTitleEl.textContent = `PROJECTS / ${filtered.length}`;
  srAnnouncerEl.textContent = query
    ? `${filtered.length} project${filtered.length !== 1 ? "s" : ""} matching "${filterText}"`
    : `${filtered.length} projects`;

  // Auto-focus single matches on the sphere
  if (sphere) {
    if (query && filtered.length === 1) {
      sphere.setActive(filtered[0].id);
    } else if (query && filtered.length !== 1) {
      if (!activeProject) {
        sphere.setActive(null);
      }
    }
  }
}


// Bind Button Listeners
btnListToggle.addEventListener("click", toggleListSheet);
btnListClose.addEventListener("click", closeListSheet);

btnAboutToggle.addEventListener("click", () => {
  if (isAboutOpen) {
    closeAboutPanel();
  } else {
    openAboutPanel();
  }
});
btnAboutClose.addEventListener("click", closeAboutPanel);

btnPreviewClose.addEventListener("click", closePreviewPanel);
btnPreviewRetry.addEventListener("click", () => {
  if (activeProject) loadIframe(activeProject.safeUrl);
});
btnPreviewFullscreen.addEventListener("click", toggleFullscreen);

btnOnboardDismiss.addEventListener("click", dismissOnboarding);

// Bind search input listener
listSearchInput.addEventListener("input", (e) => {
  renderProjectList(e.target.value);
});

// Bind Global Keyboard Events
window.addEventListener("keydown", (e) => {
  const isInput =
    e.target instanceof HTMLElement &&
    (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA");

  if (e.key === "Escape") {
    if (isListOpen) {
      toggleListSheet();
    } else if (activeProject) {
      closePreviewPanel();
    } else if (isAboutOpen) {
      closeAboutPanel();
    }
  }

  // Q/X closes panel if not typing in input
  if (!isInput && (e.key === "q" || e.key === "Q" || e.key === "x" || e.key === "X")) {
    if (activeProject) {
      closePreviewPanel();
    } else if (isAboutOpen) {
      closeAboutPanel();
    }
  }
});

// Init execution - fetch assets dynamically
Promise.all([
  fetch("projects.json").then((res) => res.json()),
  fetch("about.md").then((res) => res.text()),
])
  .then(([projectsData, aboutMd]) => {
    // Map JSON projects to full objects with safe URLs
    projects = projectsData.map((p, i) => ({
      id: i,
      text: p.text,
      url: p.url,
      importance: p.importance || "medium",
      safeUrl: normalizeSafeUrl(p.url),
    }));

    // Inject parsed about markdown
    const aboutMarkdownEl = document.querySelector(".about-markdown");
    if (aboutMarkdownEl) {
      aboutMarkdownEl.innerHTML = parseMarkdown(aboutMd, 1); // offset headings: h2→h3, h3→h4 to avoid clash with panel <h2> title
    }

    // Initialize 3D Sphere Engine after loading projects
    sphere = new SphereEngine({
      canvas: document.getElementById("scene-canvas"),
      sceneEl: document.getElementById("scene-container"),
      projects: projects,
      connectionColor: connectionColor,
      onSelect: (project) => {
        handleSelectProject(project);
      },
    });

    initOnboarding();
    renderProjectList();
    updateShellState();
  })
  .catch((err) => {
    console.error("Failed to initialize showcase:", err);
    // Show visible error state instead of a silent blank page (H3)
    const initErrorEl = document.getElementById("init-error");
    if (initErrorEl) initErrorEl.classList.remove("hidden");
    const btnInitRetry = document.getElementById("btn-init-retry");
    if (btnInitRetry) btnInitRetry.addEventListener("click", () => window.location.reload());
  });
