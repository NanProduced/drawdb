import { createContext, useState, useCallback, useRef, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useSettings, useDiagram, useUndoRedo, usePostgresSchema } from "../hooks";
import { chatCompletion } from "../services/aiService";
import { executeTool, toolDefinitions } from "../services/aiTools";
import { buildSystemPrompt } from "../services/aiPrompts";
import { db } from "../data/db";

export const AIContext = createContext(null);

const SAVE_DEBOUNCE_MS = 800;
const MAX_AGENT_ITERATIONS = 10;
const STREAM_RENDER_INTERVAL = 50;

function deepCloneField(field) {
  return {
    id: field.id,
    name: field.name,
    type: field.type,
    default: field.default,
    check: field.check,
    primary: field.primary,
    unique: field.unique,
    unsigned: field.unsigned,
    notNull: field.notNull,
    increment: field.increment,
    comment: field.comment,
    size: field.size,
    values: field.values ? [...field.values] : [],
    isArray: field.isArray,
  };
}

function deepCloneTable(table) {
  return {
    id: table.id,
    name: table.name,
    x: table.x,
    y: table.y,
    locked: table.locked,
    fields: table.fields ? table.fields.map(deepCloneField) : [],
    comment: table.comment,
    indices: table.indices ? table.indices.map((idx) => ({ ...idx })) : [],
    color: table.color,
  };
}

function deepCloneRelationship(rel) {
  return { ...rel };
}

function deepCloneTables(tables) {
  return tables ? tables.map(deepCloneTable) : [];
}

function deepCloneRelationships(relationships) {
  return relationships ? relationships.map(deepCloneRelationship) : [];
}

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
  const connectedSchemaRef = useRef(null);
  const { settings } = useSettings();
  const diagram = useDiagram();
  const { setUndoStack, setRedoStack } = useUndoRedo();
  const { connectedSchema, clearConnectedSchema } = usePostgresSchema();
  const { t } = useTranslation();

  diagramRef.current = diagram;
  connectedSchemaRef.current = connectedSchema;

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

    if (loadedDiagramIdRef.current && loadedDiagramIdRef.current !== diagramId) {
      clearConnectedSchema();
    }

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
  }, [diagramId, saveMessagesToDB, clearConnectedSchema]);

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

        const currentDiagram = diagramRef.current;
        const database = currentDiagram.database;
        const tables = deepCloneTables(currentDiagram.tables);
        const relationships = deepCloneRelationships(currentDiagram.relationships);

        const relevantTableIdsSet = new Set();
        const relevantTableNamesSet = new Set();

        const userTextLower = text.toLowerCase();
        tables.forEach((table) => {
          const tableNameLower = table.name.toLowerCase();
          if (userTextLower.includes(tableNameLower)) {
            relevantTableNamesSet.add(table.name);
          }
        });

        while (continueLoop && iterations < MAX_AGENT_ITERATIONS) {
          iterations++;

          const streamingMessage = {
            role: "assistant",
            content: "",
          };
          currentMessages = [...currentMessages, streamingMessage];
          messagesRef.current = currentMessages;
          setMessages([...currentMessages]);

          const relevantTableIds = Array.from(relevantTableIdsSet);
          const relevantTableNames = Array.from(relevantTableNamesSet);

          const systemPrompt = buildSystemPrompt(database, tables, relationships, {
            relevantTableIds,
            relevantTableNames,
            connectedSchema: connectedSchemaRef.current,
          });

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
                { 
                  tables, 
                  relationships, 
                  diagram: diagramRef.current,
                  setUndoStack,
                  setRedoStack,
                },
              );

              if (toolResult && typeof toolResult === "object") {
                if (toolResult.affected_tables && Array.isArray(toolResult.affected_tables)) {
                  toolResult.affected_tables.forEach((t) => {
                    if (t.id) relevantTableIdsSet.add(t.id);
                    if (t.name) relevantTableNamesSet.add(t.name);
                  });
                }
                if (toolResult.affected_relationships && Array.isArray(toolResult.affected_relationships)) {
                  toolResult.affected_relationships.forEach((r) => {
                    if (r.from_table) relevantTableNamesSet.add(r.from_table);
                    if (r.to_table) relevantTableNamesSet.add(r.to_table);
                  });
                }
              }

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
    [settings, t, setUndoStack, setRedoStack],
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
