import type { VaporComponent } from "vue";

export interface SegmentedControlOption {
  readonly value: string;
  readonly label: string;
  readonly ariaLabel?: string;
  readonly disabled?: boolean;
  readonly icon?: VaporComponent;
}

export interface SelectOption {
  readonly value: string;
  readonly label: string;
  readonly disabled?: boolean;
}
