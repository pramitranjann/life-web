export type EntrySource = "voice" | "text";
export type ReportType = "eod" | "morning" | "weekly";
export type TaskStatus = "open" | "in_progress" | "done" | "dismissed";
export type TaskPriority = "high" | "medium" | "low";

export interface EntryRecord {
  id: string;
  user_id: string;
  content: string;
  source: EntrySource;
  project_slug: string | null;
  local_date: string;
  created_at: string;
}

export interface ReportRecord {
  id: string;
  user_id: string;
  type: ReportType;
  content: string;
  local_date: string;
  created_at: string;
}

export interface SummaryRecord {
  id: string;
  user_id: string;
  content: string;
  week_start: string;
  created_at: string;
}

export interface SettingsRecord {
  user_id: string;
  timezone: string | null;
  eod_hour: number;
  eod_minute: number;
  updated_at: string;
}

export interface LifeNotificationRecord {
  id: string;
  user_id: string;
  kind: string;
  title: string;
  body: string;
  url: string | null;
  metadata: Record<string, unknown>;
  dedupe_key: string | null;
  created_at: string;
  read_at: string | null;
}

export interface ProgramApplicationMonitorRecord {
  program_key: string;
  user_id: string;
  program_name: string;
  program_type: string;
  url: string;
  status: string;
  status_excerpt: string;
  status_hash: string;
  last_checked_at: string;
  last_changed_at: string;
  last_notified_hash: string | null;
  last_error: string | null;
  updated_at: string;
}

export interface CalendarEventRecord {
  id: string;
  user_id: string;
  title: string | null;
  calendar_id: string | null;
  calendar_name: string | null;
  location: string | null;
  notes: string | null;
  html_link: string | null;
  attendee_emails: string[];
  reminder_minutes: number[];
  start_time: string | null;
  end_time: string | null;
  all_day: boolean;
  source: string;
  local_date: string;
  updated_at: string;
  synced_at: string;
}

export interface DayHistory {
  localDate: string;
  entryCount: number;
  hasEod: boolean;
  hasMorning: boolean;
}

export interface TaskRecord {
  id: string;
  user_id: string;
  title: string;
  details: string | null;
  project_slug: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  due_local_date: string | null;
  source_type: string;
  source_local_date: string | null;
  source_report_id: string | null;
  auto_generated: boolean;
  fingerprint: string | null;
  calendar_event_id: string | null;
  milestone_id: string | null;
  person_id: string | null;
  desk_eligible: boolean;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
}

/** A linked calendar event, denormalised for rendering on a task card. */
export interface TaskLinkedEvent {
  id: string;
  title: string;
  startTime: string | null;
  allDay: boolean;
  htmlLink: string | null;
}

/** How a task create/edit should affect the calendar. */
export type TaskCalendarIntent =
  | { mode: "none" }
  | { mode: "event"; startTime?: string | null; endTime?: string | null }
  | { mode: "link"; eventId: string }
  | { mode: "unlink" };

/** The shape the shared TaskForm emits on submit. */
export interface TaskDraft {
  title: string;
  details: string | null;
  projectSlug: string | null;
  priority: TaskPriority;
  dueLocalDate: string | null;
  calendar: TaskCalendarIntent;
  /** Create-only: auto-queue a desk receipt when the task is created. */
  deskEligible?: boolean;
}

export interface TaskCandidate {
  title: string;
  details: string | null;
  projectSlug: string | null;
  priority: TaskPriority;
  dueLocalDate: string | null;
}

export interface LifeSearchTaskHit {
  id: string;
  href: string;
  title: string;
  isHome: boolean;
  status: TaskStatus;
  priority: TaskPriority;
  projectLabel: string;
  dueLabel: string | null;
}

export interface LifeSearchProjectHit {
  id: string;
  href: string;
  name: string;
  summary: string | null;
  isHome: boolean;
}

export interface LifeSearchPersonHit {
  id: string;
  href: string;
  name: string;
  role: string | null;
  relationship: PersonRelationship | null;
  email: string | null;
  isHome: boolean;
}

export interface LifeSearchEntryHit {
  id: string;
  href: string;
  content: string;
  kind: string;
  kindColor: string;
  projectLabel: string | null;
  dayLabel: string;
  timeLabel: string;
}

export interface LifeSearchEventHit {
  id: string;
  href: string;
  title: string;
  timeLabel: string;
  dayLabel: string;
}

