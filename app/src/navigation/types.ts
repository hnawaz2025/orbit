import type { AskResponse, RecommendedEntity } from "@orbit/shared";

/**
 * Detail is registered in both stacks deliberately.
 *
 * Tapping a linked speaker from inside the plan must not throw you into the
 * Ask tab -- you would lose your day and have to navigate back to it.
 */
export type AskStackParamList = {
  Ask: { eventSlug?: string } | undefined;
  Results: { question: string; result: AskResponse };
  Detail: { item?: RecommendedEntity; entityId?: string; timeZone?: string };
};

export type PlanStackParamList = {
  Plan: undefined;
  Detail: { item?: RecommendedEntity; entityId?: string; timeZone?: string };
};

export type RootTabParamList = {
  AskTab: undefined;
  PlanTab: undefined;
};

/** Convenience for screens registered in both stacks. */
export type RootStackParamList = AskStackParamList;
