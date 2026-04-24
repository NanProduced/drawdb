export async function chatCompletion({
  messages,
  tools,
  provider,
  apiKey,
  model,
  baseUrl,
  signal,
}) {
  if (provider === "openai" || provider === "compatible") {
    return callOpenAI({ messages, tools, apiKey, model, baseUrl, signal });
  } else if (provider === "claude") {
    return callClaude({ messages, tools, apiKey, model, baseUrl, signal });
  }
  throw new Error(`Unsupported AI provider: ${provider}`);
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

function parseArguments(args) {
  if (!args) return {};
  if (typeof args === "object") return args;
  try {
    return JSON.parse(args);
  } catch {
    return {};
  }
}
