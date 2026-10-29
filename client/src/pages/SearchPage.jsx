import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useSearchParams, Link } from "react-router-dom";
import { globalSearch } from "../services/notes.service.js";
import { useWorkspace } from "../context/useWorkspace.js";

const TYPE_TABS = [
  { id: "all", label: "All" },
  { id: "notes", label: "Notes" },
  { id: "tasks", label: "Tasks" },
  { id: "questions", label: "Questions" },
  { id: "documents", label: "Documents" },
  { id: "revision", label: "Revision" },
  { id: "doubts", label: "Doubts" },
];

const TYPE_CONFIG = {
  notes: {
    label: "Notes",
    iconColor: "text-amber-700 bg-amber-50 border-amber-200",
  },
  tasks: {
    label: "Tasks",
    iconColor: "text-sky-700 bg-sky-50 border-sky-200",
  },
  questions: {
    label: "Questions",
    iconColor: "text-purple-700 bg-purple-50 border-purple-200",
  },
  documents: {
    label: "Documents",
    iconColor: "text-emerald-700 bg-emerald-50 border-emerald-200",
  },
  revision: {
    label: "Revision",
    iconColor: "text-rose-700 bg-rose-50 border-rose-200",
  },
  doubts: {
    label: "Doubts",
    iconColor: "text-[#2948D8] bg-[#EEF3FF] border-[#365CF5]/20",
  },
};

const PAGE_SIZE = 20;

/**
 * Safely highlights matching query terms inside text without dangerouslySetInnerHTML.
 */
export function HighlightMatch({ text, query }) {
  if (!text || typeof text !== "string") return null;
  if (!query || typeof query !== "string" || !query.trim()) {
    return <>{text}</>;
  }

  const trimmedQuery = query.trim();
  const escapedQuery = trimmedQuery.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const regex = new RegExp(`(${escapedQuery})`, "gi");
  const parts = text.split(regex);

  return (
    <>
      {parts.map((part, index) =>
        regex.test(part) ? (
          <mark
            key={index}
            className="bg-blue-100 text-[#182230] rounded-xs px-0.5 font-semibold"
          >
            {part}
          </mark>
        ) : (
          part
        )
      )}
    </>
  );
}

function formatRelativeTime(dateString) {
  if (!dateString) return "";
  try {
    const d = new Date(dateString);
    if (isNaN(d.getTime())) return "";
    return d.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return "";
  }
}

