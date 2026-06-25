import { createContext, useContext } from 'react';

export type ViewMode = 'desktop' | 'mobile';

interface ViewModeContextValue {
  viewMode: ViewMode;
  isMobile: boolean;
  toggle: () => void;
}

export const ViewModeContext = createContext<ViewModeContextValue>({
  viewMode: 'desktop',
  isMobile: false,
  toggle: () => {},
});

export function useViewMode() {
  return useContext(ViewModeContext);
}
