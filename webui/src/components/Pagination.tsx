import { ChevronLeft, ChevronRight } from "lucide-react";

interface PaginationProps {
  currentPage: number;
  totalItems: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  onPageSizeChange?: (size: number) => void;
}

export default function Pagination({ currentPage, totalItems, pageSize, onPageChange, onPageSizeChange }: PaginationProps) {
  // When pageSize is 0 (All), show all items on one page
  const totalPages = pageSize === 0 ? 1 : Math.ceil(totalItems / pageSize);

  return (
    <div className="flex items-center justify-between px-2 py-1.5 border-t border-slate-800">
      {/* Left side: Page navigation */}
      <div className="flex items-center gap-1">
        {totalPages > 1 && pageSize !== 0 && (
          <>
            <button
              className="p-1 rounded hover:bg-slate-700 disabled:opacity-30 disabled:cursor-not-allowed"
              onClick={() => onPageChange(currentPage - 1)}
              disabled={currentPage === 1}
              title="Previous page"
            >
              <ChevronLeft size={16} />
            </button>
            <span className="text-xs text-slate-400 min-w-[60px] text-center">
              {currentPage} / {totalPages}
            </span>
            <button
              className="p-1 rounded hover:bg-slate-700 disabled:opacity-30 disabled:cursor-not-allowed"
              onClick={() => onPageChange(currentPage + 1)}
              disabled={currentPage >= totalPages}
              title="Next page"
            >
              <ChevronRight size={16} />
            </button>
          </>
        )}
        {(totalPages <= 1 || pageSize === 0) && (
          <span className="text-xs text-slate-500">
            {totalItems} items
          </span>
        )}
      </div>

      {/* Right side: Page size selector */}
      {onPageSizeChange && (
        <select
          className="bg-slate-800 border border-slate-700 rounded text-xs py-1 px-2 focus:outline-none focus:border-slate-600"
          value={pageSize}
          onChange={(e) => {
            const newSize = parseInt(e.target.value);
            onPageSizeChange(newSize);
            onPageChange(1);
          }}
          title="Items per page"
        >
          <option value="25">25</option>
          <option value="50">50</option>
          <option value="100">100</option>
          <option value="0">All</option>
        </select>
      )}
    </div>
  );
}
