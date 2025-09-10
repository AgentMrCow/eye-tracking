import TestsSearchTable from "./TestsSearchTable";

export default function DataTogglePanel() {
  return (
    <div class="space-y-4">
      <h1 class="text-2xl font-semibold">Data Toggle Panel</h1>
      <p class="text-sm text-muted-foreground">Search and toggle Test × Recording × Participant. Disabled rows are excluded in backend queries.</p>
      <TestsSearchTable />
    </div>
  );
}
