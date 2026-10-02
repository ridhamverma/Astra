"use client";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { SheetHandle, trapFocus, useSheetFocus } from "./builder-ui";
import { NODE_DEFINITIONS } from "@/lib/simulation-editor";
import { aiApi, type GeneratedDraft } from "@/services/ai";
import { layoutGeneratedModel } from "@/lib/model-layout";
import { generationRequestKey } from "@/lib/insert-generated-model";
import type { SimulationModel } from "@/types/simulation";
import { Icon } from "@/components/dashboard/icon";
import { THINKING_WORDS } from "./thinking-words";
import {
  ChatComposer,
  ChatComposerInput,
  ChatSendButton,
  type ChatComposerInputHandle,
} from "@astryxdesign/core/Chat";

interface Exchange {
  id: string;
  prompt: string;
  draft?: GeneratedDraft;
  error?: string;
  inserted?: boolean;
  reviewed?: boolean;
}
const examples = [
  "Hospital ER with triage, two doctors, and a lab",
  "Bank with one queue and three tellers",
  "Order fulfillment: picking, packing, shipping",
  "Support center with 20% ticket escalation",
];
function ArrowUpRightIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M7 17 17 7M7 7h10v10" />
    </svg>
  );
}
function ArrowUpIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 19V5m-7 7 7-7 7 7" />
    </svg>
  );
}
function InfoIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="10" />
      <path d="M12 16v-4m0-4h.01" />
    </svg>
  );
}
function AlertIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="10" />
      <path d="M12 8v4m0 4h.01" />
    </svg>
  );
}
function SpinnerIcon() {
  return (
    <svg
      className="builder-spinner"
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="10" strokeDasharray="47 16" />
    </svg>
  );
}
function CheckCircleIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="9" />
      <path d="m8 12 2.5 2.5L16 9" />
    </svg>
  );
}
function ChevronRightIcon() {
  return (
    <svg
      className="builder-review-chevron"
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="m9 18 6-6-6-6" />
    </svg>
  );
}
function shuffleWords(words: string[]) {
  for (let index = words.length - 1; index > 0; index -= 1) {
    const target = Math.floor(Math.random() * (index + 1));
    [words[index], words[target]] = [words[target], words[index]];
  }
  return words;
}
export function ThinkingStatus() {
  const [word, setWord] = useState("Thinking");
  const [phase, setPhase] = useState<"idle" | "entering" | "exiting">("idle");
  useEffect(() => {
    const reduceMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    if (reduceMotion) return;

    const words = shuffleWords([...THINKING_WORDS]);
    let wordIndex = 1;
    let previousWord = words[0] ?? "Thinking";
    const firstPickTimer = window.setTimeout(() => setWord(previousWord), 0);
    const transitionTimers = new Set<number>();
    const wordTimer = window.setInterval(() => {
      setPhase("exiting");
      const exitTimer = window.setTimeout(() => {
        transitionTimers.delete(exitTimer);
        if (wordIndex >= words.length) {
          shuffleWords(words);
          if (words.length > 1 && words[0] === previousWord)
            [words[0], words[1]] = [words[1], words[0]];
          wordIndex = 0;
        }
        previousWord = words[wordIndex++] ?? "Thinking";
        setWord(previousWord);
        setPhase("entering");
        const enterTimer = window.setTimeout(() => {
          transitionTimers.delete(enterTimer);
          setPhase("idle");
        }, 250);
        transitionTimers.add(enterTimer);
      }, 200);
      transitionTimers.add(exitTimer);
    }, 2400);

    return () => {
      window.clearTimeout(firstPickTimer);
      window.clearInterval(wordTimer);
      transitionTimers.forEach((timer) => window.clearTimeout(timer));
    };
  }, []);

  return (
    <div className="builder-loading-status">
      <span className="builder-thinking-logo-breathe" aria-hidden="true">
        <span className="builder-astra-mark builder-thinking-logo" />
      </span>
      <div className="builder-thinking-word-line">
        <span className="builder-thinking-static" aria-hidden="true">
          Working…
        </span>
        <span className="builder-thinking-dynamic" aria-hidden="true">
          <span
            key={word}
            className={`builder-thinking-word ${phase !== "idle" ? `is-${phase}` : ""}`}
          >
            <span className="builder-thinking-word-shimmer">{word}</span>
          </span>
          <span className="builder-thinking-ellipsis">
            <i>.</i>
            <i>.</i>
            <i>.</i>
          </span>
        </span>
      </div>
      <span className="builder-sr-only" role="status" aria-live="polite">
        Astra is generating and validating your model
      </span>
    </div>
  );
}
export function ModelChat({
  disabled,
  open,
  onClose,
  onImport,
  onPendingChange,
}: {
  disabled: boolean;
  open: boolean;
  onClose: () => void;
  onImport: (model: SimulationModel) => void;
  onPendingChange?: (pending: boolean) => void;
}) {
  const [prompt, setPrompt] = useState("");
  const [pending, setPending] = useState(false);
  const [messages, setMessages] = useState<Exchange[]>([]);
  const [hasMoreConversation, setHasMoreConversation] = useState(false);
  const pendingRef = useRef(false);
  const inserted = useRef(new Set<string>());
  const input = useRef<ChatComposerInputHandle>(null);
  const focusAfterPromptUpdate = useRef(false);
  const panel = useRef<HTMLElement>(null);
  useSheetFocus(panel, open, "textarea");
  const conversation = useRef<HTMLDivElement>(null);
  const conversationEnd = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (open) input.current?.focus();
  }, [open]);
  useLayoutEffect(() => {
    if (!focusAfterPromptUpdate.current) return;
    focusAfterPromptUpdate.current = false;
    input.current?.focus();
  }, [prompt]);
  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      if (messages.length)
        conversationEnd.current?.scrollIntoView({
          behavior: window.matchMedia("(prefers-reduced-motion: reduce)")
            .matches
            ? "auto"
            : "smooth",
          block: "end",
        });
      const element = conversation.current;
      if (element)
        setHasMoreConversation(
          element.scrollHeight - element.clientHeight - element.scrollTop > 4,
        );
    });
    return () => window.cancelAnimationFrame(frame);
  }, [messages, pending]);
  useEffect(() => {
    const element = conversation.current;
    if (!element) return;
    const updateScrollFade = () =>
      setHasMoreConversation(
        element.scrollHeight - element.clientHeight - element.scrollTop > 4,
      );
    element.addEventListener("scroll", updateScrollFade, { passive: true });
    window.addEventListener("resize", updateScrollFade);
    if (typeof ResizeObserver === "undefined") return;
    const resizeObserver = new ResizeObserver(updateScrollFade);
    resizeObserver.observe(element);
    Array.from(element.children).forEach((child) =>
      resizeObserver.observe(child),
    );
    const frame = window.requestAnimationFrame(updateScrollFade);
    return () => {
      window.cancelAnimationFrame(frame);
      resizeObserver.disconnect();
      element.removeEventListener("scroll", updateScrollFade);
      window.removeEventListener("resize", updateScrollFade);
    };
  }, [messages, pending, prompt, open]);
  async function generate(value = prompt) {
    if (disabled || pendingRef.current || value.trim().length < 10) return;
    const text = value.trim();
    const id = crypto.randomUUID();
    pendingRef.current = true;
    setPending(true);
    onPendingChange?.(true);
    setPrompt("");
    setMessages((current) => [...current, { id, prompt: text }]);
    try {
      const draft = await aiApi.generate(text);
      setMessages((current) =>
        current.map((item) => (item.id === id ? { ...item, draft } : item)),
      );
    } catch (cause) {
      setMessages((current) =>
        current.map((item) =>
          item.id === id
            ? {
                ...item,
                error:
                  cause instanceof Error
                    ? cause.message
                    : "Could not generate a model.",
              }
            : item,
        ),
      );
    } finally {
      pendingRef.current = false;
      setPending(false);
      onPendingChange?.(false);
    }
  }
  function insert(item: Exchange) {
    if (disabled || !item.draft || !item.reviewed || item.inserted) return;
    const key = generationRequestKey(item.prompt);
    if (
      inserted.current.has(key) &&
      !window.confirm(
        "This request was already added. Add another copy to the canvas?",
      )
    )
      return;
    inserted.current.add(key);
    onImport(layoutGeneratedModel(item.draft.model));
    setMessages((current) =>
      current.map((message) =>
        message.id === item.id ? { ...message, inserted: true } : message,
      ),
    );
  }
  function chooseExample(example: string) {
    focusAfterPromptUpdate.current = true;
    setPrompt(example);
  }
  useEffect(() => {
    if (!open || !window.visualViewport) return;
    const viewport = window.visualViewport;
    const update = () =>
      panel.current?.style.setProperty(
        "--keyboard-space",
        `${Math.max(0, window.innerHeight - viewport.height - viewport.offsetTop)}px`,
      );
    update();
    viewport.addEventListener("resize", update);
    viewport.addEventListener("scroll", update);
    return () => {
      viewport.removeEventListener("resize", update);
      viewport.removeEventListener("scroll", update);
    };
  }, [open]);
  const latestError = messages[messages.length - 1]?.error;
  if (!open) return null;
  return (
    <aside
      ref={panel}
      role="dialog"
      id="astra-generation-drawer"
      className={`builder-ai-drawer glass ${open ? "is-open" : ""}`}
      aria-label="Ask Astra"
      aria-busy={pending}
      hidden={!open}
      onKeyDown={(event) => {
        if (window.innerWidth < 1024) trapFocus(event);
        if (event.key === "Escape") {
          event.stopPropagation();
          onClose();
        }
      }}
    >
      <SheetHandle onClose={onClose} />
      <header className="builder-chat-heading">
        <div>
          <h2>
            <span className="builder-astra-mark" aria-hidden="true" />
            Generate Model
          </h2>
          <p>
            Describe your process and Astra will draft a model for you to
            review.
          </p>
        </div>
        <button
          type="button"
          className="builder-chat-close"
          aria-label="Close Ask Astra"
          title="Close Ask Astra"
          data-tooltip="Close Ask Astra"
          onClick={onClose}
        >
          <Icon name="close" style={{ width: 16, height: 16 }} />
        </button>
      </header>
      <div
        className={`builder-conversation-frame${hasMoreConversation ? " has-more-content" : ""}`}
      >
        <div
          className="builder-conversation"
          ref={conversation}
          aria-label="Model generation conversation"
        >
          {!messages.length && (
            <>
              <div className="builder-chat-empty-heading">
                <span className="builder-astra-mark" aria-hidden="true" />
                <h3>What do you want to model?</h3>
              </div>
              <div
                className={`builder-example-section ${prompt ? "is-collapsed" : ""}`}
                aria-hidden={Boolean(prompt)}
                inert={Boolean(prompt)}
              >
                <div className="builder-example-content">
                  <p className="builder-example-label">Try an example</p>
                  <div className="builder-examples">
                    {examples.map((example) => (
                      <button
                        type="button"
                        key={example}
                        onClick={() => chooseExample(example)}
                      >
                        {example}
                        <ArrowUpRightIcon />
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </>
          )}
          {messages.map((item) => (
            <div key={item.id} className="builder-exchange">
              <p className="builder-user-message">{item.prompt}</p>
              {item.draft && (
                <div className="builder-astra-message builder-draft-card">
                  <div className="builder-draft-label">
                    <CheckCircleIcon />
                    <span>Validated draft</span>
                  </div>
                  <h3>{item.draft.model.name}</h3>
                  <div
                    className="builder-preview-chain"
                    aria-label="Generated node chain"
                  >
                    {item.draft.model.nodes.map((node) => (
                      <span key={node.id} title={node.name}>
                        <Icon name={NODE_DEFINITIONS[node.type].icon} />
                      </span>
                    ))}
                  </div>
                  <div className="builder-draft-meta">
                    <span>{item.draft.model.nodes.length} nodes</span>
                    <span>{item.draft.model.edges.length} connections</span>
                    <span>{item.draft.model.simulation.duration} min</span>
                  </div>
                  <details className="builder-draft-details">
                    <summary>
                      <ChevronRightIcon />
                      <span>Review parameters and assumptions</span>
                    </summary>
                    <div className="builder-random-seed">
                      <strong>
                        Random seed: {item.draft.model.simulation.seed}
                      </strong>
                      <span>Keeps results repeatable between runs.</span>
                    </div>
                    {item.draft.assumptions.length > 0 && (
                      <ul>
                        {item.draft.assumptions.map((assumption, index) => (
                          <li key={index}>{assumption}</li>
                        ))}
                      </ul>
                    )}
                    {item.draft.model.nodes.map((node) => (
                      <section key={node.id}>
                        <strong>
                          {node.name} · {node.type}
                        </strong>
                        <dl>
                          {Object.entries(node.config).map(([key, value]) => (
                            <div key={key}>
                              <dt>{key.replaceAll("_", " ")}</dt>
                              <dd>
                                {value == null
                                  ? "Unlimited / not set"
                                  : String(value)}
                              </dd>
                            </div>
                          ))}
                        </dl>
                      </section>
                    ))}
                    <ul>
                      {item.draft.model.edges.map((edge) => (
                        <li key={edge.id}>
                          {
                            item.draft!.model.nodes.find(
                              (node) => node.id === edge.source,
                            )?.name
                          }{" "}
                          →{" "}
                          {
                            item.draft!.model.nodes.find(
                              (node) => node.id === edge.target,
                            )?.name
                          }
                          {edge.probability != null
                            ? ` · ${edge.probability * 100}%`
                            : ""}
                        </li>
                      ))}
                    </ul>
                  </details>
                  {item.inserted ? (
                    <div className="builder-insert-success" role="status">
                      <p className="builder-inserted">
                        <CheckCircleIcon />
                        <span>Added to canvas · editable and unsaved</span>
                      </p>
                      <p>
                        Existing nodes and simulation settings are preserved.
                        Connect the new flow as needed, then save or run.
                      </p>
                    </div>
                  ) : (
                    <>
                      <label className="builder-review">
                        <input
                          type="checkbox"
                          checked={Boolean(item.reviewed)}
                          onChange={(event) =>
                            setMessages((current) =>
                              current.map((message) =>
                                message.id === item.id
                                  ? {
                                      ...message,
                                      reviewed: event.target.checked,
                                    }
                                  : message,
                              ),
                            )
                          }
                        />
                        <span className="builder-checkmark" aria-hidden="true">
                          <svg viewBox="0 0 16 16">
                            <path d="m3 8 3.2 3.2L13 4.5" />
                          </svg>
                        </span>
                        <span>I reviewed the parameters and assumptions.</span>
                      </label>
                      <button
                        type="button"
                        className="builder-primary builder-add-to-canvas"
                        aria-disabled={disabled || !item.reviewed}
                        disabled={disabled || !item.reviewed}
                        onClick={() => insert(item)}
                      >
                        Insert into canvas
                      </button>
                      <button
                        type="button"
                        className="builder-discard"
                        onClick={() =>
                          setMessages((current) =>
                            current.map((message) =>
                              message.id === item.id
                                ? { ...message, draft: undefined }
                                : message,
                            ),
                          )
                        }
                      >
                        Discard
                      </button>
                      {!item.reviewed && (
                        <p className="builder-review-hint">
                          Tick the box above to enable
                        </p>
                      )}
                      <p className="builder-chat-note">
                        Existing nodes and simulation settings are preserved.
                        Connect the new flow as needed, then save or run.
                      </p>
                    </>
                  )}
                </div>
              )}
            </div>
          ))}
          {pending && <ThinkingStatus />}
          <div
            className="builder-conversation-end"
            ref={conversationEnd}
            aria-hidden="true"
          />
        </div>
        <div className="builder-conversation-fade" aria-hidden="true" />
      </div>
      <form
        className="builder-composer"
        onSubmit={(event) => {
          event.preventDefault();
          void generate();
        }}
      >
        {latestError && (
          <div className="builder-composer-error" role="alert">
            <AlertIcon />
            <span>{latestError}</span>
            <button
              disabled={disabled || pending}
              type="button"
              onClick={() => {
                const item = messages[messages.length - 1];
                if (item) {
                  setPrompt(item.prompt);
                  input.current?.focus();
                }
              }}
            >
              Edit and retry
            </button>
          </div>
        )}
        <div className="astraComposer" data-disabled={disabled || pending}>
          <ChatComposer
            value={prompt}
            onChange={(value) => setPrompt(value.slice(0, 6000))}
            onSubmit={(value) => void generate(value)}
            placeholder="Describe the process you want to model…"
            isDisabled={disabled || pending}
            elevation="none"
            input={
              <ChatComposerInput
                id="builder-chat-input"
                handleRef={input}
                maxRows={6}
                triggers={[]}
                hasHistory={false}
                label="Describe the process you want to model"
                pasteAsToken={false}
              />
            }
            sendButton={
              <div className="astraComposerSend" title="Send (Enter)">
                <span className="builder-sr-only" id="builder-chat-send-name">
                  Generate
                </span>
                <ChatSendButton
                  isDisabled={disabled || pending || prompt.trim().length < 10}
                  sendIcon={pending ? <SpinnerIcon /> : <ArrowUpIcon />}
                  aria-label="Generate"
                  aria-labelledby="builder-chat-send-name"
                  aria-keyshortcuts="Enter"
                  aria-busy={pending}
                />
              </div>
            }
          />
        </div>
        <p className="builder-privacy-note">
          <InfoIcon />
          <span>
            Sent to your configured AI provider. Review before inserting.
            Generation never runs a simulation.
          </span>
        </p>
      </form>
    </aside>
  );
}
