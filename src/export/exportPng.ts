import { save } from "@tauri-apps/plugin-dialog";
import { writeFile } from "@tauri-apps/plugin-fs";
import type { Project } from "../model/types";
import { computeLineBreaks, type LineBreakMode, type LineLayoutPage } from "../render/lineLayout";
import { computePreviewSize, drawLinePreview, drawWatermark, singleLineHeight } from "../render/drawLinePreview";
import { DARK_EXPORT_PALETTE, LIGHT_PALETTE, LINE_GAP, type TabPalette } from "../render/constants";

/** Section 14's two size modes, revised: "Tab Sheet" is a fixed A4 page (multi-page when the
 * tab is longer than one sheet); "For Video" ("strip") has no fixed size — it's exactly as
 * wide/tall as its single line of content, meant to scroll behind a video clip. */
export type ExportSizeMode =
  | { kind: "strip"; fadeTop: boolean; fadeBottom: boolean }
  | { kind: "reel"; lineBreakMode: LineBreakMode; titleBlockEnabled: boolean };

/** Output color theme (section 14 revision): independent of the app's own UI theme and of
 * LIGHT_PALETTE/DARK_EXPORT_PALETTE's other use as the editor's screen colors. */
export type OutputTheme = "light" | "dark";

export interface ExportOptions {
  sizeMode: ExportSizeMode;
  watermark: boolean;
  outputTheme: OutputTheme;
  /** Standard-notation staff above the tab (Guitar Pro's score + tab view). */
  showNotation: boolean;
}

export function paletteForTheme(theme: OutputTheme): TabPalette {
  return theme === "dark" ? DARK_EXPORT_PALETTE : LIGHT_PALETTE;
}

// A4 at 150dpi — enough detail to print. Portrait, like a real sheet-music page.
const SHEET_WIDTH = 1240;
const SHEET_HEIGHT = 1754;
const SHEET_MARGIN_X = 56;
const SHEET_MARGIN_TOP = 56;
const SHEET_MARGIN_BOTTOM = 56;

/** No title-block content UI exists yet (that's later) — this is just the space it will
 * reserve, matching the "one fewer line fits when it's on" rule so the two stay consistent
 * once it's built. */
function titleBlockReservedHeight(showNotation: boolean): number {
  return singleLineHeight(showNotation) + LINE_GAP;
}

/** How many tab lines fit on one A4 sheet page, given the real (not guessed) line height. */
function sheetLinesPerPage(titleBlockEnabled: boolean, showNotation: boolean): number {
  const reserved = titleBlockEnabled ? titleBlockReservedHeight(showNotation) : 0;
  const contentHeight = SHEET_HEIGHT - SHEET_MARGIN_TOP - SHEET_MARGIN_BOTTOM - reserved;
  const perLine = singleLineHeight(showNotation) + LINE_GAP;
  return Math.max(1, Math.floor((contentHeight + LINE_GAP) / perLine));
}

export function computeExportPages(project: Project, options: ExportOptions): LineLayoutPage[] {
  if (options.sizeMode.kind === "strip") {
    return computeLineBreaks(project, { kind: "natural" }, Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY);
  }
  const availableLines = sheetLinesPerPage(options.sizeMode.titleBlockEnabled, options.showNotation);
  return computeLineBreaks(project, options.sizeMode.lineBreakMode, SHEET_WIDTH - SHEET_MARGIN_X * 2, availableLines);
}

function topOffsetFor(options: ExportOptions): number {
  if (options.sizeMode.kind !== "reel") return 0;
  const titleBlock = options.sizeMode.titleBlockEnabled ? titleBlockReservedHeight(options.showNotation) : 0;
  return SHEET_MARGIN_TOP + titleBlock;
}

/** Exported so the export preview can render exactly one page at 1x without paying for every
 * page in a multi-page Tab Sheet — the same pipeline the real export uses, pixel-for-pixel. */
export function renderExportPage(
  project: Project,
  page: LineLayoutPage,
  options: ExportOptions,
): HTMLCanvasElement {
  const topOffset = topOffsetFor(options);
  const leftOffset = options.sizeMode.kind === "reel" ? SHEET_MARGIN_X : 0;
  const natural = computePreviewSize(page.lines, topOffset, options.showNotation);
  const width = options.sizeMode.kind === "reel" ? SHEET_WIDTH : natural.width + leftOffset;
  const height = options.sizeMode.kind === "reel" ? SHEET_HEIGHT : natural.height;

  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(width));
  canvas.height = Math.max(1, Math.round(height));
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D context unavailable");

  const palette = paletteForTheme(options.outputTheme);
  const fadeTop = options.sizeMode.kind === "strip" && options.sizeMode.fadeTop;
  const fadeBottom = options.sizeMode.kind === "strip" && options.sizeMode.fadeBottom;

  drawLinePreview(ctx, project, page.lines, {
    background: "opaque",
    palette,
    topOffset,
    leftOffset,
    pageWidth: width,
    pageHeight: height,
    fadeTop,
    fadeBottom,
    showNotation: options.showNotation,
  });
  if (options.watermark) drawWatermark(ctx, width, height, palette);

  return canvas;
}

/** Section 14: one canvas per export page — a reel-square page is one PNG; strip is always one page. */
export function renderExportCanvases(project: Project, options: ExportOptions): HTMLCanvasElement[] {
  return computeExportPages(project, options).map((page) => renderExportPage(project, page, options));
}

export function canvasToPngBytes(canvas: HTMLCanvasElement): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error("Failed to encode canvas as PNG"));
        return;
      }
      blob
        .arrayBuffer()
        .then((buffer) => resolve(new Uint8Array(buffer)))
        .catch(reject);
    }, "image/png");
  });
}

export function sanitizeFilename(name: string): string {
  const cleaned = name.replace(/[\\/:*?"<>|]/g, "_").trim();
  return cleaned.length > 0 ? cleaned : "tab2share-project";
}

/** {proje}_part1.png, {proje}_part2.png, ... (section 14) — only when there's more than one page. */
function partPath(basePath: string, partIndex: number, totalParts: number): string {
  if (totalParts <= 1) return basePath;
  const dotIndex = basePath.lastIndexOf(".");
  const stem = dotIndex >= 0 ? basePath.slice(0, dotIndex) : basePath;
  const ext = dotIndex >= 0 ? basePath.slice(dotIndex) : ".png";
  return `${stem}_part${partIndex + 1}${ext}`;
}

export interface ExportResult {
  paths: string[];
}

/** Opens the native save dialog, then writes one PNG per export page (multi-part naming
 * when the tab needed more pages than fit — section 14's "otomatik küçültme yapılmaz" rule). */
export async function exportProjectToPng(project: Project, options: ExportOptions): Promise<ExportResult | null> {
  const defaultName = `${sanitizeFilename(project.title)}.png`;
  const basePath = await save({
    defaultPath: defaultName,
    filters: [{ name: "PNG Image", extensions: ["png"] }],
  });
  if (!basePath) return null;

  const canvases = renderExportCanvases(project, options);
  const paths: string[] = [];
  for (let i = 0; i < canvases.length; i++) {
    const bytes = await canvasToPngBytes(canvases[i]);
    const path = partPath(basePath, i, canvases.length);
    await writeFile(path, bytes);
    paths.push(path);
  }
  return { paths };
}
