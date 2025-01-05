// src/App.tsx
import { lazy } from 'solid-js';
import { Router, Route } from "@solidjs/router";
import { AppSidebar } from "@/components/app-sidebar";
import { SidebarProvider } from "@/components/ui/sidebar";
import type { RouteSectionProps } from "@solidjs/router";

// Lazy load components
const GazeAnalysis = lazy(() => import("@/components/gaze-analysis"));
const NotFound = lazy(() => import("@/components/not-found"));

function Layout(props: RouteSectionProps<unknown>) {
  return (
    <SidebarProvider>
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
      <Route
        path="/"
        component={Layout}
      >
        <Route path="/" component={GazeAnalysis} />
        <Route path="/gaze" component={GazeAnalysis} />
        <Route path="/stats" component={GazeAnalysis} />
        <Route path="/participants" component={GazeAnalysis} />
        <Route path="/settings" component={GazeAnalysis} />
        {/* Catch-all route for 404 */}
        <Route path="*" component={NotFound} />
      </Route>
    </Router>
  );
}