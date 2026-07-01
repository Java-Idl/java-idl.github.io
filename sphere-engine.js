export function normalizeSafeUrl(rawUrl) {
  if (!rawUrl || typeof rawUrl !== "string") return null;
  try {
    const parsed = new URL(rawUrl, window.location.href);
    if (parsed.protocol === "http:" || parsed.protocol === "https:") return parsed.href;
    return null;
  } catch {
    return null;
  }
}

export class SphereEngine {
  constructor(opts) {
    this.opts = opts;
    this.canvas = opts.canvas;
    this.scene = opts.sceneEl;
    const ctx = this.canvas.getContext("2d");
    if (!ctx) throw new Error("2D context unavailable");
    this.ctx = ctx;

    this.config = {
      sphereRadius: 280,
      baseRotationSpeed: 0.0002,
      mouseSensitivity: 0.000008,
      dragSensitivity: 0.003,
      perspective: 800,
      connectionDistanceSq: 120 * 120,
      targetFrameMs: 1000 / 45,
      isPaused: false,
    };

    this.state = {
      points: [],
      connections: [],
      focusedPoint: null,
      currentRotX: 0,
      currentRotY: 0,
      lastFrameTime: 0,
      isMouseOver: false,
      mouseX: 0,
      mouseY: 0,
      width: 0,
      height: 0,
      cx: 0,
      cy: 0,
      loopId: 0,
      pendingResizeFrame: 0,
      needsRender: true,
      isDragging: false,
      lastPointerX: 0,
      lastPointerY: 0,
      dragVelocityX: 0,
      dragVelocityY: 0,
    };

    this.listeners = [];
    this.mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (this.mediaQuery.matches) this.config.isPaused = true;

    this.state.mouseX = window.innerWidth / 2;
    this.state.mouseY = window.innerHeight / 2;

    this.initPoints(opts.projects);
    this.resize();
    this.attachListeners();
    this.startLoop();
  }

  initPoints(projects) {
    const total = projects.length;
    this.state.points = projects.map((data, id) => {
      const phi = Math.acos(1 - (2 * (id + 0.5)) / total);
      const theta = Math.PI * (1 + Math.sqrt(5)) * (id + 0.5);
      const safeUrl = data.safeUrl ?? null;

      const element = document.createElement("a");
      element.className = `node-link node-link--${data.importance || "medium"}`;
      element.href = safeUrl || "#";
      element.target = "_blank";
      element.rel = "noopener noreferrer";
      element.setAttribute("aria-label", `Open project: ${data.text}`);
      element.textContent = data.text;

      const nx = Math.sin(phi) * Math.cos(theta);
      const ny = Math.sin(phi) * Math.sin(theta);
      const nz = Math.cos(phi);

      const point = {
        id,
        text: data.text,
        url: data.url,
        importance: data.importance || "medium",
        safeUrl,
        nx,
        ny,
        nz,
        x: this.config.sphereRadius * nx,
        y: this.config.sphereRadius * ny,
        z: this.config.sphereRadius * nz,
        screenX: 0,
        screenY: 0,
        alpha: 1,
        element,
      };

      element.addEventListener("click", (event) => {
        event.preventDefault();
        this.select(point);
      });

      element.addEventListener("focus", () => {
        this.setActive(point.id);
      });

      element.addEventListener("blur", () => {
        const appEl = document.getElementById("app");
        const isPanelOpen = appEl && appEl.classList.contains("shell--panel-open");
        if (!isPanelOpen) {
          setTimeout(() => {
            if (
              this.state.focusedPoint === point &&
              (!document.activeElement || !document.activeElement.classList.contains("node-link"))
            ) {
              this.setActive(null);
            }
          }, 50);
        }
      });

      this.scene.appendChild(element);
      return point;
    });

    const connections = [];
    for (let i = 0; i < this.state.points.length; i++) {
      const p1 = this.state.points[i];
      for (let j = i + 1; j < this.state.points.length; j++) {
        const p2 = this.state.points[j];
        const dx = p1.x - p2.x;
        const dy = p1.y - p2.y;
        const dz = p1.z - p2.z;
        const distSq = dx * dx + dy * dy + dz * dz;
        if (distSq < this.config.connectionDistanceSq) {
          connections.push([i, j]);
        }
      }
    }
    this.state.connections = connections;
  }

  setActive(projectId) {
    const target = projectId === null ? null : this.state.points.find((p) => p.id === projectId) ?? null;
    this.state.focusedPoint = target;
    this.state.points.forEach((p) => {
      p.element.classList.toggle("is-active", p === target);
    });
    this.config.isPaused = target !== null || this.mediaQuery.matches;
    this.state.needsRender = true;
    if (this.opts.onActiveChange) {
      this.opts.onActiveChange(target);
    }
    if (target === null && !this.state.loopId) this.startLoop();
  }

