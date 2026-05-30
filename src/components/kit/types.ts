import type { Component } from "vue";

export interface SegmentedControlOption {
  readonly value: string;
  readonly label: string;
  readonly ariaLabel?: string;
  readonly disabled?: boolean;
  readonly icon?: Component;
}

export interface SelectOption {
  readonly value: string;
  readonly label: string;
  readonly disabled?: boolean;
}

export interface TabListOption {
  readonly value: string;
  readonly label: string;
  readonly ariaLabel?: string;
  readonly disabled?: boolean;
  readonly icon?: Component;
  readonly id?: string;
  readonly panelId?: string;
}
