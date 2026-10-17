import { useEffect, useState, type KeyboardEvent } from "react";
import type { DeviceSettings } from "../../../../preload/settings-api";
import { acceleratorOf, keyLabel } from "../../calls/voice-settings";
import { screenStyles } from "../screen-styles";
import type { ChangeSettings } from "./SettingsScreen";

interface AudioSettingsProps {
  readonly settings: DeviceSettings;
  readonly pushToTalkAvailable: boolean;
  readonly change: ChangeSettings;
  readonly problem: (message: string | undefined) => void;
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

interface Microphone {
  readonly deviceId: string;
  readonly label: string;
}

/**
 * The Audio section (11-m4-build step 8): microphone mode, push-to-talk key, mute hotkey, input
 * device and voice-activity sensitivity.
 */
export function AudioSettings(props: AudioSettingsProps): React.JSX.Element {
  const { settings, change } = props;
  const [capturing, setCapturing] = useState<Capturing>();
  const microphones = useMicrophones();

  function captured(event: KeyboardEvent<HTMLButtonElement>): void {
    if (capturing === undefined) return;
    event.preventDefault();
    if (event.code === "Escape") {
      setCapturing(undefined);
      return;
    }
    if (capturing === "push-to-talk") {
      setCapturing(undefined);
      props.problem(undefined);
      change({ pushToTalkKey: event.code });
      return;
    }
    if (MODIFIER_CODES.has(event.code)) return;
    const accelerator = acceleratorOf(event);
    if (accelerator === undefined) {
      props.problem("Use Ctrl or Alt with a letter, a digit or an F-key.");
      return;
    }
    setCapturing(undefined);
    props.problem(undefined);
    change({ muteHotkey: accelerator });
  }

  return (
    <>
      <fieldset className="flex flex-wrap items-center gap-3">
        <legend className="mb-1 text-zinc-300">Microphone turns on</legend>
        <label className="flex items-center gap-1">
          <input
            type="radio"
            name="microphone-mode"
            checked={settings.microphoneMode === "voice-activity"}
            onChange={() => {
              change({ microphoneMode: "voice-activity" });
            }}
          />
          When you speak
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
          While you hold the push-to-talk key
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
        {!props.pushToTalkAvailable && (
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
        <span className="text-zinc-300">Input device</span>
        <select
          value={settings.inputDeviceId ?? ""}
          className={screenStyles.textInput}
          onChange={(event) => {
            change({
              inputDeviceId:
                event.target.value === "" ? null : event.target.value,
            });
          }}
        >
          <option value="">The system&apos;s default microphone</option>
          {microphones.map((microphone) => (
            <option key={microphone.deviceId} value={microphone.deviceId}>
              {microphone.label}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-zinc-300">
          Voice-activity sensitivity: {settings.voiceSensitivity}
        </span>
        <input
          type="range"
          min={0}
          max={100}
          step={5}
          value={settings.voiceSensitivity}
          onChange={(event) => {
            change({ voiceSensitivity: Number(event.target.value) });
          }}
        />
        <span className={screenStyles.hint}>
          Higher hears quieter voices; lower ignores more background noise.
        </span>
      </label>
    </>
  );
}

/** The microphones Windows offers; their names show once the app may use the microphone. */
function useMicrophones(): readonly Microphone[] {
  const [microphones, setMicrophones] = useState<readonly Microphone[]>([]);
  useEffect(() => {
    let mounted = true;
    const read = (): void => {
      navigator.mediaDevices.enumerateDevices().then(
        (devices) => {
          if (!mounted) return;
          const inputs = devices.filter(
            (device) =>
              device.kind === "audioinput" &&
              device.deviceId !== "" &&
              device.deviceId !== "default",
          );
          setMicrophones(
            inputs.map((device, index) => ({
              deviceId: device.deviceId,
              label:
                device.label === "" ? `Microphone ${index + 1}` : device.label,
            })),
          );
        },
        () => undefined,
      );
    };
    read();
    navigator.mediaDevices.addEventListener("devicechange", read);
    return (): void => {
      mounted = false;
      navigator.mediaDevices.removeEventListener("devicechange", read);
    };
  }, []);
  return microphones;
}
