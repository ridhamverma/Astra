"use client";
import {
  useEffect,
  useRef,
  useState,
  type RefObject,
  type KeyboardEvent,
} from "react";
import { Icon, type IconName } from "@/components/dashboard/icon";

const focusable =
  'button:not(:disabled),a[href],input:not(:disabled),select:not(:disabled),textarea:not(:disabled),[tabindex="0"]';
export function trapFocus(event: KeyboardEvent<HTMLElement>) {
  if (event.key !== "Tab") return;
  const items = Array.from(
    event.currentTarget.querySelectorAll<HTMLElement>(focusable),
  ).filter((element) => element.getClientRects().length);
  const first = items[0],
    last = items[items.length - 1];
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last?.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first?.focus();
  }
}
export function useSheetFocus(
  ref: RefObject<HTMLElement | null>,
  open: boolean,
  selector: string = focusable,
) {
  useEffect(() => {
    if (!open) return;
    const trigger =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    const frame = requestAnimationFrame(() =>
      ref.current?.querySelector<HTMLElement>(selector)?.focus(),
    );
    return () => {
      cancelAnimationFrame(frame);
      if (trigger?.isConnected) trigger.focus();
    };
  }, [ref, open, selector]);
}
export interface BuilderCommand {
  label: string;
  group: string;
  icon: IconName;
  hint?: string;
  disabled?: boolean;
  action: () => void;
}
export function BuilderCommandPalette({
  commands,
  onClose,
}: {
  commands: BuilderCommand[];
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const [index, setIndex] = useState(0);
  const panel = useRef<HTMLDivElement>(null);
  useSheetFocus(panel, true);
  const matches = commands.filter((command) =>
    command.label.toLowerCase().includes(query.toLowerCase()),
  );
  const selected = Math.min(index, Math.max(0, matches.length - 1));
  function execute(command?: BuilderCommand) {
    if (command && !command.disabled) {
      onClose();
      command.action();
    }
  }
  return (
    <div className="builder-palette-backdrop" onClick={onClose}>
      <div
        ref={panel}
        className="builder-command-palette glass"
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        onClick={(event) => event.stopPropagation()}
        onKeyDown={(event) => {
          trapFocus(event);
          if (event.key === "Escape") {
            event.preventDefault();
            onClose();
          }
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            setIndex(
              (selected +
                (event.key === "ArrowDown" ? 1 : -1) +
                matches.length) %
                Math.max(1, matches.length),
            );
          }
          if (event.key === "Enter") {
            event.preventDefault();
            execute(matches[selected]);
          }
        }}
      >
        <div className="builder-command-search">
          <input
            aria-label="Search commands"
            role="combobox"
            aria-controls="builder-command-results"
            aria-expanded="true"
            aria-activedescendant={
              matches.length ? `builder-command-${selected}` : undefined
            }
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setIndex(0);
            }}
            placeholder="Search nodes, actions, and views…"
          />
          <button
            aria-label="Close command palette"
            title="Close command palette"
            onClick={onClose}
          >
            <Icon name="close" />
          </button>
        </div>
        <div
          id="builder-command-results"
          role="listbox"
          aria-label="Commands"
          className="builder-command-results"
        >
          {!matches.length && <p>No matches</p>}
          {matches.map((command, i) => (
            <div key={`${command.group}-${command.label}`}>
              {(i === 0 || matches[i - 1].group !== command.group) && (
                <p className="builder-command-group">{command.group}</p>
              )}
              <button
                id={`builder-command-${i}`}
                role="option"
                aria-selected={selected === i}
                aria-disabled={command.disabled}
                tabIndex={-1}
                onMouseMove={() => setIndex(i)}
                onClick={() => execute(command)}
              >
                <Icon name={command.icon} />
                <span>{command.label}</span>
                {command.hint && <kbd>{command.hint}</kbd>}
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function SheetHandle({ onClose }: { onClose: () => void }) {
  const start = useRef(0);
  return (
    <button
      type="button"
      className="builder-sheet-handle"
      aria-label="Close sheet"
      title="Drag down or tap to close"
      onClick={onClose}
      onPointerDown={(event) => {
        start.current = event.clientY;
        event.currentTarget.setPointerCapture(event.pointerId);
      }}
      onPointerMove={(event) => {
        if (event.currentTarget.hasPointerCapture(event.pointerId))
          event.currentTarget.parentElement?.style.setProperty(
            "--sheet-offset",
            `${Math.max(0, event.clientY - start.current)}px`,
          );
      }}
      onPointerUp={(event) => {
        event.currentTarget.parentElement?.style.setProperty(
          "--sheet-offset",
          "0px",
        );
        if (event.clientY - start.current > 96) onClose();
      }}
      onPointerCancel={(event) =>
        event.currentTarget.parentElement?.style.setProperty(
          "--sheet-offset",
          "0px",
        )
      }
    >
      <span />
    </button>
  );
}
