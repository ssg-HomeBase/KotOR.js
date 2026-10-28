import React, { useEffect, useRef, useState } from "react";
import "@/apps/game/components/fullscreen-button/fullscreenButton.scss";

/**
 * KOTOR III Phase 2 (Cam's request, 2026-10-26): a full-screen button like a video player's. It sits at the top
 * centre (clear of the game's own bars), shows while the mouse moves and fades after a few still seconds.
 * The browser's own F11 works too; the F key is the game's (cancel combat), so there is no key for this.
 */
export const FullscreenButton = () => {
  const supported = typeof document !== 'undefined' && !!document.documentElement?.requestFullscreen;
  const [isFull, setIsFull] = useState<boolean>(!!(typeof document !== 'undefined' && document.fullscreenElement));
  const [visible, setVisible] = useState(true);
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => {
    const hideLater = (ms: number) => {
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => setVisible(false), ms);
    };
    const onChange = () => setIsFull(!!document.fullscreenElement);
    const onMove = () => { setVisible(true); hideLater(2500); };
    document.addEventListener('fullscreenchange', onChange);
    window.addEventListener('mousemove', onMove);
    hideLater(6000);
    return () => {
      document.removeEventListener('fullscreenchange', onChange);
      window.removeEventListener('mousemove', onMove);
      window.clearTimeout(timer.current);
    };
  }, []);

  if (!supported) return null;

  const toggle = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else {
        await document.documentElement.requestFullscreen({ navigationUI: 'hide' } as FullscreenOptions);
      }
    } catch (err) {
      console.warn('Full screen was refused by the browser', err);
    }
  };

  const label = isFull ? 'Exit full screen' : 'Full screen';
  return (
    <button
      type="button"
      className={`fullscreen-button${visible ? ' visible' : ''}`}
      onClick={toggle}
      onMouseDown={(e) => e.stopPropagation()}
      onMouseUp={(e) => e.stopPropagation()}
      title={`${label} (F11 also works)`}
      aria-label={label}
    >
      <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
        {isFull ? (
          <path fill="currentColor" d="M8 3v5H3v2h7V3H8zm6 0v7h7V8h-5V3h-2zM3 14v2h5v5h2v-7H3zm11 0v7h2v-5h5v-2h-7z" />
        ) : (
          <path fill="currentColor" d="M3 3v7h2V5h5V3H3zm11 0v2h5v5h2V3h-7zM3 14v7h7v-2H5v-5H3zm16 0v5h-5v2h7v-7h-2z" />
        )}
      </svg>
      <span>{label}</span>
    </button>
  );
};
