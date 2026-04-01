"use client";

import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useState,
  useCallback,
  useRef,
} from "react";
import { ReactRenderer } from "@tiptap/react";
import tippy, { type Instance as TippyInstance } from "tippy.js";
import type { SuggestionOptions, SuggestionProps } from "@tiptap/suggestion";

interface UserResult {
  id: string;
  username: string | null;
  displayName: string | null;
  name: string | null;
  image: string | null;
}

interface MentionListProps {
  items: UserResult[];
  command: (item: { id: string; label: string }) => void;
}

interface MentionListRef {
  onKeyDown: (props: { event: KeyboardEvent }) => boolean;
}

const MentionList = forwardRef<MentionListRef, MentionListProps>(
  ({ items, command }, ref) => {
    const [selectedIndex, setSelectedIndex] = useState(0);

    useEffect(() => {
      setSelectedIndex(0);
    }, [items]);

    const selectItem = useCallback(
      (index: number) => {
        const item = items[index];
        if (item) {
          command({
            id: item.username ?? item.id,
            label: item.displayName || item.name || item.username || item.id,
          });
        }
      },
      [items, command]
    );

    useImperativeHandle(ref, () => ({
      onKeyDown: ({ event }: { event: KeyboardEvent }) => {
        if (event.key === "ArrowUp") {
          setSelectedIndex((prev) =>
            prev <= 0 ? items.length - 1 : prev - 1
          );
          return true;
        }
        if (event.key === "ArrowDown") {
          setSelectedIndex((prev) =>
            prev >= items.length - 1 ? 0 : prev + 1
          );
          return true;
        }
        if (event.key === "Enter") {
          selectItem(selectedIndex);
          return true;
        }
        return false;
      },
    }));

    if (!items.length) {
      return (
        <div className="mention-suggestion-list">
          <div className="mention-suggestion-empty">No users found</div>
        </div>
      );
    }

    return (
      <div className="mention-suggestion-list">
        {items.map((item, index) => (
          <button
            key={item.id}
            type="button"
            className={`mention-suggestion-item ${
              index === selectedIndex ? "is-selected" : ""
            }`}
            onClick={() => selectItem(index)}
          >
            {item.image ? (
              <img
                src={item.image}
                alt=""
                className="mention-suggestion-avatar"
              />
            ) : (
              <div className="mention-suggestion-avatar mention-suggestion-avatar-fallback">
                {(
                  item.displayName ||
                  item.name ||
                  item.username ||
                  "?"
                )[0]?.toUpperCase()}
              </div>
            )}
            <div className="mention-suggestion-info">
              <span className="mention-suggestion-name">
                {item.displayName || item.name || item.username}
              </span>
              {item.username && (
                <span className="mention-suggestion-username">
                  @{item.username}
                </span>
              )}
            </div>
          </button>
        ))}
      </div>
    );
  }
);

MentionList.displayName = "MentionList";

export const mentionSuggestion: Omit<SuggestionOptions<UserResult>, "editor"> = {
  items: async ({ query }) => {
    if (!query || query.length < 1) return [];
    try {
      const res = await fetch(
        `/api/users/search?q=${encodeURIComponent(query)}`
      );
      if (!res.ok) return [];
      return await res.json();
    } catch {
      return [];
    }
  },

  render: () => {
    let component: ReactRenderer<MentionListRef> | null = null;
    let popup: TippyInstance[] | null = null;

    return {
      onStart: (props: SuggestionProps<UserResult>) => {
        component = new ReactRenderer(MentionList, {
          props,
          editor: props.editor,
        });

        if (!props.clientRect) return;

        popup = tippy("body", {
          getReferenceClientRect: props.clientRect as () => DOMRect,
          appendTo: () => document.body,
          content: component.element,
          showOnCreate: true,
          interactive: true,
          trigger: "manual",
          placement: "bottom-start",
        });
      },

      onUpdate: (props: SuggestionProps<UserResult>) => {
        component?.updateProps(props);

        if (!props.clientRect) return;

        popup?.[0]?.setProps({
          getReferenceClientRect: props.clientRect as () => DOMRect,
        });
      },

      onKeyDown: (props: { event: KeyboardEvent }) => {
        if (props.event.key === "Escape") {
          popup?.[0]?.hide();
          return true;
        }
        return component?.ref?.onKeyDown(props) ?? false;
      },

      onExit: () => {
        popup?.[0]?.destroy();
        component?.destroy();
      },
    };
  },
};
