<script setup vapor lang="ts">
import { computed, ref } from "vue";

import {
  ActionRow,
  AppFrame,
  AppToolbar,
  DataTable,
  EmptyState,
  GroupLabel,
  ListButton,
  Panel,
  ScrollArea,
  SectionHeader,
  Separator,
  Spinner,
  ToolbarTitle,
  useAppChrome,
} from "~/components/kit";
import {
  Alert,
  Badge,
  Button,
  Card,
  Checkbox,
  ContextMenu,
  ContextMenuItem,
  ContextMenuSeparator,
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuItem,
  DropdownMenuItemIndicator,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  Field,
  IconButton,
  Input,
  Modal,
  Progress,
  Radio,
  RadioGroup,
  Select,
  Slider,
  Switch,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Textarea,
  Tooltip,
  useToast,
  type SelectOption,
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
const selectValue = ref<string | number | null>("md");
const segmentValue = ref<string | number | null>("grid");
const tabValue = ref("overview");
const choiceValue = ref<string | number | null>("comfortable");
const radioValue = ref<string | number | null>("comfortable");
const requiredValue = ref("");
const progressValue = ref(60);
const dialogOpen = ref(false);
const menuNotifications = ref(true);

const toast = useToast();

const requiredError = computed(() =>
  requiredValue.value.trim().length === 0 ? "This field is required." : undefined,
);

function bumpProgress(): void {
  progressValue.value = progressValue.value >= 100 ? 0 : Math.min(100, progressValue.value + 20);
}

const selectOptions: SelectOption[] = [
  { value: "sm", label: "Small" },
  { value: "md", label: "Medium" },
  { value: "lg", label: "Large" },
  { value: "xl", label: "Extra large (disabled)", disabled: true },
];

const segmentOptions = [
  { value: "list", label: "List", icon: LayoutGrid },
  { value: "grid", label: "Grid", icon: LayoutGrid },
  { value: "columns", label: "Columns", disabled: true },
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

const choiceRadioClassNames = {
  root: "gallery__choice",
  label: "gallery__choice-label",
} as const;
</script>

<template>
  <AppFrame class="kit-gallery" layout="flex-column" aria-label="Kit Gallery">
    <AppToolbar class="kit-gallery__toolbar" density="comfortable">
      <ToolbarTitle title="Kit Gallery" subtitle="components/kit + components/ui" />
      <template #end>
        <Badge color="blue" variant="subtle">DEV</Badge>
      </template>
    </AppToolbar>

    <ScrollArea class="kit-gallery__body" safe-area>
      <Alert color="blue" variant="surface" role="status">
        Every kit + ui primitive on the token system. Toggle light/dark in Settings &rarr;
        Appearance, and open with <code>?shell=mobile</code> to preview touch density and safe
        areas.
      </Alert>

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
            <Button size="sm" variant="surface">
              <template #left><Plus aria-hidden="true" /></template>
              New
            </Button>
          </template>
        </SectionHeader>
      </Panel>

      <Panel as="section" class="kit-gallery__section" variant="subtle" padding="lg">
        <GroupLabel as="h2">Button (ui)</GroupLabel>
        <div class="gallery__row">
          <Button variant="solid" color="blue">Primary</Button>
          <Button variant="surface">Secondary</Button>
          <Button variant="ghost">Ghost</Button>
          <Button variant="solid" color="red">
            <template #left><Trash2 aria-hidden="true" /></template>
            Danger
          </Button>
        </div>
        <div class="gallery__row">
          <Button size="sm" variant="surface">
            <template #left><RefreshCw aria-hidden="true" /></template>
            Small
          </Button>
          <Button size="md" variant="surface">
            Medium
            <template #right><Download aria-hidden="true" /></template>
          </Button>
          <Button variant="solid" color="blue" loading>Loading</Button>
          <Button variant="surface" disabled>Disabled</Button>
        </div>
      </Panel>

      <Panel as="section" class="kit-gallery__section" variant="subtle" padding="lg">
        <GroupLabel as="h2">IconButton (Ropav)</GroupLabel>
        <div class="gallery__row">
          <IconButton ariaLabel="Search" variant="ghost"><Search /></IconButton>
          <IconButton ariaLabel="Settings" variant="subtle"><Settings /></IconButton>
          <IconButton ariaLabel="Refresh" size="sm"><RefreshCw /></IconButton>
          <IconButton ariaLabel="Delete" variant="subtle" color="blue" aria-pressed="true">
            <Trash2 />
          </IconButton>
          <IconButton ariaLabel="Add" disabled><Plus /></IconButton>
        </div>
      </Panel>

      <Panel as="section" class="kit-gallery__section" variant="subtle" padding="lg">
        <GroupLabel as="h2">Badge (Ropav) + Spinner + Separator (kit)</GroupLabel>
        <div class="gallery__row">
          <Badge color="gray" variant="outline">Neutral</Badge>
          <Badge color="blue" variant="subtle">Accent</Badge>
          <Badge color="green" variant="subtle">Success</Badge>
          <Badge color="red" variant="subtle">Danger</Badge>
          <Badge color="blue" variant="subtle" size="md">Medium</Badge>
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
        <GroupLabel as="h2">Alert (Ropav)</GroupLabel>
        <div class="gallery__stack">
          <Alert color="blue" variant="surface" role="status">Informational message.</Alert>
          <Alert color="green" variant="surface" role="status">Saved successfully.</Alert>
          <Alert color="yellow" variant="surface" role="status">
            Heads up — review before continuing.
          </Alert>
          <Alert color="red" variant="surface" role="alert">Something went wrong.</Alert>
        </div>
      </Panel>

      <Panel as="section" class="kit-gallery__section" variant="subtle" padding="lg">
        <GroupLabel as="h2">Field + inputs (Ropav)</GroupLabel>
        <div class="gallery__field-grid">
          <Field v-slot="{ controlProps }" label="Text input" description="A standard text control">
            <Input v-model="textValue" v-bind="controlProps" />
          </Field>
          <Field
            v-slot="{ controlProps }"
            label="Invalid"
            description="This value is required"
            invalid
          >
            <Input v-model="textValue" v-bind="controlProps" />
          </Field>
          <Field v-slot="{ controlProps }" label="Select">
            <Select v-model="selectValue" v-bind="controlProps" :options="selectOptions" />
          </Field>
          <Field v-slot="{ controlProps }" label="Disabled" disabled>
            <Input model-value="Read only" v-bind="controlProps" />
          </Field>
          <Field
            v-slot="{ controlProps }"
            label="Required"
            :description="requiredError"
            :invalid="Boolean(requiredError)"
            required
          >
            <Input
              v-model="requiredValue"
              v-bind="controlProps"
              placeholder="Type to clear the error"
            />
          </Field>
        </div>
        <Field v-slot="{ controlProps }" label="Textarea">
          <Textarea v-model="textareaValue" v-bind="controlProps" :rows="3" />
        </Field>
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
            ariaLabel="Demo switch"
            @update:model-value="(v) => (switchValue = v)"
          />
          <span class="gallery__caption">{{ switchValue ? "On" : "Off" }}</span>
          <Separator orientation="vertical" class="gallery__inline-divider" />
          <Switch :model-value="false" ariaLabel="Disabled switch" disabled />
          <span class="gallery__caption">Disabled</span>
        </div>
        <Slider
          :model-value="sliderValue"
          :min="0"
          :max="100"
          ariaLabel="Sample slider"
          @update:model-value="(v) => (sliderValue = v)"
        />
        <span class="gallery__caption">Value: {{ sliderValue }}</span>
      </Panel>

      <Panel as="section" class="kit-gallery__section" variant="subtle" padding="lg">
        <GroupLabel as="h2">RadioGroup + Tabs (Ropav)</GroupLabel>
        <RadioGroup v-model="segmentValue" orientation="horizontal" ariaLabel="View mode">
          <Radio
            v-for="option in segmentOptions"
            :key="option.value"
            :value="option.value"
            :disabled="option.disabled"
          >
            <component v-if="option.icon" :is="option.icon" aria-hidden="true" />
            {{ option.label }}
          </Radio>
        </RadioGroup>
        <Tabs v-model="tabValue" ariaLabel="Sample tabs">
          <TabsList>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="specs">Specs</TabsTrigger>
            <TabsTrigger value="activity">Activity</TabsTrigger>
          </TabsList>
          <TabsContent value="overview">Overview panel</TabsContent>
          <TabsContent value="specs">Specs panel</TabsContent>
          <TabsContent value="activity">Activity panel</TabsContent>
        </Tabs>
        <p class="gallery__caption">Segment: {{ segmentValue }} · Tab: {{ tabValue }}</p>
      </Panel>

      <Panel as="section" class="kit-gallery__section" variant="subtle" padding="lg">
        <GroupLabel as="h2">Styled Radio cards (Ropav)</GroupLabel>
        <RadioGroup v-model="choiceValue" class="gallery__choice-grid" ariaLabel="Density">
          <Radio
            v-for="choice in densityChoices"
            :key="choice.id"
            :value="choice.id"
            :class-names="choiceRadioClassNames"
          >
            <component :is="choice.icon" class="gallery__choice-icon" aria-hidden="true" />
            <span class="gallery__choice-copy">
              <strong>{{ choice.title }}</strong>
              <span>{{ choice.description }}</span>
            </span>
          </Radio>
        </RadioGroup>
      </Panel>

      <Panel as="section" class="kit-gallery__section" variant="subtle" padding="lg">
        <GroupLabel as="h2">RadioGroup (ui)</GroupLabel>
        <RadioGroup :model-value="radioValue" ariaLabel="Density" orientation="horizontal">
          <Radio value="compact">Compact</Radio>
          <Radio value="comfortable">Comfortable</Radio>
          <Radio value="spacious">Spacious</Radio>
          <Radio value="locked" disabled>Locked</Radio>
        </RadioGroup>
        <p class="gallery__caption">Selected: {{ radioValue }}</p>
      </Panel>

      <Panel as="section" class="kit-gallery__section" variant="subtle" padding="lg">
        <GroupLabel as="h2">Tooltip (ui)</GroupLabel>
        <div class="gallery__row">
          <Tooltip content="Refresh the current view">
            <template #default="{ triggerProps }">
              <Button v-bind="triggerProps" size="sm" variant="surface">
                <template #left><RefreshCw aria-hidden="true" /></template>
                Hover me
              </Button>
            </template>
          </Tooltip>
          <Tooltip content="Open settings" placement="right">
            <template #default="{ triggerProps }">
              <IconButton v-bind="triggerProps" ariaLabel="Settings" variant="subtle">
                <Settings />
              </IconButton>
            </template>
          </Tooltip>
        </div>
      </Panel>

      <Panel as="section" class="kit-gallery__section" variant="subtle" padding="lg">
        <GroupLabel as="h2">Toast (ui)</GroupLabel>
        <div class="gallery__row">
          <Button
            size="sm"
            variant="surface"
            @click="toast.info({ title: 'Heads up', description: 'An informational toast.' })"
          >
            Info
          </Button>
          <Button
            size="sm"
            variant="surface"
            @click="toast.success({ title: 'Saved', description: 'Your changes were saved.' })"
          >
            Success
          </Button>
          <Button
            size="sm"
            variant="surface"
            @click="toast.warning({ title: 'Careful', description: 'Review before continuing.' })"
          >
            Warning
          </Button>
          <Button
            size="sm"
            variant="surface"
            color="red"
            @click="toast.error({ title: 'Failed', description: 'Something went wrong.' })"
          >
            Error
          </Button>
        </div>
      </Panel>

      <Panel as="section" class="kit-gallery__section" variant="subtle" padding="lg">
        <GroupLabel as="h2">Progress (Ropav)</GroupLabel>
        <Progress :value="progressValue" ariaLabel="Determinate progress" />
        <Progress indeterminate ariaLabel="Indeterminate progress" />
        <div class="gallery__row">
          <Button size="sm" variant="surface" @click="bumpProgress">Advance</Button>
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
              ariaLabel="Auto-hide dock"
              @update:model-value="(v) => (switchValue = v)"
            />
          </ActionRow>
          <ActionRow title="Automatic updates" description="Install updates in the background.">
            <Switch
              :model-value="autoUpdateValue"
              ariaLabel="Automatic updates"
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
          <Card layer="base">Base card</Card>
          <Card layer="surface">Surface card</Card>
          <Card layer="raised">Raised card</Card>
          <Card layer="surface" border>Bordered card</Card>
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
          <Button variant="surface" @click="dialogOpen = true">Open dialog</Button>
          <DropdownMenu>
            <template #trigger>
              <Button variant="surface">Dropdown menu</Button>
            </template>
            <template #items>
              <DropdownMenuItem>Profile</DropdownMenuItem>
              <DropdownMenuItem>Preferences</DropdownMenuItem>
              <DropdownMenuCheckboxItem v-model="menuNotifications" text-value="Notifications">
                <DropdownMenuItemIndicator class="ds-dropdown-menu__indicator">
                  ✓
                </DropdownMenuItemIndicator>
                Notifications
              </DropdownMenuCheckboxItem>
              <DropdownMenuSeparator />
              <DropdownMenuSub>
                <DropdownMenuSubTrigger>Move to…</DropdownMenuSubTrigger>
                <DropdownMenuSubContent aria-label="Move to">
                  <DropdownMenuItem>Desktop</DropdownMenuItem>
                  <DropdownMenuItem>Archive</DropdownMenuItem>
                </DropdownMenuSubContent>
              </DropdownMenuSub>
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

    <Modal
      v-model:open="dialogOpen"
      title="Standardized dialog"
      description="Modal behavior and focus management are provided by Ropav."
      :show-close-button="false"
    >
      <p class="gallery__dialog-copy">Compose dialog bodies from kit + ui primitives.</p>
      <template #footer>
        <div class="gallery__dialog-actions">
          <Button size="sm" @click="dialogOpen = false">Cancel</Button>
          <Button size="sm" variant="solid" color="blue" @click="dialogOpen = false">
            Confirm
          </Button>
        </div>
      </template>
    </Modal>
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

.gallery__choice-grid {
  display: grid;
  gap: var(--space-md);
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
}

:deep(.gallery__choice) {
  align-items: flex-start;
  background: var(--color-bg-elevated);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  padding: var(--space-md);
}

:deep(.gallery__choice:has(input:checked)) {
  border-color: var(--color-accent);
}

:deep(.gallery__choice-label) {
  align-items: flex-start;
  display: flex;
  gap: var(--space-sm);
}

.gallery__choice-icon {
  block-size: 20px;
  flex: 0 0 auto;
  inline-size: 20px;
}

.gallery__choice-copy {
  display: flex;
  flex-direction: column;
  gap: var(--space-2xs);
}

.gallery__choice-copy span {
  color: var(--color-fg-muted);
  font-size: var(--font-size-sm);
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

.gallery__dialog-actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-sm);
  justify-content: flex-end;
}
</style>
