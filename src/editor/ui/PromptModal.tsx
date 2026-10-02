import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Modal } from "./Modal";
import { SkeuButton } from "./SkeuButton";
import { SkeuInput } from "./SkeuInput";

interface PromptModalProps {
  title: string;
  label: string;
  initialValue?: string;
  placeholder?: string;
  /** "number" prompts (Go to bar) only submit a valid positive integer. */
  inputType?: "text" | "number";
  /** Shown when the field holds an existing value, e.g. to remove a section label. */
  removeLabel?: string;
  onSubmit: (value: string) => void;
  onClose: () => void;
}

/** Small one-field dialog shared by Guitar Pro's text-entry shortcuts: Section (Shift+Insert), Text (T), Go to bar (Ctrl+G). */
export function PromptModal({
  title,
  label,
  initialValue = "",
  placeholder,
  inputType = "text",
  removeLabel,
  onSubmit,
  onClose,
}: PromptModalProps) {
  const { t } = useTranslation();
  const [value, setValue] = useState(initialValue);

  function submit(next: string) {
    onSubmit(next);
    onClose();
  }

  return (
    <Modal title={title} onClose={onClose} width={340}>
      <label className="flex flex-col gap-1">
        <span style={{ color: "var(--label)" }}>{label}</span>
        <SkeuInput
          autoFocus
          type={inputType}
          min={inputType === "number" ? 1 : undefined}
          value={value}
          placeholder={placeholder}
          onFocus={(event) => event.target.select()}
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              submit(value);
            }
          }}
        />
      </label>
      <div className="flex justify-end gap-2">
        {removeLabel && initialValue ? (
          <SkeuButton className="mr-auto text-red-400" onClick={() => submit("")}>
            {removeLabel}
          </SkeuButton>
        ) : null}
        <SkeuButton onClick={onClose}>{t("confirm.cancel")}</SkeuButton>
        <SkeuButton active onClick={() => submit(value)}>
          {t("prompt.ok")}
        </SkeuButton>
      </div>
    </Modal>
  );
}
