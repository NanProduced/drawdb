import { useState } from "react";
import { Button, Input, Select, Space, Toast } from "@douyinfe/semi-ui";
import { useTranslation } from "react-i18next";
import { useSettings } from "../../../hooks";

const providerOptions = [
  { value: "openai", label: "OpenAI" },
  { value: "claude", label: "Claude (Anthropic)" },
];

const modelOptions = {
  openai: [
    { value: "gpt-4o", label: "GPT-4o" },
    { value: "gpt-4o-mini", label: "GPT-4o Mini" },
    { value: "gpt-4-turbo", label: "GPT-4 Turbo" },
    { value: "gpt-3.5-turbo", label: "GPT-3.5 Turbo" },
  ],
  claude: [
    { value: "claude-sonnet-4-20250514", label: "Claude Sonnet 4" },
    { value: "claude-3-5-sonnet-20241022", label: "Claude 3.5 Sonnet" },
    { value: "claude-3-haiku-20240307", label: "Claude 3 Haiku" },
  ],
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
    const models = modelOptions[value] || [];
    if (models.length > 0 && !models.find((m) => m.value === tempModel)) {
      setTempModel(models[0].value);
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
    setTesting(true);
    try {
      const baseUrl =
        tempBaseUrl ||
        (tempProvider === "openai"
          ? "https://api.openai.com"
          : "https://api.anthropic.com");

      if (tempProvider === "openai") {
        const res = await fetch(`${baseUrl}/v1/models`, {
          headers: { Authorization: `Bearer ${tempApiKey}` },
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        Toast.success(t("ai_connection_success_openai"));
      } else {
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
      }
    } catch (e) {
      Toast.error(t("ai_connection_failed", { message: e.message }));
    } finally {
      setTesting(false);
    }
  };

  const currentModels = modelOptions[tempProvider] || [];

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
        <Select
          value={tempModel}
          onChange={setTempModel}
          optionList={currentModels}
          style={{ width: "100%" }}
        />
      </div>
      <div>
        <label
          className="block text-xs font-medium mb-1.5"
          style={{ color: "var(--semi-color-text-2)" }}
        >
          {t("ai_base_url")}{" "}
          <span style={{ color: "var(--semi-color-text-3)" }}>
            {t("ai_base_url_optional")}
          </span>
        </label>
        <Input
          value={tempBaseUrl}
          onChange={setTempBaseUrl}
          placeholder={
            tempProvider === "openai"
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