  resume() {
    if (this.mediaQuery.matches) return;
    this.config.isPaused = false;
    if (!this.state.loopId) this.startLoop();
  }

  select(point) {
    this.setActive(point.id);
    this.opts.onSelect(point);
  }

  rotatePoint(p, angleX, angleY) {
    const cosY = Math.cos(angleY);
    const sinY = Math.sin(angleY);
    const nx1 = p.nx * cosY - p.nz * sinY;
    const nz1 = p.nz * cosY + p.nx * sinY;

    const cosX = Math.cos(angleX);
    const sinX = Math.sin(angleX);
    const ny1 = p.ny * cosX - nz1 * sinX;
    const nz2 = nz1 * cosX + p.ny * sinX;

    p.nx = nx1;
    p.ny = ny1;
    p.nz = nz2;
  }

  updateDOM(p) {
    p.x = p.nx * this.config.sphereRadius;
    p.y = p.ny * this.config.sphereRadius;
    p.z = p.nz * this.config.sphereRadius;

    const scale = this.config.perspective / (this.config.perspective - p.z);
    p.screenX = p.x * scale;
    p.screenY = p.y * scale;
    p.alpha = Math.max(0.1, (p.z + this.config.sphereRadius) / (2 * this.config.sphereRadius));
    p.element.style.transform = `translate3d(${p.screenX}px, ${p.screenY}px, 0) scale(${scale}) translate(-50%, -50%)`;
    p.element.style.opacity = String(p.alpha);
    p.element.style.zIndex = String(Math.floor(p.z + this.config.sphereRadius) + 100);
  }

  drawConnections() {
    const { ctx } = this;
    const { width, height, cx, cy, points, connections } = this.state;
    ctx.clearRect(0, 0, width, height);
    if (points.length < 2) return;

    ctx.save();
    ctx.translate(cx, cy);
    ctx.strokeStyle = this.opts.connectionColor ?? "rgba(0, 229, 255, 0.22)";
    ctx.lineWidth = 1;

    for (let k = 0; k < connections.length; k++) {
      const [i, j] = connections[k];
      const p1 = points[i];
      const p2 = points[j];
      if (p1.alpha < 0.3 || p2.alpha < 0.3) continue;
      ctx.beginPath();
      ctx.moveTo(p1.screenX, p1.screenY);
      ctx.lineTo(p2.screenX, p2.screenY);
      ctx.stroke();
    }
    ctx.restore();
  }

  loop = (timestamp = 0) => {
    if (document.hidden) {
      this.state.loopId = 0;
      return;
    }

    const elapsed = timestamp - this.state.lastFrameTime;
    if (this.state.lastFrameTime !== 0 && elapsed < this.config.targetFrameMs) {
      this.state.loopId = requestAnimationFrame(this.loop);
      return;
    }
    this.state.lastFrameTime = timestamp;

    let targetRotX = 0;
    let targetRotY = 0;
    const active = this.state.focusedPoint;
    const isDragging = this.state.isDragging;
    const hasMotionDriver = Boolean(active) || !this.config.isPaused || isDragging;

    if (!hasMotionDriver && !this.state.needsRender) {
      this.state.loopId = requestAnimationFrame(this.loop);
      return;
    }

    if (isDragging) {
      this.state.points.forEach((p) => {
        this.updateDOM(p);
      });
      this.drawConnections();
      this.state.dragVelocityX *= 0.8;
      this.state.dragVelocityY *= 0.8;
      this.state.needsRender = false;
      this.state.loopId = requestAnimationFrame(this.loop);
      return;
    }

    if (active) {
      const k = 0.05;
      targetRotY = Math.atan2(active.x, active.z) * k;
      targetRotX = Math.atan2(active.y, active.z) * k;
    } else if (!this.config.isPaused) {
      if (this.state.isMouseOver) {
        targetRotY = (this.state.mouseX - this.state.cx) * this.config.mouseSensitivity;
        targetRotX = (this.state.mouseY - this.state.cy) * this.config.mouseSensitivity;
      } else {
        targetRotY = this.config.baseRotationSpeed;
      }
    }

    this.state.currentRotX += (targetRotX - this.state.currentRotX) * 0.05;
    this.state.currentRotY += (targetRotY - this.state.currentRotY) * 0.05;

    this.state.points.forEach((p) => {
      this.rotatePoint(p, this.state.currentRotX, this.state.currentRotY);
      this.updateDOM(p);
    });

    this.drawConnections();
    this.state.needsRender = false;
    this.state.loopId = requestAnimationFrame(this.loop);
  };

