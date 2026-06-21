<script setup lang="ts">
import { computed, ref } from "vue";

import {
  ActionRow,
  AppFrame,
  AppToolbar,
  Badge,
  Checkbox,
  ChoiceCard,
  ChoiceGrid,
  DataTable,
  EmptyState,
  FormField,
  GroupLabel,
  IconButton,
  ListButton,
  Panel,
  Progress,
  ScrollArea,
  SectionHeader,
  SegmentedControl,
  Select,
  Separator,
  Spinner,
  StatusBanner,
  TabList,
  Textarea,
  TextInput,
  ToolbarTitle,
  useAppChrome,
  type SegmentedControlOption,
  type SelectOption,
  type TabListOption,
} from "~/components/kit";
import {
  Button,
  Card,
  ContextMenu,
  ContextMenuItem,
  ContextMenuSeparator,
  Dialog,
  DialogActions,
  DropdownMenu,
  DropdownMenuItem,
  DropdownMenuSeparator,
  RadioGroup,
  RadioGroupItem,
  Slider,
  Switch,
  Tooltip,
  useToast,
} from "~/components/ui";
import {
  Download,
  Folder,
  Info,
  LayoutGrid,
  Palette,
  Plus,
  RefreshCw,
  Search,
  Settings,
  Sparkles,
  Trash2,
} from "~/icons/lucide";

// Mirrors the title into the mobile header; no-ops on the desktop window.
useAppChrome({ title: () => "Kit Gallery" });

const checkboxValue = ref(true);
const switchValue = ref(true);
const autoUpdateValue = ref(false);
const sliderValue = ref(40);
const textValue = ref("Editable value");
const textareaValue = ref("Multi-line\ncontent area");
const selectValue = ref("md");
const segmentValue = ref("grid");
const tabValue = ref("overview");
const choiceValue = ref("comfortable");
const radioValue = ref("comfortable");
const requiredValue = ref("");
const progressValue = ref(60);
const dialogOpen = ref(false);

const toast = useToast();

const requiredError = computed(() =>
  requiredValue.value.trim().length === 0 ? "This field is required." : undefined,
);

function bumpProgress(): void {
  progressValue.value = progressValue.value >= 100 ? 0 : Math.min(100, progressValue.value + 20);
}

const selectOptions: readonly SelectOption[] = [
  { value: "sm", label: "Small" },
  { value: "md", label: "Medium" },
  { value: "lg", label: "Large" },
  { value: "xl", label: "Extra large (disabled)", disabled: true },
];

const segmentOptions: readonly SegmentedControlOption[] = [
  { value: "list", label: "List", icon: LayoutGrid },
  { value: "grid", label: "Grid", icon: LayoutGrid },
  { value: "columns", label: "Columns", disabled: true },
];

const tabOptions: readonly TabListOption[] = [
  { value: "overview", label: "Overview" },
  { value: "specs", label: "Specs" },
  { value: "activity", label: "Activity" },
];

const densityChoices = [
  { id: "compact", title: "Compact", description: "Dense rows for power users.", icon: LayoutGrid },
  {
    id: "comfortable",
    title: "Comfortable",
    description: "Balanced spacing (default).",
    icon: Sparkles,
  },
  { id: "spacious", title: "Spacious", description: "Roomy, touch-friendly.", icon: Folder },
] as const;
</script>

