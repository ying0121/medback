import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import { registerWidgetElements, WIDGET_MOUNT_ID } from "@/lib/chatThemes";
import {
  captureWidgetScriptElement,
  ensureMountElement,
  readEmbedConfig,
} from "@/lib/embedConfig";
import widgetStyles from "./index.css?inline";

const MOUNT_ID = WIDGET_MOUNT_ID;

// Capture the loader script immediately (before defer/async clears currentScript).
captureWidgetScriptElement();

const mountWidget = () => {
  // Snapshot host jQuery globals before any work so we can guarantee
  // they are untouched after the widget mounts.
  const win = window as Window & { $?: unknown; jQuery?: unknown };
  const savedDollar = win.$;
  const savedJQuery = win.jQuery;

  try {
    // Script-only embed: inject the mount div if the host page did not add one.
    const hostElement = ensureMountElement();
    if (!hostElement) {
      console.warn(`[MedicalChatbot] Could not create mount element "${MOUNT_ID}".`);
      return;
    }

    const config = readEmbedConfig(hostElement);
    if (!config.clinicId) {
      console.warn(
        "[MedicalChatbot] Missing clinic id. Use ?clinicId=… on the CDN script URL or data-clinic-id on the script tag.",
      );
    }

    hostElement.style.position = "fixed";
    hostElement.style.inset = "0";
    hostElement.style.zIndex = "2147483647";
    hostElement.style.pointerEvents = "none";

    const shadowRoot = hostElement.shadowRoot ?? hostElement.attachShadow({ mode: "open" });

    // Prevent duplicate mounts if the script is injected more than once.
    if (shadowRoot.querySelector("[data-medical-chatbot-mounted='true']")) {
      return;
    }

    const styleElement = document.createElement("style");
    const isolatedStyles = widgetStyles
      .replace(/:root/g, ":host")
      .replace(/\bbody\b/g, ".medical-chatbot-widget");
    styleElement.textContent = isolatedStyles;

    const appContainer = document.createElement("div");
    appContainer.className = "medical-chatbot-widget";
    appContainer.style.pointerEvents = "auto";
    appContainer.setAttribute("data-medical-chatbot-mounted", "true");
    registerWidgetElements(appContainer, hostElement);

    shadowRoot.append(styleElement, appContainer);
    createRoot(appContainer).render(<App />);
  } catch (error) {
    console.error("[MedicalChatbot] Failed to mount widget:", error);
  } finally {
    // Always restore host jQuery globals — the IIFE sandboxes our scope but
    // this guard covers any edge case where a bundled dep touched window.$.
    win.$ = savedDollar;
    win.jQuery = savedJQuery;
  }
};

const start = () => {
  if (document.body) {
    mountWidget();
    return;
  }
  // Script may load in <head> before <body> exists.
  window.addEventListener("DOMContentLoaded", mountWidget, { once: true });
};

if (document.readyState === "loading") {
  window.addEventListener("DOMContentLoaded", mountWidget, { once: true });
} else {
  start();
}
