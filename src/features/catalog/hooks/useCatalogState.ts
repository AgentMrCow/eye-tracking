import { createEffect, createMemo, createSignal, onMount } from "solid-js";
import type {
  AggMode, AoiKey, BoxTypes, CompareBy, DetailedRow, ParticipantSummary, TestCatalogRow
} from "../types";
import { ALL_AOI_KEYS, AOI_KEY_LABEL } from "../constants";
import { boxesFor, labelForKey, median } from "../utils";
import { getCatalog, getParticipants, getGazeData } from "../services/catalogApi";

export function useCatalogState() {
  /* data */
  const [catalog, setCatalog] = createSignal<TestCatalogRow[]>([]);
  const [participants, setParticipants] = createSignal<string[]>([]);

  /* filters */
  const [groupF, setGroupF] = createSignal("all groups");
  const [truthF, setTruthF] = createSignal("all truth values");
  const [posF, setPosF] = createSignal("all positions");
  const [morphF, setMorphF] = createSignal("all morphemes");
  const [seriesF, setSeriesF] = createSignal("all series");
  const [caseF, setCaseF] = createSignal("all cases");

  /* AOI keys */
  const [blueKeys, setBlueKeys] = createSignal<AoiKey[]>(["correct_AOIs"]);
  const [redKeys, setRedKeys] = createSignal<AoiKey[]>(ALL_AOI_KEYS.filter((k) => k !== "correct_AOIs"));
  const [redCustom, setRedCustom] = createSignal(false);

  const [invalidCats, setInvalidCats] = createSignal<("other" | "missing" | "out_of_screen")[]>(["missing"]);

  const [minValidPct, setMinValidPct] = createSignal(0);
  const [thresholdPct, setThresholdPct] = createSignal(50);

  const [compareBy, setCompareBy] = createSignal<CompareBy[]>(["truth_value"]);
  const [aggMode, setAggMode] = createSignal<AggMode>("discrete");

  /* compute outputs */
  const [busy, setBusy] = createSignal(false);
  const [rows, setRows] = createSignal<DetailedRow[]>([]);
  const [pSummary, setPSummary] = createSignal<ParticipantSummary[]>([]);

  onMount(async () => {
    setCatalog(await getCatalog());
    setParticipants(await getParticipants());
  });

  /* auto-complement red set while not in custom mode */
  createEffect(() => {
    const bk = blueKeys();
    if (redCustom()) return;
    setRedKeys(ALL_AOI_KEYS.filter((k) => !bk.includes(k)));
  });

  /* option lists */
  const groups = createMemo(() => ["all groups", ...Array.from(new Set(catalog().map((r) => r.group || "").filter(Boolean)))]);
  const truths = createMemo(() => ["all truth values", ...Array.from(new Set(catalog().map((r) => r.truth_value || "").filter(Boolean)))]);
  const poss = createMemo(() => ["all positions", ...Array.from(new Set(catalog().map((r) => r.only_position || "").filter(Boolean)))]);
  const morphs = createMemo(() => ["all morphemes", ...Array.from(new Set(catalog().map((r) => r.morpheme || "").filter(Boolean)))]);
  const series = createMemo(() => ["all series", ...Array.from(new Set(catalog().map((r) => r.series || "").filter(Boolean)))]);
  const cases = createMemo(() => {
    const cs = Array.from(new Set(catalog().map((r) => (r.case_no == null ? null : r.case_no))));
    return ["all cases", ...cs.filter((x): x is number => x != null).map(String)];
  });

  /* filtered tests */
  const tests = createMemo(() =>
    catalog().filter(
      (r) =>
        (groupF() === "all groups" || r.group === groupF()) &&
        (truthF() === "all truth values" || r.truth_value === truthF()) &&
        (posF() === "all positions" || r.only_position === posF()) &&
        (morphF() === "all morphemes" || r.morpheme === morphF()) &&
        (seriesF() === "all series" || r.series === seriesF()) &&
        (caseF() === "all cases" || String(r.case_no ?? "") === caseF())
    )
  );
  const testNames = createMemo(() => Array.from(new Set(tests().map((t) => t.test_name))));

  function currentSetsFor(testName: string) {
    const row = catalog().find((r) => r.test_name === testName);
    if (!row) return { blue: new Set<BoxTypes>(), red: new Set<BoxTypes>() };
    const blue = boxesFor(row, blueKeys());
    const rk = redCustom()
      ? redKeys().filter((k) => !blueKeys().includes(k))
      : ALL_AOI_KEYS.filter((k) => !blueKeys().includes(k));
    const red = boxesFor(row, rk);
    return { blue, red };
  }

  async function compute() {
    setBusy(true);
    try {
      const t = tests();
      const parts = participants();
      const invalid = new Set<BoxTypes>(invalidCats() as BoxTypes[]);

      const blueMap = new Map<string, Set<BoxTypes>>();
      const redMap = new Map<string, Set<BoxTypes>>();
      t.forEach((r) => {
        blueMap.set(r.test_name, boxesFor(r, blueKeys()));
        const rk = redCustom()
          ? redKeys().filter((k) => !blueKeys().includes(k))
          : ALL_AOI_KEYS.filter((k) => !blueKeys().includes(k));
        redMap.set(r.test_name, boxesFor(r, rk));
      });

      const out: DetailedRow[] = [];
      for (const row of t) {
        for (const p of parts) {
          const gaze = await getGazeData({ testName: row.test_name, participants: [p] });
          if (!gaze.length) continue;

          const total = gaze.length;
          const invalidCount = gaze.filter((g) => invalid.has(g.box_name as BoxTypes)).length;
          const valid = total - invalidCount;
          const validPct = total ? (valid / total) * 100 : 0;
          if (validPct < minValidPct()) continue;

          let blue = 0, red = 0;
          const blueBoxes = blueMap.get(row.test_name)!;
          const redBoxes  = redMap.get(row.test_name)!;

          for (const g of gaze) {
            const b = g.box_name as BoxTypes;
            if (invalid.has(b)) continue;
            if (blueBoxes.has(b)) blue++;
            else if (redBoxes.has(b)) red++;
          }
          const denom = blue + red;
          const pctBlue = denom ? (blue / denom) * 100 : 0;

          out.push({
            test: row.test_name,
            group: row.group ?? null,
            truth: row.truth_value ?? null,
            series: row.series ?? null,
            morph: row.morpheme ?? null,
            pos: row.only_position ?? null,
            case_no: row.case_no ?? null,
            participant: gaze[0].participant,
            recording: gaze[0].recording,
            valid,
            total,
            blue,
            red,
            pctBlue,
          });
        }
      }

      setRows(out);

      const byP = new Map<string, { pcts: number[]; blue: number; red: number }>();
      out.forEach((r) => {
        const rec = byP.get(r.participant) ?? { pcts: [], blue: 0, red: 0 };
        rec.pcts.push(r.pctBlue);
        rec.blue += r.blue;
        rec.red  += r.red;
        byP.set(r.participant, rec);
      });

      const ps: ParticipantSummary[] = [];
      byP.forEach((acc, key) => {
        const meanPct = acc.pcts.length ? acc.pcts.reduce((a, b) => a + b, 0) / acc.pcts.length : 0;
        const den = acc.blue + acc.red;
        const weightedPct = den ? (acc.blue / den) * 100 : 0;
        ps.push({ participant: key, meanPct, weightedPct });
      });
      setPSummary(ps);
    } finally {
      setBusy(false);
    }
  }

  const pieData = createMemo(() => {
    const th = thresholdPct();
    const above = pSummary().filter((p) => (aggMode() === "discrete" ? p.meanPct : p.weightedPct) >= th).length;
    const below = pSummary().length - above;
    return { labels: ["≥ threshold", "< threshold"], datasets: [{ data: [above, below] }] };
  });

  function firstCardTitle() {
    const lbls = blueKeys().map((k) => labelForKey(k, AOI_KEY_LABEL)).join(" + ");
    const mode = aggMode() === "discrete" ? "discrete" : "continuous";
    return `Participants ≥ threshold (${mode}, % in ${lbls})`;
  }

  return {
    // data
    catalog, participants,

    // filters + options
    groupF, setGroupF, truthF, setTruthF, posF, setPosF, morphF, setMorphF, seriesF, setSeriesF, caseF, setCaseF,
    groups, truths, poss, morphs, series, cases,

    // AOI keys
    blueKeys, setBlueKeys, redKeys, setRedKeys, redCustom, setRedCustom,

    // invalid + thresholds
    invalidCats, setInvalidCats, minValidPct, setMinValidPct, thresholdPct, setThresholdPct,

    // compare
    compareBy, setCompareBy, aggMode, setAggMode,

    // tests
    tests, testNames,

    // compute + outputs
    busy, compute, rows, pSummary, pieData, firstCardTitle,

    // helpers
    currentSetsFor,
  };
}
