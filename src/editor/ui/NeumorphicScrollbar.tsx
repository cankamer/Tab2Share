import { useCallback, useEffect, useRef, useState } from "react";

interface NeumorphicScrollbarProps {
  scrollRef: React.RefObject<HTMLDivElement | null>;
  className?: string;
  /** Fires whenever the user grabs, drags or clicks the bar — lets playback stop auto-following while they look around. */
  onUserScroll?: () => void;
}

export function NeumorphicScrollbar({ scrollRef, className = "", onUserScroll }: NeumorphicScrollbarProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [scrollProgress, setScrollProgress] = useState(0);
  const [thumbRatio, setThumbRatio] = useState(1);
  const [isOverflowing, setIsOverflowing] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const dragStartXRef = useRef(0);
  const dragStartScrollLeftRef = useRef(0);
  const wasDraggingRef = useRef(false);

  const updateScrollState = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;

    const maxScroll = el.scrollWidth - el.clientWidth;
    if (maxScroll > 1) {
      setIsOverflowing(true);
      setScrollProgress(Math.max(0, Math.min(1, el.scrollLeft / maxScroll)));
      setThumbRatio(Math.max(0.05, Math.min(1, el.clientWidth / el.scrollWidth)));
    } else {
      setIsOverflowing(false);
      setScrollProgress(0);
      setThumbRatio(1);
    }
  }, [scrollRef]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    updateScrollState();

    const handleScroll = () => updateScrollState();
    el.addEventListener("scroll", handleScroll, { passive: true });

    const resizeObserver = new ResizeObserver(() => updateScrollState());
    resizeObserver.observe(el);
    if (el.firstElementChild) {
      resizeObserver.observe(el.firstElementChild as Element);
    }

    return () => {
      el.removeEventListener("scroll", handleScroll);
      resizeObserver.disconnect();
    };
  }, [scrollRef, updateScrollState]);

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    const el = scrollRef.current;
    const track = trackRef.current;
    if (!el || !track) return;

    event.preventDefault();
    event.stopPropagation();
    onUserScroll?.();
    setIsDragging(true);
    wasDraggingRef.current = false;
    dragStartXRef.current = event.clientX;
    dragStartScrollLeftRef.current = el.scrollLeft;

    const handlePointerMove = (e: PointerEvent) => {
      onUserScroll?.();
      const deltaX = e.clientX - dragStartXRef.current;
      if (Math.abs(deltaX) > 2) {
        wasDraggingRef.current = true;
      }

      const maxScroll = el.scrollWidth - el.clientWidth;
      const trackWidth = track.clientWidth;
      const thumbWidth = Math.max(54, trackWidth * (el.clientWidth / el.scrollWidth));
      const availableTrackWidth = trackWidth - thumbWidth;

      if (availableTrackWidth > 0 && maxScroll > 0) {
        const scrollDelta = (deltaX / availableTrackWidth) * maxScroll;
        el.scrollLeft = Math.max(0, Math.min(maxScroll, dragStartScrollLeftRef.current + scrollDelta));
      }
    };

    const handlePointerUp = () => {
      setIsDragging(false);
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      window.removeEventListener("pointercancel", handlePointerUp);
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    window.addEventListener("pointercancel", handlePointerUp);
  };

  const handleTrackClick = (event: React.MouseEvent<HTMLDivElement>) => {
    if (wasDraggingRef.current) {
      wasDraggingRef.current = false;
      return;
    }
    const el = scrollRef.current;
    const track = trackRef.current;
    if (!el || !track) return;
    onUserScroll?.();

    const rect = track.getBoundingClientRect();
    const clickX = event.clientX - rect.left;
    const trackWidth = track.clientWidth;
    const thumbWidth = Math.max(54, trackWidth * thumbRatio);
    const availableTrackWidth = trackWidth - thumbWidth;
    if (availableTrackWidth <= 0) return;

    const targetRatio = Math.max(0, Math.min(1, (clickX - thumbWidth / 2) / availableTrackWidth));
    const maxScroll = el.scrollWidth - el.clientWidth;

    el.scrollLeft = targetRatio * maxScroll;
  };

  if (!isOverflowing) return null;

  const trackWidth = trackRef.current?.clientWidth || 300;
  const thumbWidth = Math.max(54, trackWidth * thumbRatio);
  const maxThumbLeft = Math.max(0, trackWidth - thumbWidth);
  const thumbLeft = scrollProgress * maxThumbLeft;

  return (
    <div
      ref={trackRef}
      onClick={handleTrackClick}
      className={`inset absolute bottom-2.5 left-4 right-4 h-4 rounded-full flex items-center p-0.5 cursor-pointer z-40 select-none ${className}`}
    >
      <div
        onPointerDown={handlePointerDown}
        className={`raised rounded-full h-full cursor-grab active:cursor-grabbing flex items-center justify-center transition-shadow ${
          isDragging ? "brightness-110 shadow-lg scale-y-105" : "hover:brightness-105"
        }`}
        style={{
          width: `${thumbWidth}px`,
          transform: `translateX(${thumbLeft}px)`,
          touchAction: "none",
        }}
      >
        <div className="w-5 h-1 rounded-full opacity-40 bg-[var(--control-text)]" />
      </div>
    </div>
  );
}
