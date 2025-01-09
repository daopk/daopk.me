import { describe, expect, it, vi } from "vitest";

import type { VfsStat } from "~/core/vfs/nodes";
import { normalizeVfsPath } from "~/core/vfs/path";
import { VfsError } from "~/core/vfs/errors";

import {
  CALENDAR_FILE_PATH,
  CALENDAR_MIME_TYPE,
  CALENDAR_ROOT,
  type CalendarEvent,
  type CalendarVfsClient,
  serializeCalendar,
  useCalendar,
} from "./useCalendar";

interface FakeNode {
  kind: "file" | "directory";
  text?: string;
  mimeType?: string;
  updatedAt?: number;
}

interface FakeVfs extends CalendarVfsClient {
  readonly nodes: Record<string, FakeNode>;
  readonly writes: Array<{ path: string; text: string; options: Record<string, unknown> }>;
}

function stat(path: string, node: FakeNode): VfsStat {
  const normalized = normalizeVfsPath(path);
  return {
    path: normalized,
    kind: node.kind,
    size: node.text?.length ?? 0,
    createdAt: node.updatedAt ?? 0,
    updatedAt: node.updatedAt ?? 0,
    readonly: false,
    ...(node.mimeType === undefined ? {} : { mimeType: node.mimeType }),
  };
}

function makeVfs(seed: Record<string, FakeNode> = {}): FakeVfs {
  const nodes: Record<string, FakeNode> = { ...seed };
  const writes: FakeVfs["writes"] = [];
  let now = 10;

  return {
    nodes,
    writes,
    mkdir: vi.fn(async (path: string) => {
      const normalized = normalizeVfsPath(path);
      nodes[normalized] ??= { kind: "directory", updatedAt: ++now };
      return stat(normalized, nodes[normalized]!);
    }),
    readText: vi.fn(async (path: string) => nodes[normalizeVfsPath(path)]?.text ?? null),
    writeText: vi.fn(
      async (
        path: string,
        text: string,
        options: { overwrite?: boolean; mimeType?: string } = {},
      ) => {
        const normalized = normalizeVfsPath(path);
        writes.push({ path: normalized, text, options });
        nodes[normalized] = {
          kind: "file",
          text,
          updatedAt: ++now,
          ...(options.mimeType === undefined ? {} : { mimeType: options.mimeType }),
        };
        return stat(normalized, nodes[normalized]!);
      },
    ),
  };
}

function makeEvent(overrides: Partial<CalendarEvent> = {}): CalendarEvent {
  return {
    id: "event-a",
    title: "Planning",
    startAt: "2026-05-26T09:00",
    endAt: "2026-05-26T10:00",
    allDay: false,
    notes: "",
    color: "blue",
    createdAt: "2026-05-26T08:00",
    updatedAt: "2026-05-26T08:00",
    ...overrides,
  };
}

