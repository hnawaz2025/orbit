import { create } from "zustand";
import { PASS_TIERS, type PassTier } from "@orbit/shared";
import { getItem, setItem } from "../api/storage";

const STORAGE_KEY = "orbit_pass_v1";

/**
 * Which ticket the attendee is holding.
 *
 * Undefined until they say, and that default matters: guessing PREMIUM would
 * show them sessions they cannot attend, and guessing OPEN would hide 40% of
 * the conference from someone who paid for it. Unset means show everything,
 * which is wrong in the least damaging direction and self-correcting the
 * moment they choose.
 */
interface PassState {
  pass?: PassTier;
  hydrated: boolean;
  hydrate: () => Promise<void>;
  set: (pass: PassTier | undefined) => void;
}

export const usePass = create<PassState>((setState, get) => ({
  pass: undefined,
  hydrated: false,

  hydrate: async () => {
    if (get().hydrated) return;
    try {
      const raw = await getItem(STORAGE_KEY);
      const valid = PASS_TIERS.includes(raw as PassTier) ? (raw as PassTier) : undefined;
      setState({ pass: valid, hydrated: true });
    } catch {
      setState({ hydrated: true });
    }
  },

  set: (pass) => {
    setState({ pass });
    void setItem(STORAGE_KEY, pass ?? "").catch(() => {});
  },
}));
