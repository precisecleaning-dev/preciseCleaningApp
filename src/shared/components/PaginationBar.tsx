// src/shared/components/PaginationBar.tsx
// Paginación numerada para una lista ya cargada: "Showing 1–10 of 86 items",
// tamaño de página, anterior / siguiente y páginas con elipsis.
import { useId } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { getPageButtons, getPageRange } from '../utils/pagination';
import './PaginationBar.css';

interface PaginationBarProps {
  page: number;
  pageCount: number;
  pageSize: number;
  pageSizeOptions: readonly number[];
  totalItems: number;
  /** Palabra en plural de lo que se lista ("invoices"). */
  itemLabel: string;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
}

const PaginationBar = ({
  page, pageCount, pageSize, pageSizeOptions, totalItems, itemLabel, onPageChange, onPageSizeChange,
}: PaginationBarProps) => {
  const pageSizeId = useId();
  const { first, last } = getPageRange(totalItems, page, pageSize);
  const pageButtons = getPageButtons(page, pageCount);
  const rangeText = `Showing ${first}–${last} of ${totalItems.toLocaleString('en-US')} ${itemLabel}`;

  return (
    <nav className="pgb-bar" aria-label="Pagination">
      <span className="pgb-range">{rangeText}</span>
      <label className="pgb-size" htmlFor={pageSizeId}>
        Rows
        <select
          id={pageSizeId}
          className="pgb-size-select"
          value={pageSize}
          onChange={(event) => onPageSizeChange(Number(event.target.value))}
        >
          {pageSizeOptions.map((sizeOption) => <option key={sizeOption} value={sizeOption}>{sizeOption}</option>)}
        </select>
      </label>
      <div className="pgb-pages">
        <button
          type="button"
          className="pgb-btn"
          aria-label="Previous page"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
        >
          <ChevronLeft size={16} aria-hidden="true" />
        </button>
        {pageButtons.map((pageButton) => (pageButton.type === 'ellipsis'
          ? <span key={pageButton.key} className="pgb-ellipsis" aria-hidden="true">…</span>
          : (
            <button
              key={pageButton.page}
              type="button"
              className={`pgb-btn${pageButton.page === page ? ' active' : ''}`}
              aria-current={pageButton.page === page ? 'page' : undefined}
              onClick={() => onPageChange(pageButton.page)}
            >
              {pageButton.page}
            </button>
          )))}
        <button
          type="button"
          className="pgb-btn"
          aria-label="Next page"
          disabled={page >= pageCount}
          onClick={() => onPageChange(page + 1)}
        >
          <ChevronRight size={16} aria-hidden="true" />
        </button>
      </div>
    </nav>
  );
};

export default PaginationBar;
