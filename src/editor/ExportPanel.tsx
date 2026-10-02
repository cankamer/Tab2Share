import { forwardRef, useEffect, useImperativeHandle, useState } from "react";
import { useTranslation } from "react-i18next";
import type { Project } from "../model/types";
import type { LineBreakMode } from "../render/lineLayout";
import { exportProjectToPng, type ExportOptions, type OutputTheme } from "../export/exportPng";
import { copyExportToClipboard } from "../export/clipboard";
import { SkeuButton } from "./ui/SkeuButton";
import { SkeuInput } from "./ui/SkeuInput";
import { Toggle } from "./ui/Toggle";

type Status = { kind: "idle" } | { kind: "success"; message: string } | { kind: "error"; message: string };

export interface ExportPanelHandle {
  exportPng: () => Promise<void>;
  copyToClipboard: () => Promise<void>;
}

interface ExportPanelProps {
  project: Project;
  /** Controlled from the View menu's "Measures per line" submenu (section 8), shared with the menu's own state. */
  lineBreakMode: LineBreakMode;
  onLineBreakModeChange: (mode: LineBreakMode) => void;
  /** Reports the live export settings up so the modal's preview can render exactly what
   * export would produce (section 14 revision — the preview used to be disconnected). */
  onOptionsChange?: (options: ExportOptions) => void;
  /** Starts the "Standard notation" switch in the same state as the editor view. */
  initialShowNotation?: boolean;
}

/**
 * Section 14 (revised): PNG export. "Tab Sheet" (A4, multi-page) and "For Video" (single
 * natural-width strip) size modes at a fixed 1x resolution, a light/dark output theme, an
 * independent top/bottom edge-fade design only for "For Video", the title-block-reserves-a-
 * line rule, multi-part naming when a tab needs more pages than one sheet fits, a default-on
 * watermark, and Ctrl+Shift+C clipboard copy. The page background is always opaque (the
 * theme's color) — PNG still keeps its alpha channel, it's just never a blank cutout. Export/
 * copy are also exposed via ref so the File menu (step 12) can trigger the same actions.
 */
