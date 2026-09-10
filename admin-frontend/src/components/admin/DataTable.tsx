import { ReactNode, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Search } from "lucide-react";
import { motion } from "framer-motion";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface Column<T> {
  key: string;
  header: string;
  render: (row: T) => ReactNode;
  className?: string;
  searchable?: (row: T) => string;
}

interface Props<T> {
  data: T[];
  columns: Column<T>[];
  rowKey: (row: T) => string;
  pageSize?: number;
  searchPlaceholder?: string;
  toolbar?: ReactNode;
  emptyMessage?: string;
}

export function DataTable<T>({
  data,
  columns,
  rowKey,
  pageSize = 8,
  searchPlaceholder = "Search…",
  toolbar,
  emptyMessage = "No records found",
}: Props<T>) {
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);

  const filtered = useMemo(() => {
    if (!query) return data;
    const q = query.toLowerCase();
    return data.filter((row) =>
      columns.some((c) => {
        const v = c.searchable ? c.searchable(row) : "";
        return v.toLowerCase().includes(q);
      })
    );
  }, [data, query, columns]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const pageData = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);

  return (
    <div className="bg-card border border-border/70 rounded-2xl overflow-hidden shadow-soft ring-1 ring-primary/5">
      <div className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between p-4 border-b border-border/80 bg-gradient-to-r from-primary/[0.04] via-med-sky/[0.04] to-med-mint/[0.04]">
        <div className="relative w-full sm:max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-primary/70" />
          <Input
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setPage(1);
            }}
            placeholder={searchPlaceholder}
            className="pl-9 h-10 bg-background/80 border-border/80 focus-visible:ring-primary/40"
          />
        </div>
        {toolbar}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-muted/60 text-muted-foreground">
              {columns.map((c) => (
                <th
                  key={c.key}
                  className={cn(
                    "text-left font-semibold text-[11px] uppercase tracking-[0.08em] px-4 py-3 whitespace-nowrap",
                    c.className
                  )}
                >
                  {c.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {pageData.map((row, index) => (
              <motion.tr
                key={rowKey(row)}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{
                  duration: 0.28,
                  delay: Math.min(index, 12) * 0.03,
                  ease: [0.22, 1, 0.36, 1],
                }}
                className="border-t border-border/70 hover:bg-primary/[0.03] transition-colors duration-200"
              >
                {columns.map((c) => (
                  <td key={c.key} className={cn("px-4 py-3.5 align-middle", c.className)}>
                    {c.render(row)}
                  </td>
                ))}
              </motion.tr>
            ))}
            {pageData.length === 0 && (
              <tr>
                <td colSpan={columns.length} className="text-center text-muted-foreground py-14">
                  <div className="inline-flex flex-col items-center gap-1">
                    <span className="h-10 w-10 rounded-full bg-mint-soft text-med-mint flex items-center justify-center text-sm font-semibold">
                      0
                    </span>
                    <span>{emptyMessage}</span>
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between p-4 border-t border-border/80 text-sm text-muted-foreground bg-muted/20">
        <span>
          {filtered.length === 0 ? 0 : (safePage - 1) * pageSize + 1}–
          {Math.min(safePage * pageSize, filtered.length)} of {filtered.length}
        </span>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={safePage === 1}
            onClick={() => setPage((p) => p - 1)}
            className="border-border/80"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-foreground font-semibold tabular-nums min-w-[3.5rem] text-center">
            {safePage} / {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={safePage >= totalPages}
            onClick={() => setPage((p) => p + 1)}
            className="border-border/80"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
