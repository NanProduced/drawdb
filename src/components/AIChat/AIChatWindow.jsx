import { useState, useContext, useRef, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { AIContext } from "../../context/AIContext";
import { useSettings } from "../../hooks";
import { MODAL } from "../../data/constants";
import ChatMessage from "./ChatMessage";
import ChatInput from "./ChatInput";

export default function AIChatWindow({ setModal }) {
  const [isOpen, setIsOpen] = useState(false);
  const { messages, isLoading, sendMessage, stopGeneration, clearChat } =
    useContext(AIContext);
  const { settings } = useSettings();
  const messagesEndRef = useRef(null);
  const { t } = useTranslation();

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = (text) => {
    sendMessage(text);
  };

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="group fixed bottom-20 right-6 z-50 flex items-center gap-2 px-3.5 py-2.5 rounded-xl shadow-lg transition-all duration-200 hover:shadow-xl hover:scale-[1.02] active:scale-[0.98]"
        style={{
          background: settings.mode === "dark"
            ? "rgba(var(--semi-grey-1), 1)"
            : "rgba(var(--semi-grey-0), 1)",
          border: "1px solid rgba(var(--semi-grey-3), 1)",
        }}
        title={t("ai_assistant")}
      >
        <div
          className="w-7 h-7 rounded-lg flex items-center justify-center"
          style={{ background: "rgba(var(--semi-blue-5), 1)" }}
        >
          <i className="fa-solid fa-sparkles text-white text-xs" />
        </div>
        <span
          className="text-sm font-medium"
          style={{ color: "var(--semi-color-text-1)" }}
        >
          AI
        </span>
      </button>
    );
  }

  return (
    <div
      className="fixed bottom-20 right-6 w-[400px] h-[540px] rounded-xl z-50 flex flex-col overflow-hidden"
      style={{
        background: "var(--semi-color-bg-0)",
        border: "1px solid rgba(var(--semi-grey-3), 1)",
        boxShadow: "0 8px 40px rgba(0,0,0,0.12), 0 0 0 1px rgba(var(--semi-grey-3), 0.3)",
      }}
    >
      <div
        className="flex items-center justify-between px-4 py-3"
        style={{
          borderBottom: "1px solid rgba(var(--semi-grey-3), 1)",
          background: "var(--semi-color-bg-1)",
        }}
      >
        <div className="flex items-center gap-2.5">
          <div
            className="w-6 h-6 rounded-md flex items-center justify-center"
            style={{ background: "rgba(var(--semi-blue-5), 1)" }}
          >
            <i className="fa-solid fa-sparkles text-white text-[10px]" />
          </div>
          <div>
            <span
              className="text-sm font-semibold"
              style={{ color: "var(--semi-color-text-1)" }}
            >
              {t("ai_assistant")}
            </span>
            {isLoading && (
              <span
                className="ml-2 text-xs"
                style={{ color: "var(--semi-color-text-3)" }}
              >
                {t("ai_thinking")}
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-0.5">
          <button
            onClick={clearChat}
            className="w-7 h-7 rounded-md flex items-center justify-center transition-colors"
            style={{ color: "var(--semi-color-text-3)" }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = "rgba(var(--semi-grey-2), 1)";
              e.currentTarget.style.color = "var(--semi-color-text-1)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "transparent";
              e.currentTarget.style.color = "var(--semi-color-text-3)";
            }}
            title={t("ai_clear_chat")}
          >
            <i className="fa-solid fa-trash-can text-xs" />
          </button>
          <button
            onClick={() => setModal(MODAL.AI_SETTINGS)}
            className="w-7 h-7 rounded-md flex items-center justify-center transition-colors"
            style={{ color: "var(--semi-color-text-3)" }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = "rgba(var(--semi-grey-2), 1)";
              e.currentTarget.style.color = "var(--semi-color-text-1)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "transparent";
              e.currentTarget.style.color = "var(--semi-color-text-3)";
            }}
            title={t("ai_settings")}
          >
            <i className="fa-solid fa-gear text-xs" />
          </button>
          <button
            onClick={() => setIsOpen(false)}
            className="w-7 h-7 rounded-md flex items-center justify-center transition-colors"
            style={{ color: "var(--semi-color-text-3)" }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = "rgba(var(--semi-grey-2), 1)";
              e.currentTarget.style.color = "var(--semi-color-text-1)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "transparent";
              e.currentTarget.style.color = "var(--semi-color-text-3)";
            }}
            title={t("ai_minimize")}
          >
            <i className="fa-solid fa-chevron-down text-xs" />
          </button>
        </div>
      </div>

      <div
        className="flex-1 overflow-y-auto p-4"
        style={{ background: "var(--semi-color-bg-0)" }}
      >
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center px-6">
            <div
              className="w-12 h-12 rounded-xl flex items-center justify-center mb-4"
              style={{
                background: "rgba(var(--semi-blue-5), 0.1)",
                color: "rgba(var(--semi-blue-5), 1)",
              }}
            >
              <i className="fa-solid fa-sparkles text-xl" />
            </div>
            <p
              className="text-sm font-semibold mb-1.5"
              style={{ color: "var(--semi-color-text-1)" }}
            >
              {t("ai_designer_title")}
            </p>
            <p
              className="text-xs leading-relaxed mb-4"
              style={{ color: "var(--semi-color-text-3)" }}
            >
              {t("ai_designer_desc")}
            </p>
            {!settings.aiApiKey && (
              <button
                onClick={() => setModal(MODAL.AI_SETTINGS)}
                className="text-xs px-3 py-1.5 rounded-md transition-colors"
                style={{
                  background: "rgba(var(--semi-amber-5), 0.1)",
                  color: "rgba(var(--semi-amber-5), 1)",
                  border: "1px solid rgba(var(--semi-amber-5), 0.2)",
                }}
              >
                <i className="fa-solid fa-key mr-1.5" />
                {t("ai_configure_key")}
              </button>
            )}
          </div>
        )}
        <div className="space-y-3">
          {messages.map((msg, i) => (
            <ChatMessage key={i} message={msg} />
          ))}
          {isLoading && (
            <div className="flex items-center gap-2 px-1">
              <div className="flex gap-1">
                <span
                  className="w-1.5 h-1.5 rounded-full animate-bounce"
                  style={{
                    background: "var(--semi-color-text-3)",
                    animationDelay: "0ms",
                    animationDuration: "800ms",
                  }}
                />
                <span
                  className="w-1.5 h-1.5 rounded-full animate-bounce"
                  style={{
                    background: "var(--semi-color-text-3)",
                    animationDelay: "150ms",
                    animationDuration: "800ms",
                  }}
                />
                <span
                  className="w-1.5 h-1.5 rounded-full animate-bounce"
                  style={{
                    background: "var(--semi-color-text-3)",
                    animationDelay: "300ms",
                    animationDuration: "800ms",
                  }}
                />
              </div>
            </div>
          )}
        </div>
        <div ref={messagesEndRef} />
      </div>

      <ChatInput
        onSend={handleSend}
        isLoading={isLoading}
        onStop={stopGeneration}
        hasApiKey={!!settings.aiApiKey}
        onOpenSettings={() => setModal(MODAL.AI_SETTINGS)}
      />
    </div>
  );
}
