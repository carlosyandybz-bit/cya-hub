export type AppRole = "admin" | "teacher_admin" | "teacher" | "student";

export type ExperienceContext = "teacher" | "student" | "admin";

export type IdentityContext = {
  user_id: string;
  display_name: string;
  profile_name: string;
  avatar_url: string | null;
  person_id: number | null;
  roles: AppRole[];
  timezone: string;
  greeting_boundaries: {
    morning_start?: string;
    afternoon_start?: string;
    night_start?: string;
  };
  can_admin: boolean;
  can_teach: boolean;
  can_study: boolean;
};

export type MissionState =
  | "upcoming"
  | "available"
  | "in_progress"
  | "blocked"
  | "postponed"
  | "completed"
  | "not_done"
  | "not_applicable"
  | "cancelled"
  | "completed_automatically";

export type Mission = {
  id: number;
  rule_key: string | null;
  mission_type: "main" | "daily" | "growth";
  state: MissionState;
  priority: "normal" | "priority" | "urgent";
  priority_score: number;
  title: string;
  description: string | null;
  action_target: string | null;
  due_at: string | null;
  estimated_duration_minutes: number;
  calendar_block: boolean;
};

export type HomeSnapshot = {
  timezone: string;
  greeting_boundaries: IdentityContext["greeting_boundaries"];
  quote: { id: number; text: string } | null;
  missions: Mission[];
  mission_engine: {
    enabled?: boolean;
    max_daily_missions?: number;
    quiet_hours_start?: string;
    quiet_hours_end?: string;
  } | null;
};

export type CalendarItem = {
  id: number;
  type: "class" | "mission" | "event" | "external";
  title: string;
  starts_at: string;
  ends_at: string;
  status: string;
};

export type CalendarSnapshot = {
  classes: CalendarItem[];
  missions: CalendarItem[];
  marketing_events: CalendarItem[];
  external_events: CalendarItem[];
};