/** What a tray menu item does. */
export type TrayAction = "open" | "toggle-mute" | "quit";

export interface TrayItem {
  readonly label: string;
  readonly action: TrayAction;
  readonly enabled: boolean;
}

/**
 * The tray menu: Open, Mute or Unmute, and Quit (11-m4-build step 1). Muting needs a Call; Quit
 * works even during one.
 * @example trayItems({ inCall: true, muted: false }) // [Open, Mute, Quit]
 */
export function trayItems(state: {
  readonly inCall: boolean;
  readonly muted: boolean;
}): TrayItem[] {
  return [
    { label: "Open", action: "open", enabled: true },
    {
      label: state.inCall && state.muted ? "Unmute" : "Mute",
      action: "toggle-mute",
      enabled: state.inCall,
    },
    { label: "Quit", action: "quit", enabled: true },
  ];
}