  startLoop() {
    if (document.hidden) return;
    if (!this.state.loopId) this.state.loopId = requestAnimationFrame(this.loop);
  }

  stopLoop() {
    if (this.state.loopId) {
      cancelAnimationFrame(this.state.loopId);
      this.state.loopId = 0;
    }
    this.state.lastFrameTime = 0;
  }

  resize() {
    const rect = this.canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const width = Math.max(1, Math.floor(rect.width));
    const height = Math.max(1, Math.floor(rect.height));

    this.canvas.width = width * dpr;
    this.canvas.height = height * dpr;

    this.state.width = width;
    this.state.height = height;
    this.state.cx = width / 2;
    this.state.cy = height / 2;
    const minDim = Math.min(width, height);
    const isMobile = width < 600;
    this.config.sphereRadius = isMobile ? minDim * 0.25 : minDim * 0.36;

    this.ctx.resetTransform();
    this.ctx.scale(dpr, dpr);

    this.state.needsRender = true;
  }

  scheduleResize = () => {
    if (this.state.pendingResizeFrame) return;
    this.state.pendingResizeFrame = requestAnimationFrame(() => {
      this.state.pendingResizeFrame = 0;
      this.resize();
    });
  };

  attachListeners() {
    const onMouseMove = (event) => {
      this.state.mouseX = event.clientX;
      this.state.mouseY = event.clientY;
      this.state.isMouseOver = true;
    };
    const onMouseOut = () => {
      this.state.isMouseOver = false;
    };
    const onVisibility = () => {
      if (document.hidden) this.stopLoop();
      else this.startLoop();
    };

    const onPointerDown = (event) => {
      if (
        event.target.closest(".node-link") ||
        event.target.closest("button") ||
        event.target.closest("input")
      ) {
        return;
      }
      this.state.isDragging = true;
      this.state.lastPointerX = event.clientX;
      this.state.lastPointerY = event.clientY;
      this.state.dragVelocityX = 0;
      this.state.dragVelocityY = 0;
      try {
        this.canvas.setPointerCapture(event.pointerId);
      } catch (e) {
        console.warn("setPointerCapture failed:", e);
      }
    };

    const onPointerMove = (event) => {
      if (this.state.isDragging) {
        const dx = event.clientX - this.state.lastPointerX;
        const dy = event.clientY - this.state.lastPointerY;
        this.state.lastPointerX = event.clientX;
        this.state.lastPointerY = event.clientY;

        const angleY = -dx * this.config.dragSensitivity;
        const angleX = -dy * this.config.dragSensitivity;

        this.state.points.forEach((p) => {
          this.rotatePoint(p, angleX, angleY);
        });

        this.state.dragVelocityY = angleY;
        this.state.dragVelocityX = angleX;
        this.state.needsRender = true;
      } else {
        this.state.mouseX = event.clientX;
        this.state.mouseY = event.clientY;
        this.state.isMouseOver = true;
      }
    };

    const onPointerUp = (event) => {
      if (this.state.isDragging) {
        this.state.isDragging = false;
        try {
          this.canvas.releasePointerCapture(event.pointerId);
        } catch (e) {
          console.warn("releasePointerCapture failed:", e);
        }
        this.state.currentRotY = this.state.dragVelocityY;
        this.state.currentRotX = this.state.dragVelocityX;
      }
    };

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseout", onMouseOut);
    document.addEventListener("visibilitychange", onVisibility);

    this.canvas.addEventListener("pointerdown", onPointerDown);
    this.canvas.addEventListener("pointermove", onPointerMove);
    this.canvas.addEventListener("pointerup", onPointerUp);
    this.canvas.addEventListener("pointercancel", onPointerUp);

    const ro = new ResizeObserver(() => this.scheduleResize());
    ro.observe(this.canvas);

    this.listeners.push(
      () => window.removeEventListener("mousemove", onMouseMove),
      () => window.removeEventListener("mouseout", onMouseOut),
      () => document.removeEventListener("visibilitychange", onVisibility),
      () => this.canvas.removeEventListener("pointerdown", onPointerDown),
      () => this.canvas.removeEventListener("pointermove", onPointerMove),
      () => this.canvas.removeEventListener("pointerup", onPointerUp),
      () => this.canvas.removeEventListener("pointercancel", onPointerUp),
      () => ro.disconnect()
    );
  }

  destroy() {
    this.stopLoop();
    this.listeners.forEach((fn) => fn());
    this.listeners = [];
    this.state.points.forEach((p) => p.element.remove());
    this.state.points = [];
  }
}
