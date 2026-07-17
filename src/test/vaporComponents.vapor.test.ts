import { readdirSync, readFileSync } from "node:fs";
import { relative, resolve, sep } from "node:path";

import { describe, expect, it } from "vitest";
import type { Component } from "vue";

import CalendarApp from "../../apps/calendar/src/App.vue";
import CalendarMonthView from "../../apps/calendar/src/components/CalendarMonthView.vue";
import CalendarScrollableMonthView from "../../apps/calendar/src/components/CalendarScrollableMonthView.vue";
import CalendarSettingsPanel from "../../apps/calendar/src/components/CalendarSettingsPanel.vue";
import CalendarToolbar from "../../apps/calendar/src/components/CalendarToolbar.vue";
import LunarDateWidget from "../../apps/calendar/src/widgets/LunarDateWidget.vue";
import ClockApp from "../../apps/clock/src/App.vue";
import DesktopBigClockWidget from "../../apps/clock/src/widgets/DesktopBigClockWidget.vue";
import MenubarClockWidget from "../../apps/clock/src/widgets/MenubarClockWidget.vue";
import MobileBigClockWidget from "../../apps/clock/src/widgets/MobileBigClockWidget.vue";
import NotesApp from "../../apps/notes/src/App.vue";
import DesktopStickyNote from "../../apps/notes/src/DesktopStickyNote.vue";
import NotesDesktopLayer from "../../apps/notes/src/NotesDesktopLayer.vue";
import PdfFilePreview from "../../apps/pdf-viewer/src/components/PdfFilePreview.vue";
import PreviewHostError from "../components/kit/PreviewHostError.vue";
import PreviewHostLoading from "../components/kit/PreviewHostLoading.vue";
import Button from "../components/ui/Button.vue";
import Card from "../components/ui/Card.vue";
import ContextMenu from "../components/ui/ContextMenu.vue";
import Dialog from "../components/ui/Dialog.vue";
import DialogActions from "../components/ui/DialogActions.vue";
import DropdownMenu from "../components/ui/DropdownMenu.vue";
import HoverCard from "../components/ui/HoverCard.vue";
import MenuItem from "../components/ui/MenuItem.vue";
import MenuItemIndicator from "../components/ui/MenuItemIndicator.vue";
import MenuLabel from "../components/ui/MenuLabel.vue";
import MenuRadioGroup from "../components/ui/MenuRadioGroup.vue";
import MenuRadioItem from "../components/ui/MenuRadioItem.vue";
import MenuSeparator from "../components/ui/MenuSeparator.vue";
import RadioGroup from "../components/ui/RadioGroup.vue";
import RadioGroupItem from "../components/ui/RadioGroupItem.vue";
import Slider from "../components/ui/Slider.vue";
import Switch from "../components/ui/Switch.vue";
import ToastHost from "../components/ui/ToastHost.vue";
import Tooltip from "../components/ui/Tooltip.vue";
import ImageIcon from "../icons/ImageIcon.vue";
import SvgIcon from "../icons/SvgIcon.vue";
import { assertVaporComponents } from "./mountVapor";

const REPOSITORY_ROOT = process.cwd();
const VAPOR_SCRIPT_RE = /<script\b[^>]*\bvapor\b[^>]*>/u;
const SKIPPED_DIRECTORIES = new Set(["dist", "node_modules"]);

const VAPOR_COMPONENTS = {
  "apps/calendar/src/App.vue": CalendarApp,
  "apps/calendar/src/components/CalendarMonthView.vue": CalendarMonthView,
  "apps/calendar/src/components/CalendarScrollableMonthView.vue": CalendarScrollableMonthView,
  "apps/calendar/src/components/CalendarSettingsPanel.vue": CalendarSettingsPanel,
  "apps/calendar/src/components/CalendarToolbar.vue": CalendarToolbar,
  "apps/calendar/src/widgets/LunarDateWidget.vue": LunarDateWidget,
  "apps/clock/src/App.vue": ClockApp,
  "apps/clock/src/widgets/DesktopBigClockWidget.vue": DesktopBigClockWidget,
  "apps/clock/src/widgets/MenubarClockWidget.vue": MenubarClockWidget,
  "apps/clock/src/widgets/MobileBigClockWidget.vue": MobileBigClockWidget,
  "apps/notes/src/App.vue": NotesApp,
  "apps/notes/src/DesktopStickyNote.vue": DesktopStickyNote,
  "apps/notes/src/NotesDesktopLayer.vue": NotesDesktopLayer,
  "apps/pdf-viewer/src/components/PdfFilePreview.vue": PdfFilePreview,
  "src/components/kit/PreviewHostError.vue": PreviewHostError,
  "src/components/kit/PreviewHostLoading.vue": PreviewHostLoading,
  "src/components/ui/Button.vue": Button,
  "src/components/ui/Card.vue": Card,
  "src/components/ui/ContextMenu.vue": ContextMenu,
  "src/components/ui/Dialog.vue": Dialog,
  "src/components/ui/DialogActions.vue": DialogActions,
  "src/components/ui/DropdownMenu.vue": DropdownMenu,
  "src/components/ui/HoverCard.vue": HoverCard,
  "src/components/ui/MenuItem.vue": MenuItem,
  "src/components/ui/MenuItemIndicator.vue": MenuItemIndicator,
  "src/components/ui/MenuLabel.vue": MenuLabel,
  "src/components/ui/MenuRadioGroup.vue": MenuRadioGroup,
  "src/components/ui/MenuRadioItem.vue": MenuRadioItem,
  "src/components/ui/MenuSeparator.vue": MenuSeparator,
  "src/components/ui/RadioGroup.vue": RadioGroup,
  "src/components/ui/RadioGroupItem.vue": RadioGroupItem,
  "src/components/ui/Slider.vue": Slider,
  "src/components/ui/Switch.vue": Switch,
  "src/components/ui/ToastHost.vue": ToastHost,
  "src/components/ui/Tooltip.vue": Tooltip,
  "src/icons/ImageIcon.vue": ImageIcon,
  "src/icons/SvgIcon.vue": SvgIcon,
} satisfies Readonly<Record<string, Component>>;

function collectVueFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory() && !SKIPPED_DIRECTORIES.has(entry.name)) {
      return collectVueFiles(path);
    }
    return entry.isFile() && entry.name.endsWith(".vue") ? [path] : [];
  });
}

function authoredVaporComponents(): string[] {
  return [resolve(REPOSITORY_ROOT, "src"), resolve(REPOSITORY_ROOT, "apps")]
    .flatMap(collectVueFiles)
    .filter((path) => VAPOR_SCRIPT_RE.test(readFileSync(path, "utf8")))
    .map((path) => relative(REPOSITORY_ROOT, path).split(sep).join("/"))
    .sort();
}

describe("Vapor component registry", () => {
  it("tracks every SFC authored in Vapor mode", () => {
    expect(Object.keys(VAPOR_COMPONENTS).sort()).toEqual(authoredVaporComponents());
  });

  it("compiles every registered SFC into a Vapor component", () => {
    assertVaporComponents(VAPOR_COMPONENTS);
  });
});
