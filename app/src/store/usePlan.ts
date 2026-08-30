import { create } from "zustand";
import { toPlanItem, type PlanItem, type RecommendedEntity } from "@orbit/shared";
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
const STORAGE_KEY = "orbit_plan_v3";

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
  /**
   * Whole recommendations, not just their timings.
   *
   * The earlier version kept six fields and dropped the reason, the profile,
   * the description and the links -- so a saved item could not show the
   * sentence that is the product, could not be opened, and if it was a person
   * had nowhere to sit. Saving something should not make it less than it was
   * on the card.
   */
  saved: RecommendedEntity[];
  /** Derived for layout. */
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
  /** The full recommendation behind a plan item, for opening its detail. */
  find: (id: string) => RecommendedEntity | undefined;
}

async function persist(saved: RecommendedEntity[], timeZone?: string) {
  try {
    await setItem(STORAGE_KEY, JSON.stringify({ saved, timeZone }));
  } catch {
    // A failed write costs this change on next launch, which is not worth
    // interrupting someone mid-conference to report.
  }
}

export const usePlan = create<PlanState>((set, get) => ({
  saved: [],
  items: [],
  hydrated: false,

  hydrate: async () => {
    if (get().hydrated) return;
    try {
      const raw = await getItem(STORAGE_KEY);
      const parsed = raw
        ? (JSON.parse(raw) as { saved?: RecommendedEntity[]; timeZone?: string })
        : null;
      const saved = Array.isArray(parsed?.saved) ? parsed!.saved : [];
      set({ saved, items: saved.map(toPlanItem), timeZone: parsed?.timeZone, hydrated: true });
    } catch {
      // Corrupt or unreadable storage starts an empty plan rather than
      // preventing the app from opening.
      set({ items: [], hydrated: true });
    }
  },

  add: (entity, timeZone) => {
    const saved = get().saved;
    if (saved.some((i) => i.id === entity.id)) return;
    const next = [...saved, entity];
    const zone = timeZone ?? get().timeZone;
    set({ saved: next, items: next.map(toPlanItem), timeZone: zone });
    void persist(next, zone);
  },

  remove: (id) => {
    const next = get().saved.filter((i) => i.id !== id);
    set({ saved: next, items: next.map(toPlanItem) });
    void persist(next, get().timeZone);
  },

  has: (id) => get().saved.some((i) => i.id === id),

  find: (id) => get().saved.find((i) => i.id === id),
}));
