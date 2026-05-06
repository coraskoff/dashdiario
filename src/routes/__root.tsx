import {
  Outlet,
  Link,
  createRootRouteWithContext,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/sonner";
import { CheckSquare, Wallet, BookOpen } from "lucide-react";

import appCss from "../styles.css?url";

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
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Foco" },
      {
        name: "description",
        content:
          "Gestão pessoal simples e elegante: organize suas tarefas e controle suas finanças em um só lugar.",
      },
      { property: "og:title", content: "Foco" },
      {
        property: "og:description",
        content: "Gestão pessoal simples e elegante para tarefas e finanças.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "theme-color", content: "#ffffff" },
      { name: "apple-mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-title", content: "Dash" },
      { name: "apple-mobile-web-app-status-bar-style", content: "default" },
      { name: "twitter:title", content: "Foco" },
      { name: "description", content: "Manage tasks and finances with this personal productivity app." },
      { property: "og:description", content: "Manage tasks and finances with this personal productivity app." },
      { name: "twitter:description", content: "Manage tasks and finances with this personal productivity app." },
      { property: "og:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/77a7da8a-e506-45bd-909f-7e2a619ac6dc/id-preview-a7edfe6d--103f1b89-8b2d-40b4-b63e-d234c9a13499.lovable.app-1777289344486.png" },
      { name: "twitter:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/77a7da8a-e506-45bd-909f-7e2a619ac6dc/id-preview-a7edfe6d--103f1b89-8b2d-40b4-b63e-d234c9a13499.lovable.app-1777289344486.png" },
    ],
    links: [
      {
        rel: "stylesheet",
        href: appCss,
      },
      { rel: "manifest", href: "/manifest.webmanifest" },
      { rel: "apple-touch-icon", href: "/apple-touch-icon.png" },
      { rel: "icon", type: "image/png", sizes: "192x192", href: "/icon-192.png" },
      { rel: "icon", type: "image/png", sizes: "512x512", href: "/icon-512.png" },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
});

function RootShell({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

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
  return (
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
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-6 py-10 pb-28 md:pb-10">{children}</main>
      <MobileNav />
    </div>
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
