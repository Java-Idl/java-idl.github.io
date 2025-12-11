# Javagar's Project Nexus

**Current Version**: 2.0 (The Command Center)

An immersive 3D visualization of project links, designed as a futuristic interface. It features a rotating point cloud of nodes that users can navigate, search, and interact with to preview external projects seamlessly.

---

## Development Report

### Phase I: The Core Foundation
The project began as a standard 3D visualization experiment. The initial implementation utilized a basic "floating interactive sphere" concept.
-   **Architecture**: A pure Vanilla Javascript implementation using HTML5 Canvas for rendering. No heavy 3D libraries (like Three.js) were used; instead, a custom 3D projection engine was written to keep the application lightweight (~15KB).
-   **Data-Driven**: The system was designed to be data-agnostic, loading project nodes dynamically from a `links.yaml` file.

### Phase II: The Audit & Optimization
Upon initial review, several critical deficiencies were identified in the codebase:
1.  **Performance**: A busy-wait loop was detected. The animation loop continued running even when the 3D view was hidden, consuming unnecessary CPU cycles. This was patched by implementing state-aware loop cancellation.
2.  **Accessibility**: The application lacked basic ARIA labels, making it unusable for screen readers. A comprehensive accessibility pass added semantic roles (`role="img"`, `role="list"`) and keyboard navigation support (J/K keys).

### Phase III: The Paradigm Shift
The most significant evolution occurred during the UI/UX review.
-   **The Problem**: The original floating header overlay blocked the view of the sphere, and the "Glassmorphism" aesthetic deemed outdated.
-   **The Pivot**: A "Design Overhaul" was proposed, offering three directions. The **"Command Center"** concept was selected.
-   **Implementation**:
    -   The layout was fundamentally restructured. The floating UI was moved to a fixed **Sidebar (320px)** on the left.
    -   The structural borders were changed from Gold to a sleek Dark Gray (`#333`) to reduce visual fatigue, reserving Gold for high-value accents.
    -   The 3D Canvas logic was rewritten to offset the "center of the world" by 320px, ensuring the sphere rotates perfectly in the available negative space, not the center of the viewport.

### Phase IV: Integration Mechanics
The final hurdle was the "Preview Pane" experience, specifically regarding **Custom Cursors** on external sites.
-   **The Glitch**: When opening external projects (like *HackerAndSleeper*) in the iframe preview, their custom cursor logic failed, rendering the cursor invisible.
-   **Diagnosis**: It was discovered that:
    1.  The `.iframe-loader` overlay was consuming mouse events even when transparent.
    2.  Global `user-select: none` rules on the parent page were bleeding into the iframe's internal logic.
    3.  The iframe was not receiving focus, leaving the child site in a "suspended" animation state.
-   **The Solution**:
    -   **Pointer Events**: Explicitly set `pointer-events: none` on the loader.
    -   **Focus Injection**: Implemented logic to force `iframe.contentWindow.focus()` upon load.
    -   **Style Isolation**: Reverted global interaction locks, applying them only to specific UI parent elements.

---

## Technical Features
-   **Custom 3D Engine**: Zero-dependency 3D projection.
-   **YAML Data Source**: Easy-to-edit project list.
-   **Sidebar Architecture**: Fixed-width sidebar with mathematically unified canvas resizing.
-   **Optimized Rendering**: Distance-squared calculations for connection drawing to minimize `Math.sqrt` calls.

## Quick Start

1.  **Add Projects**: Edit `links.yaml`.
    ```yaml
    - text: "My Project"
      url: "https://mywebsite.com"
    ```
2.  **Run**:
    ```bash
    python -m http.server 8000
    ```
