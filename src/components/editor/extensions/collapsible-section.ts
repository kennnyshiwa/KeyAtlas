import { Node as TiptapNode, mergeAttributes } from "@tiptap/core";

/**
 * A collapsible "More" section that mirrors the standalone Geekhack-style
 * details/summary markup:
 *
 *   <details class="ka-collapsible-section" data-collapsible="true">
 *     <summary class="ka-collapsible-summary">More</summary>
 *     <div class="ka-collapsible-content" data-collapsible-content="true">…</div>
 *   </details>
 *
 * On the public display page this serialises to a real <details> element so the
 * browser handles the show/hide natively. Inside the editor we drive it with a
 * custom node view backed by a <button> pill, because a native <details> applies
 * its own toggle behaviour that fights ProseMirror's view management.
 */
export const CollapsibleSection = TiptapNode.create({
  name: "collapsibleSection",
  group: "block",
  content: "block+",
  defining: true,
  isolating: true,

  addAttributes() {
    return {
      summary: {
        default: "More",
        parseHTML: (element) => {
          const summary = element.querySelector("summary");
          const value = summary?.textContent?.trim() || "More";
          // Legacy imports labelled these "Hidden section"; normalise to "More".
          return value === "Hidden section" ? "More" : value;
        },
        renderHTML: () => ({}),
      },
      open: {
        default: false,
        parseHTML: (element) => element.hasAttribute("open"),
        renderHTML: () => ({}),
      },
      textAlign: {
        default: "left",
        parseHTML: (element) =>
          (element instanceof HTMLElement ? element.style.textAlign : "") || "left",
        renderHTML: () => ({}),
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: "details[data-collapsible='true']",
        contentElement: "div[data-collapsible-content]",
      },
      {
        tag: "details",
        contentElement: "div[data-collapsible-content]",
      },
    ];
  },

  renderHTML({ node, HTMLAttributes }) {
    // Read open/summary/textAlign from node.attrs directly: their attribute
    // renderHTML returns {} (so they don't leak as raw DOM attributes), which
    // means they are NOT present on HTMLAttributes. Reading node.attrs is what
    // lets getHTML() actually emit `open` so the state round-trips correctly.
    const { summary, open, textAlign } = node.attrs;

    return [
      "details",
      mergeAttributes(HTMLAttributes, {
        "data-collapsible": "true",
        class: "ka-collapsible-section",
        style: textAlign && textAlign !== "left" ? `text-align: ${textAlign}` : undefined,
        ...(open ? { open: "open" } : {}),
      }),
      ["summary", { class: "ka-collapsible-summary" }, String(summary || "More")],
      ["div", { "data-collapsible-content": "true", class: "ka-collapsible-content" }, 0],
    ];
  },

  addNodeView() {
    return ({ node, editor, getPos }) => {
      const typeName = this.name;

      const dom = document.createElement("div");
      dom.className = "ka-collapsible-section";
      dom.setAttribute("data-collapsible", "true");

      // A real <button> renders an obviously clickable pill and gives us native
      // keyboard activation (Enter/Space) for free.
      const summary = document.createElement("button");
      summary.type = "button";
      summary.className = "ka-collapsible-summary";
      summary.contentEditable = "false";

      const content = document.createElement("div");
      content.className = "ka-collapsible-content";
      content.setAttribute("data-collapsible-content", "true");

      const sync = (nextNode: typeof node) => {
        summary.textContent = String(nextNode.attrs.summary || "More");

        const open = Boolean(nextNode.attrs.open);
        summary.setAttribute("aria-expanded", open ? "true" : "false");
        if (open) {
          dom.setAttribute("open", "open");
        } else {
          dom.removeAttribute("open");
        }

        const align = nextNode.attrs.textAlign;
        dom.style.textAlign = align && align !== "left" ? String(align) : "";
      };

      const toggle = () => {
        if (typeof getPos !== "function") return;
        const pos = getPos();
        if (typeof pos !== "number") return;
        const current = editor.state.doc.nodeAt(pos);
        if (!current || current.type.name !== typeName) return;

        editor.view.dispatch(
          editor.state.tr.setNodeMarkup(pos, undefined, {
            ...current.attrs,
            open: !Boolean(current.attrs.open),
          }),
        );
      };

      // Keep the editor selection stable when the pill is pressed, then toggle.
      summary.addEventListener("mousedown", (event) => event.preventDefault());
      summary.addEventListener("click", (event) => {
        event.preventDefault();
        toggle();
      });

      dom.append(summary, content);
      sync(node);

      return {
        dom,
        contentDOM: content,
        update(updatedNode) {
          if (updatedNode.type.name !== typeName) return false;
          sync(updatedNode);
          return true;
        },
        // The pill is ours, not editable content — don't let ProseMirror handle
        // events that originate on it.
        stopEvent(event) {
          const target = event.target;
          return target instanceof globalThis.Node && summary.contains(target);
        },
        // Only react to mutations inside the editable content region; ignore our
        // own changes to the pill label and wrapper attributes.
        ignoreMutation(mutation) {
          return !(mutation.target === content || content.contains(mutation.target));
        },
      };
    };
  },
});
