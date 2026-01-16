// app/protected/projects/%5BprojectId%5D/types.ts
export type BlockType = "text" | "flashcards";

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json }
  | Json[];

export type ProjectRow = {
  id: string; // tu DB está usando UUID (ya vimos el error de uuid)
  title: string;
  description_md: string | null;
  updated_at: string;
};

export type ProjectBlockRow = {
  id: string;
  project_id: string; // UUID del proyecto
  type: BlockType;
  order_index: number;
  data: Json;
  created_at: string;
  updated_at: string;
};

export type FlashcardGroupRow = {
  id: string;
  block_id: string; // UUID del block (project_blocks.id)
  title: string;
  order_index: number;
  created_at: string;
};

export type FlashcardRow = {
  id: string;
  project_id: string; // UUID del proyecto
  group_id: string | null; // UUID del grupo
  front: string;
  back: string;
  order_index: number;
  created_at: string;
  updated_at: string;
};