export const ExportPanel = forwardRef<ExportPanelHandle, ExportPanelProps>(function ExportPanel(
  { project, lineBreakMode, onLineBreakModeChange, onOptionsChange, initialShowNotation = true },
  ref,
) {
  const { t } = useTranslation();
  const [sizeKind, setSizeKind] = useState<"strip" | "reel">("reel");
  const [titleBlockEnabled, setTitleBlockEnabled] = useState(false);
  const [fadeTop, setFadeTop] = useState(false);
  const [fadeBottom, setFadeBottom] = useState(false);
  const [outputTheme, setOutputTheme] = useState<OutputTheme>("light");
  const [watermark, setWatermark] = useState(true);
  const [showNotation, setShowNotation] = useState(initialShowNotation);
  const [status, setStatus] = useState<Status>({ kind: "idle" });

  const measuresPerLine = lineBreakMode.kind === "fixed" ? lineBreakMode.measuresPerLine : 4;

  function currentOptions(): ExportOptions {
    return {
      sizeMode:
        sizeKind === "strip"
          ? { kind: "strip", fadeTop, fadeBottom }
          : { kind: "reel", lineBreakMode, titleBlockEnabled },
      watermark,
      outputTheme,
      showNotation,
    };
  }

  useEffect(() => {
    onOptionsChange?.(currentOptions());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sizeKind, titleBlockEnabled, fadeTop, fadeBottom, lineBreakMode, outputTheme, watermark, showNotation]);

  async function handleExport() {
    try {
      const result = await exportProjectToPng(project, currentOptions());
      if (!result) {
        setStatus({ kind: "idle" });
        return;
      }
      setStatus({
        kind: "success",
        message:
          result.paths.length === 1
            ? t("exportPanel.exportedOne", { path: result.paths[0] })
            : t("exportPanel.exportedMany", { count: result.paths.length, paths: result.paths.join(", ") }),
      });
    } catch (error) {
      setStatus({ kind: "error", message: String(error) });
    }
  }

  async function handleCopyToClipboard() {
    try {
      await copyExportToClipboard(project, currentOptions());
      setStatus({ kind: "success", message: t("exportPanel.copiedToClipboard") });
    } catch (error) {
      setStatus({ kind: "error", message: String(error) });
    }
  }

  useImperativeHandle(ref, () => ({ exportPng: handleExport, copyToClipboard: handleCopyToClipboard }));

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const target = event.target;
      const isTextInput =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        (target instanceof HTMLElement && target.isContentEditable);
      if (isTextInput) return;

      const mod = event.ctrlKey || event.metaKey;
      if (mod && event.shiftKey && event.key.toLowerCase() === "c") {
        event.preventDefault();
        handleCopyToClipboard();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project, sizeKind, lineBreakMode, titleBlockEnabled, fadeTop, fadeBottom, outputTheme, watermark, showNotation]);

  return (
    <div className="raised flex flex-col gap-3 rounded-2xl p-4 text-xs">
      <div className="flex flex-wrap items-center gap-2">
        <span style={{ color: "var(--label)" }}>{t("exportPanel.title")}</span>
        <SkeuButton onClick={() => setSizeKind("strip")} active={sizeKind === "strip"}>
          {t("exportPanel.strip")}
        </SkeuButton>
        <SkeuButton onClick={() => setSizeKind("reel")} active={sizeKind === "reel"}>
          {t("exportPanel.reel")}
        </SkeuButton>

        {sizeKind === "reel" ? (
          <>
            <span className="mx-1" style={{ color: "var(--body-edge)" }}>
              |
            </span>
            <SkeuButton onClick={() => onLineBreakModeChange({ kind: "auto" })} active={lineBreakMode.kind === "auto"}>
              {t("exportPanel.auto")}
            </SkeuButton>
            <SkeuButton
              onClick={() => onLineBreakModeChange({ kind: "fixed", measuresPerLine })}
              active={lineBreakMode.kind === "fixed"}
            >
              {t("exportPanel.fixed")}
            </SkeuButton>
            {lineBreakMode.kind === "fixed" ? (
              <SkeuInput
                key={lineBreakMode.measuresPerLine}
                type="number"
                min={1}
                max={8}
                defaultValue={lineBreakMode.measuresPerLine}
                onBlur={(event) => {
                  const raw = Number(event.target.value);
                  const value = Number.isFinite(raw) ? Math.max(1, Math.min(8, raw)) : 1;
                  onLineBreakModeChange({ kind: "fixed", measuresPerLine: value });
                }}
                className="w-14"
              />
            ) : null}

            <span className="ml-2">
              <Toggle checked={titleBlockEnabled} onChange={setTitleBlockEnabled} label={t("exportPanel.titleBlock")} />
            </span>
          </>
        ) : (
          <span className="ml-2 flex items-center gap-2">
            <Toggle checked={fadeTop} onChange={setFadeTop} label={t("exportPanel.fadeTop")} />
            <Toggle checked={fadeBottom} onChange={setFadeBottom} label={t("exportPanel.fadeBottom")} />
          </span>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span style={{ color: "var(--label)" }}>{t("exportPanel.theme")}</span>
        <SkeuButton onClick={() => setOutputTheme("light")} active={outputTheme === "light"}>
          {t("exportPanel.themeLight")}
        </SkeuButton>
        <SkeuButton onClick={() => setOutputTheme("dark")} active={outputTheme === "dark"}>
          {t("exportPanel.themeDark")}
        </SkeuButton>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Toggle checked={watermark} onChange={setWatermark} label={t("exportPanel.watermark")} />
        <Toggle checked={showNotation} onChange={setShowNotation} label={t("exportPanel.notation")} />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <SkeuButton onClick={handleExport}>{t("exportPanel.export")}</SkeuButton>
        <SkeuButton title="Ctrl+Shift+C" onClick={handleCopyToClipboard}>
          {t("exportPanel.copy")}
        </SkeuButton>
        <span style={{ color: "var(--label)" }}>{t("exportPanel.clipboardNote")}</span>
      </div>

      {status.kind === "success" ? <div className="text-green-700">{status.message}</div> : null}
      {status.kind === "error" ? <div className="text-red-700">{status.message}</div> : null}
    </div>
  );
});
