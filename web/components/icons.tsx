import type { SVGProps } from "react";

/**
 * Lightweight inline SVG icon set (24x24, stroke = currentColor).
 * No external icon dependency — keeps the bundle small per project rules.
 */

export type IconName =
  | "dashboard"
  | "route"
  | "users"
  | "binoculars"
  | "map"
  | "chart"
  | "settings"
  | "search"
  | "bell"
  | "chevronDown"
  | "chevronLeft"
  | "chevronRight"
  | "chevronUp"
  | "chevronsUpDown"
  | "plus"
  | "x"
  | "check"
  | "more"
  | "camera"
  | "play"
  | "pause"
  | "skipBack"
  | "skipForward"
  | "download"
  | "upload"
  | "alert"
  | "clock"
  | "calendar"
  | "compass"
  | "refresh"
  | "eye"
  | "login"
  | "menu"
  | "fullscreen"
  | "locate"
  | "activity"
  | "heart"
  | "truck"
  | "target"
  | "lock"
  | "sliders"
  | "info"
  | "pencil"
  | "trash"
  | "copy"
  | "mail"
  | "phone"
  | "pin"
  | "star"
  | "wifi"
  | "radio"
  | "droplet"
  | "tree"
  | "paw"
  | "fire"
  | "sos"
  | "box"
  | "layers"
  | "filter"
  | "grid"
  | "list"
  | "gallery"
  | "save"
  | "key"
  | "shield"
  | "zoomIn"
  | "zoomOut"
  | "maximize"
  | "minimize"
  | "ruler"
  | "history"
  | "template"
  | "export"
  | "print"
  | "file"
  | "zap"
  | "link"
  | "edit"
  | "flag"
  | "power";

