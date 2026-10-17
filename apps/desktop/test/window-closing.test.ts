import { describe, expect, it, vi } from "vitest";
import {
  hideOnClose,
  showAgain,
  type HideableWindow,
} from "../src/main/window-closing";

interface FakeWindow {
  readonly window: HideableWindow;
  readonly hide: ReturnType<typeof vi.fn<() => void>>;
  readonly show: ReturnType<typeof vi.fn<() => void>>;
  readonly focus: ReturnType<typeof vi.fn<() => void>>;
  readonly restore: ReturnType<typeof vi.fn<() => void>>;
  /** Asks the window to close, as the close button does. */
  close(): { prevented: boolean };
}

function fakeWindow(minimized = false): FakeWindow {
  const listeners: ((event: { preventDefault(): void }) => void)[] = [];
  const hide = vi.fn<() => void>();
  const show = vi.fn<() => void>();
  const focus = vi.fn<() => void>();
  const restore = vi.fn<() => void>();
  return {
    window: {
      on: (_event, listener): void => {
        listeners.push(listener);
      },
      hide,
      show,
      focus,
      isMinimized: () => minimized,
      restore,
    },
    hide,
    show,
    focus,
    restore,
    close: (): { prevented: boolean } => {
      const result = { prevented: false };
      for (const listener of listeners) {
        listener({
          preventDefault: () => {
            result.prevented = true;
          },
        });
      }
      return result;
    },
  };
}

describe("hideOnClose (D42, D15b)", () => {
  it("hides the window instead of closing it, and says so", () => {
    const fake = fakeWindow();
    const hidden = vi.fn<() => void>();
    hideOnClose(fake.window, { decide: () => "hide", hidden });

    expect(fake.close()).toEqual({ prevented: true });
    expect(fake.hide).toHaveBeenCalledOnce();
    expect(hidden).toHaveBeenCalledOnce();
  });

  it("lets the window close when the decision is to close", () => {
    const fake = fakeWindow();
    const hidden = vi.fn<() => void>();
    hideOnClose(fake.window, { decide: () => "close", hidden });

    expect(fake.close()).toEqual({ prevented: false });
    expect(fake.hide).not.toHaveBeenCalled();
    expect(hidden).not.toHaveBeenCalled();
  });
});

describe("showAgain", () => {
  it("shows and focuses a hidden window", () => {
    const fake = fakeWindow();

    showAgain(fake.window);

    expect(fake.show).toHaveBeenCalledOnce();
    expect(fake.focus).toHaveBeenCalledOnce();
    expect(fake.restore).not.toHaveBeenCalled();
  });

  it("restores a minimized window first", () => {
    const fake = fakeWindow(true);

    showAgain(fake.window);

    expect(fake.restore).toHaveBeenCalledOnce();
  });
});