<template>
  <AppFrame class="kit-gallery" layout="flex-column" aria-label="Kit Gallery">
    <AppToolbar class="kit-gallery__toolbar" density="comfortable">
      <ToolbarTitle title="Kit Gallery" subtitle="components/kit + components/ui" />
      <template #end>
        <Badge tone="accent">DEV</Badge>
      </template>
    </AppToolbar>

    <ScrollArea class="kit-gallery__body" safe-area>
      <StatusBanner tone="info">
        Every kit + ui primitive on the token system. Toggle light/dark in Settings &rarr;
        Appearance, and open with <code>?shell=mobile</code> to preview touch density and safe
        areas.
      </StatusBanner>

      <Panel as="section" class="kit-gallery__section" variant="subtle" padding="lg">
        <GroupLabel as="h2">Section headers (kit)</GroupLabel>
        <SectionHeader
          size="page"
          :icon="Palette"
          title="Page title"
          subtitle="size=page, with an icon slot"
        />
        <Separator />
        <SectionHeader title="Section title" subtitle="Default section scale">
          <template #actions>
            <Button size="sm" variant="secondary" :icon-start="Plus">New</Button>
          </template>
        </SectionHeader>
      </Panel>

      <Panel as="section" class="kit-gallery__section" variant="subtle" padding="lg">
        <GroupLabel as="h2">Button (ui)</GroupLabel>
        <div class="gallery__row">
          <Button variant="primary">Primary</Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="ghost">Ghost</Button>
          <Button variant="danger" :icon-start="Trash2">Danger</Button>
        </div>
        <div class="gallery__row">
          <Button size="sm" variant="secondary" :icon-start="RefreshCw">Small</Button>
          <Button size="md" variant="secondary" :icon-end="Download">Medium</Button>
          <Button variant="primary" loading>Loading</Button>
          <Button variant="secondary" disabled>Disabled</Button>
        </div>
      </Panel>

      <Panel as="section" class="kit-gallery__section" variant="subtle" padding="lg">
        <GroupLabel as="h2">IconButton (kit)</GroupLabel>
        <div class="gallery__row">
          <IconButton :icon="Search" label="Search" variant="ghost" />
          <IconButton :icon="Settings" label="Settings" variant="subtle" />
          <IconButton :icon="RefreshCw" label="Refresh" size="sm" />
          <IconButton :icon="Trash2" label="Delete" active />
          <IconButton :icon="Plus" label="Add" disabled />
        </div>
      </Panel>

      <Panel as="section" class="kit-gallery__section" variant="subtle" padding="lg">
        <GroupLabel as="h2">Badge + Spinner + Separator (kit)</GroupLabel>
        <div class="gallery__row">
          <Badge tone="neutral">Neutral</Badge>
          <Badge tone="accent">Accent</Badge>
          <Badge tone="success">Success</Badge>
          <Badge tone="danger">Danger</Badge>
          <Badge tone="accent" size="md">Medium</Badge>
        </div>
        <div class="gallery__divider-demo">
          <Spinner size="sm" />
          <Separator orientation="vertical" />
          <Spinner size="md" />
          <Separator orientation="vertical" />
          <Spinner size="lg" />
        </div>
      </Panel>

      <Panel as="section" class="kit-gallery__section" variant="subtle" padding="lg">
        <GroupLabel as="h2">StatusBanner (kit)</GroupLabel>
        <div class="gallery__stack">
          <StatusBanner tone="info">Informational message.</StatusBanner>
          <StatusBanner tone="success">Saved successfully.</StatusBanner>
          <StatusBanner tone="warning">Heads up — review before continuing.</StatusBanner>
          <StatusBanner tone="error">Something went wrong.</StatusBanner>
        </div>
      </Panel>

      <Panel as="section" class="kit-gallery__section" variant="subtle" padding="lg">
        <GroupLabel as="h2">Inputs (kit)</GroupLabel>
        <div class="gallery__field-grid">
          <FormField label="Text input" hint="A standard text control">
            <TextInput v-model="textValue" />
          </FormField>
          <FormField label="Invalid" error="This value is required">
            <TextInput v-model="textValue" invalid />
          </FormField>
          <FormField label="Select">
            <Select v-model="selectValue" :options="selectOptions" />
          </FormField>
          <FormField label="Disabled">
            <TextInput model-value="Read only" disabled />
          </FormField>
          <FormField label="Required" :error="requiredError" required>
            <TextInput v-model="requiredValue" placeholder="Type to clear the error" />
          </FormField>
        </div>
        <FormField label="Textarea">
          <Textarea v-model="textareaValue" :rows="3" />
        </FormField>
        <div class="gallery__row">
          <Checkbox v-model="checkboxValue">Enable notifications</Checkbox>
          <Checkbox :model-value="false" disabled>Disabled option</Checkbox>
        </div>
      </Panel>

      <Panel as="section" class="kit-gallery__section" variant="subtle" padding="lg">
        <GroupLabel as="h2">Switch + Slider (ui)</GroupLabel>
        <div class="gallery__row">
          <Switch
            :model-value="switchValue"
            aria-label="Demo switch"
            @update:model-value="(v) => (switchValue = v)"
          />
          <span class="gallery__caption">{{ switchValue ? "On" : "Off" }}</span>
          <Separator orientation="vertical" class="gallery__inline-divider" />
          <Switch :model-value="false" aria-label="Disabled switch" disabled />
          <span class="gallery__caption">Disabled</span>
        </div>
        <Slider
          :model-value="sliderValue"
          :min="0"
          :max="100"
          aria-label="Sample slider"
          @update:model-value="(v) => (sliderValue = v)"
        />
        <span class="gallery__caption">Value: {{ sliderValue }}</span>
      </Panel>

      <Panel as="section" class="kit-gallery__section" variant="subtle" padding="lg">
        <GroupLabel as="h2">SegmentedControl + TabList (kit)</GroupLabel>
        <SegmentedControl v-model="segmentValue" :options="segmentOptions" label="View mode" />
        <TabList v-model="tabValue" :tabs="tabOptions" label="Sample tabs" />
        <p class="gallery__caption">Segment: {{ segmentValue }} · Tab: {{ tabValue }}</p>
      </Panel>

      <Panel as="section" class="kit-gallery__section" variant="subtle" padding="lg">
        <GroupLabel as="h2">ChoiceGrid + ChoiceCard (kit)</GroupLabel>
        <ChoiceGrid label="Density">
          <ChoiceCard
            v-for="choice in densityChoices"
            :key="choice.id"
            :icon="choice.icon"
            :title="choice.title"
            :description="choice.description"
            :selected="choice.id === choiceValue"
            @select="choiceValue = choice.id"
          />
        </ChoiceGrid>
      </Panel>

      <Panel as="section" class="kit-gallery__section" variant="subtle" padding="lg">
        <GroupLabel as="h2">RadioGroup (ui)</GroupLabel>
        <RadioGroup
          :model-value="radioValue"
          label="Density"
          orientation="horizontal"
          @update:model-value="(v) => (radioValue = v)"
        >
          <RadioGroupItem value="compact" label="Compact" />
          <RadioGroupItem value="comfortable" label="Comfortable" />
          <RadioGroupItem value="spacious" label="Spacious" />
          <RadioGroupItem value="locked" label="Locked" disabled />
        </RadioGroup>
        <p class="gallery__caption">Selected: {{ radioValue }}</p>
      </Panel>

      <Panel as="section" class="kit-gallery__section" variant="subtle" padding="lg">
        <GroupLabel as="h2">Tooltip (ui)</GroupLabel>
        <div class="gallery__row">
          <Tooltip label="Refresh the current view">
            <Button size="sm" variant="secondary" :icon-start="RefreshCw">Hover me</Button>
          </Tooltip>
          <Tooltip label="Open settings" side="right">
            <IconButton :icon="Settings" label="Settings" variant="subtle" />
          </Tooltip>
        </div>
      </Panel>

      <Panel as="section" class="kit-gallery__section" variant="subtle" padding="lg">
        <GroupLabel as="h2">Toast (ui)</GroupLabel>
        <div class="gallery__row">
          <Button
            size="sm"
            variant="secondary"
            @click="toast.info({ title: 'Heads up', description: 'An informational toast.' })"
          >
            Info
          </Button>
          <Button
            size="sm"
            variant="secondary"
            @click="toast.success({ title: 'Saved', description: 'Your changes were saved.' })"
          >
            Success
          </Button>
          <Button
            size="sm"
            variant="secondary"
            @click="toast.warning({ title: 'Careful', description: 'Review before continuing.' })"
          >
            Warning
          </Button>
          <Button
            size="sm"
            variant="danger"
            @click="toast.error({ title: 'Failed', description: 'Something went wrong.' })"
          >
            Error
          </Button>
        </div>
      </Panel>

      <Panel as="section" class="kit-gallery__section" variant="subtle" padding="lg">
        <GroupLabel as="h2">Progress (kit)</GroupLabel>
        <Progress :value="progressValue" label="Determinate progress" />
        <Progress :value="null" label="Indeterminate progress" />
        <div class="gallery__row">
          <Button size="sm" variant="secondary" @click="bumpProgress">Advance</Button>
          <span class="gallery__caption">Value: {{ progressValue }}%</span>
        </div>
      </Panel>

      <Panel as="section" class="kit-gallery__section" variant="subtle" padding="lg">
        <GroupLabel as="h2">ListButton + ActionRow (kit)</GroupLabel>
        <Panel class="gallery__list" variant="default" padding="none">
          <ListButton :icon="Folder" title="Documents" meta="24 items" />
          <ListButton :icon="Settings" title="Preferences" active />
          <ListButton :icon="Download" title="Downloads" meta="3 items" />
        </Panel>
        <Panel variant="default" padding="md">
          <ActionRow
            title="Auto-hide dock"
            description="Reveal it by moving the pointer to the edge."
          >
            <Switch
              :model-value="switchValue"
              aria-label="Auto-hide dock"
              @update:model-value="(v) => (switchValue = v)"
            />
          </ActionRow>
          <ActionRow title="Automatic updates" description="Install updates in the background.">
            <Switch
              :model-value="autoUpdateValue"
              aria-label="Automatic updates"
              @update:model-value="(v) => (autoUpdateValue = v)"
            />
          </ActionRow>
        </Panel>
      </Panel>

      <Panel as="section" class="kit-gallery__section" variant="subtle" padding="lg">
        <GroupLabel as="h2">Panel + Card (kit / ui)</GroupLabel>
        <div class="gallery__field-grid">
          <Panel variant="default" padding="md">Default panel</Panel>
          <Panel variant="subtle" padding="md">Subtle panel</Panel>
          <Panel variant="elevated" padding="md">Elevated panel</Panel>
          <Panel variant="plain" padding="md">Plain panel</Panel>
        </div>
        <div class="gallery__field-grid">
          <Card>Default card</Card>
          <Card variant="subtle">Subtle card</Card>
          <Card interactive>Interactive card</Card>
          <Card interactive selected>Selected card</Card>
        </div>
      </Panel>

      <Panel as="section" class="kit-gallery__section" variant="subtle" padding="lg">
        <GroupLabel as="h2">EmptyState + DataTable (kit)</GroupLabel>
        <EmptyState
          :icon="Info"
          title="Nothing here yet"
          description="Empty states center an icon, title and supporting copy."
        />
        <DataTable label="Sample files" variant="lined">
          <div role="row">
            <span role="columnheader">Name</span>
            <span role="columnheader">Type</span>
            <span role="columnheader">Size</span>
          </div>
          <div role="row">
            <span role="cell">readme.md</span>
            <span role="cell">Markdown</span>
            <span role="cell">2 KB</span>
          </div>
          <div role="row">
            <span role="cell">report.pdf</span>
            <span role="cell">PDF</span>
            <span role="cell">512 KB</span>
          </div>
        </DataTable>
      </Panel>

      <Panel as="section" class="kit-gallery__section" variant="subtle" padding="lg">
        <GroupLabel as="h2">Overlays (ui)</GroupLabel>
        <div class="gallery__row">
          <Button variant="secondary" @click="dialogOpen = true">Open dialog</Button>
          <DropdownMenu>
            <template #trigger>
              <Button variant="secondary">Dropdown menu</Button>
            </template>
            <template #items>
              <DropdownMenuItem>Profile</DropdownMenuItem>
              <DropdownMenuItem>Preferences</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem>Sign out</DropdownMenuItem>
            </template>
          </DropdownMenu>
          <ContextMenu :modal="false">
            <template #trigger>
              <div class="gallery__context-target">Right-click here</div>
            </template>
            <template #items>
              <ContextMenuItem>Open</ContextMenuItem>
              <ContextMenuItem>Rename</ContextMenuItem>
              <ContextMenuSeparator />
              <ContextMenuItem>Delete</ContextMenuItem>
            </template>
          </ContextMenu>
        </div>
      </Panel>
    </ScrollArea>

    <Dialog
      v-model:open="dialogOpen"
      title="Standardized dialog"
      description="Modal with a DialogActions footer that stacks on narrow shells."
    >
      <p class="gallery__dialog-copy">Compose dialog bodies from kit + ui primitives.</p>
      <DialogActions>
        <Button size="sm" @click="dialogOpen = false">Cancel</Button>
        <Button size="sm" variant="primary" @click="dialogOpen = false">Confirm</Button>
      </DialogActions>
    </Dialog>
  </AppFrame>
