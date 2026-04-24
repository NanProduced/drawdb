import { createContext, useEffect, useState } from "react";
import { tableWidth } from "../data/constants";

const defaultSettings = {
  strictMode: false,
  showFieldSummary: true,
  showGrid: true,
  snapToGrid: false,
  showDataTypes: true,
  mode: "light",
  autosave: true,
  showCardinality: true,
  showRelationshipLabels: true,
  tableWidth: tableWidth,
  showDebugCoordinates: false,
  showComments: true,
  aiApiKey: "",
  aiBaseUrl: "https://api.openai.com/v1",
  aiModel: "gpt-4o-mini",
};

const defaultContextValue = {
  settings: defaultSettings,
  setSettings: () => {},
};

function loadSettings() {
  try {
    const savedSettings = localStorage.getItem("settings");
    if (savedSettings) {
      const parsed = JSON.parse(savedSettings);
      return { ...defaultSettings, ...parsed };
    }
  } catch (error) {
    console.error("Failed to parse settings from localStorage:", error);
  }
  return { ...defaultSettings };
}

export const SettingsContext = createContext(defaultContextValue);

export default function SettingsContextProvider({ children }) {
  const [settings, setSettings] = useState(loadSettings);

  useEffect(() => {
    document.body.setAttribute("theme-mode", settings.mode);
  }, [settings.mode]);

  useEffect(() => {
    try {
      localStorage.setItem("settings", JSON.stringify(settings));
    } catch (error) {
      console.error("Failed to save settings to localStorage:", error);
    }
  }, [settings]);

  return (
    <SettingsContext.Provider value={{ settings, setSettings }}>
      {children}
    </SettingsContext.Provider>
  );
}
