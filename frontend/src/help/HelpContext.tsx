import { createContext, useContext } from "react";

export type HelpContextValue = {
  openHelp: (slug?: string | null) => void;
};

export const HelpContext = createContext<HelpContextValue | null>(null);

export function useHelp() {
  return useContext(HelpContext);
}
