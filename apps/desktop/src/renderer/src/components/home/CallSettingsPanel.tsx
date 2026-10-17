import { useEffect, useState, type KeyboardEvent } from "react";
import type { CpuMeasurement } from "../../../../preload/call-api";
import type {
  DeviceSettings,
  ShareCodec,
  VoiceControlsStatus,
} from "../../../../preload/settings-api";
import type { DesktopApi } from "../../../../preload/desktop-api";
import { UNEXPECTED_FAILURE_MESSAGE } from "../../account/account-messages";
import {
  acceleratorOf,
  keyLabel,
  SHARE_CODEC_LABELS,
} from "../../calls/voice-settings";
import { screenStyles } from "../screen-styles";

interface CallSettingsPanelProps {
  readonly desktopApi: DesktopApi;
}

type Capturing = "push-to-talk" | "mute";

const MODIFIER_CODES = new Set([
  "ControlLeft",
  "ControlRight",
  "AltLeft",
  "AltRight",
  "ShiftLeft",
  "ShiftRight",
  "MetaLeft",
  "MetaRight",
]);

/**
 * The Call settings of this computer (#9's spec): how the microphone turns on, the push-to-talk key,
 * the mute hotkey, the screen-share codec and Hide my IP. M4's settings screen takes them over (#10).
 */
export function CallSettingsPanel(
  props: CallSettingsPanelProps,
): React.JSX.Element {
  const { desktopApi } = props;
  const [settings, setSettings] = useState<DeviceSettings>();
  const [status, setStatus] = useState<VoiceControlsStatus>();
  const [capturing, setCapturing] = useState<Capturing>();
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
        setStatus(controls);
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

  function change(changes: Partial<DeviceSettings>): void {
    desktopApi.changeSettings(changes).then(setSettings, () => {
      setMessage(UNEXPECTED_FAILURE_MESSAGE);
    });
  }

  function captured(event: KeyboardEvent<HTMLButtonElement>): void {
    if (capturing === undefined) return;
    event.preventDefault();
    if (event.code === "Escape") {
      setCapturing(undefined);
      return;
    }
    if (capturing === "push-to-talk") {
      setCapturing(undefined);
      setMessage(undefined);
      change({ pushToTalkKey: event.code });
      return;
    }
    if (MODIFIER_CODES.has(event.code)) return;
    const accelerator = acceleratorOf(event);
    if (accelerator === undefined) {
      setMessage("Use Ctrl or Alt with a letter, a digit or an F-key.");
      return;
    }
    setCapturing(undefined);
    setMessage(undefined);
    change({ muteHotkey: accelerator });
  }

  if (settings === undefined) {
    return (
      <p className={screenStyles.hint}>{message ?? "Loading Call settings…"}</p>
    );
  }

  return (
    <div className="flex w-full flex-col gap-3 py-2">
      <fieldset className="flex flex-wrap items-center gap-3">
        <legend className="mb-1 text-zinc-300">Microphone</legend>
        <label className="flex items-center gap-1">
          <input
            type="radio"
            name="microphone-mode"
            checked={settings.microphoneMode === "voice-activity"}
            onChange={() => {
              change({ microphoneMode: "voice-activity" });
            }}
          />
          Voice activity
        </label>
        <label className="flex items-center gap-1">
          <input
            type="radio"
            name="microphone-mode"
            checked={settings.microphoneMode === "push-to-talk"}
            onChange={() => {
              change({ microphoneMode: "push-to-talk" });
            }}
          />
          Push-to-talk
        </label>
      </fieldset>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-zinc-300">Push-to-talk key:</span>
        <span>
          {settings.pushToTalkKey === null
            ? "none"
            : keyLabel(settings.pushToTalkKey)}
        </span>
        <button
          type="button"
          className={screenStyles.smallSecondaryButton}
          onClick={() => {
            setCapturing("push-to-talk");
          }}
          onKeyDown={captured}
        >
          {capturing === "push-to-talk" ? "Press a key…" : "Change"}
        </button>
        {settings.pushToTalkKey !== null && (
          <button
            type="button"
            className={screenStyles.linkButton}
            onClick={() => {
              change({ pushToTalkKey: null });
            }}
          >
            Clear
          </button>
        )}
        {status?.pushToTalkAvailable === false && (
          <span className="text-amber-300">
            Push-to-talk needs the keyboard hook, which is not installed yet.
          </span>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-zinc-300">Mute hotkey:</span>
        <span>{settings.muteHotkey}</span>
        <button
          type="button"
          className={screenStyles.smallSecondaryButton}
          onClick={() => {
            setCapturing("mute");
          }}
          onKeyDown={captured}
        >
          {capturing === "mute" ? "Press the keys…" : "Change"}
        </button>
      </div>
      <label className="flex items-center gap-2">
        <span className="text-zinc-300">Screen-share codec:</span>
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
      <label className="flex items-center gap-2">
        <input
          type="checkbox"
          checked={settings.hideMyIp}
          onChange={(event) => {
            change({ hideMyIp: event.target.checked });
          }}
        />
        Hide my IP: connect only through the relay, from the next Call on
      </label>
      {message !== undefined && (
        <p role="alert" className={screenStyles.errorMessage}>
          {message}
        </p>
      )}
      {import.meta.env.DEV && <CpuMeasurementTool desktopApi={desktopApi} />}
    </div>
  );
}

/** How long one CPU measurement runs. */
const MEASUREMENT_SECONDS = 30;

/**
 * Development builds only: measures the app's CPU use while sharing, for the codec comparison
 * recorded in 10-m3-build (#9, Step 05).
 */
function CpuMeasurementTool(props: {
  readonly desktopApi: DesktopApi;
}): React.JSX.Element {
  const [measuring, setMeasuring] = useState(false);
  const [measured, setMeasured] = useState<CpuMeasurement>();

  return (
    <div className="flex flex-col gap-1 border-t border-zinc-800 pt-2 text-xs">
      <button
        type="button"
        className={screenStyles.smallSecondaryButton}
        disabled={measuring}
        onClick={() => {
          setMeasuring(true);
          props.desktopApi
            .measureCpu(MEASUREMENT_SECONDS)
            .then(setMeasured, () => undefined)
            .finally(() => {
              setMeasuring(false);
            });
        }}
      >
        {measuring
          ? `Measuring for ${MEASUREMENT_SECONDS} seconds…`
          : `Measure CPU for ${MEASUREMENT_SECONDS} seconds (development)`}
      </button>
      {measured !== undefined && (
        <p className="font-mono text-zinc-300">
          {measured.averagePercent}% of one core on average:{" "}
          {measured.byProcessType
            .map((entry) => `${entry.type} ${entry.averagePercent}%`)
            .join(", ")}
        </p>
      )}
    </div>
  );
}
