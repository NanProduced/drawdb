import { createContext, useState, useCallback, useRef, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useSettings, useDiagram } from "../hooks";
import { chatCompletion } from "../services/aiService";
import { executeTool, toolDefinitions } from "../services/aiTools";
import { buildSystemPrompt } from "../services/aiPrompts";
import { db } from "../data/db";

export const AIContext = createContext(null);

const SAVE_DEBOUNCE_MS = 800;
const MAX_AGENT_ITERATIONS = 10;

function toApiMessages(messages) {
  return messages
    .filter((m) => !m.displayOnly)
    .map((m) => {
      if (m.role === "assistant" && m.toolCalls) {
        return {
          role: "assistant",
          content: m.content || null,
          tool_calls: m.toolCalls.map((tc) => ({
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
        };
      }
      if (m.role === "tool") {
        return {
          role: "tool",
          tool_call_id: m.toolCallId,
          content: m.content,
        };
      }
      return {
        role: m.role,
        content: m.content,
      };
    });
}

export default function AIContextProvider({ children, diagramId }) {
  const [messages, setMessages] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const abortControllerRef = useRef(null);
  const messagesRef = useRef([]);
  const diagramRef = useRef(null);
  const saveTimerRef = useRef(null);
  const loadedDiagramIdRef = useRef(null);
  const { settings } = useSettings();
  const diagram = useDiagram();
  const { t } = useTranslation();

  diagramRef.current = diagram;

  const saveMessagesToDB = useCallback(async (msgs, dId) => {
    if (!dId) return;
    try {
      await db.diagrams.where("diagramId").equals(dId).modify({
        aiMessages: msgs,
      });
    } catch (e) {
      console.error("Failed to save AI messages:", e);
    }
  }, []);

  const debouncedSave = useCallback(
    (msgs) => {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
      }
      saveTimerRef.current = setTimeout(() => {
        saveMessagesToDB(msgs, loadedDiagramIdRef.current);
      }, SAVE_DEBOUNCE_MS);
    },
    [saveMessagesToDB],
  );

  useEffect(() => {
    if (!diagramId) return;

    const loadMessages = async () => {
      try {
        const diagram = await db.diagrams
          .where("diagramId")
          .equals(diagramId)
          .first();
        if (diagram && diagram.aiMessages) {
          messagesRef.current = diagram.aiMessages;
          setMessages(diagram.aiMessages);
        } else {
          messagesRef.current = [];
          setMessages([]);
        }
      } catch (e) {
        console.error("Failed to load AI messages:", e);
        messagesRef.current = [];
        setMessages([]);
      }
    };

    loadMessages();
    loadedDiagramIdRef.current = diagramId;

    return () => {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
        saveMessagesToDB(messagesRef.current, diagramId);
      }
    };
  }, [diagramId, saveMessagesToDB]);

  useEffect(() => {
    if (!loadedDiagramIdRef.current) return;
    if (messages.length === 0 && messagesRef.current.length === 0) return;
    debouncedSave(messagesRef.current);
  }, [messages, debouncedSave]);

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

      const currentDiagram = diagramRef.current;

      try {
        const systemPrompt = buildSystemPrompt(
          currentDiagram.database,
          currentDiagram.tables,
        );

        const apiMessages = [
          { role: "system", content: systemPrompt },
          ...toApiMessages(newMessages),
        ];

        abortControllerRef.current = new AbortController();

        let continueLoop = true;
        let iterations = 0;
        let currentMessages = [...newMessages];

        while (continueLoop && iterations < MAX_AGENT_ITERATIONS) {
          iterations++;
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
                diagramRef.current,
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
            displayOnly: true,
          };
          messagesRef.current = [...messagesRef.current, cancelMessage];
          setMessages([...messagesRef.current]);
        } else {
          setError(e.message || "An error occurred while calling the AI.");
          const errorMessage = {
            role: "assistant",
            content: `${t("ai_error_prefix")}${e.message || "Failed to get AI response."}`,
            displayOnly: true,
          };
          messagesRef.current = [...messagesRef.current, errorMessage];
          setMessages([...messagesRef.current]);
        }
      } finally {
        setIsLoading(false);
        abortControllerRef.current = null;
      }
    },
    [settings, t],
  );

  const stopGeneration = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
  }, []);

  const clearChat = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    messagesRef.current = [];
    setMessages([]);
    setError(null);
    if (loadedDiagramIdRef.current) {
      saveMessagesToDB([], loadedDiagramIdRef.current);
    }
  }, [saveMessagesToDB]);

  const clearError = useCallback(() => {
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
        clearError,
      }}
    >
      {children}
    </AIContext.Provider>
  );
}
