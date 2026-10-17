import { useEffect, useState } from "react";
import type { DesktopApi } from "../../../../preload/desktop-api";
import type {
  DeviceSettings,
  PreviewMode,
  ShareCodec,
  VoiceControlsStatus,
} from "../../../../preload/settings-api";
import { UNEXPECTED_FAILURE_MESSAGE } from "../../account/account-messages";
import { SHARE_CODEC_LABELS } from "../../calls/voice-settings";
import { screenStyles } from "../screen-styles";
import { AudioSettings } from "./AudioSettings";
import { BlockedList } from "./BlockedList";
import { CpuMeasurementTool } from "./CpuMeasurementTool";

interface SettingsScreenProps {
  readonly desktopApi: DesktopApi;
  readonly close: () => void;
}

/** A section's change: only the settings it names. */
export type ChangeSettings = (changes: Partial<DeviceSettings>) => void;

const PREVIEW_LABELS: Readonly<Record<PreviewMode, string>> = {
  full: "The sender and the message",
  sender: "Only the sender",
  generic: "Only that a message arrived",
};

/**
 * Every setting of this computer in four sections: Audio, Video, Privacy and App (11-m4-build
 * step 8). Each change is stored at once and survives a restart.
 */
export function SettingsScreen(props: SettingsScreenProps): React.JSX.Element {
  const { desktopApi } = props;
  const [settings, setSettings] = useState<DeviceSettings>();
  const [voiceControls, setVoiceControls] = useState<VoiceControlsStatus>();
  const [message, setMessage] = useState<string>();

  useEffect(() => {
    let mounted = true;
    Promise.all([
      desktopApi.readSettings(),
      desktopApi.readVoiceControls(),
    ]).then(
      ([read, controls]) => {
        if (!mounted) return;
        setSettings(read);
        setVoiceControls(controls);
      },
      () => {
        if (mounted) setMessage(UNEXPECTED_FAILURE_MESSAGE);
      },
    );
    const unsubscribe = desktopApi.onSettingsChanged(setSettings);
    return (): void => {
      mounted = false;
      unsubscribe();
    };
  }, [desktopApi]);

  const change: ChangeSettings = (changes) => {
    desktopApi.changeSettings(changes).then(setSettings, () => {
      setMessage(UNEXPECTED_FAILURE_MESSAGE);
    });
  };

  return (
    <section
      aria-labelledby="settings-title"
      className="flex h-full flex-col gap-6 overflow-y-auto p-6 text-sm"
    >
      <header className="flex items-center justify-between">
        <h1 id="settings-title" className="text-lg font-semibold">
          Settings
        </h1>
        <button
          type="button"
          className={screenStyles.smallSecondaryButton}
          onClick={props.close}
        >
          Done
        </button>
      </header>
      {message !== undefined && (
        <p role="alert" className={screenStyles.errorMessage}>
          {message}
        </p>
      )}
      {settings === undefined ? (
        <p className={screenStyles.hint}>Loading settings…</p>
      ) : (
        <>
          <SettingsSection title="Audio">
            <AudioSettings
              settings={settings}
              pushToTalkAvailable={voiceControls?.pushToTalkAvailable ?? false}
              change={change}
              problem={setMessage}
            />
          </SettingsSection>
          <SettingsSection title="Video">
            <label className="flex items-center gap-2">
              <span className="text-zinc-300">Screen-share codec</span>
              <select
                value={settings.codec}
                className={screenStyles.textInput}
                onChange={(event) => {
                  change({ codec: event.target.value as ShareCodec });
                }}
              >
                {Object.entries(SHARE_CODEC_LABELS).map(([codec, label]) => (
                  <option key={codec} value={codec}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            {import.meta.env.DEV && (
              <CpuMeasurementTool desktopApi={desktopApi} />
            )}
          </SettingsSection>
          <SettingsSection title="Privacy">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={settings.hideMyIp}
                onChange={(event) => {
                  change({ hideMyIp: event.target.checked });
                }}
              />
              Hide my IP: connect to Calls only through the relay, from the next
              Call on
            </label>
            <fieldset className="flex flex-col gap-1">
              <legend className="mb-1 text-zinc-300">
                Message notifications show
              </legend>
              {Object.entries(PREVIEW_LABELS).map(([mode, label]) => (
                <label key={mode} className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="preview-mode"
                    checked={settings.previewMode === mode}
                    onChange={() => {
                      change({ previewMode: mode as PreviewMode });
                    }}
                  />
                  {label}
                </label>
              ))}
              <span className={screenStyles.hint}>
                While you share your screen, notifications only say that a
                message arrived.
              </span>
            </fieldset>
            <BlockedList desktopApi={desktopApi} />
          </SettingsSection>
          <SettingsSection title="App">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={settings.startAtLogin}
                onChange={(event) => {
                  change({ startAtLogin: event.target.checked });
                }}
              />
              Start with Windows, hidden in the tray
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={settings.quitOnClose}
                onChange={(event) => {
                  change({ quitOnClose: event.target.checked });
                }}
              />
              Quit when the window is closed, instead of keeping the app in the
              tray
            </label>
          </SettingsSection>
        </>
      )}
    </section>
  );
}

function SettingsSection(props: {
  readonly title: string;
  readonly children: React.ReactNode;
}): React.JSX.Element {
  return (
    <section
      aria-label={props.title}
      className="flex flex-col gap-3 border-t border-zinc-800 pt-4"
    >
      <h2 className={screenStyles.sectionHeading}>{props.title}</h2>
      {props.children}
    </section>
  );
}
