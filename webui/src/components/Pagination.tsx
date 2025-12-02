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
    <div className="flex items-center justify-between px-4 py-2 border-t border-slate-800">
      <div className="flex items-center gap-2">
        {onPageSizeChange && (
          <>
            <span className="text-xs text-slate-400">Items per page:</span>
            <select
              className="btn-outline text-xs py-1 px-2"
              value={pageSize}
              onChange={(e) => {
                const newSize = parseInt(e.target.value);
                onPageSizeChange(newSize);
                // Reset to page 1 when changing page size
                onPageChange(1);
              }}
            >
              <option value="25">25</option>
              <option value="50">50</option>
              <option value="100">100</option>
              <option value="0">All</option>
            </select>
          </>
        )}
      </div>

      <span className="text-sm text-slate-400">
        {totalPages > 0 ? `Page ${currentPage} of ${totalPages} (${totalItems} items)` : `${totalItems} items`}
      </span>

      {totalPages > 1 && pageSize !== 0 && (
        <div className="flex gap-2">
          <button
            className="btn-outline flex items-center gap-1"
            onClick={() => onPageChange(currentPage - 1)}
            disabled={currentPage === 1}
          >
            <ChevronLeft size={16} />
            Previous
          </button>
          <button
            className="btn-outline flex items-center gap-1"
            onClick={() => onPageChange(currentPage + 1)}
            disabled={currentPage >= totalPages}
          >
            Next
            <ChevronRight size={16} />
          </button>
        </div>
      )}
    </div>
  );
}
