import { useState } from "react";
import type { CpuMeasurement } from "../../../../preload/call-api";
import type { DesktopApi } from "../../../../preload/desktop-api";
import { screenStyles } from "../screen-styles";

/** How long one CPU measurement runs. */
const MEASUREMENT_SECONDS = 30;

/**
 * Development builds only: measures the app's CPU use while sharing, for the codec comparison
 * recorded in 10-m3-build (#9, Step 05).
 */
export function CpuMeasurementTool(props: {
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
