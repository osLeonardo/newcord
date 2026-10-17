import { useId } from "react";
import { screenStyles } from "./screen-styles";

interface TextFieldProps {
  readonly label: string;
  readonly type: "text" | "password";
  readonly value: string;
  readonly autoComplete: string;
  readonly onChange: (value: string) => void;
}

/** A labelled text or password input of the account screens. */
export function TextField(props: TextFieldProps): React.JSX.Element {
  const id = useId();
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-sm text-zinc-300">
        {props.label}
      </label>
      <input
        id={id}
        type={props.type}
        value={props.value}
        autoComplete={props.autoComplete}
        autoCapitalize="none"
        spellCheck={false}
        className={screenStyles.textInput}
        onChange={(event) => {
          props.onChange(event.target.value);
        }}
      />
    </div>
  );
}
