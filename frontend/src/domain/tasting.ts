import type { ConsumeWineDraft } from "../types";

export function tastingRequest(draft: ConsumeWineDraft) {
  return {
    consumed_at: draft.consumed_at || undefined,
    note: draft.note.trim(),
    tasting_rating: Number(draft.tasting_rating || 0),
    tasting_enjoyment: draft.tasting_enjoyment,
    tasting_occasion: draft.tasting_occasion.trim(),
    tasting_pairing: draft.tasting_pairing.trim(),
    tasting_companions: draft.tasting_companions.trim(),
    memory_photo: draft.memory_photo,
  };
}
