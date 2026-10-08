"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import Image from "next/image";
import { useTimePreview } from "@/components/time/time-preview-provider";

type ChatRole = "user" | "assistant";
const BOT_NAME = "Southern Company Bot";
const BOT_LOGO_SRC = "/logo.svg";

interface ChatMessage {
  id: string;
  role: ChatRole;
  content: string;
  pending?: boolean;
}

interface ChatFilterContext {
  includeExceptions?: boolean;
  asOfDate?: string;
  state?: string;
  affiliate?: string;
  county?: string;
  deviceType?: string;
  siteCode?: string;
}

interface StreamHandlers {
  onToken: (token: string) => void;
  onError: (message: string) => void;
  onDone: () => void;
}

function createId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `id-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function parseBooleanParam(value: string | null): boolean | undefined {
  if (!value) {
    return undefined;
  }

  const normalized = value.toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) {
    return true;
  }
  if (["0", "false", "no", "off"].includes(normalized)) {
    return false;
  }

  return undefined;
}

function derivePathFilters(pathname: string): Partial<ChatFilterContext> {
  const segments = pathname.split("/").filter(Boolean);
  if (segments[0] !== "map" || segments[1] !== "state") {
    return {};
  }

  const filters: Partial<ChatFilterContext> = {};
  if (segments[2]) {
    filters.state = segments[2].toUpperCase();
  }
  if (segments[3] === "county" && segments[4]) {
    filters.county = segments[4];
  }
  if (segments[5] === "site" && segments[6]) {
    filters.siteCode = segments[6].toUpperCase();
  }

  return filters;
}

function buildFilterContext(
  pathname: string,
  searchParams: ReturnType<typeof useSearchParams>,
  asOfDate?: string,
): ChatFilterContext {
  const fromPath = derivePathFilters(pathname);

  return {
    asOfDate,
    includeExceptions:
      parseBooleanParam(searchParams.get("includeExceptions")) ?? fromPath.includeExceptions,
    state: searchParams.get("state") || fromPath.state,
    affiliate: searchParams.get("affiliate") || undefined,
    county: searchParams.get("county") || fromPath.county,
    deviceType: searchParams.get("deviceType") || undefined,
    siteCode: searchParams.get("siteCode") || fromPath.siteCode,
  };
}

function parseSseBlock(block: string): { event: string; data: string } | null {
  const lines = block
    .split("\n")
    .map((line) => line.trimEnd())
    .filter((line) => line.length > 0);
  if (!lines.length) {
    return null;
  }

  let event = "message";
  const data: string[] = [];
  for (const line of lines) {
    if (line.startsWith("event:")) {
      event = line.slice(6).trim();
      continue;
    }

    if (line.startsWith("data:")) {
      data.push(line.slice(5).trimStart());
    }
  }

  return { event, data: data.join("\n") };
}

async function consumeSseStream(
  stream: ReadableStream<Uint8Array>,
  handlers: StreamHandlers,
): Promise<void> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }

    buffer += decoder.decode(value, { stream: true });
    let boundary = buffer.indexOf("\n\n");
    while (boundary !== -1) {
      const block = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + 2);

      const parsed = parseSseBlock(block);
      if (parsed && parsed.data) {
        try {
          const payload = JSON.parse(parsed.data) as unknown;
          if (parsed.event === "token") {
            handlers.onToken((payload as { token?: string }).token ?? "");
          } else if (parsed.event === "error") {
            handlers.onError((payload as { error?: string }).error ?? "Chat request failed.");
          } else if (parsed.event === "done") {
            handlers.onDone();
          }
        } catch {
          handlers.onError("Invalid streaming payload from server.");
        }
      }

      boundary = buffer.indexOf("\n\n");
    }
  }
}

function toHistory(messages: ChatMessage[]): Array<{ role: ChatRole; content: string }> {
  return messages
    .filter((message) => !message.pending && message.content.trim().length > 0)
    .map((message) => ({
      role: message.role,
      content: message.content,
    }))
    .slice(-6);
}

export function ChatWidget() {
  const { asOfDate } = useTimePreview();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isOpen, setIsOpen] = useState(false);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [messages, isOpen]);

  const filterContext = useMemo(
    () => buildFilterContext(pathname, searchParams, asOfDate),
    [asOfDate, pathname, searchParams],
  );

  async function submitMessage(): Promise<void> {
    const question = input.trim();
    if (!question || isSubmitting) {
      return;
    }

    const userMessage: ChatMessage = {
      id: createId(),
      role: "user",
      content: question,
    };
    const assistantMessageId = createId();
    const assistantPlaceholder: ChatMessage = {
      id: assistantMessageId,
      role: "assistant",
      content: "",
      pending: true,
    };

    setError(null);
    setInput("");
    setIsSubmitting(true);
    setMessages((prev) => [...prev, userMessage, assistantPlaceholder]);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message: question,
          history: toHistory(messages),
          context: {
            pathname,
            filters: filterContext,
          },
        }),
      });

      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? `Chat request failed (${response.status}).`);
      }

      if (!response.body) {
        throw new Error("No streaming body returned from server.");
      }

      await consumeSseStream(response.body, {
        onToken: (token) => {
          if (!token) {
            return;
          }

          setMessages((prev) =>
            prev.map((message) =>
              message.id === assistantMessageId
                ? {
                    ...message,
                    content: `${message.content}${token}`,
                  }
                : message,
            ),
          );
        },
        onError: (message) => {
          setError(message);
          setMessages((prev) =>
            prev.map((item) =>
              item.id === assistantMessageId
                ? {
                    ...item,
                    content: item.content || `Error: ${message}`,
                    pending: false,
                  }
                : item,
            ),
          );
        },
        onDone: () => {
          setMessages((prev) =>
            prev.map((message) =>
              message.id === assistantMessageId
                ? {
                    ...message,
                    pending: false,
                  }
                : message,
            ),
          );
        },
      });
    } catch (requestError) {
      const message =
        requestError instanceof Error
          ? requestError.message
          : "Unable to send chat request.";
      setError(message);
      setMessages((prev) =>
        prev.map((item) =>
          item.id === assistantMessageId
            ? {
                ...item,
                content: item.content || `Error: ${message}`,
                pending: false,
              }
            : item,
        ),
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  function handleInputKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>): void {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void submitMessage();
    }
  }

  if (!isOpen) {
    return (
      <button
        type="button"
        className="chat-launcher"
        onClick={() => setIsOpen(true)}
        aria-label={`Open ${BOT_NAME}`}
      >
        <span className="chat-launcher-content">
          <Image
            src={BOT_LOGO_SRC}
            alt=""
            width={18}
            height={18}
            className="chat-bot-logo chat-bot-logo-sm"
            aria-hidden="true"
          />
          <span>Ask {BOT_NAME} about dashboard data...</span>
        </span>
      </button>
    );
  }

  return (
    <section className="chat-widget" aria-label={BOT_NAME}>
      <header className="chat-header">
        <div className="chat-header-brand">
          <Image
            src={BOT_LOGO_SRC}
            alt=""
            width={24}
            height={24}
            className="chat-bot-logo"
            aria-hidden="true"
          />
          <div>
            <h2 className="chat-title">{BOT_NAME}</h2>
            <p className="chat-subtitle">OpenAI + live database queries</p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setIsOpen(false)}
          className="chat-close-btn"
          aria-label="Close chat"
        >
          Close
        </button>
      </header>

      <div ref={listRef} className="chat-messages">
        {messages.length === 0 ? (
          <p className="chat-empty">
            Ask a question like: &quot;How many high-risk devices are in GA?&quot;
          </p>
        ) : null}

        {messages.map((message) => (
          <article
            key={message.id}
            className={`chat-message ${
              message.role === "user" ? "chat-message-user" : "chat-message-assistant"
            }`}
          >
            <div className="chat-message-role">
              {message.role === "user" ? (
                "You"
              ) : (
                <>
                  <Image
                    src={BOT_LOGO_SRC}
                    alt=""
                    width={13}
                    height={13}
                    className="chat-bot-logo chat-bot-logo-inline"
                    aria-hidden="true"
                  />
                  <span>{BOT_NAME}</span>
                </>
              )}
            </div>
            <div className="chat-message-content">
              {message.content || (message.pending ? "..." : "")}
              {message.pending ? <span className="chat-cursor">|</span> : null}
            </div>
          </article>
        ))}
      </div>

      {error ? <p className="chat-error">{error}</p> : null}

      <footer className="chat-input-wrap">
        <textarea
          value={input}
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={handleInputKeyDown}
          placeholder="Ask a question about the database..."
          className="chat-input"
          rows={3}
          disabled={isSubmitting}
        />
        <button
          type="button"
          className="chat-send-btn"
          onClick={() => void submitMessage()}
          disabled={isSubmitting || input.trim().length === 0}
        >
          {isSubmitting ? "Sending..." : "Send"}
        </button>
      </footer>
    </section>
  );
}
