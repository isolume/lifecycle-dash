interface PaginationControlsProps {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  maxVisiblePages?: number;
}

function getVisiblePages(currentPage: number, totalPages: number, maxVisiblePages: number): number[] {
  const visibleCount = Math.max(1, Math.min(maxVisiblePages, totalPages));
  const half = Math.floor(visibleCount / 2);
  const start = Math.max(1, Math.min(currentPage - half, totalPages - visibleCount + 1));
  return Array.from({ length: visibleCount }, (_, index) => start + index);
}

export function PaginationControls({
  currentPage,
  totalPages,
  onPageChange,
  maxVisiblePages = 6,
}: PaginationControlsProps) {
  const pages = getVisiblePages(currentPage, totalPages, maxVisiblePages);
  const canGoPrev = currentPage > 1;
  const canGoNext = currentPage < totalPages;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        className="btn btn-secondary btn-sm"
        disabled={!canGoPrev}
        onClick={() => onPageChange(1)}
      >
        First
      </button>
      <button
        type="button"
        className="btn btn-secondary btn-sm"
        disabled={!canGoPrev}
        onClick={() => onPageChange(currentPage - 1)}
      >
        Previous
      </button>

      {pages.map((pageNumber) => {
        const active = pageNumber === currentPage;
        return (
          <button
            key={pageNumber}
            type="button"
            className={`btn btn-sm ${active ? "border-accent bg-accent text-white" : "btn-secondary"}`}
            disabled={active}
            onClick={() => onPageChange(pageNumber)}
            aria-label={`Go to page ${pageNumber}`}
            aria-current={active ? "page" : undefined}
          >
            {pageNumber}
          </button>
        );
      })}

      <button
        type="button"
        className="btn btn-secondary btn-sm"
        disabled={!canGoNext}
        onClick={() => onPageChange(currentPage + 1)}
      >
        Next
      </button>
      <button
        type="button"
        className="btn btn-secondary btn-sm"
        disabled={!canGoNext}
        onClick={() => onPageChange(totalPages)}
      >
        Last
      </button>
    </div>
  );
}
