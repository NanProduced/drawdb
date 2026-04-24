export async function chatCompletion({
  messages,
  tools,
  provider,
  apiKey,
  model,
  baseUrl,
  signal,
  onContent,
}) {
  if (provider === "openai" || provider === "compatible") {
    return onContent
      ? streamOpenAI({ messages, tools, apiKey, model, baseUrl, signal, onContent })
      : callOpenAI({ messages, tools, apiKey, model, baseUrl, signal });
  } else if (provider === "claude") {
    return onContent
      ? streamClaude({ messages, tools, apiKey, model, baseUrl, signal, onContent })
      : callClaude({ messages, tools, apiKey, model, baseUrl, signal });
  }
  throw new Error(`Unsupported AI provider: ${provider}`);
}

async function streamOpenAI({ messages, tools, apiKey, model, baseUrl, signal, onContent }) {
  const url = (baseUrl || "https://api.openai.com/v1").replace(/\/+$/, "") + "/chat/completions";

  const body = {
    model,
    messages,
    stream: true,
    tools: tools.map((t) => ({
      type: "function",
      function: {
        name: t.name,
        description: t.description,
        parameters: t.parameters,
      },
    })),
  };

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
    signal,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(
      err.error?.message || `OpenAI API error: HTTP ${res.status}`,
    );
  }

  let content = "";
  const toolCallsMap = new Map();

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  let streamDone = false;
  while (!streamDone) {
    const { done, value } = await reader.read();
    if (done) { streamDone = true; break; }

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || !trimmed.startsWith("data: ")) continue;
      const data = trimmed.slice(6);
      if (data === "[DONE]") { streamDone = true; break; }

      try {
        const parsed = JSON.parse(data);
        const delta = parsed.choices?.[0]?.delta;
        if (!delta) continue;

        if (delta.content) {
          content += delta.content;
          onContent(content);
        }

        if (delta.tool_calls) {
          for (const tc of delta.tool_calls) {
            const idx = tc.index ?? 0;
            if (!toolCallsMap.has(idx)) {
              toolCallsMap.set(idx, {
                id: tc.id || "",
                name: tc.function?.name || "",
                arguments: tc.function?.arguments || "",
              });
            } else {
              const existing = toolCallsMap.get(idx);
              if (tc.id) existing.id = tc.id;
              if (tc.function?.name) existing.name = tc.function.name;
              if (tc.function?.arguments) existing.arguments += tc.function.arguments;
            }
          }
        }
      } catch {
        // skip incomplete JSON chunks
      }
    }
  }

  const toolCalls = Array.from(toolCallsMap.values()).map((tc) => ({
    id: tc.id,
    name: tc.name,
    arguments: parseArguments(tc.arguments),
  }));

  return { content, toolCalls };
}

async function streamClaude({ messages, tools, apiKey, model, baseUrl, signal, onContent }) {
  const url = (baseUrl || "https://api.anthropic.com/v1").replace(/\/+$/, "") + "/messages";

  const systemMessage = messages.find((m) => m.role === "system");
  const nonSystemMessages = messages.filter((m) => m.role !== "system");

  const formattedMessages = formatClaudeMessages(nonSystemMessages);

  const claudeTools = tools.map((t) => ({
    name: t.name,
    description: t.description,
    input_schema: t.parameters,
  }));

  const body = {
    model,
    max_tokens: 4096,
    messages: formattedMessages,
    tools: claudeTools,
    stream: true,
  };

  if (systemMessage) {
    body.system = systemMessage.content;
  }

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify(body),
    signal,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(
      err.error?.message || `Claude API error: HTTP ${res.status}`,
    );
  }

  let content = "";
  const toolCalls = [];
  let currentToolCall = null;

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  let streamDone = false;
  while (!streamDone) {
    const { done, value } = await reader.read();
    if (done) { streamDone = true; break; }

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data: ")) continue;
      const data = trimmed.slice(6);

      try {
        const parsed = JSON.parse(data);

        if (parsed.type === "message_stop") {
          streamDone = true;
          break;
        }

        if (parsed.type === "content_block_start") {
          if (parsed.content_block?.type === "tool_use") {
            currentToolCall = {
              id: parsed.content_block.id,
              name: parsed.content_block.name,
              arguments: "",
            };
          }
        } else if (parsed.type === "content_block_delta") {
          if (parsed.delta?.type === "text_delta" && parsed.delta.text) {
            content += parsed.delta.text;
            onContent(content);
          } else if (parsed.delta?.type === "input_json_delta" && currentToolCall) {
            currentToolCall.arguments += parsed.delta.partial_json || "";
          }
        } else if (parsed.type === "content_block_stop") {
          if (currentToolCall) {
            toolCalls.push({
              id: currentToolCall.id,
              name: currentToolCall.name,
              arguments: parseArguments(currentToolCall.arguments),
            });
            currentToolCall = null;
          }
        }
      } catch {
        // skip incomplete JSON chunks
      }
    }
  }

  return { content, toolCalls };
}

