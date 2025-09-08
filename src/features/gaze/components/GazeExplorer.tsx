import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import GazeSelectors from "./GazeSelectors";
import PlaybackBar from "./PlaybackBar";
import TimeSeriesChart from "./TimeSeriesChart";
import StimulusOverlay from "./StimulusOverlay";
import { useGazeState } from "../hooks/useGazeState";

export default function GazeExplorer() {
  const s = useGazeState();

  // points for overlay
  const pts = () => (s.series()?.gaze ?? [])
    .filter(g => g.gaze_x !== null && g.gaze_y !== null && g.box_name !== "missing" && g.box_name !== "out_of_screen")
    .map(g => ({ t: (+new Date(g.timestamp) - (s.series()?.baseMs ?? +new Date(g.timestamp))) / 1000, x: g.gaze_x as number, y: g.gaze_y as number }))
    .sort((a,b) => a.t - b.t);

  return (
    <div class="space-y-6">
      <Card>
        <CardHeader><CardTitle>Gaze Explorer</CardTitle></CardHeader>
        <CardContent class="space-y-3">
          <GazeSelectors
            tests={s.tests()} participants={s.participants()}
            selTest={s.selTest()} setSelTest={(v) => s.setSelTest(v ?? "")}
            selPart={s.selPart()} setSelPart={(v) => s.setSelPart(v ?? "")}
            timelines={s.timelines()} recOpts={s.recOpts()}
            selTimeline={s.selTimeline()} setSelTimeline={(v) => s.setSelTimeline(v ?? "")}
            selRecording={s.selRecording()} setSelRecording={(v) => s.setSelRecording(v ?? "")}
            hasMultiSession={s.timelines().length > 1 || s.recOpts().length > 1}
          />

          <PlaybackBar
            duration={s.pb.duration()} playSec={s.pb.playSec()} isPlaying={s.pb.isPlaying()}
            play={s.pb.play} pause={s.pb.pause} stop={s.pb.stop} scrub={s.pb.scrub}
            binMs={s.binMs} setBinMs={s.setBinMs} viewSec={s.viewSec} setViewSec={s.setViewSec}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Time Series</CardTitle></CardHeader>
        <CardContent>
          <TimeSeriesChart
            datasets={s.series()?.datasets ?? []}
            playSec={s.pb.playSec()}
            viewSec={s.viewSec()}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Stimulus Overlay</CardTitle></CardHeader>
        <CardContent>
          <StimulusOverlay
            imgUrl={s.imgUrl()}
            playSec={s.pb.playSec()}
            duration={s.pb.duration()}
            points={pts()}
          />
          <div class="text-xs text-muted-foreground mt-2">
            {s.currentWord() ? <>Current word: <b>{s.currentWord()}</b></> : "(select a test)"}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
