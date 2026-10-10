# Security Report: Advanced Website Screen Capture & Photo Protection

## Overview
This document outlines the security mechanisms implemented to protect sensitive content from unauthorized capture, photography, recording, and distribution. It details the layered defenses applied on the frontend, their operational bounds, and important limitations.

---

## 1. What is Prevented

### Automated/Accidental Copying
- **Text Selection & Drag-and-Drop**: Text selection, image dragging, and default copy actions (`select-none`, `onDragStart`) are strictly disabled within the `ProtectedViewer` and globally via `MalpracticeGuard`.
- **Context Menus**: Right-click context menus are blocked globally to prevent easy access to "Save Image As..." or "Inspect Element" using `window.addEventListener('contextmenu', e => e.preventDefault())`.
- **Keyboard Shortcuts (Basic Screenshots)**: Common OS-level screenshot shortcuts (e.g., `PrintScreen`, `Cmd+Shift+3/4/5`, `Win+Shift+S`) are intercepted and `preventDefault()` is called.

### Background and Off-Tab Viewing
- **Tab Invisibility**: Using the Page Visibility API (`visibilitychange` event), the page actively listens for tab switching or minimizing. If the page is hidden, sensitive content is immediately blurred and hidden in the `ProtectedViewer`, and the `MalpracticeGuard` displays a global warning.
- **Window Defocusing (Snipping Tools)**: Snipping tools often steal window focus. When the window loses focus (`blur` event), the global `MalpracticeGuard` triggers a red full-screen overlay, effectively blocking the visual content from being captured in the snip.

---

## 2. What is Merely Discouraged (Mitigated)

### Physical-Camera Photography (Using Another Phone)
- **Dynamic Watermarking**: The `DynamicWatermark` component adds a semi-transparent, moving pattern of text (e.g., user ID and timestamp) across the protected content. This makes it difficult to take a photo of the screen and crop out the identity of the person viewing it.
- **Hover-to-View**: The `ProtectedViewer` supports an optional `requireHoverToView` mode. The user must keep their mouse over the content to see it. If they reach for their phone to take a picture and move the mouse away, the content blurs out.

### Screen Recording
- While we cannot completely prevent OS-level screen recording tools from running, the `MalpracticeGuard` will trigger an alert and block the screen if it detects any shortcut combinations or focus loss events typically associated with launching recording software.

---

## 3. What Cannot Be Guaranteed (Limitations)

**It is fundamentally impossible for a web browser to completely prevent content from being captured if it is being rendered on a user's screen.**

- **Advanced Screen Recording**: OS-level screen recording tools that do not require keyboard shortcuts, do not steal focus, and hook directly into the graphics driver will bypass browser-level detection. JavaScript cannot interact with or detect external screen recording software reliably.
- **Hardware Capture Devices**: HDMI capture cards or splitters placed between the computer and the monitor cannot be detected by the browser.
- **Sophisticated Photography**: While the dynamic watermark makes photography risky (by embedding the user's identity), it does not prevent the physical camera from taking the picture.
- **Developer Tools**: Advanced users can disable JavaScript or manually remove overlay DOM elements via browser developer tools to bypass the `ProtectedViewer` or `MalpracticeGuard`. (This is why server-side authentication and short-lived signed URLs are critical for delivering the actual content data).

## Conclusion
The implemented frontend mechanisms provide a robust **deterrent** and **forensic trail** (via watermarks) against casual theft, screenshots, and screen recording. However, they must be paired with strict server-side authorization. No frontend security layer can provide 100% protection against dedicated data exfiltration attempts on untrusted hardware.