async function callOpenAI({ messages, tools, apiKey, model, baseUrl, signal }) {
  const url = (baseUrl || "https://api.openai.com/v1").replace(/\/+$/, "") + "/chat/completions";

  const body = {
    model,
    messages,
    tools: tools.map((t) => ({
      type: "function",
      function: {
        name: t.name,
        description: t.description,
        parameters: t.parameters,
      },
    })),
  };

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
    signal,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(
      err.error?.message || `OpenAI API error: HTTP ${res.status}`,
    );
  }

  const data = await res.json();
  const choice = data.choices?.[0];
  if (!choice) throw new Error("No response from OpenAI");

  const content = choice.message?.content || "";
  const toolCalls = choice.message?.tool_calls?.map((tc) => ({
    id: tc.id,
    name: tc.function.name,
    arguments: parseArguments(tc.function.arguments),
  }));

  return { content, toolCalls: toolCalls || [] };
}

async function callClaude({ messages, tools, apiKey, model, baseUrl, signal }) {
  const url = (baseUrl || "https://api.anthropic.com/v1").replace(/\/+$/, "") + "/messages";

  const systemMessage = messages.find((m) => m.role === "system");
  const nonSystemMessages = messages.filter((m) => m.role !== "system");

  const formattedMessages = formatClaudeMessages(nonSystemMessages);

  const claudeTools = tools.map((t) => ({
    name: t.name,
    description: t.description,
    input_schema: t.parameters,
  }));

  const body = {
    model,
    max_tokens: 4096,
    messages: formattedMessages,
    tools: claudeTools,
  };

  if (systemMessage) {
    body.system = systemMessage.content;
  }

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify(body),
    signal,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(
      err.error?.message || `Claude API error: HTTP ${res.status}`,
    );
  }

  const data = await res.json();

  let content = "";
  const toolCalls = [];

  for (const block of data.content || []) {
    if (block.type === "text") {
      content += block.text;
    } else if (block.type === "tool_use") {
      toolCalls.push({
        id: block.id,
        name: block.name,
        arguments: block.input,
      });
    }
  }

  return { content, toolCalls };
}

function formatClaudeMessages(nonSystemMessages) {
  const formattedMessages = [];
  let pendingToolResults = [];

  const flushToolResults = () => {
    if (pendingToolResults.length > 0) {
      formattedMessages.push({
        role: "user",
        content: pendingToolResults,
      });
      pendingToolResults = [];
    }
  };

  for (const m of nonSystemMessages) {
    if (m.role === "tool") {
      pendingToolResults.push({
        type: "tool_result",
        tool_use_id: m.tool_call_id,
        content: m.content,
      });
      continue;
    }

    flushToolResults();

    if (m.role === "assistant" && m.tool_calls) {
      formattedMessages.push({
        role: "assistant",
        content: [
          ...(m.content ? [{ type: "text", text: m.content }] : []),
          ...m.tool_calls.map((tc) => ({
            type: "tool_use",
            id: tc.id,
            name: tc.function.name,
            input: parseArguments(tc.function.arguments),
          })),
        ],
      });
      continue;
    }

    formattedMessages.push({
      role: m.role,
      content: m.content || "",
    });
  }

  flushToolResults();

  return formattedMessages;
}

function parseArguments(args) {
  if (!args) return {};
  if (typeof args === "object") return args;
  try {
    return JSON.parse(args);
  } catch {
    return {};
  }
}
