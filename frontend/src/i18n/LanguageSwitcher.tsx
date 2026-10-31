import { useEffect } from "react";
import { Languages } from "lucide-react";
import { setLanguage, useLanguage } from "./state";
export function LanguageSwitcher() {
  const language = useLanguage();
  useEffect(() => {
    document.documentElement.lang = language;
    document.documentElement.dir = "ltr";
  }, [language]);
  return (
    <div className="language-bar">
      <Languages size={16} />
      <span>Reading language</span>
      <div role="group" aria-label="Reading language" translate="no">
        <button
          type="button"
          aria-pressed={language === "en"}
          onClick={() => setLanguage("en")}
        >
          English
        </button>
        <button
          type="button"
          aria-pressed={language === "ur-Latn"}
          onClick={() => setLanguage("ur-Latn")}
        >
          Roman Urdu
        </button>
      </div>
      <small>School messages stay in their original language.</small>
    </div>
  );
}
