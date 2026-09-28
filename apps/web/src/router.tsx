import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type AnchorHTMLAttributes, type ReactNode } from 'react';
import { IS_ARTIFACT } from './platform/index.ts';

export type Route =
  | { name: 'now' }
  | { name: 'notices' }
  | { name: 'notice'; id: string }
  | { name: 'learn' }
  | { name: 'settings' }
  | { name: 'not-found' };

export const TABS = [
  { path: '/', name: 'now', label: 'Now' },
  { path: '/notices', name: 'notices', label: 'Notices' },
  { path: '/learn', name: 'learn', label: 'How it works' },
  { path: '/settings', name: 'settings', label: 'Settings' },
] as const;

export function parseRoute(path: string): Route {
  const clean = path.replace(/\/+$/, '') || '/';
  if (clean === '/') return { name: 'now' };
  if (clean === '/notices') return { name: 'notices' };
  if (clean === '/learn') return { name: 'learn' };
  if (clean === '/settings') return { name: 'settings' };
  const notice = /^\/notices\/([A-Za-z0-9-]{1,64})$/.exec(clean);
  if (notice?.[1]) return { name: 'notice', id: notice[1] };
  return { name: 'not-found' };
}

/** Depth used to pick a transition direction: tabs left to right, details deeper. */
function depthOf(route: Route): number {
  switch (route.name) {
    case 'now':
      return 0;
    case 'notices':
      return 1;
    case 'notice':
      return 1.5;
    case 'learn':
      return 2;
    case 'settings':
      return 3;
    default:
      return 0;
  }
}

interface RouterValue {
  path: string;
  route: Route;
  direction: 1 | -1;
  navigate(path: string, options?: { replace?: boolean }): void;
}

const RouterContext = createContext<RouterValue | null>(null);

export function RouterProvider({ children }: { children: ReactNode }) {
  // The artifact preview keeps routes in memory: its frame only allows plain #anchors.
  const [path, setPath] = useState(() => (IS_ARTIFACT ? '/' : window.location.pathname));
  const previous = useRef<Route>(parseRoute(path));
  const [direction, setDirection] = useState<1 | -1>(1);

  useEffect(() => {
    if (IS_ARTIFACT) return;
    const onPop = () => setPath(window.location.pathname);
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const route = useMemo(() => parseRoute(path), [path]);

  useEffect(() => {
    setDirection(depthOf(route) >= depthOf(previous.current) ? 1 : -1);
    previous.current = route;
  }, [route]);

  const navigate = useCallback((next: string, options?: { replace?: boolean }) => {
    if (!IS_ARTIFACT) {
      if (options?.replace) window.history.replaceState(null, '', next);
      else if (next !== window.location.pathname) window.history.pushState(null, '', next);
    }
    setPath(next);
    window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
  }, []);

  const value = useMemo(() => ({ path, route, direction, navigate }), [path, route, direction, navigate]);
  return <RouterContext.Provider value={value}>{children}</RouterContext.Provider>;
}

export function useRouter(): RouterValue {
  const value = useContext(RouterContext);
  if (!value) throw new Error('useRouter outside RouterProvider');
  return value;
}

export function Link({ to, children, onClick, ...rest }: AnchorHTMLAttributes<HTMLAnchorElement> & { to: string }) {
  const { navigate } = useRouter();
  return (
    <a
      href={to}
      {...rest}
      onClick={(event) => {
        onClick?.(event);
        if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
        event.preventDefault();
        navigate(to);
      }}
    >
      {children}
    </a>
  );
}
