import { For, Show, createEffect, createMemo, createSignal, untrack, onMount } from "solid-js";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider, SliderFill, SliderThumb, SliderTrack } from "@/components/ui/slider";
import JsonViewer from "@/components/ui/json-viewer";

import { getAllCatalog, getGazeData, getTimelineRecordings } from "@/features/gaze/services/gazeApi";
import { getStatic, getParticipantsTableRaw } from "@/shared/tauriClient";
import { boxesFor } from "@/features/catalog/utils";
import { ALL_AOI_KEYS, AOI_KEY_LABEL } from "@/features/catalog/constants";

interface Session {
  timeline: string;
  recording: string;
}

interface CompareGroup {
  id: string;
  name: string;
  tests: string[];
  participants: string[];
  recordings: string[];
  metaFilters: {
    truthValue: string;
    morpheme: string;
    position: string;
    series: string;
    group: string;
  };
}

export default function AdvancedComparePage() {
  // Global data
  const [catalog, setCatalog] = createSignal<any[]>([]);
  const [tests, setTests] = createSignal<string[]>([]);
  const [participants, setParticipants] = createSignal<string[]>([]);
  const [isQacMap, setIsQacMap] = createSignal<Record<string, boolean>>({});
  const [partsByTest, setPartsByTest] = createSignal<Record<string, string[]>>({});
  const [sessionsByPart, setSessionsByPart] = createSignal<Record<string, Session[]>>({});
  
  // Global selections
  const [globalTests, setGlobalTests] = createSignal<string[]>([]);
  const [globalParticipants, setGlobalParticipants] = createSignal<string[]>([]);
  const [numGroups, setNumGroups] = createSignal<number>(2);
  
  // AOI threshold
  const [thresholdPct, setThresholdPct] = createSignal<number>(50);
  
  // AOI sets selection
  const [blueKeys, setBlueKeys] = createSignal<string[]>(["correct_AOIs"]);
  const [redKeys, setRedKeys] = createSignal<string[]>(ALL_AOI_KEYS.filter(k => k !== "correct_AOIs"));
  const [invalidCats, setInvalidCats] = createSignal<("other" | "missing" | "out_of_screen")[]>(["missing"]);
  
  // Compare groups
  const [compareGroups, setCompareGroups] = createSignal<CompareGroup[]>([
    {
      id: "group1",
      name: "Group 1",
      tests: [],
      participants: [],
      recordings: [],
      metaFilters: {
        truthValue: "all",
        morpheme: "all", 
        position: "all",
        series: "all",
        group: "all"
      }
    },
    {
      id: "group2", 
      name: "Group 2",
      tests: [],
      participants: [],
      recordings: [],
      metaFilters: {
        truthValue: "all",
        morpheme: "all",
        position: "all", 
        series: "all",
        group: "all"
      }
    }
  ]);
  
  // Results
  const [results, setResults] = createSignal<any>(null);
  const [running, setRunning] = createSignal(false);

  // Meta filter options
  const [truthValues, setTruthValues] = createSignal<string[]>([]);
  const [morphemes, setMorphemes] = createSignal<string[]>([]);
  const [positions, setPositions] = createSignal<string[]>([]);
  const [seriesOptions, setSeriesOptions] = createSignal<string[]>([]);
  const [groupOptions, setGroupOptions] = createSignal<string[]>([]);

  // Session management
  const [currentTest, setCurrentTest] = createSignal<string>("");
  const [selParticipants, setSelParticipants] = createSignal<string[]>([]);
  const [selectedSessions, setSelectedSessions] = createSignal<Record<string, string[]>>({});

  // Initialize with onMount and load initial data
  onMount(async () => {
    const [catalogData, participantsData, staticData] = await Promise.all([
      getAllCatalog().catch(() => []),
      getParticipantsTableRaw().catch(() => []),
      getStatic().catch(() => ({ participants_by_test: {}, tests_by_participant: {} }))
    ]);
    
    setCatalog(catalogData);
    setTests(Object.keys(staticData.participants_by_test || {}));
    setParticipants(Object.keys(staticData.tests_by_participant || {}));
    setPartsByTest(staticData.participants_by_test || {});
    
    // Build QAC map
    const qacMap: Record<string, boolean> = {};
    participantsData.forEach((p: any) => {
      qacMap[p.participant] = Boolean(p.is_qac);
    });
    setIsQacMap(qacMap);
    
    // Extract meta filter options from catalog
    const truths = Array.from(new Set(catalogData.map(c => c.truth_value).filter(Boolean)));
    const morphs = Array.from(new Set(catalogData.map(c => c.morpheme).filter(Boolean)));
    const pos = Array.from(new Set(catalogData.map(c => c.only_position).filter(Boolean)));
    const series = Array.from(new Set(catalogData.map(c => c.series).filter(Boolean)));
    const groups = Array.from(new Set(catalogData.map(c => c.group).filter(Boolean)));
    
    setTruthValues(truths as string[]);
    setMorphemes(morphs as string[]);
    setPositions(pos as string[]);
    setSeriesOptions(series as string[]);
    setGroupOptions(groups as string[]);
    
    // Set initial test selection if available
    if (Object.keys(staticData.participants_by_test || {}).length > 0) {
      const firstTest = Object.keys(staticData.participants_by_test || {})[0];
      setCurrentTest(firstTest);
    }
  });

  // Fetch sessions for participants
  createEffect(async () => {
    const gTests = globalTests();
    const gParts = globalParticipants();
    if (!gTests.length || !gParts.length) return;
    
    const sessionMap: Record<string, Session[]> = {};
    
    for (const part of gParts) {
      const allSessions: Session[] = [];
      for (const test of gTests) {
        const sessions = await getTimelineRecordings({ 
          testName: test, 
          participants: [part] 
        }).catch(() => []);
        allSessions.push(...sessions.map(s => ({ timeline: s.timeline, recording: s.recording })));
      }
      sessionMap[part] = allSessions;
    }
    
    setSessionsByPart(sessionMap);
  });

  // Session selection management with untrack to prevent infinite loops
  createEffect(() => {
    const test = currentTest();
    const parts = selParticipants();
    
    if (!test || !parts.length) {
      setSelectedSessions({});
      return;
    }

    const newSessions: Record<string, string[]> = { ...untrack(selectedSessions) };
    const currentSessionsByPart = { ...untrack(sessionsByPart) };
    
    parts.forEach(part => {
      const sessions = currentSessionsByPart[part] || [];
      if (!newSessions[part]) {
        newSessions[part] = sessions.map(s => `${s.timeline}|${s.recording}`);
      }
    });
    
    setSelectedSessions(newSessions);
  });

  // Update number of groups
  createEffect(() => {
    const n = numGroups();
    const current = compareGroups();
    
    if (n > current.length) {
      // Add new groups
      const newGroups = [...current];
      for (let i = current.length; i < n; i++) {
        newGroups.push({
          id: `group${i + 1}`,
          name: `Group ${i + 1}`,
          tests: [],
          participants: [],
          recordings: [],
          metaFilters: {
            truthValue: "all",
            morpheme: "all",
            position: "all",
            series: "all",
            group: "all"
          }
        });
      }
      setCompareGroups(newGroups);
    } else if (n < current.length) {
      // Remove excess groups
      setCompareGroups(current.slice(0, n));
    }
  });

  // Computed values using createMemo for performance
  const filteredTestsByGroup = createMemo(() => {
    const catalogMap = new Map(catalog().map(c => [c.test_name, c]));
    const groupMap = new Map<string, string[]>();
    
    compareGroups().forEach(group => {
      const filtered = globalTests().filter(test => {
        const cat = catalogMap.get(test);
        if (!cat) return true;
        
        const filters = group.metaFilters;
        return (
          (filters.truthValue === "all" || cat.truth_value === filters.truthValue) &&
          (filters.morpheme === "all" || cat.morpheme === filters.morpheme) &&
          (filters.position === "all" || cat.only_position === filters.position) &&
          (filters.series === "all" || cat.series === filters.series) &&
          (filters.group === "all" || cat.group === filters.group)
        );
      });
      groupMap.set(group.id, filtered);
    });
    
    return groupMap;
  });

  // Filtered options for each group
  const getFilteredTests = (group: CompareGroup) => {
    return filteredTestsByGroup().get(group.id) || [];
  };

  const getFilteredParticipants = (group: CompareGroup) => {
    // Filter participants based on selected tests in the group
    if (!group.tests.length) return globalParticipants();
    
    const allowedParts = new Set<string>();
    group.tests.forEach(test => {
      const parts = partsByTest()[test] || [];
      parts.forEach(p => allowedParts.add(p));
    });
    
    return globalParticipants().filter(p => allowedParts.has(p));
  };

  const getFilteredRecordings = (group: CompareGroup) => {
    if (!group.participants.length) return [];
    
    const allRecordings = new Set<string>();
    group.participants.forEach(part => {
      const sessions = sessionsByPart()[part] || [];
      sessions.forEach(s => allRecordings.add(`${part} | ${s.timeline}`));
    });
    
    return Array.from(allRecordings);
  };

  // Update group
  const updateGroup = (groupId: string, updates: Partial<CompareGroup>) => {
    setCompareGroups(groups => 
      groups.map(g => g.id === groupId ? { ...g, ...updates } : g)
    );
  };

  // Generate comparison
  async function generateComparison() {
    setRunning(true);
    setResults(null);
    
    try {
      // Process each group and calculate blue vs red percentages
      const groupResults = [];
      
      for (const group of compareGroups()) {
        if (!group.tests.length || !group.participants.length) continue;
        
        const groupData = [];
        
        for (const test of group.tests) {
          for (const part of group.participants) {
            const sessions = sessionsByPart()[part] || [];
            const relevantSessions = sessions.filter(s => 
              group.recordings.includes(`${part} | ${s.timeline}`)
            );
            
            for (const session of relevantSessions) {
              const gazeData = await getGazeData({
                testName: test,
                participants: [part],
                timeline: session.timeline,
                recording: session.recording
              }).catch(() => []);
              
              if (!gazeData.length) continue;
              
              // Calculate blue vs red percentages
              const catalogRow = catalog().find(c => c.test_name === test);
              if (!catalogRow) continue;
              
              const blueBoxes = new Set(boxesFor(catalogRow, blueKeys()));
              const redBoxes = new Set(boxesFor(catalogRow, redKeys()));
              const invalid = new Set(invalidCats());
              
              let blueCount = 0, redCount = 0, totalValid = 0;
              
              gazeData.forEach(point => {
                const box = point.box_name;
                if (invalid.has(box as "other" | "missing" | "out_of_screen")) return;
                
                totalValid++;
                if (blueBoxes.has(box as any)) blueCount++;
                else if (redBoxes.has(box as any)) redCount++;
              });
              
              if (totalValid > 0) {
                const bluePct = (blueCount / totalValid) * 100;
                const redPct = (redCount / totalValid) * 100;
                const blueOverRed = totalValid > 0 ? bluePct / (bluePct + redPct) * 100 : 0;
                
                groupData.push({
                  test,
                  participant: part,
                  session: `${session.timeline}|${session.recording}`,
                  bluePct,
                  redPct,
                  blueOverRed,
                  aboveThreshold: blueOverRed >= thresholdPct()
                });
              }
            }
          }
        }
        
        groupResults.push({
          group: group.name,
          data: groupData,
          avgBlueOverRed: groupData.length > 0 ? 
            groupData.reduce((sum, d) => sum + d.blueOverRed, 0) / groupData.length : 0,
          aboveThresholdPct: groupData.length > 0 ?
            (groupData.filter(d => d.aboveThreshold).length / groupData.length) * 100 : 0
        });
      }
      
      setResults({ groups: groupResults, threshold: thresholdPct() });
    } catch (error) {
      console.error("Error generating comparison:", error);
    } finally {
      setRunning(false);
    }
  }

  return (
    <div class="space-y-6">
      {/* Global Controls */}
      <Card>
        <CardHeader>
          <CardTitle>Advanced Compare - Cantonese "Only" Comprehension Analysis</CardTitle>
        </CardHeader>
        <CardContent class="space-y-4">
          {/* Global Test Selection */}
          <div class="flex flex-col gap-2">
            <div class="flex items-center justify-between">
              <span class="text-sm font-medium">Global Tests ({tests().length} available)</span>
              <div class="flex gap-1">
                <Button size="sm" variant="outline" onClick={() => setGlobalTests(tests())}>All</Button>
                <Button size="sm" variant="outline" onClick={() => setGlobalTests([])}>None</Button>
              </div>
            </div>
            <div class="space-y-2">
              <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2 max-h-40 overflow-y-auto border rounded p-2">
                <For each={tests()}>
                  {(test) => (
                    <label class="flex items-center space-x-2 text-sm">
                      <input
                        type="checkbox"
                        checked={globalTests().includes(test)}
                        onChange={(e) => {
                          if (e.currentTarget.checked) {
                            setGlobalTests([...globalTests(), test]);
                          } else {
                            setGlobalTests(globalTests().filter(t => t !== test));
                          }
                        }}
                      />
                      <span class="truncate">{test}</span>
                      <span class="text-xs text-muted-foreground">({(partsByTest()[test] || []).length})</span>
                    </label>
                  )}
                </For>
              </div>
            </div>
          </div>

          {/* Global Participant Selection */}
          <div class="flex flex-col gap-2">
            <div class="flex items-center justify-between">
              <span class="text-sm font-medium">Global Participants ({participants().length} available)</span>
              <div class="flex gap-1">
                <Button size="sm" variant="outline" onClick={() => setGlobalParticipants(participants())}>All</Button>
                <Button size="sm" variant="outline" onClick={() => setGlobalParticipants([])}>None</Button>
              </div>
            </div>
            <div class="space-y-2">
              <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2 max-h-40 overflow-y-auto border rounded p-2">
                <For each={participants()}>
                  {(participant) => (
                    <label class="flex items-center space-x-2 text-sm">
                      <input
                        type="checkbox"
                        checked={globalParticipants().includes(participant)}
                        onChange={(e) => {
                          if (e.currentTarget.checked) {
                            setGlobalParticipants([...globalParticipants(), participant]);
                          } else {
                            setGlobalParticipants(globalParticipants().filter(p => p !== participant));
                          }
                        }}
                      />
                      <span class="truncate">{participant}</span>
                      <span class="text-xs text-muted-foreground">({isQacMap()[participant] ? 'QAC' : 'Non-QAC'})</span>
                    </label>
                  )}
                </For>
              </div>
            </div>
          </div>

          {/* Number of Groups */}
          <div class="flex items-center gap-4">
            <span class="text-sm font-medium">Number of Compare Groups:</span>
            <Select
              value={numGroups()}
              onChange={setNumGroups}
              options={[2, 3, 4, 5]}
              itemComponent={(pp) => <SelectItem item={pp.item}>{pp.item.rawValue}</SelectItem>}
            >
              <SelectTrigger class="w-32">
                <SelectValue>{String(numGroups())}</SelectValue>
              </SelectTrigger>
              <SelectContent />
            </Select>
          </div>

          {/* Threshold Slider */}
          <div class="flex items-center gap-4">
            <span class="text-sm font-medium">Blue vs Red Threshold:</span>
            <div class="flex-1 max-w-xs">
              <Slider 
                value={[thresholdPct()]} 
                minValue={0} 
                maxValue={100} 
                step={1}
                onChange={(v) => setThresholdPct(v[0] ?? 50)}
              >
                <SliderTrack><SliderFill /></SliderTrack>
                <SliderThumb />
              </Slider>
            </div>
            <span class="text-sm font-mono w-12">{thresholdPct()}%</span>
          </div>
        </CardContent>
      </Card>

      {/* AOI Configuration */}
      <Card>
        <CardHeader>
          <CardTitle>AOI Configuration</CardTitle>
        </CardHeader>
        <CardContent class="space-y-4">
          {/* Blue AOIs */}
          <div class="flex flex-col gap-2">
            <span class="text-sm font-medium">Blue AOIs (Positive)</span>
            <div class="grid grid-cols-2 gap-2 max-h-32 overflow-y-auto border rounded p-2">
              <For each={ALL_AOI_KEYS}>
                {(key) => (
                  <label class="flex items-center space-x-2 text-sm">
                    <input
                      type="checkbox"
                      checked={blueKeys().includes(key)}
                      onChange={(e) => {
                        if (e.currentTarget.checked) {
                          setBlueKeys([...blueKeys(), key]);
                        } else {
                          setBlueKeys(blueKeys().filter(k => k !== key));
                        }
                      }}
                    />
                    <span class="truncate">{AOI_KEY_LABEL[key as keyof typeof AOI_KEY_LABEL]}</span>
                  </label>
                )}
              </For>
            </div>
          </div>

          {/* Red AOIs */}
          <div class="flex flex-col gap-2">
            <span class="text-sm font-medium">Red AOIs (Negative)</span>
            <div class="grid grid-cols-2 gap-2 max-h-32 overflow-y-auto border rounded p-2">
              <For each={ALL_AOI_KEYS}>
                {(key) => (
                  <label class="flex items-center space-x-2 text-sm">
                    <input
                      type="checkbox"
                      checked={redKeys().includes(key)}
                      onChange={(e) => {
                        if (e.currentTarget.checked) {
                          setRedKeys([...redKeys(), key]);
                        } else {
                          setRedKeys(redKeys().filter(k => k !== key));
                        }
                      }}
                    />
                    <span class="truncate">{AOI_KEY_LABEL[key as keyof typeof AOI_KEY_LABEL]}</span>
                  </label>
                )}
              </For>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Compare Groups */}
      <For each={compareGroups()}>
        {(group) => (
          <Card>
            <CardHeader>
              <CardTitle>{group.name}</CardTitle>
            </CardHeader>
            <CardContent class="space-y-4">
              {/* Group Tests */}
              <div class="flex flex-col gap-2">
                <span class="text-sm font-medium">Tests (filtered by global + meta filters)</span>
                <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2 max-h-40 overflow-y-auto border rounded p-2">
                  <For each={getFilteredTests(group)}>
                    {(test) => (
                      <label class="flex items-center space-x-2 text-sm">
                        <input
                          type="checkbox"
                          checked={group.tests.includes(test)}
                          onChange={(e) => {
                            const next = e.currentTarget.checked
                              ? [...group.tests, test]
                              : group.tests.filter((t) => t !== test);
                            updateGroup(group.id, { tests: next });
                          }}
                        />
                        <span class="truncate">{test}</span>
                      </label>
                    )}
                  </For>
                </div>
              </div>

              {/* Group Participants */}
              <div class="flex flex-col gap-2">
                <span class="text-sm font-medium">Participants (filtered by global + selected tests)</span>
                <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2 max-h-40 overflow-y-auto border rounded p-2">
                  <For each={getFilteredParticipants(group)}>
                    {(participant) => (
                      <label class="flex items-center space-x-2 text-sm">
                        <input
                          type="checkbox"
                          checked={group.participants.includes(participant)}
                          onChange={(e) => {
                            const next = e.currentTarget.checked
                              ? [...group.participants, participant]
                              : group.participants.filter((p) => p !== participant);
                            updateGroup(group.id, { participants: next });
                          }}
                        />
                        <span class="truncate">{participant}</span>
                        <span class="text-xs text-muted-foreground">({isQacMap()[participant] ? 'QAC' : 'Non-QAC'})</span>
                      </label>
                    )}
                  </For>
                </div>
              </div>

              {/* Group Recordings */}
              <div class="flex flex-col gap-2">
                <span class="text-sm font-medium">Recordings (Participant | Timeline)</span>
                <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2 max-h-40 overflow-y-auto border rounded p-2">
                  <For each={getFilteredRecordings(group)}>
                    {(rec) => (
                      <label class="flex items-center space-x-2 text-sm">
                        <input
                          type="checkbox"
                          checked={group.recordings.includes(rec)}
                          onChange={(e) => {
                            const next = e.currentTarget.checked
                              ? [...group.recordings, rec]
                              : group.recordings.filter((r) => r !== rec);
                            updateGroup(group.id, { recordings: next });
                          }}
                        />
                        <span class="truncate">{rec}</span>
                      </label>
                    )}
                  </For>
                </div>
              </div>

              {/* Meta Filters */}
              <div class="grid grid-cols-2 md:grid-cols-3 gap-4">
                <div class="flex flex-col gap-1">
                  <span class="text-xs text-muted-foreground">Truth Value</span>
                  <Select
                    value={group.metaFilters.truthValue}
                    onChange={(truthValue) => updateGroup(group.id, { metaFilters: { ...group.metaFilters, truthValue } })}
                    options={["all", ...truthValues()]}
                    itemComponent={(pp) => <SelectItem item={pp.item}>{pp.item.rawValue}</SelectItem>}
                  >
                    <SelectTrigger class="w-full">
                      <SelectValue>{group.metaFilters.truthValue}</SelectValue>
                    </SelectTrigger>
                    <SelectContent />
                  </Select>
                </div>

                <div class="flex flex-col gap-1">
                  <span class="text-xs text-muted-foreground">Morpheme</span>
                  <Select
                    value={group.metaFilters.morpheme}
                    onChange={(morpheme) => updateGroup(group.id, { metaFilters: { ...group.metaFilters, morpheme } })}
                    options={["all", ...morphemes()]}
                    itemComponent={(pp) => <SelectItem item={pp.item}>{pp.item.rawValue}</SelectItem>}
                  >
                    <SelectTrigger class="w-full">
                      <SelectValue>{group.metaFilters.morpheme}</SelectValue>
                    </SelectTrigger>
                    <SelectContent />
                  </Select>
                </div>

                <div class="flex flex-col gap-1">
                  <span class="text-xs text-muted-foreground">Position</span>
                  <Select
                    value={group.metaFilters.position}
                    onChange={(position) => updateGroup(group.id, { metaFilters: { ...group.metaFilters, position } })}
                    options={["all", ...positions()]}
                    itemComponent={(pp) => <SelectItem item={pp.item}>{pp.item.rawValue}</SelectItem>}
                  >
                    <SelectTrigger class="w-full">
                      <SelectValue>{group.metaFilters.position}</SelectValue>
                    </SelectTrigger>
                    <SelectContent />
                  </Select>
                </div>

                <div class="flex flex-col gap-1">
                  <span class="text-xs text-muted-foreground">Series</span>
                  <Select
                    value={group.metaFilters.series}
                    onChange={(series) => updateGroup(group.id, { metaFilters: { ...group.metaFilters, series } })}
                    options={["all", ...seriesOptions()]}
                    itemComponent={(pp) => <SelectItem item={pp.item}>{pp.item.rawValue}</SelectItem>}
                  >
                    <SelectTrigger class="w-full">
                      <SelectValue>{group.metaFilters.series}</SelectValue>
                    </SelectTrigger>
                    <SelectContent />
                  </Select>
                </div>

                <div class="flex flex-col gap-1">
                  <span class="text-xs text-muted-foreground">Group</span>
                  <Select
                    value={group.metaFilters.group}
                    onChange={(group_val) => updateGroup(group.id, { metaFilters: { ...group.metaFilters, group: group_val } })}
                    options={["all", ...groupOptions()]}
                    itemComponent={(pp) => <SelectItem item={pp.item}>{pp.item.rawValue}</SelectItem>}
                  >
                    <SelectTrigger class="w-full">
                      <SelectValue>{group.metaFilters.group}</SelectValue>
                    </SelectTrigger>
                    <SelectContent />
                  </Select>
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </For>

      {/* Generate Button */}
      <div class="flex justify-center">
        <Button 
          onClick={generateComparison} 
          disabled={running() || !globalTests().length || !globalParticipants().length}
          class="px-8"
        >
          {running() ? "Generating..." : "Generate Comparison"}
        </Button>
      </div>

      {/* Results */}
      <Show when={results()}>
        <Card>
          <CardHeader>
            <CardTitle>Comparison Results</CardTitle>
          </CardHeader>
          <CardContent>
            <JsonViewer data={results()} />
          </CardContent>
        </Card>
      </Show>
    </div>
  );
}
