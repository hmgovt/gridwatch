import { AnimatePresence, LayoutGroup, motion, MotionConfig } from 'motion/react';
import { useEffect } from 'react';
import { Icon, type IconName } from './components/Icon.tsx';
import { Wordmark } from './components/Logo.tsx';
import { ScenarioPicker } from './components/ScenarioPicker.tsx';
import { ToastProvider } from './components/Toast.tsx';
import { DataProvider, useData } from './data/DataProvider.tsx';
import { Link, RouterProvider, TABS, useRouter, type Route } from './router.tsx';
import { LearnScreen } from './screens/LearnScreen.tsx';
import { NoticeDetailScreen, NoticesScreen } from './screens/NoticesScreen.tsx';
import { NowScreen } from './screens/NowScreen.tsx';
import { Onboarding } from './screens/Onboarding.tsx';
import { SettingsScreen } from './screens/SettingsScreen.tsx';
import { onNotificationOpen } from './platform/index.ts';
import { useAlertPrefsSync } from './state/alerts.ts';
import { PrefsProvider, usePrefs } from './state/prefs.tsx';
import { UiProvider, useUi } from './state/ui.tsx';

const TAB_ICONS: Record<(typeof TABS)[number]['name'], IconName> = {
  now: 'now',
  notices: 'notices',
  learn: 'learn',
  settings: 'settings',
};

export function App() {
  return (
    <MotionConfig reducedMotion="user">
      <PrefsProvider>
        <UiProvider>
          <RouterProvider>
            <DataProvider>
              <ToastProvider>
                <Shell />
              </ToastProvider>
            </DataProvider>
          </RouterProvider>
        </UiProvider>
      </PrefsProvider>
    </MotionConfig>
  );
}

function Shell() {
  const { route, path, direction, navigate } = useRouter();
  const { prefs } = usePrefs();
  const { scenariosOpen, closeScenarios, openScenarios, welcomeOpen } = useUi();
  const { mode, status } = useData();
  useAlertPrefsSync();
  useEffect(() => onNotificationOpen((to) => navigate(to)), [navigate]);

  const activeTab = route.name === 'notice' ? 'notices' : route.name;

  return (
    <div className="app">
      <a href="#main" className="skip-link">
        Skip to content
      </a>
      <header className="topbar">
        <Link to="/" className="brand-link" aria-label="everybody Hz home">
          <Wordmark />
        </Link>
        <LayoutGroup id="topnav">
          <nav className="topnav" aria-label="Main">
            {TABS.map((tab) => (
              <Link key={tab.path} to={tab.path} className={`topnav-link ${activeTab === tab.name ? 'is-active' : ''}`} aria-current={activeTab === tab.name ? 'page' : undefined}>
                {tab.label}
                {activeTab === tab.name && <motion.span layoutId="topnav-underline" className="topnav-underline" />}
              </Link>
            ))}
          </nav>
        </LayoutGroup>
        <div className="topbar-end">
          {mode === 'scenario' && (
            <button type="button" className="chip scenario-toggle" onClick={openScenarios}>
              <Icon name="layers" />
              Scenario
            </button>
          )}
          {status && <span className={`status-pip lvl-${status.level}`} aria-hidden="true" />}
        </div>
      </header>

      <main id="main" className="main" tabIndex={-1}>
        <AnimatePresence mode="wait" initial={false} custom={direction}>
          <motion.div
            key={path}
            custom={direction}
            initial={{ opacity: 0, x: 18 * direction }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -12 * direction }}
            transition={{ duration: 0.22, ease: [0.2, 0.8, 0.2, 1] }}
          >
            <Screen route={route} />
          </motion.div>
        </AnimatePresence>
      </main>

      <LayoutGroup id="tabbar">
        <nav className="tabbar" aria-label="Main">
          {TABS.map((tab) => {
            const active = activeTab === tab.name;
            return (
              <Link key={tab.path} to={tab.path} className={`tab ${active ? 'is-active' : ''}`} aria-current={active ? 'page' : undefined}>
                {active && <motion.span layoutId="tab-pill" className="tab-pill" transition={{ type: 'spring', stiffness: 520, damping: 40 }} />}
                <Icon name={TAB_ICONS[tab.name]} />
                <span className="tab-label">{tab.name === 'learn' ? 'Learn' : tab.label}</span>
              </Link>
            );
          })}
        </nav>
      </LayoutGroup>

      <ScenarioPicker open={scenariosOpen} onClose={closeScenarios} />
      <AnimatePresence>{(!prefs.onboarded || welcomeOpen) && <Onboarding key="welcome" />}</AnimatePresence>
    </div>
  );
}

function Screen({ route }: { route: Route }) {
  switch (route.name) {
    case 'now':
      return <NowScreen />;
    case 'notices':
      return <NoticesScreen />;
    case 'notice':
      return <NoticeDetailScreen id={route.id} />;
    case 'learn':
      return <LearnScreen />;
    case 'settings':
      return <SettingsScreen />;
    default:
      return (
        <div className="page">
          <div className="card">
            <h1>Page not found</h1>
            <p className="muted">
              <Link to="/">Go to the current status</Link>
            </p>
          </div>
        </div>
      );
  }
}
