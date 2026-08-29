import { create } from "zustand";
import type { PlanItem, RecommendedEntity } from "@orbit/shared";
import { getItem, setItem } from "../api/storage";

/**
 * Versioned, and bumped deliberately.
 *
 * A plan stores a snapshot of each entity rather than a reference to it, so
 * anything saved before the corpus improved keeps whatever it knew at the time
 * -- items saved while most sessions still lacked times are frozen with
 * startsAt null and render as "ANY TIME" forever. Bumping the key discards
 * those rather than displaying a schedule that is quietly wrong.
 *
 * The snapshot is still the right shape for now: the plan must work with no
 * network, standing in a basement conference hall. But it needs a refresh path
 * -- an endpoint that re-reads saved ids -- before an attendee could be
 * carrying a stale room number into a corridor. Noted rather than solved.
 */
const STORAGE_KEY = "orbit_plan_v2";

/**
 * The plan lives on the device, not the server.
 *
 * Consistent with the rest of Orbit's identity model: there is no account, so
 * there is nowhere to hang a server-side plan that survives a reinstall anyway.
 * The cost is real -- a lost phone loses the plan -- but the alternative is
 * asking a conference attendee to make an account before they can save a
 * session, which is the friction the whole product is built to avoid.
 */
interface PlanState {
  items: PlanItem[];
  hydrated: boolean;
  hydrate: () => Promise<void>;
  add: (entity: RecommendedEntity) => void;
  remove: (id: string) => void;
  has: (id: string) => boolean;
}

function toPlanItem(entity: RecommendedEntity): PlanItem {
  return {
    id: entity.id,
    title: entity.title,
    kind: entity.kind,
    locationName: entity.locationName,
    startsAt: entity.startsAt,
    endsAt: entity.endsAt,
  };
}

async function persist(items: PlanItem[]) {
  try {
    await setItem(STORAGE_KEY, JSON.stringify(items));
  } catch {
    // A failed write costs this change on next launch, which is not worth
    // interrupting someone mid-conference to report.
  }
}

export const usePlan = create<PlanState>((set, get) => ({
  items: [],
  hydrated: false,

  hydrate: async () => {
    if (get().hydrated) return;
    try {
      const raw = await getItem(STORAGE_KEY);
      const items = raw ? (JSON.parse(raw) as PlanItem[]) : [];
      set({ items: Array.isArray(items) ? items : [], hydrated: true });
    } catch {
      // Corrupt or unreadable storage starts an empty plan rather than
      // preventing the app from opening.
      set({ items: [], hydrated: true });
    }
  },

  add: (entity) => {
    const items = get().items;
    if (items.some((i) => i.id === entity.id)) return;
    const next = [...items, toPlanItem(entity)];
    set({ items: next });
    void persist(next);
  },

  remove: (id) => {
    const next = get().items.filter((i) => i.id !== id);
    set({ items: next });
    void persist(next);
  },

  has: (id) => get().items.some((i) => i.id === id),
}));
