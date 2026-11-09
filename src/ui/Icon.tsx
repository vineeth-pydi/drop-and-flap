import type { ReactNode } from 'react';

export interface IconProps {
  name: string;
  size?: number;
}

const artwork: Record<string, ReactNode> = {
  play: <path d="M8 4.5 20 12 8 19.5Z" />,
  pause: <><path d="M7 5H10V19H7Z" /><path d="M14 5H17V19H14Z" /></>,
  arrow: <><path d="M4 12H20" /><path d="m14 6 6 6-6 6" /></>,
  sound: <><path d="M4 9H8L13 5V19L8 15H4Z" /><path d="M16 8a6 6 0 0 1 0 8M19 5a10 10 0 0 1 0 14" /></>,
  mute: <><path d="M4 9H8L13 5V19L8 15H4Z" /><path d="m17 9 5 6m0-6-5 6" /></>,
  shield: <><path d="M12 3 20 6V12C20 16.2 16.2 19.1 12 21 7.8 19.1 4 16.2 4 12V6Z" /><path d="m8.5 12 2.3 2.3 4.8-5" /></>,
  settings: <><path d="M5 4V20M12 4V20M19 4V20" /><path d="M2.5 8H7.5V12H2.5ZM9.5 14H14.5V18H9.5ZM16.5 6H21.5V10H16.5Z" fill="var(--panel, #111b29)" /></>,
  history: <><path d="M4 9A8.5 8.5 0 1 1 4 16M4 4V9H9" /><path d="M12 7V12L16 14" /></>,
  download: <><path d="M12 3V15m-5-5 5 5 5-5" /><path d="M4 16V21H20V16" /></>,
  share: <><path d="m9 9 6-4m-6 10 6 4" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="4" r="3" /><circle cx="18" cy="20" r="3" /></>,
  close: <path d="m5 5 14 14M19 5 5 19" />,
  camera: <><path d="M3 7H8L10 4H15L17 7H21V20H3Z" /><circle cx="12" cy="13" r="4" /></>,
  check: <path d="m4 12 5 5L20 6" />,
  bolt: <path d="M14 2 5 13H11L10 22 20 10H14Z" />,
};

/** Decorative icons belong inside a control with a visible or accessible name. */
export default function Icon({ name, size = 20 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      {artwork[name] ?? artwork.bolt}
    </svg>
  );
}

export interface PixelBirdProps {
  size?: number;
  className?: string;
}

/** Original gym bird, built on an integer pixel grid with a colored sweatband. */
export function PixelBird({ size = 44, className }: PixelBirdProps) {
  return (
    <svg width={size} height={size * 30 / 36} viewBox="0 0 36 30" className={className}
      aria-hidden="true" focusable="false" shapeRendering="crispEdges">
      <path d="M12 2H25V5H29V9H32V22H28V26H10V23H6V20H3V11H7V6H12Z" fill="var(--accent, #ccff5f)" />
      <path d="M12 2H25V5H29V9H32V22H28V26H10V23H6V20H3V11H7V6H12Z"
        fill="none" stroke="var(--bg, #080c14)" strokeWidth="2" />
      <path d="M7 7H29V11H7ZM4 9H7V15H4Z" fill="var(--secondary, #ff71ba)" />
      <path d="M8 14H17V17H20V21H17V23H8V20H6V17H8Z" fill="var(--pipe, #537342)" />
      <path d="M27 15H35V21H27Z" fill="#FFCB50" />
      <path d="M27 18H35V20H27Z" fill="var(--bg, #080c14)" />
      <path d="M22 10H28V16H22Z" fill="#FFF8DF" />
      <path d="M25 11H28V14H25Z" fill="#080C14" />
      <path d="M12 26H16V29H12ZM23 26H27V29H23Z" fill="#FFCB50" />
    </svg>
  );
}
