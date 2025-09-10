// src/App.tsx
import { lazy } from 'solid-js';
import { Router, Route } from "@solidjs/router";
import { AppSidebar } from "@/components/app-sidebar";
import { SidebarProvider } from "@/components/ui/sidebar";
import GlobalLoadingBar from "@/components/ui/global-loading-bar";
import type { RouteSectionProps } from "@solidjs/router";

// Lazy load components
const GazeAnalysis = lazy(() =>
  import("@/features/gaze").then(m => ({ default: m.GazeAnalysis }))
);
const CatalogCompare = lazy(() =>
  import("@/features/catalog").then(m => ({ default: m.CatalogCompare }))
);
const DataTogglePanel = lazy(() =>
  import("@/features/toggles").then(m => ({ default: m.DataTogglePanel }))
);
const Dashboard = lazy(() =>
  import("@/features/dashboard").then(m => ({ default: m.Dashboard }))
);
const NotFound    = lazy(() =>
  import("@/components/not-found").then(m => ({ default: m.default }))
);

function Layout(props: RouteSectionProps<unknown>) {
  return (
    <SidebarProvider>
      <GlobalLoadingBar />
      <div class="flex h-screen w-full">
        <AppSidebar />
        <main class="flex-1 min-w-0 overflow-auto bg-background">
          <div class="container p-6">
            {props.children}
          </div>
        </main>
      </div>
    </SidebarProvider>
  );
}

export default function App() {
  return (
    <Router>
      <Route path="/" component={Layout}>
        <Route path="/" component={Dashboard} />
        <Route path="/gaze" component={GazeAnalysis} />
        {/* NEW page */}
        <Route path="/compare" component={CatalogCompare} />
        <Route path="/data-toggle" component={DataTogglePanel} />
        {/* dedicated pages */}
        <Route path="/stats" component={lazy(() => import("@/features/stats").then(m => ({ default: m.StatsPage })))} />
        <Route path="/participants" component={lazy(() => import("@/features/participants").then(m => ({ default: m.ParticipantsPage })))} />
        <Route path="/settings" component={lazy(() => import("@/features/settings").then(m => ({ default: m.SettingsPage })))} />
        {/* Catch-all route for 404 */}
        <Route path="*" component={NotFound} />
      </Route>
    </Router>
  );
}
