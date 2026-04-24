import { useState } from "react";
import { useTranslation } from "react-i18next";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

function ThinkBlock({ content }) {
  const [open, setOpen] = useState(false);
  const { t } = useTranslation();

  return (
    <div
      className="mb-2 rounded-md overflow-hidden"
      style={{
        border: "1px solid rgba(var(--semi-grey-3), 1)",
        background: "rgba(var(--semi-grey-1), 0.5)",
      }}
    >
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium transition-colors"
        style={{ color: "var(--semi-color-text-3)" }}
      >
        <i
          className={`fa-solid fa-chevron-right text-[9px] transition-transform duration-200 ${open ? "rotate-90" : ""}`}
        />
        {t("ai_thinking")}
      </button>
      {open && (
        <div
          className="px-2.5 pb-2 text-xs leading-relaxed"
          style={{ color: "var(--semi-color-text-3)" }}
        >
          <ReactMarkdown remarkPlugins={[remarkGfm]}>
            {content}
          </ReactMarkdown>
        </div>
      )}
    </div>
  );
}

function parseThinkContent(text) {
  if (!text) return [];

  const parts = [];
  const thinkRegex = /<think\s*>([\s\S]*?)(?:<\/think\s*>|$)/g;
  let match;
  let lastIndex = 0;

  while ((match = thinkRegex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push({
        type: "text",
        content: text.slice(lastIndex, match.index),
      });
    }
    parts.push({
      type: "think",
      content: match[1].trim(),
    });
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    parts.push({
      type: "text",
      content: text.slice(lastIndex),
    });
  }

  if (parts.length === 0) {
    return [{ type: "text", content: text }];
  }

  return parts;
}

export default function ChatMessage({ message }) {
  const isUser = message.role === "user";
  const isTool = message.role === "tool";
  const isDisplayOnly = message.displayOnly;
  const { t } = useTranslation();

  if (isDisplayOnly) {
    return (
      <div className="flex justify-center">
        <div
          className="text-xs px-3 py-1.5 rounded-md"
          style={{
            background: "rgba(var(--semi-grey-2), 1)",
            color: "var(--semi-color-text-3)",
          }}
        >
          {message.content}
        </div>
      </div>
    );
  }

  if (isTool) {
    let result;
    try {
      result =
        typeof message.content === "string"
          ? JSON.parse(message.content)
          : message.content;
    } catch {
      result = { message: message.content };
    }

    const isCreateTables = message.toolName === "create_tables";
    const successCount = result.results?.filter((r) => r.success).length || 0;

    return (
      <div className="flex justify-start">
        <div
          className="max-w-[85%] rounded-lg px-3 py-2.5 text-sm"
          style={{
            background: isCreateTables && successCount > 0
              ? "rgba(var(--semi-green-5), 0.08)"
              : "rgba(var(--semi-grey-1), 1)",
            border: "1px solid " + (isCreateTables && successCount > 0
              ? "rgba(var(--semi-green-5), 0.2)"
              : "rgba(var(--semi-grey-3), 1)"),
          }}
        >
          <div className="flex items-center gap-2 mb-1">
            <i
              className={
                isCreateTables && successCount > 0
                  ? "fa-solid fa-check-circle"
                  : "fa-solid fa-circle-info"
              }
              style={{
                fontSize: "11px",
                color: isCreateTables && successCount > 0
                  ? "rgba(var(--semi-green-5), 1)"
                  : "var(--semi-color-text-3)",
              }}
            />
            <span
              className="text-xs font-medium"
              style={{
                color: isCreateTables && successCount > 0
                  ? "rgba(var(--semi-green-5), 1)"
                  : "var(--semi-color-text-2)",
              }}
            >
              {isCreateTables && successCount > 0
                ? t("ai_tables_created", { count: successCount })
                : t("ai_tool_executed")}
            </span>
          </div>
          {result.results?.filter((r) => r.success).length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-1.5">
              {result.results
                .filter((r) => r.success)
                .map((r, i) => (
                  <span
                    key={i}
                    className="text-xs px-2 py-0.5 rounded-md font-mono"
                    style={{
                      background: "rgba(var(--semi-blue-5), 0.1)",
                      color: "rgba(var(--semi-blue-5), 1)",
                    }}
                  >
                    {r.tableName}
                  </span>
                ))}
            </div>
          )}
          {result.results?.filter((r) => !r.success).length > 0 && (
            <div className="mt-1.5">
              {result.results
                .filter((r) => !r.success)
                .map((r, i) => (
                  <span
                    key={i}
                    className="text-xs block"
                    style={{ color: "rgba(var(--semi-red-5), 1)" }}
                  >
                    {r.error}
                  </span>
                ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  const parts = parseThinkContent(message.content || "");
  const hasVisibleContent = parts.some(
    (p) => p.type === "text" && p.content.trim(),
  );

  if (!isUser && !hasVisibleContent && parts.length === 0) {
    return null;
  }

  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className="max-w-[85%] rounded-lg px-3 py-2 text-sm"
        style={
          isUser
            ? {
                background: "rgba(var(--semi-blue-5), 1)",
                color: "white",
              }
            : {
                background: "rgba(var(--semi-grey-1), 1)",
                color: "var(--semi-color-text-1)",
              }
        }
      >
        {isUser ? (
          <div className="whitespace-pre-wrap break-words leading-relaxed">
            {message.content}
          </div>
        ) : (
          <div className="ai-markdown-content">
            {parts.map((part, i) =>
              part.type === "think" ? (
                <ThinkBlock key={i} content={part.content} />
              ) : part.content.trim() ? (
                <ReactMarkdown key={i} remarkPlugins={[remarkGfm]}>
                  {part.content}
                </ReactMarkdown>
              ) : null,
            )}
          </div>
        )}
        {message.toolCalls && message.toolCalls.length > 0 && (
          <div
            className="mt-2 pt-1.5 text-xs flex items-center gap-1.5"
            style={{
              borderTop: isUser
                ? "1px solid rgba(255,255,255,0.2)"
                : "1px solid rgba(var(--semi-grey-3), 1)",
              opacity: 0.8,
            }}
          >
            <i className="fa-solid fa-wand-magic" />
            <span>
              {message.toolCalls.map((tc) => tc.name).join(", ")}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
