export interface Achievement {
  id: number;
  name: string | null;
  image: string | null;
  description: string | null;
  prereq_display: string | null;
  prereq_active: number[] | null;
  default: number;
  category: number;
  category_order: number | null;
  fn: string;
  status: number;
  status_text: "EARNED" | "VISIBLE_EARNABLE" | "VISIBLE_NOT_EARNABLE";
}

export interface AchievementCategory {
  category_id: number;
  category_name: string;
  achievements: ReadonlyArray<Achievement>;
}
