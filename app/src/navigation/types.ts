import type { AskResponse, RecommendedEntity } from "@orbit/shared";

export type RootStackParamList = {
  Ask: { eventSlug?: string } | undefined;
  Results: { question: string; result: AskResponse };
  Detail: { item: RecommendedEntity };
};
