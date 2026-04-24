import { createContext, useState, useCallback, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useSettings, useDiagram } from "../hooks";
import { chatCompletion } from "../services/aiService";
import { executeTool, toolDefinitions } from "../services/aiTools";
import { buildSystemPrompt } from "../services/aiPrompts";

export const AIContext = createContext(null);

export default function AIContextProvider({ children }) {
  const [messages, setMessages] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const abortControllerRef = useRef(null);
  const messagesRef = useRef([]);
  const { settings } = useSettings();
  const diagram = useDiagram();
  const { t } = useTranslation();

  const sendMessage = useCallback(
    async (text) => {
      if (!text.trim()) return;
      if (!settings.aiApiKey) {
        setError(t("ai_please_configure_api_key"));
        return;
      }

      setError(null);
      const userMessage = { role: "user", content: text };
      const newMessages = [...messagesRef.current, userMessage];
      messagesRef.current = newMessages;
      setMessages([...newMessages]);
      setIsLoading(true);

      try {
        const systemPrompt = buildSystemPrompt(
          diagram.database,
          diagram.tables,
        );

        const apiMessages = [
          { role: "system", content: systemPrompt },
          ...newMessages.map((m) => ({
            role: m.role,
            content: m.content,
          })),
        ];

        abortControllerRef.current = new AbortController();

        let continueLoop = true;
        let currentMessages = [...newMessages];

        while (continueLoop) {
          const result = await chatCompletion({
            messages: apiMessages,
            tools: toolDefinitions,
            provider: settings.aiProvider,
            apiKey: settings.aiApiKey,
            model: settings.aiModel,
            baseUrl: settings.aiBaseUrl,
            signal: abortControllerRef.current.signal,
          });

          if (result.toolCalls && result.toolCalls.length > 0) {
            const assistantMessage = {
              role: "assistant",
              content: result.content || "",
              toolCalls: result.toolCalls,
            };
            currentMessages = [...currentMessages, assistantMessage];
            messagesRef.current = currentMessages;
            setMessages([...currentMessages]);

            apiMessages.push({
              role: "assistant",
              content: result.content || null,
              tool_calls: result.toolCalls.map((tc) => ({
                id: tc.id,
                type: "function",
                function: {
                  name: tc.name,
                  arguments:
                    typeof tc.arguments === "string"
                      ? tc.arguments
                      : JSON.stringify(tc.arguments),
                },
              })),
            });

            for (const toolCall of result.toolCalls) {
              const toolResult = executeTool(
                toolCall.name,
                toolCall.arguments,
                diagram,
              );

              const toolMessage = {
                role: "tool",
                content:
                  typeof toolResult === "string"
                    ? toolResult
                    : JSON.stringify(toolResult),
                toolCallId: toolCall.id,
                toolName: toolCall.name,
              };
              currentMessages = [...currentMessages, toolMessage];
              messagesRef.current = currentMessages;
              setMessages([...currentMessages]);

              apiMessages.push({
                role: "tool",
                tool_call_id: toolCall.id,
                content:
                  typeof toolResult === "string"
                    ? toolResult
                    : JSON.stringify(toolResult),
              });
            }

            continueLoop = true;
          } else {
            const assistantMessage = {
              role: "assistant",
              content: result.content || "",
            };
            currentMessages = [...currentMessages, assistantMessage];
            messagesRef.current = currentMessages;
            setMessages([...currentMessages]);
            continueLoop = false;
          }
        }
      } catch (e) {
        if (e.name === "AbortError") {
          const cancelMessage = {
            role: "assistant",
            content: t("ai_operation_cancelled"),
          };
          messagesRef.current = [...messagesRef.current, cancelMessage];
          setMessages([...messagesRef.current]);
        } else {
          setError(e.message || "An error occurred while calling the AI.");
          const errorMessage = {
            role: "assistant",
            content: `${t("ai_error_prefix")}${e.message || "Failed to get AI response."}`,
          };
          messagesRef.current = [...messagesRef.current, errorMessage];
          setMessages([...messagesRef.current]);
        }
      } finally {
        setIsLoading(false);
        abortControllerRef.current = null;
      }
    },
    [settings, diagram, t],
  );

  const stopGeneration = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
  }, []);

  const clearChat = useCallback(() => {
    messagesRef.current = [];
    setMessages([]);
    setError(null);
  }, []);

  return (
    <AIContext.Provider
      value={{
        messages,
        isLoading,
        error,
        sendMessage,
        stopGeneration,
        clearChat,
      }}
    >
      {children}
    </AIContext.Provider>
  );
}
