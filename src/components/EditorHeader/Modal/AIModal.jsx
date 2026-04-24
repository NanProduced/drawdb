import { useState, useEffect } from "react";
import {
  Input,
  Radio,
  RadioGroup,
  Button,
  Banner,
  Spin,
} from "@douyinfe/semi-ui";
import { useTranslation } from "react-i18next";
import { useSettings, useDiagram } from "../../../hooks";
import { generateDatabaseSchema } from "../../../api/ai";
import { arrangeTables } from "../../../utils/arrangeTables";
import { STATUS } from "../../../data/constants";

export default function AIModal({ onGenerate }) {
  const { t } = useTranslation();
  const { settings, setSettings } = useSettings();
  const { tables: existingTables, database } = useDiagram();

  const [prompt, setPrompt] = useState("");
  const [mode, setMode] = useState("append");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState({ type: STATUS.NONE, message: "" });
  const [tempApiKey, setTempApiKey] = useState(settings.aiApiKey || "");
  const [tempBaseUrl, setTempBaseUrl] = useState(settings.aiBaseUrl || "https://api.openai.com/v1");
  const [tempModel, setTempModel] = useState(settings.aiModel || "gpt-4o-mini");
  const [showSettings, setShowSettings] = useState(!settings.aiApiKey || !settings.aiApiKey.trim());

  const hasApiKey = settings.aiApiKey && settings.aiApiKey.trim() !== "";

  useEffect(() => {
    if (showSettings) {
      setTempApiKey(settings.aiApiKey || "");
      setTempBaseUrl(settings.aiBaseUrl || "https://api.openai.com/v1");
      setTempModel(settings.aiModel || "gpt-4o-mini");
    }
  }, [showSettings, settings.aiApiKey, settings.aiBaseUrl, settings.aiModel]);

  const examplePrompts = [
    "创建一个电商系统，包含用户、商品、订单和购物车",
    "设计一个博客系统，需要用户、文章、评论和分类",
    "创建一个图书馆管理系统，包含图书、读者和借阅记录",
    "设计一个任务管理系统，支持项目、任务和团队成员",
  ];

  const handleSaveSettings = () => {
    setSettings((prev) => ({
      ...prev,
      aiApiKey: tempApiKey,
      aiBaseUrl: tempBaseUrl,
      aiModel: tempModel,
    }));
    setShowSettings(false);
  };

  const handleGenerate = async () => {
    if (!prompt.trim()) {
      setError({
        type: STATUS.ERROR,
        message: t("ai_prompt_required"),
      });
      return;
    }

    const apiKeyToUse = tempApiKey || settings.aiApiKey || "";
    const baseUrlToUse = tempBaseUrl || settings.aiBaseUrl || "https://api.openai.com/v1";
    const modelToUse = tempModel || settings.aiModel || "gpt-4o-mini";

    if (!apiKeyToUse || apiKeyToUse.trim() === "") {
      setShowSettings(true);
      setError({
        type: STATUS.WARNING,
        message: t("ai_api_key_required"),
      });
      return;
    }

    setLoading(true);
    setError({ type: STATUS.NONE, message: "" });

    try {
      const result = await generateDatabaseSchema(
        prompt,
        apiKeyToUse,
        baseUrlToUse,
        modelToUse,
        database,
        mode === "append" ? existingTables : []
      );

      if (result.tables.length === 0) {
        setError({
          type: STATUS.ERROR,
          message: t("ai_no_tables_generated"),
        });
        return;
      }

      arrangeTables(result);

      onGenerate({
        tables: result.tables,
        relationships: result.relationships,
        mode: mode,
      });

      setPrompt("");
    } catch (err) {
      console.error("AI generation error:", err);
      setError({
        type: STATUS.ERROR,
        message: err.message || t("ai_generation_error"),
      });
    } finally {
      setLoading(false);
    }
  };

  const handleExampleClick = (example) => {
    setPrompt(example);
  };

  return (
    <div className="space-y-4">
      {showSettings ? (
        <div className="space-y-4">
          <div className="text-sm font-medium">
            {t("ai_settings_title")}
          </div>
          
          <div>
            <label className="block text-sm mb-1">
              {t("ai_api_key_label")}
            </label>
            <Input
              placeholder="sk-..."
              value={tempApiKey}
              onChange={(value) => setTempApiKey(value)}
              type="password"
            />
          </div>

          <div>
            <label className="block text-sm mb-1">
              {t("ai_base_url_label")}
            </label>
            <Input
              placeholder="https://api.openai.com/v1"
              value={tempBaseUrl}
              onChange={(value) => setTempBaseUrl(value)}
            />
            <div className="text-xs text-gray-500 mt-1">
              {t("ai_base_url_hint")}
            </div>
          </div>

          <div>
            <label className="block text-sm mb-1">
              {t("ai_model_label")}
            </label>
            <Input
              placeholder="gpt-4o-mini"
              value={tempModel}
              onChange={(value) => setTempModel(value)}
            />
            <div className="text-xs text-gray-500 mt-1">
              {t("ai_model_hint")}
            </div>
          </div>

          <div className="flex gap-2">
            <Button
              type="primary"
              onClick={handleSaveSettings}
              disabled={!tempApiKey.trim()}
            >
              {t("save")}
            </Button>
            {hasApiKey && (
              <Button onClick={() => setShowSettings(false)}>
                {t("cancel")}
              </Button>
            )}
          </div>
        </div>
      ) : (
        <>
          <div>
            <label className="block text-sm font-medium mb-2">
              {t("ai_prompt_label")}
            </label>
            <Input.TextArea
              placeholder={t("ai_prompt_placeholder")}
              value={prompt}
              onChange={(value) => setPrompt(value)}
              rows={5}
              autosize={{ minRows: 4, maxRows: 8 }}
              disabled={loading}
            />
          </div>

          <div>
            <div className="text-sm text-gray-500 mb-2">
              {t("ai_example_prompts")}:
            </div>
            <div className="flex flex-wrap gap-2">
              {examplePrompts.map((example, index) => (
                <Button
                  key={index}
                  size="small"
                  onClick={() => handleExampleClick(example)}
                  disabled={loading}
                >
                  {example}
                </Button>
              ))}
            </div>
          </div>

          <div>
            <RadioGroup
              value={mode}
              onChange={(e) => setMode(e.target.value)}
              disabled={loading}
            >
              <Radio value="append">
                {t("ai_mode_append")}
              </Radio>
              <Radio value="replace">
                {t("ai_mode_replace")}
              </Radio>
            </RadioGroup>
          </div>

          <div className="flex items-center gap-3">
            <Button
              type="primary"
              onClick={handleGenerate}
              disabled={loading || !prompt.trim()}
              icon={loading ? <Spin size="small" /> : null}
            >
              {loading ? t("ai_generating") : t("ai_generate")}
            </Button>
            <Button
              icon={<i className="bi bi-gear" />}
              onClick={() => setShowSettings(true)}
              disabled={loading}
            >
              {t("settings")}
            </Button>
          </div>
        </>
      )}

      {error.type !== STATUS.NONE && (
        <Banner
          type={
            error.type === STATUS.ERROR
              ? "danger"
              : error.type === STATUS.WARNING
              ? "warning"
              : "info"
          }
          fullMode={false}
          description={<div>{error.message}</div>}
          closeIcon
          onClose={() => setError({ type: STATUS.NONE, message: "" })}
        />
      )}
    </div>
  );
}
