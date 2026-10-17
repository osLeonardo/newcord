import { useEffect, useState } from "react";
import type { ShareSourceSummary } from "../../../../preload/call-api";
import type { DesktopApi } from "../../../../preload/desktop-api";
import { UNEXPECTED_FAILURE_MESSAGE } from "../../account/account-messages";
import { screenStyles } from "../screen-styles";

interface SharePickerProps {
  readonly desktopApi: DesktopApi;
  readonly pick: (sourceId: string) => void;
  readonly cancel: () => void;
}

/** The app's own picker of screens and windows to share, with thumbnails (10-m3-build step 7). */
export function SharePicker(props: SharePickerProps): React.JSX.Element {
  const { desktopApi } = props;
  const [sources, setSources] = useState<readonly ShareSourceSummary[]>();
  const [message, setMessage] = useState<string>();

  useEffect(() => {
    let mounted = true;
    desktopApi.listShareSources().then(
      (listed) => {
        if (mounted) setSources(listed);
      },
      () => {
        if (mounted) setMessage(UNEXPECTED_FAILURE_MESSAGE);
      },
    );
    return (): void => {
      mounted = false;
    };
  }, [desktopApi]);

  return (
    <section
      aria-label="Share a screen or window"
      className="flex w-full flex-col gap-2 py-2"
    >
      <p className="text-zinc-300">
        Pick what to share. Only the picture is shared, never sound.
      </p>
      {sources === undefined && message === undefined && (
        <p className={screenStyles.hint}>Looking for screens and windows…</p>
      )}
      <ul className="grid grid-cols-2 gap-2 md:grid-cols-3">
        {sources?.map((source) => (
          <li key={source.id}>
            <button
              type="button"
              className="flex w-full flex-col gap-1 rounded border border-zinc-700 p-2 text-left hover:border-zinc-400"
              onClick={() => {
                props.pick(source.id);
              }}
            >
              <img
                src={source.thumbnail}
                alt=""
                className="aspect-video w-full rounded bg-black object-contain"
              />
              <span className="truncate text-xs">
                {source.kind === "screen" ? "Screen: " : ""}
                {source.name}
              </span>
            </button>
          </li>
        ))}
      </ul>
      {message !== undefined && (
        <p role="alert" className={screenStyles.errorMessage}>
          {message}
        </p>
      )}
      <button
        type="button"
        className={screenStyles.smallSecondaryButton}
        onClick={props.cancel}
      >
        Cancel
      </button>
    </section>
  );
}
