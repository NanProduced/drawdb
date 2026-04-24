import { useState, useRef } from "react";
import { useTranslation } from "react-i18next";

export default function ChatInput({
  onSend,
  isLoading,
  onStop,
  hasApiKey,
  onOpenSettings,
}) {
  const [text, setText] = useState("");
  const textareaRef = useRef(null);
  const { t } = useTranslation();

  const handleSend = () => {
    if (!text.trim() || isLoading) return;
    onSend(text.trim());
    setText("");
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleInput = (e) => {
    setText(e.target.value);
    const el = e.target;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 120) + "px";
  };

  if (!hasApiKey) {
    return (
      <div
        className="px-4 py-3"
        style={{ borderTop: "1px solid rgba(var(--semi-grey-3), 1)" }}
      >
        <button
          onClick={onOpenSettings}
          className="w-full text-sm py-2 rounded-lg transition-colors font-medium"
          style={{
            background: "rgba(var(--semi-blue-5), 0.1)",
            color: "rgba(var(--semi-blue-5), 1)",
            border: "1px solid rgba(var(--semi-blue-5), 0.2)",
          }}
        >
          <i className="fa-solid fa-key mr-1.5" />
          {t("ai_configure_key_start")}
        </button>
      </div>
    );
  }

  return (
    <div
      className="px-3 py-3"
      style={{ borderTop: "1px solid rgba(var(--semi-grey-3), 1)" }}
    >
      <div
        className="flex items-end gap-2 rounded-lg px-3 py-1.5"
        style={{
          background: "rgba(var(--semi-grey-1), 1)",
          border: "1px solid rgba(var(--semi-grey-3), 1)",
        }}
      >
        <textarea
          ref={textareaRef}
          value={text}
          onChange={handleInput}
          onKeyDown={handleKeyDown}
          placeholder={t("ai_placeholder")}
          rows={1}
          className="flex-1 resize-none bg-transparent text-sm focus:outline-none py-1.5"
          style={{
            maxHeight: 120,
            color: "var(--semi-color-text-1)",
          }}
          disabled={isLoading}
        />
        {isLoading ? (
          <button
            onClick={onStop}
            className="flex-shrink-0 w-7 h-7 rounded-md flex items-center justify-center transition-colors"
            style={{
              background: "rgba(var(--semi-red-5), 0.1)",
              color: "rgba(var(--semi-red-5), 1)",
            }}
            title={t("ai_stop")}
          >
            <i className="fa-solid fa-stop text-[10px]" />
          </button>
        ) : (
          <button
            onClick={handleSend}
            disabled={!text.trim()}
            className="flex-shrink-0 w-7 h-7 rounded-md flex items-center justify-center transition-colors"
            style={{
              background: text.trim()
                ? "rgba(var(--semi-blue-5), 1)"
                : "rgba(var(--semi-grey-3), 1)",
              color: text.trim() ? "white" : "var(--semi-color-text-3)",
              cursor: text.trim() ? "pointer" : "not-allowed",
            }}
            title={t("ai_send")}
          >
            <i className="fa-solid fa-arrow-up text-[10px]" />
          </button>
        )}
      </div>
    </div>
  );
}
