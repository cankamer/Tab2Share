import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { Project } from "../model/types";
import type { LineBreakMode } from "../render/lineLayout";
import type { ExportOptions } from "../export/exportPng";
import { Modal } from "./ui/Modal";
import { ExportPreview } from "./LinePreview";
import { ExportPanel, type ExportPanelHandle } from "./ExportPanel";

interface ExportModalProps {
  project: Project;
  lineBreakMode: LineBreakMode;
  onLineBreakModeChange: (mode: LineBreakMode) => void;
  onClose: () => void;
  showNotation?: boolean;
}

/**
 * Export Modal Popup Screen (Section 14 & UI Polish):
 * Opens as a dedicated pop-up dialog showing the live, pixel-accurate PNG preview (Tab
 * Sheet's real A4 shape, For Video's fade included) with line breaking options, resolution
 * scale, output theme, title block toggle, and download / copy actions.
 */
export function ExportModal({
  project,
  lineBreakMode,
  onLineBreakModeChange,
  onClose,
  showNotation,
}: ExportModalProps) {
  const { t } = useTranslation();
  const exportPanelRef = useRef<ExportPanelHandle>(null);
  const [exportOptions, setExportOptions] = useState<ExportOptions | null>(null);

  return (
    <Modal title={t("exportPanel.title", "Export PNG")} onClose={onClose} width={880}>
      <div className="flex flex-col gap-4">
        {/* WYSIWYG export preview — mirrors ExportPanel's live settings exactly */}
        {exportOptions ? <ExportPreview project={project} options={exportOptions} /> : null}

        {/* Export Controls & Action Buttons */}
        <ExportPanel
          ref={exportPanelRef}
          project={project}
          lineBreakMode={lineBreakMode}
          onLineBreakModeChange={onLineBreakModeChange}
          onOptionsChange={setExportOptions}
          initialShowNotation={showNotation}
        />
      </div>
    </Modal>
  );
}