</template>

<style scoped lang="scss">
.kit-gallery__toolbar {
  border-block-end: 1px solid var(--color-border);
}

.kit-gallery__body {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  gap: var(--space-lg);
  padding: var(--space-lg);
}

.kit-gallery__section {
  display: flex;
  flex-direction: column;
  gap: var(--space-md);
}

.gallery__row {
  align-items: center;
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-md);
}

.gallery__stack {
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
}

.gallery__field-grid {
  display: grid;
  gap: var(--space-md);
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
}

.gallery__divider-demo {
  align-items: center;
  block-size: 40px;
  display: flex;
  gap: var(--space-md);
}

.gallery__inline-divider {
  block-size: 20px;
}

.gallery__list {
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.gallery__caption {
  color: var(--color-fg-muted);
  font-size: var(--font-size-sm);
}

.gallery__context-target {
  align-items: center;
  background: var(--color-bg-subtle);
  border: 1px dashed var(--color-border);
  border-radius: var(--radius-md);
  color: var(--color-fg-muted);
  display: flex;
  font-size: var(--font-size-sm);
  justify-content: center;
  min-block-size: var(--control-height-md);
  padding: var(--space-sm) var(--space-md);
}

.gallery__dialog-copy {
  color: var(--color-fg-muted);
  margin: 0;
}
</style>