describe("useCalendar", () => {
  it("creates /home/calendar and starts empty when the events file is missing", async () => {
    const vfs = makeVfs();
    const calendar = useCalendar({ vfs });

    await expect(calendar.loadCalendar()).resolves.toBe(true);

    expect(vfs.mkdir).toHaveBeenCalledWith(CALENDAR_ROOT, { recursive: true });
    expect(calendar.status.value).toBe("empty");
    expect(calendar.events.value).toEqual([]);
  });

  it("loads valid events sorted by start time", async () => {
    const vfs = makeVfs({
      [CALENDAR_ROOT]: { kind: "directory" },
      [CALENDAR_FILE_PATH]: {
        kind: "file",
        text: serializeCalendar([
          makeEvent({
            id: "late",
            title: "Late",
            startAt: "2026-05-26T16:00",
            endAt: "2026-05-26T17:00",
          }),
          makeEvent({ id: "early", title: "Early", startAt: "2026-05-26T08:00" }),
        ]),
        mimeType: CALENDAR_MIME_TYPE,
      },
    });
    const calendar = useCalendar({ vfs });

    await calendar.loadCalendar();

    expect(calendar.events.value.map((event) => event.id)).toEqual(["early", "late"]);
    expect(calendar.status.value).toBe("ready");
  });

  it("surfaces invalid JSON without overwriting the stored file", async () => {
    const vfs = makeVfs({
      [CALENDAR_ROOT]: { kind: "directory" },
      [CALENDAR_FILE_PATH]: { kind: "file", text: "not json", mimeType: CALENDAR_MIME_TYPE },
    });
    const calendar = useCalendar({ vfs });

    await expect(calendar.loadCalendar()).resolves.toBe(false);

    expect(calendar.status.value).toBe("error");
    expect(vfs.writes).toHaveLength(0);
  });

  it("treats a missing events file error as an empty calendar", async () => {
    const vfs = makeVfs({ [CALENDAR_ROOT]: { kind: "directory" } });
    vi.mocked(vfs.readText).mockRejectedValueOnce(
      new VfsError("NOT_FOUND", "Path not found", { path: CALENDAR_FILE_PATH }),
    );
    const calendar = useCalendar({ vfs });

    await expect(calendar.loadCalendar()).resolves.toBe(true);

    expect(calendar.status.value).toBe("empty");
    expect(calendar.events.value).toEqual([]);
    expect(vfs.writes).toHaveLength(0);
  });

  it("creates, updates, and deletes events in the versioned JSON document", async () => {
    const vfs = makeVfs();
    const calendar = useCalendar({
      vfs,
      now: () => new Date(2026, 4, 26, 10, 15),
      idFactory: () => "event-1",
    });
    await calendar.loadCalendar();

    const created = await calendar.createEvent({
      title: "Design review",
      startAt: "2026-05-26T11:00",
      endAt: "2026-05-26T12:00",
      allDay: false,
      notes: "Bring notes",
      color: "green",
    });

    expect(created.ok).toBe(true);
    expect(vfs.writes.at(-1)).toMatchObject({
      path: CALENDAR_FILE_PATH,
      options: { overwrite: true, mimeType: CALENDAR_MIME_TYPE },
    });
    expect(JSON.parse(vfs.writes.at(-1)!.text)).toMatchObject({
      version: 1,
      events: [{ id: "event-1", title: "Design review", color: "green" }],
    });

    const updated = await calendar.updateEvent("event-1", {
      title: "Design critique",
      startAt: "2026-05-26T13:00",
      endAt: "2026-05-26T14:00",
      allDay: false,
      notes: "",
      color: "purple",
    });

    expect(updated.ok).toBe(true);
    expect(calendar.events.value[0]).toMatchObject({
      id: "event-1",
      title: "Design critique",
      color: "purple",
    });

    await expect(calendar.deleteEvent("event-1")).resolves.toBe(true);
    expect(JSON.parse(vfs.writes.at(-1)!.text)).toMatchObject({ version: 1, events: [] });
    expect(calendar.status.value).toBe("empty");
  });

  it("rejects invalid input before writing", async () => {
    const vfs = makeVfs();
    const calendar = useCalendar({ vfs });
    await calendar.loadCalendar();

    await expect(
      calendar.createEvent({
        title: "   ",
        startAt: "2026-05-26T12:00",
        endAt: "2026-05-26T11:00",
        allDay: false,
        notes: "",
        color: "blue",
      }),
    ).resolves.toEqual({ ok: false, event: null });

    expect(calendar.status.value).toBe("error");
    expect(vfs.writes).toHaveLength(0);
  });

  it("keeps the in-memory edit visible when VFS save fails", async () => {
    const vfs = makeVfs();
    const calendar = useCalendar({
      vfs,
      idFactory: () => "event-offline",
      now: () => new Date(2026, 4, 26, 10, 0),
    });
    await calendar.loadCalendar();
    vi.mocked(vfs.writeText).mockResolvedValueOnce(null);

    const result = await calendar.createEvent({
      title: "Offline draft",
      startAt: "2026-05-26T11:00",
      endAt: "2026-05-26T12:00",
      allDay: false,
      notes: "",
      color: "gray",
    });

    expect(result.ok).toBe(false);
    expect(result.event?.id).toBe("event-offline");
    expect(calendar.events.value).toHaveLength(1);
    expect(calendar.status.value).toBe("error");
  });
});
