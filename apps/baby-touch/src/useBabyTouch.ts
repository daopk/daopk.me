import { useBabyTouchParentHold } from "./useBabyTouchParentHold";
import { useBabyTouchSettings } from "./useBabyTouchSettings";
import { useBabyTouchSound } from "./useBabyTouchSound";

interface BabyTouchOptions {
  readonly onParentHoldComplete?: () => void;
  readonly storage?: Storage;
  readonly setTimeout?: typeof window.setTimeout;
  readonly clearTimeout?: typeof window.clearTimeout;
}

export function useBabyTouch(options: BabyTouchOptions = {}) {
  const settingsState = useBabyTouchSettings({ storage: options.storage });
  const sound = useBabyTouchSound({ settings: settingsState.settings });

  const parentHold = useBabyTouchParentHold({
    clearTimeout: options.clearTimeout,
    onComplete: options.onParentHoldComplete ?? (() => undefined),
    setTimeout: options.setTimeout,
  });

  return {
    handleParentCornerDown: parentHold.handleParentCornerDown,
    handleParentCornerUp: parentHold.handleParentCornerUp,
    hasAudioContext: sound.hasAudioContext,
    playTapTone: sound.playTapTone,
    resetSettings: settingsState.resetSettings,
    settings: settingsState.settings,
    settingsLabel: settingsState.settingsLabel,
    updateSettings: settingsState.updateSettings,
  };
}
