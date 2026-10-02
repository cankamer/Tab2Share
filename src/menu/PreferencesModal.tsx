import { useTranslation } from "react-i18next";
import { Modal } from "../editor/ui/Modal";
import { SkeuButton } from "../editor/ui/SkeuButton";
import { Toggle } from "../editor/ui/Toggle";
import type { AppLanguage } from "../i18n";
import type { ThemeChoice } from "../theme";

interface PreferencesModalProps {
  onClose: () => void;
  theme: ThemeChoice;
  onSetTheme: (choice: ThemeChoice) => void;
  language: AppLanguage;
  onSetLanguage: (language: AppLanguage) => void;
  reverseScroll: boolean;
  onSetReverseScroll: (value: boolean) => void;
}

const THEME_CHOICES: ThemeChoice[] = ["light", "dark", "system"];
const LANGUAGES: AppLanguage[] = ["en", "tr"];

/** Edit > Preferences... (section 8) — theme and language quick access, alongside the same View menu controls. */
export function PreferencesModal({
  onClose,
  theme,
  onSetTheme,
  language,
  onSetLanguage,
  reverseScroll,
  onSetReverseScroll,
}: PreferencesModalProps) {
  const { t } = useTranslation();

  return (
    <Modal title={t("preferences.title")} onClose={onClose} width={340}>
      <div className="flex flex-col gap-3 text-xs">
        <div className="flex flex-col gap-1">
          <span style={{ color: "var(--label)" }}>{t("preferences.themeField")}</span>
          <div className="flex gap-1">
            {THEME_CHOICES.map((choice) => (
              <SkeuButton key={choice} active={theme === choice} onClick={() => onSetTheme(choice)}>
                {t(`theme.${choice}`)}
              </SkeuButton>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-1">
          <span style={{ color: "var(--label)" }}>{t("preferences.languageField")}</span>
          <div className="flex gap-1">
            {LANGUAGES.map((lang) => (
              <SkeuButton key={lang} active={language === lang} onClick={() => onSetLanguage(lang)}>
                {t(`language.${lang}`)}
              </SkeuButton>
            ))}
          </div>
        </div>

        <Toggle checked={reverseScroll} onChange={onSetReverseScroll} label={t("preferences.reverseScroll")} />

        <p style={{ color: "var(--label)" }}>{t("preferences.autosaveNote")}</p>

        <SkeuButton onClick={onClose} className="self-end">
          {t("preferences.close")}
        </SkeuButton>
      </div>
    </Modal>
  );
}
