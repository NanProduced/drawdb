import { Tooltip } from "@douyinfe/semi-ui";
import { useTranslation } from "react-i18next";

export default function AIFloatingButton({ onClick, hasApiKey }) {
  const { t } = useTranslation();

  return (
    <Tooltip content={hasApiKey ? t("ai_generate_schema") : t("ai_need_api_key")} position="left">
      <button
        className="w-12 h-12 rounded-full popover-theme flex items-center justify-center shadow-lg hover:shadow-xl transition-all duration-200 hover:scale-105"
        onClick={onClick}
        style={{
          background: hasApiKey 
            ? "linear-gradient(135deg, #667eea 0%, #764ba2 100%)" 
            : "linear-gradient(135deg, #9ca3af 0%, #6b7280 100%)",
        }}
      >
        <i className="bi bi-stars text-white text-xl" />
      </button>
    </Tooltip>
  );
}
