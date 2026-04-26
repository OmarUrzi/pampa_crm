import { apiFetch } from "./client";

export type SlideDeckRow = {
  id: string;
  source: string;
  title: string | null;
  provider: string | null;
  createdAt: string;
};

export type SlideDeckListItem = SlideDeckRow;

export async function apiListSlidesForEvento(eventoId: string) {
  return await apiFetch<{ decks: SlideDeckListItem[] }>(`/eventos/${eventoId}/slides-decks`);
}

