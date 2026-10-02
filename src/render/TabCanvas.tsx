import { useEffect, useMemo, useRef } from "react";
import type { Project } from "../model/types";
import { computeLayout, hitTest } from "./layout";
import { drawTab, type EditorVisual } from "./drawTab";
import { LIGHT_PALETTE, SCREEN_PALETTE } from "./constants";
import { useResolvedTheme } from "../theme";

interface TabCanvasProps {
  project: Project;
  visual?: EditorVisual;
  onCellClick?: (flatIndex: number, string: 1 | 2 | 3 | 4 | 5 | 6) => void;
  /** Section 9.2's chord-name warning: fires with the hovered beat's flatIndex, or null off it. */
  onCellHover?: (flatIndex: number | null) => void;
  onDeleteMeasure?: (measureIndex: number) => void;
  /** Standard-notation staff above the tab (Guitar Pro's score + tab view). */
  showNotation?: boolean;
}

/**
 * The tab is painted as a row of fixed-width canvas tiles instead of one canvas as wide as the
 * whole song. A single canvas for a 24-bar piece is ~17,000 device pixels wide — past what most
 * GPUs allow for one texture — and scrolling it stuttered (and stuttered more once a CSS scale
 * was applied). Tiles stay small enough to be GPU-backed, and each only paints the measures it shows.
 */
const TILE_CSS_WIDTH = 2048;
/** Paint margin around a tile so chord names, bends and slurs that overhang a measure still draw. */
const TILE_CULL_MARGIN = 80;

/** Canvas render of a Project's tab. Painting is read-only; `onCellClick`/`onCellHover` are the only interaction. */
export function TabCanvas({ project, visual, onCellClick, onCellHover, onDeleteMeasure, showNotation = false }: TabCanvasProps) {
  const tilesRef = useRef<(HTMLCanvasElement | null)[]>([]);
  const surfaceRef = useRef<HTMLDivElement>(null);
  const theme = useResolvedTheme();
  const layout = useMemo(() => computeLayout(project, showNotation), [project, showNotation]);
  const tileCount = Math.max(1, Math.ceil(layout.width / TILE_CSS_WIDTH));

  useEffect(() => {
    const dpr = window.devicePixelRatio || 1;
    const palette = theme === "light" ? LIGHT_PALETTE : SCREEN_PALETTE;

    for (let index = 0; index < tileCount; index++) {
      const canvas = tilesRef.current[index];
      const ctx = canvas?.getContext("2d");
      if (!canvas || !ctx) continue;

      const x0 = index * TILE_CSS_WIDTH;
      const width = Math.min(TILE_CSS_WIDTH, layout.width - x0);
      canvas.width = Math.max(1, Math.round(width * dpr));
      canvas.height = Math.round(layout.height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${layout.height}px`;

      // Layout coordinates are global: shift the tile's window to the origin and clip to it.
      ctx.setTransform(dpr, 0, 0, dpr, -x0 * dpr, 0);
      ctx.save();
      ctx.beginPath();
      ctx.rect(x0, 0, width, layout.height);
      ctx.clip();
      drawTab(ctx, project, layout, palette, visual, {
        xMin: x0 - TILE_CULL_MARGIN,
        xMax: x0 + width + TILE_CULL_MARGIN,
      });
      ctx.restore();
    }
  }, [project, visual, theme, layout, tileCount]);

  /** Pointer position in layout pixels: the surface is CSS-scaled by the editor's zoom and fit-to-height. */
  function toLayoutPoint(event: React.MouseEvent<HTMLDivElement>) {
    const surface = surfaceRef.current;
    if (!surface) return null;
    const rect = surface.getBoundingClientRect();
    const scaleX = rect.width > 0 ? layout.width / rect.width : 1;
    const scaleY = rect.height > 0 ? layout.height / rect.height : 1;
    return { x: (event.clientX - rect.left) * scaleX, y: (event.clientY - rect.top) * scaleY };
  }

  function handleClick(event: React.MouseEvent<HTMLDivElement>) {
    if (!onCellClick) return;
    const point = toLayoutPoint(event);
    if (!point) return;
    const hit = hitTest(layout, point.x, point.y);
    if (hit) onCellClick(hit.flatIndex, hit.string);
  }

  function handleMouseMove(event: React.MouseEvent<HTMLDivElement>) {
    if (!onCellHover) return;
    const point = toLayoutPoint(event);
    if (!point) return;
    const hit = hitTest(layout, point.x, point.y);
    onCellHover(hit ? hit.flatIndex : null);
  }

  return (
    <div className="relative inline-block group/canvas">
      <div
        ref={surfaceRef}
        onClick={handleClick}
        onMouseMove={handleMouseMove}
        onMouseLeave={() => onCellHover?.(null)}
        className={`flex ${onCellClick ? "cursor-pointer" : ""}`}
        style={{ width: layout.width, height: layout.height }}
      >
        {Array.from({ length: tileCount }, (_, index) => (
          <canvas
            key={index}
            ref={(element) => {
              tilesRef.current[index] = element;
            }}
            className={`block shrink-0 ${index === tileCount - 1 ? "rounded-r-lg" : ""}`}
          />
        ))}
      </div>
      {onDeleteMeasure && project.track.measures.length > 1 ? (
        <div className="absolute inset-0 pointer-events-none">
          {layout.measures.map((measure, index) => {
            const centerX = (measure.startX + measure.endX) / 2;
            return (
              <button
                key={index}
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onDeleteMeasure(index);
                }}
                title={`Ölçü ${index + 1} Sil`}
                className="raised absolute pointer-events-auto flex h-6 w-6 -translate-x-1/2 items-center justify-center rounded-full text-xs font-bold text-red-500 opacity-0 transition-all duration-200 group-hover/canvas:opacity-100 hover:scale-115 hover:bg-red-50 hover:text-red-700 active:scale-95 shadow-md"
                style={{ left: centerX, bottom: 30 }}
              >
                ✕
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
