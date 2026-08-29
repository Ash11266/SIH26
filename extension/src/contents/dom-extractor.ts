// extension/src/contents/dom-extractor.ts
import { SanitizedElement, AgentAction } from "../../shared/types";

const SOM_CONTAINER_ID = "__privacy_agent_som_container__";

/**
 * Extracts interactive DOM elements, tags them with data-agent-id, and scales coordinates by window.devicePixelRatio
 */
export function extractDOMElements(): { elements: SanitizedElement[]; dpr: number } {
  const dpr = window.devicePixelRatio || 1;
  const elements: SanitizedElement[] = [];
  const selector = "button, a, input, select, textarea, [role='button'], [role='link'], [role='checkbox'], [tabindex='0']";

  const rawElements = Array.from(document.querySelectorAll<HTMLElement>(selector));
  let badgeIdCounter = 1;

  for (const node of rawElements) {
    // Skip invisible or tiny elements
    const rect = node.getBoundingClientRect();
    if (rect.width <= 2 || rect.height <= 2 || window.getComputedStyle(node).display === "none") {
      continue;
    }

    const badgeId = String(badgeIdCounter++);
    node.setAttribute("data-agent-id", badgeId);

    // Physical pixel scaling using window.devicePixelRatio
    const physicalBbox: [number, number, number, number] = [
      Math.round((rect.left + window.scrollX) * dpr),
      Math.round((rect.top + window.scrollY) * dpr),
      Math.round(rect.width * dpr),
      Math.round(rect.height * dpr),
    ];

    let role = node.tagName.toLowerCase();
    if (role === "a") role = "link";
    if (node.getAttribute("role")) role = node.getAttribute("role")!;

    let text = node.innerText || (node as HTMLInputElement).value || node.getAttribute("aria-label") || node.getAttribute("placeholder") || "";
    text = text.trim().slice(0, 100);

    const attrs = {
      type: (node as HTMLInputElement).type,
      placeholder: (node as HTMLInputElement).placeholder,
      ariaLabel: node.getAttribute("aria-label") || undefined,
      name: node.getAttribute("name") || undefined,
      href: (node as HTMLAnchorElement).href || undefined,
      value: (node as HTMLInputElement).value || undefined,
    };

    elements.push({
      id: badgeId,
      role,
      bbox: physicalBbox,
      text,
      redacted: false,
      attrs,
    });
  }

  return { elements, dpr };
}

/**
 * Injects Set-of-Marks (SoM) badges as visible on-screen overlays next to each tagged element
 */
export function injectSetOfMarks(): void {
  clearSetOfMarks();

  const container = document.createElement("div");
  container.id = SOM_CONTAINER_ID;
  container.style.position = "absolute";
  container.style.top = "0";
  container.style.left = "0";
  container.style.width = "100%";
  container.style.height = "100%";
  container.style.pointerEvents = "none";
  container.style.zIndex = "999999";

  const taggedNodes = document.querySelectorAll<HTMLElement>("[data-agent-id]");
  taggedNodes.forEach((node) => {
    const badgeId = node.getAttribute("data-agent-id");
    if (!badgeId) return;

    const rect = node.getBoundingClientRect();
    const badge = document.createElement("div");
    badge.innerText = badgeId;
    badge.style.position = "absolute";
    badge.style.left = `${rect.left + window.scrollX - 6}px`;
    badge.style.top = `${rect.top + window.scrollY - 10}px`;
    badge.style.backgroundColor = "#FFCC00";
    badge.style.color = "#000000";
    badge.style.border = "1.5px solid #000000";
    badge.style.borderRadius = "4px";
    badge.style.padding = "1px 4px";
    badge.style.fontSize = "11px";
    badge.style.fontWeight = "bold";
    badge.style.fontFamily = "sans-serif";
    badge.style.boxShadow = "0 1px 4px rgba(0,0,0,0.5)";
    badge.style.pointerEvents = "none";
    badge.style.zIndex = "999999";

    container.appendChild(badge);
  });

  document.body.appendChild(container);
}

/**
 * Clears injected Set-of-Marks overlay from the live DOM
 */
export function clearSetOfMarks(): void {
  const container = document.getElementById(SOM_CONTAINER_ID);
  if (container) {
    container.remove();
  }
}

/**
 * Executes AgentAction on the current DOM page
 */
export function executeAgentAction(action: AgentAction): { success: boolean; message: string } {
  try {
    if (action.type === "done") {
      return { success: true, message: "Task marked done." };
    }

    if (action.type === "scroll") {
      const scrollPx = parseInt(action.value || "400", 10);
      window.scrollBy({ top: scrollPx, behavior: "smooth" });
      return { success: true, message: `Scrolled by ${scrollPx}px` };
    }

    if (action.type === "navigate") {
      if (action.value) {
        window.location.href = action.value;
        return { success: true, message: `Navigated to ${action.value}` };
      }
      return { success: false, message: "Navigate action missing URL value" };
    }

    if (!action.targetId) {
      return { success: false, message: `Action ${action.type} requires targetId` };
    }

    const targetNode = document.querySelector<HTMLElement>(`[data-agent-id="${action.targetId}"]`);
    if (!targetNode) {
      return { success: false, message: `Element with targetId #${action.targetId} not found` };
    }

    // Scroll node into view gently
    targetNode.scrollIntoView({ block: "nearest", inline: "nearest" });

    if (action.type === "click") {
      targetNode.focus();
      targetNode.click();
      targetNode.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
      return { success: true, message: `Clicked element #${action.targetId}` };
    }

    if (action.type === "type") {
      if (targetNode instanceof HTMLInputElement || targetNode instanceof HTMLTextAreaElement) {
        targetNode.focus();
        targetNode.value = action.value || "";
        targetNode.dispatchEvent(new Event("input", { bubbles: true }));
        targetNode.dispatchEvent(new Event("change", { bubbles: true }));
        return { success: true, message: `Typed value into element #${action.targetId}` };
      } else {
        targetNode.innerText = action.value || "";
        return { success: true, message: `Updated text of element #${action.targetId}` };
      }
    }

    return { success: false, message: `Unhandled action type ${action.type}` };
  } catch (err: any) {
    return { success: false, message: `Execution exception: ${err.message || err}` };
  }
}

// Register listener for chrome runtime messaging
if (typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.onMessage) {
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "EXTRACT_DOM") {
      injectSetOfMarks();
      const { elements, dpr } = extractDOMElements();
      sendResponse({
        elements,
        viewport: { w: window.innerWidth, h: window.innerHeight, devicePixelRatio: dpr },
      });
      return true;
    }

    if (request.action === "CLEAR_SOM") {
      clearSetOfMarks();
      sendResponse({ success: true });
      return true;
    }

    if (request.action === "EXECUTE_ACTION") {
      const result = executeAgentAction(request.agentAction);
      sendResponse(result);
      return true;
    }
  });
}
