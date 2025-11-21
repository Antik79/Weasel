import { useState, useMemo, ReactNode } from "react";
import { ArrowUp, ArrowDown } from "lucide-react";

export type SortDirection = "asc" | "desc" | null;

export interface TableColumn<T> {
  key: string;
  label: string;
  sortable?: boolean;
  render?: (item: T) => ReactNode;
  sortFn?: (a: T, b: T) => number;
}

interface TableProps<T> {
  data: T[];
  columns: TableColumn<T>[];
  keyExtractor: (item: T) => string | number;
  isLoading?: boolean;
  emptyMessage?: string;
  className?: string;
  headerClassName?: string;
  rowClassName?: string | ((item: T) => string);
  maxHeight?: string;
}

export default function Table<T>({
  data,
  columns,
  keyExtractor,
  isLoading = false,
  emptyMessage = "No data available",
  className = "",
  headerClassName = "",
  rowClassName = "",
  maxHeight = "max-h-96"
}: TableProps<T>) {
  const [sortColumn, setSortColumn] = useState<string | null>(null);
  const [sortDirection, setSortDirection] = useState<SortDirection>(null);

  const sortedData = useMemo(() => {
    if (!sortColumn || !sortDirection) return data;

    const column = columns.find((col) => col.key === sortColumn);
    if (!column || !column.sortable) return data;

    const sorted = [...data].sort((a, b) => {
      if (column.sortFn) {
        return column.sortFn(a, b);
      }
      // Default string/number comparison
      const aVal = (a as any)[sortColumn];
      const bVal = (b as any)[sortColumn];
      if (aVal === bVal) return 0;
      if (aVal == null) return 1;
      if (bVal == null) return -1;
      if (typeof aVal === "string" && typeof bVal === "string") {
        return aVal.localeCompare(bVal);
      }
      return aVal < bVal ? -1 : 1;
    });

    return sortDirection === "asc" ? sorted : sorted.reverse();
  }, [data, sortColumn, sortDirection, columns]);

  const handleSort = (columnKey: string) => {
    const column = columns.find((col) => col.key === columnKey);
    if (!column || !column.sortable) return;

    if (sortColumn === columnKey) {
      if (sortDirection === "asc") {
        setSortDirection("desc");
      } else if (sortDirection === "desc") {
        setSortColumn(null);
        setSortDirection(null);
      } else {
        setSortDirection("asc");
      }
    } else {
      setSortColumn(columnKey);
      setSortDirection("asc");
    }
  };

  const getRowClassName = (item: T): string => {
    if (typeof rowClassName === "function") {
      return rowClassName(item);
    }
    return rowClassName || "";
  };

  return (
    <div className={`overflow-auto border border-slate-800 rounded-lg ${maxHeight} ${className}`}>
      <table className="w-full text-sm">
        <thead className={`bg-slate-900 text-slate-400 text-xs uppercase sticky top-0 z-10 border-b border-slate-800 ${headerClassName}`}>
          <tr>
            {columns.map((column) => (
              <th
                key={column.key}
                className={`px-3 py-2 text-left ${
                  column.sortable ? "cursor-pointer hover:text-white select-none" : ""
                }`}
                onClick={() => column.sortable && handleSort(column.key)}
              >
                <div className="flex items-center gap-2">
                  <span>{column.label}</span>
                  {column.sortable && sortColumn === column.key && (
                    <span className="text-sky-400">
                      {sortDirection === "asc" ? (
                        <ArrowUp size={14} />
                      ) : (
                        <ArrowDown size={14} />
                      )}
                    </span>
                  )}
                </div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-800">
          {isLoading && (
            <tr>
              <td colSpan={columns.length} className="px-3 py-4 text-center text-slate-400">
                Loading…
              </td>
            </tr>
          )}
          {!isLoading && sortedData.length === 0 && (
            <tr>
              <td colSpan={columns.length} className="px-3 py-4 text-center text-slate-400">
                {emptyMessage}
              </td>
            </tr>
          )}
          {!isLoading &&
            sortedData.map((item) => (
              <tr
                key={keyExtractor(item)}
                className={`border-t border-slate-800 hover:bg-slate-900/60 ${getRowClassName(item)}`}
              >
                {columns.map((column) => (
                  <td key={column.key} className="px-3 py-2">
                    {column.render ? column.render(item) : (item as any)[column.key]}
                  </td>
                ))}
              </tr>
            ))}
        </tbody>
      </table>
    </div>
  );
}

