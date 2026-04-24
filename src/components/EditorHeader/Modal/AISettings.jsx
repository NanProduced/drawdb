import { useState } from "react";
import { Button, Input, Select, Space, Toast } from "@douyinfe/semi-ui";
import { useTranslation } from "react-i18next";
import { useSettings } from "../../../hooks";

const providerOptions = [
  { value: "openai", label: "OpenAI" },
  { value: "claude", label: "Claude (Anthropic)" },
  { value: "compatible", label: "OpenAI Compatible" },
];

const modelSuggestions = {
  openai: ["gpt-4o", "gpt-4o-mini", "gpt-4-turbo", "gpt-3.5-turbo"],
  claude: [
    "claude-sonnet-4-20250514",
    "claude-3-5-sonnet-20241022",
    "claude-3-haiku-20240307",
  ],
  compatible: [],
};

export default function AISettings() {
  const { settings, setSettings } = useSettings();
  const [tempProvider, setTempProvider] = useState(settings.aiProvider);
  const [tempApiKey, setTempApiKey] = useState(settings.aiApiKey);
  const [tempModel, setTempModel] = useState(settings.aiModel);
  const [tempBaseUrl, setTempBaseUrl] = useState(settings.aiBaseUrl);
  const [testing, setTesting] = useState(false);
  const { t } = useTranslation();

  const handleProviderChange = (value) => {
    setTempProvider(value);
    const suggestions = modelSuggestions[value] || [];
    if (
      suggestions.length > 0 &&
      !suggestions.includes(tempModel)
    ) {
      setTempModel(suggestions[0]);
    }
  };

  const handleSave = () => {
    setSettings((prev) => ({
      ...prev,
      aiProvider: tempProvider,
      aiApiKey: tempApiKey,
      aiModel: tempModel,
      aiBaseUrl: tempBaseUrl,
    }));
    Toast.success(t("ai_saved"));
  };

  const handleTest = async () => {
    if (!tempApiKey) {
      Toast.error(t("ai_no_api_key"));
      return;
    }
    if (!tempModel) {
      Toast.error("Please enter a model name");
      return;
    }
    setTesting(true);
    try {
      const baseUrl =
        tempBaseUrl ||
        (tempProvider === "openai"
          ? "https://api.openai.com"
          : tempProvider === "claude"
            ? "https://api.anthropic.com"
            : "");

      if (!baseUrl && tempProvider === "compatible") {
        throw new Error("Base URL is required for compatible providers");
      }

      if (tempProvider === "claude") {
        const res = await fetch(`${baseUrl}/v1/messages`, {
          method: "POST",
          headers: {
            "x-api-key": tempApiKey,
            "anthropic-version": "2023-06-01",
            "content-type": "application/json",
          },
          body: JSON.stringify({
            model: tempModel,
            max_tokens: 10,
            messages: [{ role: "user", content: "Hi" }],
          }),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.error?.message || `HTTP ${res.status}`);
        }
        Toast.success(t("ai_connection_success_claude"));
      } else {
        const res = await fetch(`${baseUrl}/v1/chat/completions`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${tempApiKey}`,
          },
          body: JSON.stringify({
            model: tempModel,
            max_tokens: 10,
            messages: [{ role: "user", content: "Hi" }],
          }),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.error?.message || `HTTP ${res.status}`);
        }
        Toast.success(t("ai_connection_success_openai"));
      }
    } catch (e) {
      Toast.error(t("ai_connection_failed", { message: e.message }));
    } finally {
      setTesting(false);
    }
  };

  const suggestions = modelSuggestions[tempProvider] || [];
  const isCompatible = tempProvider === "compatible";

  return (
    <div className="space-y-5">
      <div>
        <label
          className="block text-xs font-medium mb-1.5"
          style={{ color: "var(--semi-color-text-2)" }}
        >
          {t("ai_provider")}
        </label>
        <Select
          value={tempProvider}
          onChange={handleProviderChange}
          optionList={providerOptions}
          style={{ width: "100%" }}
        />
        {isCompatible && (
          <p
            className="text-xs mt-1.5"
            style={{ color: "var(--semi-color-text-3)" }}
          >
            Use this for any API that follows the OpenAI protocol (e.g.
            MiniMax, DeepSeek, Ollama, vLLM, etc.)
          </p>
        )}
      </div>
      <div>
        <label
          className="block text-xs font-medium mb-1.5"
          style={{ color: "var(--semi-color-text-2)" }}
        >
          {t("ai_api_key")}
        </label>
        <Input
          mode="password"
          value={tempApiKey}
          onChange={setTempApiKey}
          placeholder={t("ai_api_key_placeholder")}
          style={{ width: "100%" }}
        />
        <p
          className="text-xs mt-1.5"
          style={{ color: "var(--semi-color-text-3)" }}
        >
          {t("ai_api_key_hint")}
        </p>
      </div>
      <div>
        <label
          className="block text-xs font-medium mb-1.5"
          style={{ color: "var(--semi-color-text-2)" }}
        >
          {t("ai_model")}
        </label>
        <Input
          value={tempModel}
          onChange={setTempModel}
          placeholder={
            isCompatible
              ? "e.g. MiniMax-Text-01, deepseek-chat, ..."
              : suggestions[0] || "Enter model name"
          }
          style={{ width: "100%" }}
        />
        {suggestions.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-2">
            {suggestions.map((m) => (
              <button
                key={m}
                onClick={() => setTempModel(m)}
                className="text-xs px-2 py-0.5 rounded-md transition-colors cursor-pointer"
                style={{
                  background:
                    tempModel === m
                      ? "rgba(var(--semi-blue-5), 0.15)"
                      : "rgba(var(--semi-grey-1), 1)",
                  color:
                    tempModel === m
                      ? "rgba(var(--semi-blue-5), 1)"
                      : "var(--semi-color-text-3)",
                  border: `1px solid ${
                    tempModel === m
                      ? "rgba(var(--semi-blue-5), 0.3)"
                      : "rgba(var(--semi-grey-3), 1)"
                  }`,
                }}
              >
                {m}
              </button>
            ))}
          </div>
        )}
      </div>
      <div>
        <label
          className="block text-xs font-medium mb-1.5"
          style={{ color: "var(--semi-color-text-2)" }}
        >
          {t("ai_base_url")}{" "}
          <span
            className={isCompatible ? "" : ""}
            style={{ color: isCompatible ? "rgba(var(--semi-red-5), 1)" : "var(--semi-color-text-3)" }}
          >
            {isCompatible ? "(required)" : t("ai_base_url_optional")}
          </span>
        </label>
        <Input
          value={tempBaseUrl}
          onChange={setTempBaseUrl}
          placeholder={
            isCompatible
              ? "https://your-api-endpoint.com"
              : tempProvider === "openai"
                ? "https://api.openai.com"
                : "https://api.anthropic.com"
          }
          style={{ width: "100%" }}
        />
        <p
          className="text-xs mt-1.5"
          style={{ color: "var(--semi-color-text-3)" }}
        >
          {t("ai_base_url_hint")}
        </p>
      </div>
      <Space>
        <Button theme="solid" onClick={handleSave}>
          {t("saved")}
        </Button>
        <Button onClick={handleTest} loading={testing}>
          {t("ai_test_connection")}
        </Button>
      </Space>
    </div>
  );
}