export interface LifeSearchResults {
  query: string;
  hasQuery: boolean;
  totalResults: number;
  projects: LifeSearchProjectHit[];
  people: LifeSearchPersonHit[];
  tasks: LifeSearchTaskHit[];
  entries: LifeSearchEntryHit[];
  events: LifeSearchEventHit[];
}

export type PrintJobStatus = "pending" | "leased" | "printed" | "failed";

/** A queued desk-printer receipt. The brain (PR Life) fills this; the ESP32
 * only leases, prints, and reports back. */
export interface PrintJobRecord {
  id: string;
  user_id: string;
  task_id: string | null;
  device_id: string;
  task_title: string;
  receipt_payload: string;
  status: PrintJobStatus;
  attempts: number;
  last_error: string | null;
  created_at: string;
  leased_at: string | null;
  lease_expires_at: string | null;
  printed_at: string | null;
}

/** Per-task print state, derived from the latest job for that task. Drives the
 * badges in Print Management. "none" = never queued (distinct from failed). */
export type TaskPrintState = "none" | "pending" | "leased" | "printed" | "failed";

export interface TaskPrintInfo {
  state: TaskPrintState;
  jobId: string | null;
  printedAt: string | null;
  lastError: string | null;
  attempts: number;
  /** True when a successful receipt exists, even if the latest job later failed
   * or the task was completed — so "already printed" stays visible. */
  hasPrinted: boolean;
}

export type ProjectStatus = "active" | "on_hold" | "done";
export type ProjectKind = "general" | "ux";

/** A project row, now stored in the database and editable from the UI. */
export interface ProjectRecord {
  slug: string;
  name: string;
  summary: string | null;
  color: string | null;
  parent_slug: string | null;
  project_kind: ProjectKind;
  aliases: string[];
  status: ProjectStatus;
  target_date: string | null;
  archived: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

/** A named stage within a project, used to roll tasks up into phases. */
export interface ProjectMilestoneRecord {
  id: string;
  user_id: string;
  project_slug: string;
  name: string;
  target_date: string | null;
  sort_order: number;
  created_at: string;
}

export type ProjectRefKind = "link" | "note" | "image";

/** A pinned reference (link, note, or uploaded image) on a project. */
export interface ProjectRefRecord {
  id: string;
  user_id: string;
  project_slug: string;
  kind: ProjectRefKind;
  title: string | null;
  url: string | null;
  body: string | null;
  storage_path: string | null;
  created_at: string;
}

export interface ProjectPageRecord {
  id: string;
  user_id: string;
  project_slug: string;
  title: string;
  body: string;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

/** The minimal project shape shared with client components via context. */
export interface LifeProjectClient {
  slug: string;
  name: string;
  color: string | null;
  parent_slug: string | null;
  project_kind: ProjectKind;
}

export type PersonRelationship =
  | "mentor"
  | "professor"
  | "alumni"
  | "recruiter"
  | "founder"
  | "collaborator"
  | "contact";

/** A professional contact in the Rolodex. */
export interface PersonRecord {
  id: string;
  user_id: string;
  name: string;
  role: string | null;
  relationship: PersonRelationship;
  why: string | null;
  channel: string | null;
  cadence_days: number | null;
  archived: boolean;
  email: string | null;
  phone: string | null;
  /** How you know them. `why` is the separate question of what you want. */
  how: string | null;
  /** Always arrays — the 010 columns default to '[]'/'{}', never null. */
  links: PersonLink[];
  likes: string[];
  dislikes: string[];
  created_at: string;
  updated_at: string;
}

export interface PersonLink {
  label: string;
  url: string;
}

export type InteractionKind = "met" | "call" | "message" | "showed_work" | "note";

/** A dated log entry of contact with a person. */
export interface InteractionRecord {
  id: string;
  user_id: string;
  person_id: string;
  local_date: string;
  kind: InteractionKind;
  summary: string;
  project_slug: string | null;
  created_at: string;
}

export type StudioItemKind = "image" | "link" | "moodboard" | "critique" | "note";

export interface StudioItemRecord {
  id: string;
  user_id: string;
  kind: StudioItemKind;
  title: string;
  body: string | null;
  url: string | null;
  storage_path: string | null;
  width: number | null;
  height: number | null;
  x: number | null;
  y: number | null;
  tags: string[];
  project_slug: string | null;
  board_id: string | null;
  created_at: string;
  updated_at: string;
}
