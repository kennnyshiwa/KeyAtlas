function hasMeaningfulContent(container: Element) {
  for (const node of Array.from(container.childNodes)) {
    if (node.nodeType === Node.TEXT_NODE && node.textContent?.trim()) {
      return true;
    }

    if (node.nodeType !== Node.ELEMENT_NODE) {
      continue;
    }

    const element = node as HTMLElement;
    if (element.tagName === "P" && !(element.textContent || "").trim() && element.querySelector("img, video, iframe") == null) {
      continue;
    }

    if (element.tagName === "BR") {
      continue;
    }

    if ((element.textContent || "").trim() || element.querySelector("img, video, iframe, hr, table, ul, ol, blockquote")) {
      return true;
    }
  }

  return false;
}

function isBoundaryNode(node: ChildNode) {
  if (node.nodeType === Node.TEXT_NODE) {
    return false;
  }

  if (node.nodeType !== Node.ELEMENT_NODE) {
    return false;
  }

  const element = node as HTMLElement;
  return element.tagName === "DETAILS" || element.tagName === "HR";
}

function ensureContentWrapper(details: HTMLElement) {
  let content = details.querySelector<HTMLElement>(":scope > div[data-collapsible-content]");
  if (content) return content;

  content = document.createElement("div");
  content.setAttribute("data-collapsible-content", "true");
  content.className = "ka-collapsible-content";

  const summary = details.querySelector(":scope > summary");
  let cursor = summary?.nextSibling ?? details.firstChild;
  while (cursor) {
    const next = cursor.nextSibling;
    content.appendChild(cursor);
    cursor = next;
  }

  details.appendChild(content);
  return content;
}

export function normalizeCollapsibleSections(html: string) {
  if (!html.includes("<details")) {
    return html;
  }

  if (typeof DOMParser === "undefined") {
    return html.replace(/<details([^>]*)>([\s\S]*?)<\/details>/gi, (full, attrs, inner) => {
      if (/data-collapsible-content\s*=/.test(inner)) return full;

      const summaryMatch = inner.match(/<summary([^>]*)>([\s\S]*?)<\/summary>/i);
      if (!summaryMatch || summaryMatch.index == null) return full;

      const summaryHtml = summaryMatch[0];
      const beforeSummary = inner.slice(0, summaryMatch.index);
      const afterSummary = inner.slice(summaryMatch.index + summaryHtml.length);

      return `<details${attrs}>${beforeSummary}${summaryHtml}<div data-collapsible-content="true">${afterSummary}</div></details>`;
    });
  }

  const parser = new DOMParser();
  const doc = parser.parseFromString(html, "text/html");
  const root = doc.body;

  for (const details of Array.from(root.querySelectorAll<HTMLElement>("details"))) {
    // If the section is already well-formed (has its content wrapper), leave it
    // and its siblings completely alone. This keeps normalization idempotent so
    // it never swallows content that follows an existing section on round-trips.
    const hadWrapper = details.querySelector(":scope > div[data-collapsible-content]") != null;
    const content = ensureContentWrapper(details);
    if (hadWrapper) continue;

    const parent = details.parentNode;
    if (!parent) continue;

    // Raw imported section (summary only): pull following siblings into the body
    // until the next section/divider boundary.
    while (details.nextSibling && !isBoundaryNode(details.nextSibling)) {
      content.appendChild(details.nextSibling);
    }

    if (!hasMeaningfulContent(content)) {
      content.innerHTML = "<p></p>";
    }
  }

  return root.innerHTML;
}
