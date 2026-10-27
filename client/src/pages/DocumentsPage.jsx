import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useAuth } from "../context/useAuth.js";
import {
  fetchDocuments,
  createDocument,
  updateDocument,
  favoriteDocument,
  unfavoriteDocument,
  deleteDocument,
  DOCUMENT_LIMITS,
} from "../services/notes.service.js";
import EmptyState from "../components/EmptyState.jsx";

const PAGE_SIZE = 20;

function formatTimestamp(isoString) {
  if (!isoString) return null;
  try {
    const date = new Date(isoString);
    if (isNaN(date.getTime())) return null;
    return new Intl.DateTimeFormat(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    }).format(date);
  } catch {
    return null;
  }
}

function getCategoryBadgeClass(category) {
  switch (category?.toLowerCase()) {
    case "pdf":
      return "bg-rose-50 text-rose-700 border-rose-200";
    case "article":
      return "bg-blue-50 text-blue-700 border-blue-200";
    case "documentation":
      return "bg-teal-50 text-teal-800 border-teal-200";
    case "course":
      return "bg-purple-50 text-purple-700 border-purple-200";
    case "video":
      return "bg-amber-50 text-amber-800 border-amber-200";
    case "repository":
      return "bg-stone-100 text-stone-800 border-stone-300";
    default:
      return "bg-stone-50 text-stone-600 border-stone-200";
  }
}

function formatUrlHost(urlStr) {
  try {
    const parsed = new URL(urlStr);
    return parsed.hostname.replace(/^www\./, "");
  } catch {
    return urlStr;
  }
}

/**
 * DocumentsPage - Personal Document & Resource Library.
 * Stores links and metadata to PDFs, articles, documentation, courses, videos,
 * repositories, and learning resources.
 */
