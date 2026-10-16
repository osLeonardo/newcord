import { screenStyles } from "./screen-styles";

interface SwitchScreenLinkProps {
  readonly prompt: string;
  readonly label: string;
  readonly onClick: () => void;
}

/** A link-styled button that moves between the sign-up and login screens without navigating. */
export function SwitchScreenLink(
  props: SwitchScreenLinkProps,
): React.JSX.Element {
  return (
    <p className={screenStyles.hint}>
      {props.prompt}{" "}
      <button
        type="button"
        className={screenStyles.linkButton}
        onClick={props.onClick}
      >
        {props.label}
      </button>
    </p>
  );
}
