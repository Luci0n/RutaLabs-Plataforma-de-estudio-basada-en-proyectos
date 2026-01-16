export type ProjectId = string | number;

export type ProjectVisibility = "private" | "unlisted" | "public";
export type ProjectRole = "owner" | "editor" | "guest";

export type ProjectBlockType = "text" | "flashcards";

export type ReviewRating = "again" | "hard" | "good" | "easy";

export type ReviewState = "new" | "learning" | "review" | "relearning";

export type ProjectRow = {
  id: ProjectId;
  owner_user_id: string;
  title: string;
  description_md: string | null;
  visibility: ProjectVisibility;
  is_hidden: boolean;
  updated_at: string;
  published_at: string | null;
};

export type ProjectBlockRow = {
  id: string;
  project_id: ProjectId;
  type: ProjectBlockType;
  order_index: number;
  data: unknown;
  created_at: string;
  updated_at: string;
};

export type FlashcardGroupRow = {
  id: string;
  block_id: string;
  title: string;
  order_index: number;
  created_at: string;
};

export type FlashcardRow = {
  id: string;
  project_id: ProjectId;
  group_id: string | null;
  front: string;
  back: string;
  order_index: number;
  created_at: string;
  updated_at: string;
};

export type FlashcardReviewStateRow = {
  user_id: string;
  card_id: string;
  due_at: string;
  state: ReviewState;
  interval_days: number;
  ease: number;
  reps: number;
  lapses: number;
  last_review_at: string | null;
  created_at: string;
  updated_at: string;
};

export type PracticeCard = {
  id: string;
  front: string;
  back: string;
  order_index: number;
  group_id: string | null;

  // estado del usuario
  due_at: string;
  state: ReviewState;
  interval_days: number;
  ease: number;
};

