import { For, Show, createSignal } from "solid-js";
import type { ColumnDef, SortingState, ColumnFiltersState, VisibilityState } from "@tanstack/solid-table";
import {
  createSolidTable,
  flexRender,
  getCoreRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  getFilteredRowModel,
} from "@tanstack/solid-table";

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { TextField, TextFieldInput } from "@/components/ui/text-field";
import { Button } from "@/components/ui/button";
import { ChevronDown } from "lucide-solid";

// Keep this component generic so we can reuse it later if needed
export function DataTable<TData, TValue>(props: { columns: ColumnDef<TData, TValue>[]; data: TData[] }) {
  const [sorting, setSorting] = createSignal<SortingState>([]);
  const [filters, setFilters] = createSignal<ColumnFiltersState>([]);
  const [visibility, setVisibility] = createSignal<VisibilityState>({});
  const [rowSel, setRowSel] = createSignal({});

  const table = createSolidTable({
    get data() { return props.data; },
    get columns() { return props.columns; },
    onSortingChange: setSorting,
    onColumnFiltersChange: setFilters,
    onColumnVisibilityChange: setVisibility,
    onRowSelectionChange: setRowSel,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    state: {
      get sorting() { return sorting(); },
      get columnFilters() { return filters(); },
      get columnVisibility() { return visibility(); },
      get rowSelection() { return rowSel(); },
    },
  });

  return (
    <div class="w-full">
      <div class="flex items-center py-4">
        {/* quick filter by test */}
        <TextField
          value={(table.getColumn("test")?.getFilterValue() as string) ?? ""}
          onChange={(v) => table.getColumn("test")?.setFilterValue(v)}
        >
          <TextFieldInput placeholder="Filter tests..." class="max-w-sm" />
        </TextField>

        {/* visibility toggle */}
        <DropdownMenu placement="bottom-end">
          <DropdownMenuTrigger as={Button<"button">} variant="outline" class="ml-auto">
            Columns <ChevronDown class="ml-1 h-4 w-4" />
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuLabel>Toggle columns</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <For each={table.getAllLeafColumns()}>
              {(col) => (
                <DropdownMenuCheckboxItem
                  class="capitalize"
                  checked={col.getIsVisible()}
                  onChange={(v) => col.toggleVisibility(!!v)}
                >
                  {col.id}
                </DropdownMenuCheckboxItem>
              )}
            </For>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div class="rounded-md border">
        <Table>
          <TableHeader>
            <For each={table.getHeaderGroups()}>
              {(hg) => (
                <TableRow>
                  <For each={hg.headers}>
                    {(header) => (
                      <TableHead>
                        {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
                      </TableHead>
                    )}
                  </For>
                </TableRow>
              )}
            </For>
          </TableHeader>
          <TableBody>
            <Show
              when={table.getRowModel().rows?.length}
              fallback={
                <TableRow>
                  <TableCell colSpan={props.columns.length} class="h-24 text-center">
                    No results.
                  </TableCell>
                </TableRow>
              }
            >
              <For each={table.getRowModel().rows}>
                {(row) => (
                  <TableRow data-state={row.getIsSelected() && "selected"}>
                    <For each={row.getVisibleCells()}>
                      {(cell) => <TableCell>{flexRender(cell.column.columnDef.cell, cell.getContext())}</TableCell>}
                    </For>
                  </TableRow>
                )}
              </For>
            </Show>
          </TableBody>
        </Table>
      </div>

      <div class="flex items-center justify-end space-x-2 py-4">
        <div class="flex-1 text-sm text-muted-foreground">
          {table.getFilteredSelectedRowModel().rows.length} of {table.getFilteredRowModel().rows.length} row(s) selected.
        </div>
        <div class="space-x-2">
          <Button variant="outline" size="sm" onClick={() => table.previousPage()} disabled={!table.getCanPreviousPage()}>
            Previous
          </Button>
          <Button variant="outline" size="sm" onClick={() => table.nextPage()} disabled={!table.getCanNextPage()}>
            Next
          </Button>
        </div>
      </div>
    </div>
  );
}

export default DataTable;
