import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';

interface UiValue {
  scenariosOpen: boolean;
  openScenarios(): void;
  closeScenarios(): void;
  welcomeOpen: boolean;
  openWelcome(): void;
  closeWelcome(): void;
}

const UiContext = createContext<UiValue | null>(null);

export function UiProvider({ children }: { children: ReactNode }) {
  const [scenariosOpen, setScenariosOpen] = useState(false);
  const [welcomeOpen, setWelcomeOpen] = useState(false);
  const value = useMemo(
    () => ({
      scenariosOpen,
      openScenarios: () => setScenariosOpen(true),
      closeScenarios: () => setScenariosOpen(false),
      welcomeOpen,
      openWelcome: () => setWelcomeOpen(true),
      closeWelcome: () => setWelcomeOpen(false),
    }),
    [scenariosOpen, welcomeOpen],
  );
  return <UiContext.Provider value={value}>{children}</UiContext.Provider>;
}

export function useUi(): UiValue {
  const value = useContext(UiContext);
  if (!value) throw new Error('useUi outside UiProvider');
  return value;
}
