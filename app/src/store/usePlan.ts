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
  /**
   * The venue's zone, recorded when items are saved.
   *
   * The plan has to render the conference's wall clock with no network, so the
   * zone is stored beside the items rather than fetched. One event at a time,
   * so one zone.
   */
  timeZone?: string;
  hydrated: boolean;
  hydrate: () => Promise<void>;
  add: (entity: RecommendedEntity, timeZone?: string) => void;
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

async function persist(items: PlanItem[], timeZone?: string) {
  try {
    await setItem(STORAGE_KEY, JSON.stringify({ items, timeZone }));
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
      const parsed = raw ? (JSON.parse(raw) as { items?: PlanItem[]; timeZone?: string }) : null;
      set({
        items: Array.isArray(parsed?.items) ? parsed!.items : [],
        timeZone: parsed?.timeZone,
        hydrated: true,
      });
    } catch {
      // Corrupt or unreadable storage starts an empty plan rather than
      // preventing the app from opening.
      set({ items: [], hydrated: true });
    }
  },

  add: (entity, timeZone) => {
    const items = get().items;
    if (items.some((i) => i.id === entity.id)) return;
    const next = [...items, toPlanItem(entity)];
    const zone = timeZone ?? get().timeZone;
    set({ items: next, timeZone: zone });
    void persist(next, zone);
  },

  remove: (id) => {
    const next = get().items.filter((i) => i.id !== id);
    set({ items: next });
    void persist(next, get().timeZone);
  },

  has: (id) => get().items.some((i) => i.id === id),
}));