const paths: Record<IconName, React.ReactNode> = {
  dashboard: (<><rect x="3" y="3" width="7" height="9" rx="1" /><rect x="14" y="3" width="7" height="5" rx="1" /><rect x="14" y="12" width="7" height="9" rx="1" /><rect x="3" y="16" width="7" height="5" rx="1" /></>),
  route: (<><circle cx="6" cy="19" r="2.5" /><circle cx="18" cy="5" r="2.5" /><path d="M8.5 19H14a2.5 2.5 0 0 0 0-5H10a2.5 2.5 0 0 1 0-5h5.5" /></>),
  users: (<><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></>),
  binoculars: (<><path d="M10 10h4" /><path d="M19 7V4a1 1 0 0 0-1-1h-2a1 1 0 0 0-1 1v3" /><path d="M20 7v11a3 3 0 0 1-3 3h-3a2 2 0 0 1-2-2v-5" /><path d="M9 21h-3a3 3 0 0 1-3-3V7" /><path d="M4 4a1 1 0 0 0-1 1v3" /><circle cx="12" cy="14" r="2" /><circle cx="12" cy="17" r="0.5" fill="currentColor" /></>),
  map: (<><path d="m3 6 6-3 6 3 6-3v15l-6 3-6-3-6 3z" /><path d="M9 3v15" /><path d="M15 6v15" /></>),
  chart: (<><path d="M3 3v16a2 2 0 0 0 2 2h16" /><path d="M7 13l4-4 4 4 6-7" /></>),
  settings: (<><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" /></>),
  search: (<><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" /></>),
  bell: (<><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" /><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" /></>),
  chevronDown: <path d="m6 9 6 6 6-6" />,
  chevronLeft: <path d="m15 18-6-6 6-6" />,
  chevronRight: <path d="m9 18 6-6-6-6" />,
  chevronUp: <path d="m18 15-6-6-6 6" />,
  chevronsUpDown: <path d="m7 15 5 5 5-5M7 9l5-5 5 5" />,
  plus: <path d="M12 5v14M5 12h14" />,
  x: <path d="M18 6 6 18M6 6l12 12" />,
  check: <path d="M20 6 9 17l-5-5" />,
  more: (<><circle cx="12" cy="12" r="1" fill="currentColor" /><circle cx="6" cy="12" r="1" fill="currentColor" /><circle cx="18" cy="12" r="1" fill="currentColor" /></>),
  camera: (<><path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z" /><circle cx="12" cy="13" r="3" /></>),
  play: <path d="M6 4l14 8-14 8z" />,
  pause: (<><path d="M10 4v16" /><path d="M14 4v16" /></>),
  skipBack: (<><path d="M19 20 9 12l10-8v16z" /><path d="M5 19V5" /></>),
  skipForward: (<><path d="m5 4 10 8-10 8V4z" /><path d="M19 5v14" /></>),
  download: (<><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><path d="m7 10 5 5 5-5" /><path d="M12 15V3" /></>),
  upload: (<><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><path d="m17 8-5-5-5 5" /><path d="M12 3v12" /></>),
  alert: (<><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /><path d="M12 9v4" /><path d="M12 17h.01" /></>),
  info: (<><circle cx="12" cy="12" r="9" /><path d="M12 16v-4" /><path d="M12 8h.01" /></>),
  clock: (<><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>),
  calendar: (<><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" /></>),
  compass: (<><circle cx="12" cy="12" r="9" /><path d="m15.5 8.5-2 5-5 2 2-5z" /></>),
  refresh: (<><path d="M21 12a9 9 0 1 1-3-6.7L21 8" /><path d="M21 3v5h-5" /></>),
  eye: (<><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z" /><circle cx="12" cy="12" r="3" /></>),
  login: (<><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" /><path d="m10 17 5-5-5-5" /><path d="M15 12H3" /></>),
  menu: <path d="M4 6h16M4 12h16M4 18h16" />,
  fullscreen: (<><path d="M8 3H5a2 2 0 0 0-2 2v3" /><path d="M21 8V5a2 2 0 0 0-2-2h-3" /><path d="M3 16v3a2 2 0 0 0 2 2h3" /><path d="M16 21h3a2 2 0 0 0 2-2v-3" /></>),
  locate: (<><circle cx="12" cy="12" r="3" /><circle cx="12" cy="12" r="8" /><path d="M12 2v2M12 20v2M2 12h2M20 12h2" /></>),
  activity: <path d="M22 12h-4l-3 9L9 3l-3 9H2" />,
  heart: (<><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" /></>),
  truck: (<><path d="M10 17h4V5H2v12h3" /><path d="M20 17h2v-3.34a4 4 0 0 0-1.17-2.83L19 9h-5v8h1" /><circle cx="7.5" cy="17.5" r="2.5" /><circle cx="17.5" cy="17.5" r="2.5" /></>),
  target: (<><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="5" /><circle cx="12" cy="12" r="1" /></>),
  lock: (<><rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></>),
  sliders: <path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6" />,
  pencil: (<><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" /></>),
  trash: (<><path d="M3 6h18" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" /><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></>),
  copy: (<><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></>),
  mail: (<><rect x="2" y="4" width="20" height="16" rx="2" /><path d="m22 7-10 6L2 7" /></>),
  phone: (<><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z" /></>),
  pin: (<><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0z" /><circle cx="12" cy="10" r="3" /></>),
  star: (<><path d="m12 2 3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01z" /></>),
  wifi: (<><path d="M5 12.55a11 11 0 0 1 14.08 0" /><path d="M1.42 9a16 16 0 0 1 21.16 0" /><path d="M8.53 16.11a6 6 0 0 1 6.95 0" /><path d="M12 20h.01" /></>),
  radio: (<><circle cx="12" cy="12" r="2" /><path d="M4.93 19.07a10 10 0 0 1 0-14.14" /><path d="M7.76 16.24a6 6 0 0 1 0-8.49" /><path d="M16.24 7.76a6 6 0 0 1 0 8.49" /><path d="M19.07 4.93a10 10 0 0 1 0 14.14" /></>),
  droplet: <path d="M12 22a7 7 0 0 0 7-7c0-2-1-3.9-3-5.5s-3.5-4-4-6.5c-.5 2.5-2 4.9-4 6.5C6 11.1 5 13 5 15a7 7 0 0 0 7 7z" />,
  tree: (<><path d="M12 2v20" /><path d="M12 4 8.5 8M12 4l3.5 4" /><path d="M12 9 8.5 13M12 9l3.5 4" /><path d="M12 14 8.5 18M12 14l3.5 4" /></>),
  paw: (<><circle cx="11" cy="4" r="2" /><circle cx="18" cy="8" r="2" /><circle cx="20" cy="16" r="2" /><path d="M9 10a5 5 0 0 1 5 5v3.5a3.5 3.5 0 0 1-6.84 1.045Q6.52 17.48 4.46 16.84A3.5 3.5 0 0 1 5.5 12Z" /></>),
  fire: (<><path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z" /></>),
  sos: (<><circle cx="12" cy="12" r="9" /><path d="M8.5 9.5h1.2a1 1 0 0 1 1 1.2L10 13.8a1 1 0 0 0 1 1.2H15M6.5 12H7" /><path d="M11 12.5h3" /></>),
  box: (<><path d="M21 8V4a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v4" /><path d="M3 8v12a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V8H3z" /><path d="M12 8v12" /><path d="M7 3v5M17 3v5" /></>),
  layers: (<><path d="m12 2 10 6-10 6L2 8z" /><path d="m2 14 10 6 10-6" /></>),
  filter: (<><path d="M22 3H2l8 9.46V19l4 2v-8.54z" /></>),
  grid: (<><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></>),
  list: (<><path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" /></>),
  gallery: (<><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="9" cy="9" r="2" /><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" /></>),
  save: (<><path d="M21 3H3v18h18z" /><path d="M7 3v6h10V3" /><path d="M7 17h10" /></>),
  key: (<><path d="m21 2-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0 3 3L22 7l-3-3m-3.5 3.5L19 4" /></>),
  print: (<><path d="M6 9V2h12v7" /><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" /><rect x="6" y="14" width="12" height="8" /></>),
  shield: (<><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></>),
  zoomIn: (<><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3M11 8v6M8 11h6" /></>),
  zoomOut: (<><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3M8 11h6" /></>),
  maximize: (<><path d="M8 3H5a2 2 0 0 0-2 2v3" /><path d="M21 8V5a2 2 0 0 0-2-2h-3" /><path d="M3 16v3a2 2 0 0 0 2 2h3" /><path d="M16 21h3a2 2 0 0 0 2-2v-3" /></>),
  minimize: (<><path d="M8 3v3a2 2 0 0 1-2 2H3" /><path d="M21 8h-3a2 2 0 0 1-2-2V3" /><path d="M3 16h3a2 2 0 0 1 2 2v3" /><path d="M16 21v-3a2 2 0 0 1 2-2h3" /></>),
  ruler: (<><path d="M21.3 8.7 15.3 2.7a1 1 0 0 0-1.4 0l-11.2 11.2a1 1 0 0 0 0 1.4l6 6a1 1 0 0 0 1.4 0l11.2-11.2a1 1 0 0 0 0-1.4z" /><path d="m7.5 10.5 2 2M10.5 7.5l2 2M13.5 4.5 15.5 6.5M4.5 13.5l2 2" /></>),
  history: (<><path d="M3 12a9 9 0 1 0 3.4-7" /><path d="M3 4v5h5" /><path d="M12 7v5l3 2" /></>),
  template: (<><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M3 9h18M9 21V9" /></>),
  export: (<><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><path d="m7 10 5 5 5-5" /><path d="M12 15V3" /></>),
  file: (<><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" /><path d="M16 13H8M16 17H8" /></>),
  zap: (<><path d="M13 2 3 14h9l-1 8 10-12h-9l1-8z" /></>),
  link: (<><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" /><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" /></>),
  edit: (<><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" /><path d="m15 5 4 4" /></>),
  flag: (<><path d="M4 22V4" /><path d="M4 4c4-3 8 3 12 0v9c-4 3-8-3-12 0" /></>),
  power: (<><path d="M12 2v10" /><path d="M18.4 6.6a9 9 0 1 1-12.77.04" /></>),
};

export interface IconProps extends SVGProps<SVGSVGElement> {
  name: IconName;
  size?: number;
}

export function Icon({ name, size = 18, ...props }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {paths[name]}
    </svg>
  );
}