export default function DocumentsPage() {
  const { getCsrfToken } = useAuth();

  // Documents and pagination state
  const [documents, setDocuments] = useState([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [operationError, setOperationError] = useState(null);

  // Filters & Search
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [topicFilter, setTopicFilter] = useState("");
  const [favoriteFilter, setFavoriteFilter] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");

  // Create / Edit Modal state
  const [showFormModal, setShowFormModal] = useState(false);
  const [editingDocument, setEditingDocument] = useState(null);
  const [formTitle, setFormTitle] = useState("");
  const [formUrl, setFormUrl] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formCategory, setFormCategory] = useState("other");
  const [formTopic, setFormTopic] = useState("");
  const [formFavorite, setFormFavorite] = useState(false);
  const [isSubmittingForm, setIsSubmittingForm] = useState(false);
  const [formError, setFormError] = useState(null);

  // Delete Confirmation Modal state
  const [deletingDocument, setDeletingDocument] = useState(null);
  const [isSubmittingDelete, setIsSubmittingDelete] = useState(false);
  const [deleteError, setDeleteError] = useState(null);

  // Stale request guard ref
  const fetchGenerationRef = useRef(0);

  // Debounce search query
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(searchQuery.trim());
      setOffset(0);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Load documents callback
  const loadDocuments = useCallback(
    async (currentOffset = offset) => {
      const currentGen = ++fetchGenerationRef.current;
      setIsLoading(true);
      setError(null);

      try {
        const result = await fetchDocuments({
          category: categoryFilter !== "all" ? categoryFilter : undefined,
          topic: topicFilter.trim() ? topicFilter.trim() : undefined,
          favorite: favoriteFilter ? true : undefined,
          q: debouncedQuery || undefined,
          limit: PAGE_SIZE,
          offset: currentOffset,
        });

        if (currentGen !== fetchGenerationRef.current) return;

        setDocuments(result.documents || []);
        setTotal(result.total || 0);
        setHasMore(result.hasMore);
      } catch (err) {
        if (currentGen !== fetchGenerationRef.current) return;
        setError(err?.message || "Failed to load documents.");
      } finally {
        if (currentGen === fetchGenerationRef.current) {
          setIsLoading(false);
        }
      }
    },
    [offset, categoryFilter, topicFilter, favoriteFilter, debouncedQuery]
  );

  useEffect(() => {
    loadDocuments(offset);
  }, [loadDocuments, offset]);

  // Filter change handlers
  const handleCategoryChange = (e) => {
    setCategoryFilter(e.target.value);
    setOffset(0);
  };

  const handleTopicChange = (e) => {
    setTopicFilter(e.target.value);
    setOffset(0);
  };

  const handleFavoriteToggle = () => {
    setFavoriteFilter((prev) => !prev);
    setOffset(0);
  };

  const handleClearFilters = () => {
    setCategoryFilter("all");
    setTopicFilter("");
    setFavoriteFilter(false);
    setSearchQuery("");
    setDebouncedQuery("");
    setOffset(0);
  };

  // Open Create Modal
  const handleOpenCreate = () => {
    setEditingDocument(null);
    setFormTitle("");
    setFormUrl("");
    setFormDescription("");
    setFormCategory("other");
    setFormTopic("");
    setFormFavorite(false);
    setFormError(null);
    setShowFormModal(true);
  };

  // Open Edit Modal
  const handleOpenEdit = (doc) => {
    setEditingDocument(doc);
    setFormTitle(doc.title || "");
    setFormUrl(doc.url || "");
    setFormDescription(doc.description || "");
    setFormCategory(doc.category || "other");
    setFormTopic(doc.topic || "");
    setFormFavorite(Boolean(doc.favorite));
    setFormError(null);
    setShowFormModal(true);
  };

  const handleCloseForm = () => {
    if (isSubmittingForm) return;
    setShowFormModal(false);
    setEditingDocument(null);
    setFormError(null);
  };

  // Save (Create or Update) Document
  const handleSaveDocument = async (e) => {
    e.preventDefault();
    setFormError(null);
    setOperationError(null);

    const trimmedTitle = formTitle.trim();
    if (!trimmedTitle) {
      setFormError("Document title cannot be empty.");
      return;
    }
    if (trimmedTitle.length > DOCUMENT_LIMITS.MAX_TITLE_LENGTH) {
      setFormError(`Document title cannot exceed ${DOCUMENT_LIMITS.MAX_TITLE_LENGTH} characters.`);
      return;
    }

    const trimmedUrl = formUrl.trim();
    if (!trimmedUrl) {
      setFormError("Document URL cannot be empty.");
      return;
    }
    if (trimmedUrl.length > DOCUMENT_LIMITS.MAX_URL_LENGTH) {
      setFormError(`Document URL cannot exceed ${DOCUMENT_LIMITS.MAX_URL_LENGTH} characters.`);
      return;
    }

    try {
      const parsed = new URL(trimmedUrl);
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
        setFormError("Document URL must use http or https protocol.");
        return;
      }
    } catch {
      setFormError("Document URL must be a valid, well-formed URL.");
      return;
    }

    setIsSubmittingForm(true);

    try {
      const csrfToken = await getCsrfToken();

      if (editingDocument) {
        const updated = await updateDocument(editingDocument.id, {
          title: trimmedTitle,
          url: trimmedUrl,
          description: formDescription,
          category: formCategory,
          topic: formTopic,
          favorite: formFavorite,
          csrfToken,
        });

        setDocuments((prev) =>
          prev.map((d) => (d.id === editingDocument.id ? updated : d))
        );
      } else {
        const created = await createDocument({
          title: trimmedTitle,
          url: trimmedUrl,
          description: formDescription,
          category: formCategory,
          topic: formTopic,
          favorite: formFavorite,
          csrfToken,
        });

        setDocuments((prev) => [created, ...prev]);
        setTotal((prev) => prev + 1);
      }

      handleCloseForm();
    } catch (err) {
      setFormError(err?.message || "Failed to save document.");
    } finally {
      setIsSubmittingForm(false);
    }
  };

  // Toggle Favorite Status (with optimistic UI and rollback)
  const handleToggleFavorite = async (doc) => {
    const prevFavorite = doc.favorite;
    const nextFavorite = !prevFavorite;

    // Optimistic update
    setDocuments((prev) =>
      prev.map((d) => (d.id === doc.id ? { ...d, favorite: nextFavorite } : d))
    );

    try {
      const csrfToken = await getCsrfToken();
      if (nextFavorite) {
        await favoriteDocument(doc.id, { csrfToken });
      } else {
        await unfavoriteDocument(doc.id, { csrfToken });
      }
    } catch (err) {
      // Rollback on failure
      setDocuments((prev) =>
        prev.map((d) => (d.id === doc.id ? { ...d, favorite: prevFavorite } : d))
      );
      setOperationError(err?.message || "Failed to update favorite status.");
    }
  };

  // Open Delete Confirmation Modal
  const handleOpenDelete = (doc) => {
    setDeletingDocument(doc);
    setDeleteError(null);
  };

  const handleCloseDelete = () => {
    if (isSubmittingDelete) return;
    setDeletingDocument(null);
    setDeleteError(null);
  };

  // Confirm Soft Deletion
  const handleConfirmDelete = async () => {
    if (!deletingDocument) return;
    setIsSubmittingDelete(true);
    setDeleteError(null);
    setOperationError(null);

    try {
      const csrfToken = await getCsrfToken();
      await deleteDocument(deletingDocument.id, { csrfToken });

      setDocuments((prev) => prev.filter((d) => d.id !== deletingDocument.id));
      setTotal((prev) => Math.max(0, prev - 1));
      handleCloseDelete();

      if (documents.length <= 1 && offset > 0) {
        setOffset((prev) => Math.max(0, prev - PAGE_SIZE));
      }
    } catch (err) {
      setDeleteError(err?.message || "Failed to delete document.");
    } finally {
      setIsSubmittingDelete(false);
    }
  };

  // Active counts
  const favoritesCount = useMemo(
    () => documents.filter((d) => d.favorite).length,
    [documents]
  );

  const hasActiveFilters =
    categoryFilter !== "all" || topicFilter.trim() !== "" || favoriteFilter || debouncedQuery !== "";

  return (
    <div className="space-y-6">
      {/* Top Banner Toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-stone-200 pb-4">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-teal-50 px-3 py-1 text-xs font-semibold text-teal-800 border border-teal-200">
              <span className="h-1.5 w-1.5 rounded-full bg-teal-600" aria-hidden="true" />
              Total: {total}
            </span>
            <span className="inline-flex items-center rounded-full bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-800 border border-amber-200">
              ★ Favorites: {favoritesCount}
            </span>
          </div>
          <p className="mt-1 text-xs text-stone-500">
            Store and reference important documents here.
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={handleOpenCreate}
            className="inline-flex items-center gap-1.5 rounded-xl bg-teal-800 px-4 py-2 text-xs font-semibold text-white shadow-xs hover:bg-teal-700 focus-visible:outline-2 focus-visible:outline-teal-800 transition-colors"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            Add Document
          </button>
        </div>
      </div>

      {/* Global Error Banner */}
      {operationError && (
        <div
          role="alert"
          className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-xs text-rose-800 flex items-start justify-between"
        >
          <span>{operationError}</span>
          <button
            type="button"
            onClick={() => setOperationError(null)}
            className="text-rose-600 hover:text-rose-900 font-semibold text-xs ml-4"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Filter and Search Bar */}
      <div className="rounded-2xl border border-stone-200 bg-white p-4 shadow-2xs space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
          {/* Search Input */}
          <div className="relative">
            <label htmlFor="doc-search-input" className="sr-only">
              Search documents
            </label>
            <input
              id="doc-search-input"
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by title, url, topic..."
              className="w-full rounded-xl border border-stone-300 bg-stone-50/50 px-3 py-2 pl-9 text-xs text-stone-800 placeholder-stone-400 focus:border-teal-700 focus:bg-white focus:outline-none"
            />
            <svg
              className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-stone-400"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>

          {/* Category Filter */}
          <div>
            <label htmlFor="doc-category-filter" className="sr-only">
              Category
            </label>
            <select
              id="doc-category-filter"
              value={categoryFilter}
              onChange={handleCategoryChange}
              className="w-full rounded-xl border border-stone-300 bg-stone-50/50 px-3 py-2 text-xs text-stone-800 focus:border-teal-700 focus:bg-white focus:outline-none"
            >
              <option value="all">All Categories</option>
              <option value="pdf">PDF</option>
              <option value="article">Article</option>
              <option value="documentation">Documentation</option>
              <option value="course">Course</option>
              <option value="video">Video</option>
              <option value="repository">Repository</option>
              <option value="other">Other</option>
            </select>
          </div>

          {/* Topic Filter */}
          <div>
            <label htmlFor="doc-topic-filter" className="sr-only">
              Topic
            </label>
            <input
              id="doc-topic-filter"
              type="text"
              value={topicFilter}
              onChange={handleTopicChange}
              placeholder="Filter by topic..."
              className="w-full rounded-xl border border-stone-300 bg-stone-50/50 px-3 py-2 text-xs text-stone-800 placeholder-stone-400 focus:border-teal-700 focus:bg-white focus:outline-none"
            />
          </div>

          {/* Favorites Filter & Clear */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleFavoriteToggle}
              className={`flex-1 rounded-xl px-3 py-2 text-xs font-semibold border transition-colors ${
                favoriteFilter
                  ? "bg-amber-50 border-amber-300 text-amber-800 shadow-2xs"
                  : "bg-white border-stone-300 text-stone-700 hover:bg-stone-50"
              }`}
            >
              ★ Favorites Only
            </button>

            {hasActiveFilters && (
              <button
                type="button"
                onClick={handleClearFilters}
                className="rounded-xl border border-stone-200 bg-stone-100 px-3 py-2 text-xs font-medium text-stone-600 hover:bg-stone-200 transition-colors"
                title="Clear all filters"
              >
                Reset
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      {isLoading ? (
        <div className="py-12 text-center text-xs text-stone-500">
          Loading documents...
        </div>
      ) : error ? (
        <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-6 text-center text-xs text-rose-800">
          <p className="font-semibold mb-2">Error Loading Documents</p>
          <p>{error}</p>
          <button
            type="button"
            onClick={() => loadDocuments(offset)}
            className="mt-4 rounded-xl bg-rose-800 px-4 py-2 text-xs font-semibold text-white hover:bg-rose-700 transition-colors"
          >
            Retry
          </button>
        </div>
      ) : documents.length === 0 ? (
        hasActiveFilters ? (
          favoriteFilter && categoryFilter === "all" && !topicFilter.trim() && !debouncedQuery ? (
            <EmptyState
              title="No favorite documents"
              description="Star important documents to quickly access them here."
              action={{
                label: "Clear favorites filter",
                onClick: handleClearFilters,
              }}
            />
          ) : (
            <EmptyState
              title="No documents match your filters"
              description="Try adjusting your search query or filters to find what you're looking for."
              action={{
                label: "Clear filters",
                onClick: handleClearFilters,
              }}
            />
          )
        ) : (
          <EmptyState
            title="No documents yet"
            description="Store and reference important documents here."
            action={{
              label: "Add Document",
              onClick: handleOpenCreate,
            }}
          />
        )
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {documents.map((doc) => (
              <div
                key={doc.id}
                className="group relative flex flex-col justify-between rounded-2xl border border-stone-200 bg-white p-5 shadow-2xs hover:shadow-xs transition-shadow"
              >
                <div>
                  {/* Card Header: Category badge, Topic badge, and Favorite Star */}
                  <div className="flex items-center justify-between gap-2 mb-2.5">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span
                        className={`inline-flex items-center rounded-md px-2 py-0.5 text-2xs font-semibold border uppercase tracking-wider ${getCategoryBadgeClass(
                          doc.category
                        )}`}
                      >
                        {doc.category || "other"}
                      </span>
                      {doc.topic && (
                        <span className="inline-flex items-center rounded-md bg-stone-100 px-2 py-0.5 text-2xs font-medium text-stone-700 border border-stone-200">
                          {doc.topic}
                        </span>
                      )}
                    </div>

                    <button
                      type="button"
                      onClick={() => handleToggleFavorite(doc)}
                      aria-label={doc.favorite ? "Unfavorite document" : "Favorite document"}
                      className={`rounded-lg p-1 text-sm transition-colors ${
                        doc.favorite
                          ? "text-amber-500 hover:text-amber-600"
                          : "text-stone-300 hover:text-stone-400"
                      }`}
                    >
                      {doc.favorite ? "★" : "☆"}
                    </button>
                  </div>

                  {/* Title as Safe External Link */}
                  <h2 className="text-sm font-semibold text-stone-900 group-hover:text-teal-900 line-clamp-2">
                    <a
                      href={doc.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 hover:underline"
                    >
                      <span>{doc.title}</span>
                      <svg
                        className="h-3.5 w-3.5 shrink-0 text-stone-400"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        aria-hidden="true"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth="2"
                          d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                        />
                      </svg>
                    </a>
                  </h2>

                  {/* URL Host Snippet */}
                  <p className="mt-1 text-2xs text-stone-400 truncate font-mono">
                    {formatUrlHost(doc.url)}
                  </p>

                  {/* Description */}
                  {doc.description && (
                    <p className="mt-2 text-xs text-stone-600 line-clamp-3 leading-relaxed">
                      {doc.description}
                    </p>
                  )}
                </div>

                {/* Card Footer: Timestamp & Actions */}
                <div className="mt-4 pt-3 border-t border-stone-100 flex items-center justify-between text-2xs text-stone-400">
                  <span>{formatTimestamp(doc.updatedAt) || ""}</span>

                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => handleOpenEdit(doc)}
                      className="rounded-lg p-1.5 text-stone-500 hover:bg-stone-100 hover:text-stone-800 transition-colors"
                      title="Edit document"
                    >
                      <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                      </svg>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleOpenDelete(doc)}
                      className="rounded-lg p-1.5 text-stone-500 hover:bg-rose-50 hover:text-rose-600 transition-colors"
                      title="Delete document"
                    >
                      <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Pagination Controls */}
          {total > PAGE_SIZE && (
            <div className="flex items-center justify-between border-t border-stone-200 pt-4 text-xs text-stone-500">
              <span>
                Showing {offset + 1} to {Math.min(offset + PAGE_SIZE, total)} of {total} documents
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={offset === 0}
                  onClick={() => setOffset((prev) => Math.max(0, prev - PAGE_SIZE))}
                  className="rounded-xl border border-stone-300 bg-white px-3 py-1.5 text-xs font-semibold text-stone-700 shadow-2xs hover:bg-stone-50 disabled:opacity-40 disabled:pointer-events-none transition-colors"
                >
                  Previous
                </button>
                <button
                  type="button"
                  disabled={!hasMore}
                  onClick={() => setOffset((prev) => prev + PAGE_SIZE)}
                  className="rounded-xl border border-stone-300 bg-white px-3 py-1.5 text-xs font-semibold text-stone-700 shadow-2xs hover:bg-stone-50 disabled:opacity-40 disabled:pointer-events-none transition-colors"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Create / Edit Document Modal */}
      {showFormModal && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="doc-form-title"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-900/40 backdrop-blur-2xs overflow-y-auto"
        >
          <div className="w-full max-w-lg rounded-2xl border border-stone-200 bg-white p-6 shadow-xl space-y-4 my-8">
            <div className="flex items-center justify-between border-b border-stone-200 pb-3">
              <h2 id="doc-form-title" className="text-sm font-semibold text-stone-900">
                {editingDocument ? "Edit Document" : "Add New Document"}
              </h2>
              <button
                type="button"
                onClick={handleCloseForm}
                className="text-stone-400 hover:text-stone-600 transition-colors"
              >
                ✕
              </button>
            </div>

            {formError && (
              <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800">
                {formError}
              </div>
            )}

            <form onSubmit={handleSaveDocument} className="space-y-4">
              {/* Title */}
              <div>
                <label htmlFor="doc-input-title" className="block text-xs font-semibold text-stone-700 mb-1">
                  Title <span className="text-rose-500">*</span>
                </label>
                <input
                  id="doc-input-title"
                  type="text"
                  required
                  maxLength={DOCUMENT_LIMITS.MAX_TITLE_LENGTH}
                  value={formTitle}
                  onChange={(e) => setFormTitle(e.target.value)}
                  placeholder="e.g. React Official Documentation"
                  className="w-full rounded-xl border border-stone-300 px-3 py-2 text-xs text-stone-800 focus:border-teal-700 focus:outline-none"
                />
              </div>

              {/* URL */}
              <div>
                <label htmlFor="doc-input-url" className="block text-xs font-semibold text-stone-700 mb-1">
                  URL <span className="text-rose-500">*</span>
                </label>
                <input
                  id="doc-input-url"
                  type="url"
                  required
                  maxLength={DOCUMENT_LIMITS.MAX_URL_LENGTH}
                  value={formUrl}
                  onChange={(e) => setFormUrl(e.target.value)}
                  placeholder="https://example.com/guide.pdf"
                  className="w-full rounded-xl border border-stone-300 px-3 py-2 text-xs text-stone-800 focus:border-teal-700 focus:outline-none"
                />
              </div>

              {/* Category & Topic */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label htmlFor="doc-input-category" className="block text-xs font-semibold text-stone-700 mb-1">
                    Category
                  </label>
                  <select
                    id="doc-input-category"
                    value={formCategory}
                    onChange={(e) => setFormCategory(e.target.value)}
                    className="w-full rounded-xl border border-stone-300 px-3 py-2 text-xs text-stone-800 focus:border-teal-700 focus:outline-none"
                  >
                    <option value="pdf">PDF</option>
                    <option value="article">Article</option>
                    <option value="documentation">Documentation</option>
                    <option value="course">Course</option>
                    <option value="video">Video</option>
                    <option value="repository">Repository</option>
                    <option value="other">Other</option>
                  </select>
                </div>

                <div>
                  <label htmlFor="doc-input-topic" className="block text-xs font-semibold text-stone-700 mb-1">
                    Topic
                  </label>
                  <input
                    id="doc-input-topic"
                    type="text"
                    maxLength={DOCUMENT_LIMITS.MAX_TOPIC_LENGTH}
                    value={formTopic}
                    onChange={(e) => setFormTopic(e.target.value)}
                    placeholder="e.g. Frontend Architecture"
                    className="w-full rounded-xl border border-stone-300 px-3 py-2 text-xs text-stone-800 focus:border-teal-700 focus:outline-none"
                  />
                </div>
              </div>

              {/* Description */}
              <div>
                <label htmlFor="doc-input-description" className="block text-xs font-semibold text-stone-700 mb-1">
                  Description
                </label>
                <textarea
                  id="doc-input-description"
                  rows={3}
                  maxLength={DOCUMENT_LIMITS.MAX_DESCRIPTION_LENGTH}
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                  placeholder="Summary or key notes about this resource..."
                  className="w-full rounded-xl border border-stone-300 px-3 py-2 text-xs text-stone-800 focus:border-teal-700 focus:outline-none"
                />
              </div>

              {/* Favorite Checkbox */}
              <div className="flex items-center gap-2 pt-1">
                <input
                  id="doc-input-favorite"
                  type="checkbox"
                  checked={formFavorite}
                  onChange={(e) => setFormFavorite(e.target.checked)}
                  className="h-4 w-4 rounded border-stone-300 text-teal-800 focus:ring-teal-700"
                />
                <label htmlFor="doc-input-favorite" className="text-xs text-stone-700 font-medium">
                  Mark as favorite
                </label>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center justify-end gap-2 pt-3 border-t border-stone-200">
                <button
                  type="button"
                  onClick={handleCloseForm}
                  disabled={isSubmittingForm}
                  className="rounded-xl border border-stone-300 bg-white px-4 py-2 text-xs font-semibold text-stone-700 shadow-2xs hover:bg-stone-50 disabled:opacity-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingForm}
                  className="rounded-xl bg-teal-800 px-4 py-2 text-xs font-semibold text-white shadow-xs hover:bg-teal-700 disabled:opacity-50 transition-colors"
                >
                  {isSubmittingForm ? "Saving..." : editingDocument ? "Save Changes" : "Create Document"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deletingDocument && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="doc-delete-title"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-900/40 backdrop-blur-2xs"
        >
          <div className="w-full max-w-md rounded-2xl border border-stone-200 bg-white p-6 shadow-xl space-y-4">
            <h2 id="doc-delete-title" className="text-sm font-semibold text-stone-900">
              Delete Document
            </h2>

            {deleteError && (
              <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800">
                {deleteError}
              </div>
            )}

            <p className="text-xs text-stone-600 leading-relaxed">
              Are you sure you want to delete{" "}
              <strong className="text-stone-900 font-semibold">{deletingDocument.title}</strong>?
              This will remove the document from your library.
            </p>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-stone-200">
              <button
                type="button"
                onClick={handleCloseDelete}
                disabled={isSubmittingDelete}
                className="rounded-xl border border-stone-300 bg-white px-4 py-2 text-xs font-semibold text-stone-700 shadow-2xs hover:bg-stone-50 disabled:opacity-50 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                disabled={isSubmittingDelete}
                className="rounded-xl bg-rose-700 px-4 py-2 text-xs font-semibold text-white shadow-xs hover:bg-rose-800 disabled:opacity-50 transition-colors"
              >
                {isSubmittingDelete ? "Deleting..." : "Delete Document"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
