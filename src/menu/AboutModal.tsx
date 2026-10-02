import { useTranslation } from "react-i18next";
import { Modal } from "../editor/ui/Modal";
import { SkeuButton } from "../editor/ui/SkeuButton";

const APP_VERSION = "0.1.0";

/** Help > About Tab2Share (section 8): version, license, contributors. */
export function AboutModal({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();

  return (
    <Modal title={t("about.title")} onClose={onClose} width={380}>
      <div className="flex flex-col gap-2 text-xs" style={{ color: "var(--control-text)" }}>
        <p>{t("about.version", { version: APP_VERSION })}</p>
        <p style={{ color: "var(--label)" }}>{t("about.license")}</p>
        <p style={{ color: "var(--label)" }}>{t("about.credits")}</p>
        <SkeuButton onClick={onClose} className="self-end">
          {t("about.close")}
        </SkeuButton>
      </div>
    </Modal>
  );
}
