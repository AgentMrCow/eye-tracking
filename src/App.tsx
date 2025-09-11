// src/App.tsx
import { lazy, onMount } from 'solid-js';
import { Router, Route } from "@solidjs/router";
import { AppSidebar } from "@/components/app-sidebar";
import { SidebarProvider } from "@/components/ui/sidebar";
import GlobalLoadingBar from "@/components/ui/global-loading-bar";
import GlobalLoadingOverlay from "@/components/ui/global-loading-overlay";
import RouteLoadingTracker from "@/components/ui/route-loading";
import { getStatic } from "@/shared/tauriClient";
import { invoke } from "@tauri-apps/api/core";
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
const AoiReportPage = lazy(() =>
  import("@/features/reports").then(m => ({ default: m.AoiReportPage }))
);
const AdvancedComparePage = lazy(() =>
  import("@/features/advanced").then(m => ({ default: m.AdvancedComparePage }))
);
const NotFound    = lazy(() =>
  import("@/components/not-found").then(m => ({ default: m.default }))
);
const Splashscreen = lazy(() =>
  import("@/features/splash").then(m => ({ default: m.Splashscreen }))
);

function Layout(props: RouteSectionProps<unknown>) {
  return (
    <SidebarProvider>
      <GlobalLoadingBar />
      <GlobalLoadingOverlay />
      <RouteLoadingTracker />
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
  onMount(() => {
    // Preload static data; mark frontend readiness for splash
    (async () => {
      try { await getStatic(); } catch {}
      try { await invoke("set_complete", { task: "frontend" }); } catch {}
    })();
  });
  return (
    <Router>
      {/* Splashscreen window route (no layout) */}
      <Route path="/splashscreen" component={Splashscreen} />
      <Route path="/" component={Layout}>
        <Route path="/" component={Dashboard} />
        <Route path="/gaze" component={GazeAnalysis} />
        {/* NEW page */}
        <Route path="/compare" component={CatalogCompare} />
        <Route path="/data-toggle" component={DataTogglePanel} />
        <Route path="/reports" component={AoiReportPage} />
        <Route path="/advanced" component={AdvancedComparePage} />
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
