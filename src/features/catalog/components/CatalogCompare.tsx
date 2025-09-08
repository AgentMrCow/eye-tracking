import { createMemo } from "solid-js";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { CircleHelp, Settings2 } from "lucide-solid";

/* state + hooks */
import { useCatalogState } from "../hooks/useCatalogState";
import { usePlayback } from "../hooks/usePlayback";
import { useSeries } from "../hooks/useSeries";

/* pieces */
import FiltersBar from "./FiltersBar";
import AoISelects from "./AoISelects";
import ThresholdsBar from "./ThresholdsBar";
import SummaryCards from "./SummaryCards";
import ComparePanels from "./ComparePanels";
import DataTable from "./DetailsTable";

/* table columns */
import type { ColumnDef } from "@tanstack/solid-table";
import type { DetailedRow } from "../types";

const makeColumns = (): ColumnDef<DetailedRow>[] => [
  { accessorKey: "test", header: "Test" },
  { accessorKey: "group", header: "Group" },
  { accessorKey: "truth", header: "Truth" },
  { accessorKey: "series", header: "Series" },
  { accessorKey: "morph", header: "Morph" },
  { accessorKey: "pos", header: "Pos" },
  { accessorKey: "case_no", header: "Case" },
  { accessorKey: "participant", header: "Participant" },
  { accessorKey: "recording", header: "Recording" },
  {
    accessorKey: "valid",
    header: "Valid",
    cell: (p) => <div class="text-right tabular-nums">{Number(p.row.getValue("valid")).toLocaleString()}</div>,
  },
  {
    accessorKey: "total",
    header: "Total",
    cell: (p) => <div class="text-right tabular-nums">{Number(p.row.getValue("total")).toLocaleString()}</div>,
  },
  {
    accessorKey: "pctBlue",
    header: () => <div class="text-right">% in blue</div>,
    cell: (p) => <div class="text-right tabular-nums">{Number(p.row.getValue("pctBlue")).toFixed(1)}%</div>,
  },
];

export default function CatalogCompare() {
  const S = useCatalogState();
  const PB = usePlayback();

  /* pass AOI sets to compare-panel builder */
  const getSetsFor = (testName: string) => S.currentSetsFor(testName);

  const counts = createMemo(() => ({
    tests: S.tests().length,
    participants: S.participants().length,
  }));

  return (
    <div class="space-y-6">
      <Card>
        <CardHeader class="flex flex-col gap-2">
          <CardTitle class="flex items-center gap-2">
            <Settings2 class="h-5 w-5" /> Catalog Comparison
          </CardTitle>
        </CardHeader>
        <CardContent class="space-y-3">
          <FiltersBar
            groups={S.groups()} truths={S.truths()} poss={S.poss()} morphs={S.morphs()} series={S.series()} cases={S.cases()}
            groupF={S.groupF()} setGroupF={S.setGroupF}
            truthF={S.truthF()} setTruthF={S.setTruthF}
            posF={S.posF()} setPosF={S.setPosF}
            morphF={S.morphF()} setMorphF={S.setMorphF}
            seriesF={S.seriesF()} setSeriesF={S.setSeriesF}
            caseF={S.caseF()} setCaseF={S.setCaseF}
          />

          <AoISelects
            blueKeys={S.blueKeys()} setBlueKeys={S.setBlueKeys}
            redKeys={S.redKeys()} setRedKeys={S.setRedKeys}
            redCustom={S.redCustom()} setRedCustom={S.setRedCustom}
            invalidCats={S.invalidCats()} setInvalidCats={S.setInvalidCats}
          />

          <ThresholdsBar
            minValidPct={S.minValidPct()} setMinValidPct={S.setMinValidPct}
            thresholdPct={S.thresholdPct()} setThresholdPct={S.setThresholdPct}
            aggMode={S.aggMode()} setAggMode={S.setAggMode}
            busy={S.busy()} onCompute={S.compute}
            counts={counts()}
          />
        </CardContent>
      </Card>

      <SummaryCards
        title={S.firstCardTitle()}
        pieData={S.pieData()}
        thresholdPct={S.thresholdPct()}
        aggMode={S.aggMode()}
        compareBy={S.compareBy()}
        rows={S.rows()}
      />

      <ComparePanels
        testNames={S.testNames()}
        participants={S.participants()}
        getSetsFor={getSetsFor}
        invalidCats={S.invalidCats()}
        // playback wiring
        duration={PB.duration} setDuration={PB.setDuration}
        playSec={PB.playSec} setPlaySec={PB.setPlaySec}
        isPlaying={PB.isPlaying} play={PB.play} pause={PB.pause} stop={PB.stop} scrub={PB.scrub}
        // series hook
        useSeries={useSeries}
      />

      <Card>
        <CardHeader>
          <CardTitle>Detailed Rows (test × participant)</CardTitle>
        </CardHeader>
        <CardContent>
          <DataTable columns={makeColumns()} data={S.rows()} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle class="flex items-center gap-2">
            <CircleHelp class="w-5 h-5" /> Notes
          </CardTitle>
        </CardHeader>
        <CardContent class="prose prose-sm max-w-none text-muted-foreground">
          <ul class="list-disc pl-5 space-y-2">
            <li><b>Progressive draw</b>: line charts clip to the current time so curves are “traced” as playback advances.</li>
            <li><b>% Valid</b> shows (per bin) the proportion of samples not in excluded invalid categories.</li>
            <li><b>Stimulus overlays</b> share the same playhead and hue-by-time logic as the gaze analysis screen.</li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
