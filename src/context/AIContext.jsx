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
const STREAM_RENDER_INTERVAL = 50;

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

      try {
        abortControllerRef.current = new AbortController();

        let continueLoop = true;
        let iterations = 0;
        let currentMessages = [...newMessages];
        let nonSystemApiMessages = toApiMessages(newMessages);

        while (continueLoop && iterations < MAX_AGENT_ITERATIONS) {
          iterations++;

          const streamingMessage = {
            role: "assistant",
            content: "",
          };
          currentMessages = [...currentMessages, streamingMessage];
          messagesRef.current = currentMessages;
          setMessages([...currentMessages]);

          const currentDiagram = diagramRef.current;
          const tables = [...currentDiagram.tables];
          const relationships = [...currentDiagram.relationships];

          const systemPrompt = buildSystemPrompt(
            currentDiagram.database,
            tables,
          );

          const apiMessages = [
            { role: "system", content: systemPrompt },
            ...nonSystemApiMessages,
          ];

          let lastRenderTime = 0;

          const result = await chatCompletion({
            messages: apiMessages,
            tools: toolDefinitions,
            provider: settings.aiProvider,
            apiKey: settings.aiApiKey,
            model: settings.aiModel,
            baseUrl: settings.aiBaseUrl,
            signal: abortControllerRef.current.signal,
            onContent: (partialContent) => {
              streamingMessage.content = partialContent;
              const now = Date.now();
              if (now - lastRenderTime >= STREAM_RENDER_INTERVAL) {
                lastRenderTime = now;
                setMessages([...messagesRef.current]);
              }
            },
          });

          streamingMessage.content = result.content || "";
          if (result.toolCalls && result.toolCalls.length > 0) {
            streamingMessage.toolCalls = result.toolCalls;
          }
          setMessages([...messagesRef.current]);

          if (result.toolCalls && result.toolCalls.length > 0) {
            nonSystemApiMessages.push({
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
                { tables, relationships, diagram: diagramRef.current },
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

              nonSystemApiMessages.push({
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
            continueLoop = false;
          }
        }
      } catch (e) {
        if (e.name === "AbortError") {
          const msgs = messagesRef.current;
          const lastMsg = msgs[msgs.length - 1];
          if (lastMsg && lastMsg.role === "assistant" && !lastMsg.toolCalls) {
            lastMsg.content = t("ai_operation_cancelled");
            lastMsg.displayOnly = true;
          } else {
            msgs.push({
              role: "assistant",
              content: t("ai_operation_cancelled"),
              displayOnly: true,
            });
          }
          setMessages([...msgs]);
        } else {
          setError(e.message || "An error occurred while calling the AI.");
          const msgs = messagesRef.current;
          const lastMsg = msgs[msgs.length - 1];
          if (lastMsg && lastMsg.role === "assistant" && !lastMsg.toolCalls && !lastMsg.content) {
            lastMsg.content = `${t("ai_error_prefix")}${e.message || "Failed to get AI response."}`;
            lastMsg.displayOnly = true;
          } else {
            msgs.push({
              role: "assistant",
              content: `${t("ai_error_prefix")}${e.message || "Failed to get AI response."}`,
              displayOnly: true,
            });
          }
          setMessages([...msgs]);
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
