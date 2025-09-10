import { For, Show, createMemo, createSignal } from "solid-js";
import type { ColumnDef, ColumnFiltersState, SortingState, VisibilityState } from "@tanstack/solid-table";
import { createSolidTable, flexRender, getCoreRowModel, getFilteredRowModel, getSortedRowModel } from "@tanstack/solid-table";
import type { SearchSliceRow } from "@/shared/type";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { isLoading } from "@/shared/loading";
import { TextField, TextFieldInput } from "@/components/ui/text-field";
import { searchSlices } from "@/features/toggles/services/searchApi";
import { useDisabledSlices } from "@/features/toggles/hooks/useDisabledSlices";

const durationFmt = (n?: number | null) => (n == null ? "" : `${n.toFixed(2)}s`);

export default function TestsSearchTable() {
  const [sorting, setSorting] = createSignal<SortingState>([]);
  const [columnFilters, setColumnFilters] = createSignal<ColumnFiltersState>([]);
  const [columnVisibility, setColumnVisibility] = createSignal<VisibilityState>({});
  const [rows, setRows] = createSignal<SearchSliceRow[]>([]);
  const [q, setQ] = createSignal("");
  const [onlyDisabled, setOnlyDisabled] = createSignal(false);

  const S = useDisabledSlices();
  (async () => setRows(await searchSlices()))();

  const columns: ColumnDef<SearchSliceRow>[] = [
    {
      accessorKey: "test_name",
      header: (props) => {
        const dir = props.column.getIsSorted();
        const mark = dir === "asc" ? "^" : dir === "desc" ? "v" : "-";
        return (
          <Button variant="ghost" onClick={() => props.column.toggleSorting(props.column.getIsSorted() === "asc")}>
            Test Name <span class="ml-1">{mark}</span>
          </Button>
        );
      },
      cell: (props) => <div class="font-medium">{props.row.getValue("test_name")}</div>,
    },
    {
      accessorKey: "participant_name",
      header: (props) => {
        const dir = props.column.getIsSorted();
        const mark = dir === "asc" ? "^" : dir === "desc" ? "v" : "-";
        return (
          <Button variant="ghost" onClick={() => props.column.toggleSorting(props.column.getIsSorted() === "asc")}>
            Participant <span class="ml-1">{mark}</span>
          </Button>
        );
      },
    },
    {
      accessorKey: "recording_name",
      header: (props) => {
        const dir = props.column.getIsSorted();
        const mark = dir === "asc" ? "^" : dir === "desc" ? "v" : "-";
        return (
          <Button variant="ghost" onClick={() => props.column.toggleSorting(props.column.getIsSorted() === "asc")}>
            Recording <span class="ml-1">{mark}</span>
          </Button>
        );
      },
    },
    {
      accessorKey: "group",
      header: (props) => {
        const dir = props.column.getIsSorted();
        const mark = dir === "asc" ? "^" : dir === "desc" ? "v" : "-";
        return (
          <Button variant="ghost" onClick={() => props.column.toggleSorting(props.column.getIsSorted() === "asc")}>
            Group <span class="ml-1">{mark}</span>
          </Button>
        );
      },
    },
    {
      accessorKey: "image_name",
      header: (props) => {
        const dir = props.column.getIsSorted();
        const mark = dir === "asc" ? "^" : dir === "desc" ? "v" : "-";
        return (
          <Button variant="ghost" onClick={() => props.column.toggleSorting(props.column.getIsSorted() === "asc")}>
            Image Name <span class="ml-1">{mark}</span>
          </Button>
        );
      },
    },
    {
      accessorKey: "sentence",
      header: (props) => {
        const dir = props.column.getIsSorted();
        const mark = dir === "asc" ? "^" : dir === "desc" ? "v" : "-";
        return (
          <Button variant="ghost" onClick={() => props.column.toggleSorting(props.column.getIsSorted() === "asc")}>
            Sentence <span class="ml-1">{mark}</span>
          </Button>
        );
      },
    },
    {
      accessorKey: "pair_duration_seconds",
      header: (props) => {
        const dir = props.column.getIsSorted();
        const mark = dir === "asc" ? "^" : dir === "desc" ? "v" : "-";
        return (
          <Button variant="ghost" onClick={() => props.column.toggleSorting(props.column.getIsSorted() === "asc")}>
            Pair Duration <span class="ml-1">{mark}</span>
          </Button>
        );
      },
      cell: (props) => <div class="tabular-nums">{durationFmt(props.row.getValue("pair_duration_seconds") as number | null)}</div>,
    },
    {
      id: "toggle",
      header: "Status",
      cell: (props) => {
        const r = props.row.original;
        const disabled = () => S.isDisabled({ test_name: r.test_name, recording_name: r.recording_name, participant_name: r.participant_name });
        return (
          <label class="inline-flex items-center gap-2">
            <input type="checkbox" checked={disabled()} onChange={(e) => S.setSlice({ test_name: r.test_name, recording_name: r.recording_name, participant_name: r.participant_name }, e.currentTarget.checked)} />
            <span>{disabled() ? 'Disabled' : 'Enabled'}</span>
          </label>
        );
      },
      enableSorting: false,
      enableHiding: false,
    },
  ];

  const filtered = createMemo(() => {
    const term = q().toLowerCase().trim();
    let out = rows();
    if (term) {
      out = out.filter(r => [r.test_name, r.participant_name, r.recording_name, r.group ?? "", r.image_name ?? "", r.sentence ?? ""].some(v => (v).toLowerCase().includes(term)));
    }
    if (onlyDisabled()) {
      out = out.filter(r => S.isDisabled({ test_name: r.test_name, recording_name: r.recording_name, participant_name: r.participant_name }));
    }
    return out;
  });

  const table = createSolidTable({
    get data() { return filtered(); },
    get columns() { return columns; },
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onColumnVisibilityChange: setColumnVisibility,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    state: {
      get sorting() { return sorting(); },
      get columnFilters() { return columnFilters(); },
      get columnVisibility() { return columnVisibility(); },
    },
  });

  return (
    <div class="space-y-3">
      <div class="flex items-center gap-2 py-2 flex-wrap">
        <TextField value={q()} onChange={setQ}>
          <TextFieldInput placeholder="Search all…" class="max-w-sm" />
        </TextField>
        <TextField value={(table.getColumn("test_name")?.getFilterValue() as string) ?? ""} onChange={(v) => table.getColumn("test_name")?.setFilterValue(v)}>
          <TextFieldInput placeholder="Filter test_name…" class="max-w-sm" />
        </TextField>
        <TextField value={(table.getColumn("participant_name")?.getFilterValue() as string) ?? ""} onChange={(v) => table.getColumn("participant_name")?.setFilterValue(v)}>
          <TextFieldInput placeholder="Filter participant…" class="max-w-sm" />
        </TextField>
        <TextField value={(table.getColumn("recording_name")?.getFilterValue() as string) ?? ""} onChange={(v) => table.getColumn("recording_name")?.setFilterValue(v)}>
          <TextFieldInput placeholder="Filter recording…" class="max-w-sm" />
        </TextField>
        <TextField value={(table.getColumn("group")?.getFilterValue() as string) ?? ""} onChange={(v) => table.getColumn("group")?.setFilterValue(v)}>
          <TextFieldInput placeholder="Filter group…" class="max-w-sm" />
        </TextField>
        <TextField value={(table.getColumn("image_name")?.getFilterValue() as string) ?? ""} onChange={(v) => table.getColumn("image_name")?.setFilterValue(v)}>
          <TextFieldInput placeholder="Filter image…" class="max-w-sm" />
        </TextField>
        <TextField value={(table.getColumn("sentence")?.getFilterValue() as string) ?? ""} onChange={(v) => table.getColumn("sentence")?.setFilterValue(v)}>
          <TextFieldInput placeholder="Filter sentence…" class="max-w-sm" />
        </TextField>
        <label class="inline-flex items-center gap-2 text-sm ml-auto">
          <Checkbox checked={onlyDisabled()} onChange={(v) => setOnlyDisabled(!!v)} />
          Show only disabled
        </label>
        <Button variant="outline" onClick={() => table.resetSorting()}>Reset sort</Button>
        <DropdownMenu placement="bottom-end">
          <DropdownMenuTrigger as={Button<"button">} variant="outline" class="ml-auto">
            Columns
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <For each={table.getAllColumns().filter((c) => c.getCanHide())}>
              {(column) => (
                <DropdownMenuCheckboxItem class="capitalize" checked={column.getIsVisible()} onChange={(value) => column.toggleVisibility(!!value)}>
                  {column.id}
                </DropdownMenuCheckboxItem>
              )}
            </For>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div class="rounded-md border overflow-auto max-h-[65vh] w-full">
        <div class="min-w-[900px]">
        <Table>
          <TableHeader>
            <For each={table.getHeaderGroups()}>
              {(headerGroup) => (
                <TableRow>
                  <For each={headerGroup.headers}>
                    {(header) => (
                      <TableHead>
                        <Show when={!header.isPlaceholder}>
                          {flexRender(header.column.columnDef.header, header.getContext())}
                        </Show>
                      </TableHead>
                    )}
                  </For>
                </TableRow>
              )}
            </For>
          </TableHeader>
          <TableBody>
            <Show when={table.getRowModel().rows?.length} fallback={
              isLoading() ? (
                <>
                  {Array.from({ length: 8 }).map(() => (
                    <TableRow>
                      <TableCell colSpan={columns.length}>
                        <Skeleton class="h-5 w-full" />
                      </TableCell>
                    </TableRow>
                  ))}
                </>
              ) : (
                <TableRow><TableCell colSpan={columns.length} class="h-24 text-center">No results.</TableCell></TableRow>
              )
            }>
              <For each={table.getRowModel().rows}>
                {(row) => (
                  <TableRow data-state={row.getIsSelected() && "selected"}>
                    <For each={row.getVisibleCells()}>
                      {(cell) => (
                        <TableCell>{flexRender(cell.column.columnDef.cell, cell.getContext())}</TableCell>
                      )}
                    </For>
                  </TableRow>
                )}
              </For>
            </Show>
          </TableBody>
        </Table>
        </div>
      </div>
    </div>
  );
}