export default function SearchPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { activeWorkspace, activeWorkspaceId } = useWorkspace();

  const query = searchParams.get("q") || "";
  const activeType = searchParams.get("type") || "all";
  const offsetParam = parseInt(searchParams.get("offset") || "0", 10);
  const currentOffset = isNaN(offsetParam) || offsetParam < 0 ? 0 : offsetParam;

  const [searchInput, setSearchInput] = useState(query);
  const [data, setData] = useState({
    results: [],
    total: 0,
    hasMore: false,
  });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  // Stale-response protection counter
  const latestReqIdRef = useRef(0);

  // Sync search input if URL query param changes externally
  useEffect(() => {
    setSearchInput(query);
  }, [query]);

  const executeSearch = useCallback(
    async (q, type, offset, signal) => {
      const trimmed = q.trim();
      if (!trimmed) {
        setData({ results: [], total: 0, hasMore: false });
        setIsLoading(false);
        setError(null);
        return;
      }

      const reqId = ++latestReqIdRef.current;
      setIsLoading(true);
      setError(null);

      try {
        const res = await globalSearch({
          q: trimmed,
          type,
          limit: PAGE_SIZE,
          offset,
          workspaceId: activeWorkspaceId,
          signal,
        });

        // Stale response guard
        if (reqId !== latestReqIdRef.current) return;

        setData({
          results: res.results || [],
          total: res.total || 0,
          hasMore: Boolean(res.hasMore),
        });
      } catch (err) {
        if (err.name === "AbortError" || signal?.aborted) return;
        if (reqId !== latestReqIdRef.current) return;

        setError(err?.message || "Failed to execute search. Please try again.");
      } finally {
        if (reqId === latestReqIdRef.current && !signal?.aborted) {
          setIsLoading(false);
        }
      }
    },
    [activeWorkspaceId]
  );

  useEffect(() => {
    const controller = new AbortController();
    executeSearch(query, activeType, currentOffset, controller.signal);
    return () => controller.abort();
  }, [query, activeType, currentOffset, executeSearch]);

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    const trimmed = searchInput.trim();
    const newParams = new URLSearchParams(searchParams);
    if (trimmed) {
      newParams.set("q", trimmed);
      newParams.set("offset", "0");
    } else {
      newParams.delete("q");
      newParams.delete("offset");
    }
    setSearchParams(newParams);
  };

  const handleTabChange = (typeId) => {
    const newParams = new URLSearchParams(searchParams);
    if (typeId === "all") {
      newParams.delete("type");
    } else {
      newParams.set("type", typeId);
    }
    newParams.set("offset", "0");
    setSearchParams(newParams);
  };

  const handlePageChange = (newOffset) => {
    const newParams = new URLSearchParams(searchParams);
    newParams.set("offset", String(newOffset));
    setSearchParams(newParams);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  // Group results by type when type === 'all'
  const groupedResults = useMemo(() => {
    if (activeType !== "all") return null;

    const groups = {};
    for (const item of data.results) {
      if (!groups[item.type]) {
        groups[item.type] = [];
      }
      groups[item.type].push(item);
    }
    return groups;
  }, [activeType, data.results]);

  const renderResultItem = (item) => {
    const config = TYPE_CONFIG[item.type] || {
      label: item.type,
      iconColor: "text-slate-700 bg-slate-50 border-slate-200",
    };

    return (
      <article
        key={`${item.type}-${item.id}`}
        className="rounded-xl border border-slate-200/90 bg-white p-3.5 sm:p-4 transition-all hover:border-slate-300 shadow-2xs hover:shadow-xs"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2 mb-1.5">
              <span
                className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider ${config.iconColor}`}
              >
                {config.label}
              </span>

              {item.badges &&
                item.badges.map((badge, idx) => (
                  <span
                    key={idx}
                    className="inline-flex items-center rounded-md bg-slate-100 px-1.5 py-0.5 text-[11px] font-medium text-slate-600 border border-slate-200"
                  >
                    {badge}
                  </span>
                ))}

              {item.updatedAt && (
                <span className="text-[11px] text-slate-400">
                  {formatRelativeTime(item.updatedAt)}
                </span>
              )}
            </div>

            <h3 className="text-base font-semibold text-[#182230] hover:text-[#365CF5]">
              <Link to={item.url} className="focus:outline-none focus:underline">
                <HighlightMatch text={item.title} query={query} />
              </Link>
            </h3>

            {item.subtitle && (
              <p className="mt-0.5 text-xs text-slate-500 font-medium">
                {item.subtitle}
              </p>
            )}

            {item.snippet && (
              <p className="mt-2 text-sm text-slate-600 leading-relaxed break-words">
                <HighlightMatch text={item.snippet} query={query} />
              </p>
            )}
          </div>
        </div>
      </article>
    );
  };

  const renderPagination = () => {
    if (data.total <= PAGE_SIZE) return null;

    const currentPage = Math.floor(currentOffset / PAGE_SIZE) + 1;
    const totalPages = Math.ceil(data.total / PAGE_SIZE);
    const startRange = currentOffset + 1;
    const endRange = Math.min(currentOffset + PAGE_SIZE, data.total);

    return (
      <nav
        aria-label="Search results pagination"
        className="flex flex-col sm:flex-row items-center justify-between gap-3 border-t border-slate-200 pt-4 mt-6"
      >
        <span className="text-xs text-slate-500">
          Showing <span className="font-semibold text-slate-800">{startRange}</span>–
          <span className="font-semibold text-slate-800">{endRange}</span> of{" "}
          <span className="font-semibold text-slate-800">{data.total}</span> results
        </span>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => handlePageChange(Math.max(0, currentOffset - PAGE_SIZE))}
            disabled={currentOffset === 0}
            className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40 disabled:hover:bg-white transition-colors"
          >
            Previous
          </button>
          <span className="text-xs font-medium text-slate-600 px-1">
            Page {currentPage} of {totalPages}
          </span>
          <button
            type="button"
            onClick={() => handlePageChange(currentOffset + PAGE_SIZE)}
            disabled={!data.hasMore}
            className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40 disabled:hover:bg-white transition-colors"
          >
            Next
          </button>
        </div>
      </nav>
    );
  };

  return (
    <div className="w-full space-y-4 sm:space-y-5">
      {/* Header with Search Input and Active Workspace Context */}
      <div className="space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900">
              Global Search
            </h1>
            <p className="text-xs text-slate-500 mt-0.5">
              Searching in{" "}
              <span className="font-semibold text-[#365CF5]">
                {activeWorkspace?.name || "Active Workspace"}
              </span>
            </p>
          </div>
        </div>

        {/* Search Bar Form */}
        <form onSubmit={handleSearchSubmit} className="relative">
          <div className="relative flex items-center">
            <svg
              className="absolute left-3.5 h-4 w-4 text-[#8A94A6] pointer-events-none"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth="2"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z"
              />
            </svg>
            <input
              type="search"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search notes, tasks, questions, documents, revision items, doubts…"
              aria-label="Search query"
              maxLength={200}
              className="w-full rounded-2xl border border-[#DCE3EF] bg-white py-2.5 pl-10 pr-24 text-sm text-[#182230] shadow-2xs placeholder:text-[#8A94A6] focus:border-[#365CF5] focus:outline-none focus:ring-1 focus:ring-[#365CF5]"
            />
            <button
              type="submit"
              className="absolute right-1.5 rounded-xl bg-[#365CF5] px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-[#2848D8] shadow-xs transition-colors"
            >
              Search
            </button>
          </div>
        </form>

        {/* Type Filter Tabs */}
        {query.trim() && (
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 border-b border-[#E6EAF2]">
            {TYPE_TABS.map((tab) => {
              const isActive = activeType === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => handleTabChange(tab.id)}
                  aria-pressed={isActive}
                  aria-label={`Filter by ${tab.label}`}
                  className={`rounded-xl px-3 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap ${
                    isActive
                      ? "bg-[#365CF5] text-white"
                      : "text-[#667085] hover:bg-[#F4F6FB] hover:text-[#182230]"
                  }`}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Main Content Area */}
      <div>
        {/* Initial Prompt State */}
        {!query.trim() && (
          <div className="rounded-3xl border border-dashed border-[#E6EAF2] bg-white p-12 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-[#EEF3FF] text-[#365CF5] mb-3">
              <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
              </svg>
            </div>
            <h2 className="text-base font-bold text-[#182230]">
              Search your workspace
            </h2>
            <p className="mt-1 text-sm text-[#667085] max-w-sm mx-auto">
              Enter a keyword above to search across your notes, tasks, questions, documents, revision topics, and doubts.
            </p>
          </div>
        )}

        {/* Loading State */}
        {query.trim() && isLoading && (
          <div className="py-12 text-center" aria-live="polite">
            <div className="inline-block h-6 w-6 animate-spin rounded-full border-2 border-[#365CF5] border-t-transparent" />
            <p className="mt-2 text-xs text-[#667085] font-medium">Searching…</p>
          </div>
        )}

        {/* Error State */}
        {query.trim() && !isLoading && error && (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-center space-y-2" role="alert">
            <p className="text-sm font-semibold text-rose-800">{error}</p>
            <button
              type="button"
              onClick={() => executeSearch(query, activeType, currentOffset)}
              className="rounded-xl bg-rose-600 hover:bg-rose-700 px-3 py-1.5 text-xs font-semibold text-white transition-colors"
            >
              Retry
            </button>
          </div>
        )}

        {/* Empty Results State */}
        {query.trim() && !isLoading && !error && data.total === 0 && (
          <div className="rounded-3xl border border-dashed border-[#E6EAF2] bg-white p-12 text-center">
            <h2 className="text-base font-bold text-[#182230]">
              No results for &lsquo;{query}&rsquo;
            </h2>
            <p className="mt-1 text-sm text-[#667085] max-w-sm mx-auto">
              We couldn&apos;t find anything matching your search in this workspace. Try adjusting your query or selecting another workspace.
            </p>
          </div>
        )}

        {/* Results List */}
        {query.trim() && !isLoading && !error && data.total > 0 && (
          <div className="space-y-6">
            {/* If type === 'all', show results grouped by category */}
            {activeType === "all" && groupedResults ? (
              <div className="space-y-8">
                {Object.entries(groupedResults).map(([typeKey, items]) => {
                  const config = TYPE_CONFIG[typeKey] || { label: typeKey };
                  return (
                    <section key={typeKey} className="space-y-3">
                      <div className="flex items-center justify-between border-b border-[#E6EAF2] pb-2">
                        <h2 className="text-xs font-bold uppercase tracking-wider text-[#667085]">
                          {config.label} ({items.length})
                        </h2>
                        <button
                          type="button"
                          onClick={() => handleTabChange(typeKey)}
                          className="text-xs font-semibold text-[#365CF5] hover:underline"
                        >
                          View all {config.label.toLowerCase()}
                        </button>
                      </div>
                      <div className="space-y-3">
                        {items.map(renderResultItem)}
                      </div>
                    </section>
                  );
                })}
              </div>
            ) : (
              /* Specific type selected: single flat list */
              <div className="space-y-3">
                {data.results.map(renderResultItem)}
              </div>
            )}

            {/* Pagination Controls */}
            {renderPagination()}
          </div>
        )}
      </div>
    </div>
  );
}
