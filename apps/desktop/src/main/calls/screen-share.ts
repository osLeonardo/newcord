import type { ShareSourceSummary } from "../../preload/call-api";

/** A screen or window the system can capture, with its thumbnail as a data URL. */
export interface CapturableSource<Source> {
  readonly id: string;
  readonly name: string;
  readonly thumbnail: string;
  /** What answers the window's screen-share request, such as Electron's `DesktopCapturerSource`. */
  readonly source: Source;
}

/** Electron's `desktopCapturer`, or a test's stand-in. */
export interface ScreenSources<Source> {
  list(): Promise<readonly CapturableSource<Source>[]>;
}

/**
 * The app's own source picker (10-m3-build step 7): the window lists the screens and windows,
 * the person chooses one, and only that choice answers the next screen-share request.
 */
export interface ShareChooser<Source> {
  listSources(): Promise<ShareSourceSummary[]>;
  /** False for a source the last listing did not show. */
  choose(sourceId: string): boolean;
  /** The chosen source, once; the request is refused without one. */
  take(): Source | undefined;
}

/**
 * Creates the chooser over the system's sources.
 * @example const chooser = createShareChooser({ list: () => desktopCapturer.getSources(…) });
 */
export function createShareChooser<Source>(
  sources: ScreenSources<Source>,
): ShareChooser<Source> {
  let listed = new Map<string, Source>();
  let chosen: Source | undefined;
  return {
    listSources: async (): Promise<ShareSourceSummary[]> => {
      const found = await sources.list();
      listed = new Map(found.map((entry) => [entry.id, entry.source]));
      chosen = undefined;
      return found.map((entry) => ({
        id: entry.id,
        name: entry.name,
        kind: entry.id.startsWith("screen:") ? "screen" : "window",
        thumbnail: entry.thumbnail,
      }));
    },
    choose: (sourceId): boolean => {
      chosen = listed.get(sourceId);
      return chosen !== undefined;
    },
    take: (): Source | undefined => {
      const source = chosen;
      chosen = undefined;
      return source;
    },
  };
}
