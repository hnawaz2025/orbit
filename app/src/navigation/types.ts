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

/**
 * The organizer's view sits above the tabs, not inside them.
 *
 * It is one of three people at the conference, and a tab spends a permanent
 * quarter of every attendee's navigation on a door they cannot open. As a
 * modal reached from a mark in the corner it costs nobody anything and is
 * still one tap away when it is time to show it.
 */
export type RootStackParamList = {
  Tabs: undefined;
  Insights: undefined;
};
