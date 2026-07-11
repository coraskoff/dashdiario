import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useLocation,
} from "@tanstack/react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/sonner";
import { CheckSquare, Wallet, BookOpen, Plus, Timer, HeartPulse } from "lucide-react";
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";

interface MobileFabCtx {
  setFab: (action: (() => void) | null) => void;
}

export const MobileFabContext = createContext<MobileFabCtx>({ setFab: () => {} });

export function useMobileFab(action: (() => void) | null) {
  const { setFab } = useContext(MobileFabContext);
  const actionRef = useRef(action);
  actionRef.current = action;
  useEffect(() => {
    setFab(() => actionRef.current?.());
    return () => setFab(null);
  }, [setFab]);
}

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

interface RouterContext {
  queryClient: QueryClient;
}

export const Route = createRootRouteWithContext<RouterContext>()({
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
});

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  return (
    <QueryClientProvider client={queryClient}>
      <AppLayout>
        <Outlet />
      </AppLayout>
      <Toaster richColors position="top-center" />
    </QueryClientProvider>
  );
}

function AppLayout({ children }: { children: React.ReactNode }) {
  const [fabAction, setFabActionState] = useState<(() => void) | null>(null);
  const setFab = useCallback((action: (() => void) | null) => {
    setFabActionState(action ? () => action : null);
  }, []);
  const location = useLocation();
  const isFocus =
    location.pathname.startsWith("/timer/focus") ||
    location.pathname.startsWith("/timer/flow");

  if (isFocus) {
    return (
      <MobileFabContext.Provider value={{ setFab }}>
        {children}
      </MobileFabContext.Provider>
    );
  }

  return (
    <MobileFabContext.Provider value={{ setFab }}>
      <div className="min-h-screen bg-background">
        <header className="sticky top-0 z-40 border-b border-border/60 bg-background/80 backdrop-blur-xl">
          <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-6">
            <Link to="/tasks" className="flex items-center gap-2 font-semibold tracking-tight">
              <span className="inline-block h-2 w-2 rounded-full bg-foreground" />
              Dash
            </Link>
            <nav className="hidden md:flex items-center gap-1 text-sm">
              <NavLink to="/tasks">Tarefas</NavLink>
              <NavLink to="/finance">Finanças</NavLink>
              <NavLink to="/notes">Notas</NavLink>
              <NavLink to="/timer">Foco</NavLink>
              <NavLink to="/saude">Saúde</NavLink>
            </nav>
          </div>
        </header>
        <main className="mx-auto max-w-5xl px-6 py-10 pb-28 md:pb-10">{children}</main>
        <MobileNav />
        {fabAction && (
          <button
            onClick={fabAction}
            aria-label="Novo"
            className="md:hidden fixed bottom-24 right-5 z-40 flex h-12 w-12 items-center justify-center rounded-full bg-foreground text-background shadow-lg shadow-black/15 transition-transform active:scale-95"
          >
            <Plus size={20} strokeWidth={2} />
          </button>
        )}
      </div>
    </MobileFabContext.Provider>
  );
}

function NavLink({ to, children }: { to: string; children: React.ReactNode }) {
  return (
    <Link
      to={to}
      className="rounded-md px-3 py-1.5 text-muted-foreground transition-colors hover:text-foreground data-[status=active]:text-foreground data-[status=active]:bg-secondary"
    >
      {children}
    </Link>
  );
}

const NAV_ITEMS = [
  { to: "/tasks", label: "Tarefas", icon: CheckSquare },
  { to: "/finance", label: "Finanças", icon: Wallet },
  { to: "/notes", label: "Notas", icon: BookOpen },
  { to: "/timer", label: "Foco", icon: Timer },
  { to: "/saude", label: "Saúde", icon: HeartPulse },
] as const;

function MobileNav() {
  return (
    <nav
      className="md:hidden fixed bottom-6 left-1/2 -translate-x-1/2 z-50"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <div className="flex items-center gap-0.5 rounded-full border border-border/60 bg-background/95 px-2 py-2 shadow-xl shadow-black/10 backdrop-blur-xl">
        {NAV_ITEMS.map(({ to, label, icon: Icon }) => (
          <Link
            key={to}
            to={to}
            className="group relative flex items-center gap-1.5 rounded-full px-3 py-2 text-sm text-muted-foreground transition-all duration-200 hover:text-foreground data-[status=active]:bg-secondary data-[status=active]:text-foreground"
          >
            <Icon size={17} strokeWidth={1.75} />
            <span className="max-w-0 overflow-hidden whitespace-nowrap transition-all duration-200 group-data-[status=active]:max-w-[4rem]">
              {label}
            </span>
          </Link>
        ))}
      </div>
    </nav>
  );
}
