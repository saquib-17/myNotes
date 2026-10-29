import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useAuth } from "../context/useAuth.js";
import {
  fetchQuestions,
  createQuestion,
  updateQuestion,
  practiceQuestion,
  updateQuestionStatus,
  deleteQuestion,
  QUESTION_LIMITS,
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
      hour: "numeric",
      minute: "2-digit",
    }).format(date);
  } catch {
    return null;
  }
}

/**
 * QuestionsPage - Personal Question Bank for Placement Preparation.
 * Supports SHORT_ANSWER, MCQ, and CODING question types, full CRUD,
 * interactive Practice Mode with answer reveal and checking, mastery status tracking,
 * and soft-deletion.
 */
export default function QuestionsPage() {
  const { getCsrfToken } = useAuth();

  // Questions and pagination state
  const [questions, setQuestions] = useState([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [operationError, setOperationError] = useState(null);

  // Filters & Search
  const [typeFilter, setTypeFilter] = useState("all");
  const [difficultyFilter, setDifficultyFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [topicFilter, setTopicFilter] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");

  // Create / Edit Modal state
  const [showFormModal, setShowFormModal] = useState(false);
  const [editingQuestion, setEditingQuestion] = useState(null);
  const [formType, setFormType] = useState("SHORT_ANSWER");
  const [formQuestion, setFormQuestion] = useState("");
  const [formAnswer, setFormAnswer] = useState("");
  const [formExplanation, setFormExplanation] = useState("");
  const [formTopic, setFormTopic] = useState("");
  const [formDifficulty, setFormDifficulty] = useState("medium");
  const [formStatus, setFormStatus] = useState("unlearned");
  const [formMcqOptions, setFormMcqOptions] = useState(["", ""]);
  const [formCorrectOptionIndex, setFormCorrectOptionIndex] = useState(0);
  const [isSubmittingForm, setIsSubmittingForm] = useState(false);
  const [formError, setFormError] = useState(null);

  // Practice Mode state
  const [isPracticeMode, setIsPracticeMode] = useState(false);
  const [practiceIndex, setPracticeIndex] = useState(0);
  const [isAnswerRevealed, setIsAnswerRevealed] = useState(false);
  const [selectedMcqOption, setSelectedMcqOption] = useState(null);
  const [isMcqChecked, setIsMcqChecked] = useState(false);
  const [practiceSuccessNotice, setPracticeSuccessNotice] = useState(null);
  const [isSubmittingPractice, setIsSubmittingPractice] = useState(false);

  // Delete Confirmation Modal state
  const [deletingQuestion, setDeletingQuestion] = useState(null);
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

  // Load questions callback
  const loadQuestions = useCallback(
    async (signal) => {
      const currentGen = ++fetchGenerationRef.current;
      setIsLoading(true);
      setError(null);

      try {
        const queryParams = {
          limit: PAGE_SIZE,
          offset,
          signal,
        };
        if (typeFilter !== "all") queryParams.type = typeFilter;
        if (difficultyFilter !== "all") queryParams.difficulty = difficultyFilter;
        if (statusFilter !== "all") queryParams.status = statusFilter;
        if (topicFilter.trim()) queryParams.topic = topicFilter.trim();
        if (debouncedQuery) queryParams.q = debouncedQuery;

        const data = await fetchQuestions(queryParams);

        if (fetchGenerationRef.current !== currentGen || signal?.aborted) {
          return;
        }

        const rawList = Array.isArray(data.questions)
          ? data.questions
          : Array.isArray(data.items)
            ? data.items
            : [];

        const totalCount =
          typeof data.total === "number" ? data.total : offset + rawList.length;

        // Auto-recover offset if out of bounds
        if (offset > 0 && rawList.length === 0 && totalCount > 0) {
          const lastValidOffset =
            Math.floor((totalCount - 1) / PAGE_SIZE) * PAGE_SIZE;
          if (lastValidOffset !== offset) {
            setOffset(lastValidOffset);
            return;
          }
        }

        setQuestions(rawList);
        setTotal(totalCount);
        setHasMore(Boolean(data.hasMore));
      } catch (err) {
        if (
          fetchGenerationRef.current !== currentGen ||
          signal?.aborted ||
          err.name === "AbortError"
        ) {
          return;
        }
        setError(err?.message || "Could not load questions from server.");
      } finally {
        if (fetchGenerationRef.current === currentGen) {
          setIsLoading(false);
        }
      }
    },
    [offset, typeFilter, difficultyFilter, statusFilter, topicFilter, debouncedQuery]
  );

  useEffect(() => {
    const controller = new AbortController();
    loadQuestions(controller.signal);
    return () => controller.abort();
  }, [loadQuestions]);

  // Open Create Modal
  const handleOpenCreate = () => {
    setEditingQuestion(null);
    setFormType("SHORT_ANSWER");
    setFormQuestion("");
    setFormAnswer("");
    setFormExplanation("");
    setFormTopic("");
    setFormDifficulty("medium");
    setFormStatus("unlearned");
    setFormMcqOptions(["", ""]);
    setFormCorrectOptionIndex(0);
    setFormError(null);
    setShowFormModal(true);
  };

  // Open Edit Modal
  const handleOpenEdit = (qItem) => {
    setEditingQuestion(qItem);
    setFormType(qItem.type || "SHORT_ANSWER");
    setFormQuestion(qItem.question || "");
    setFormAnswer(qItem.answer || "");
    setFormExplanation(qItem.explanation || "");
    setFormTopic(qItem.topic || "");
    setFormDifficulty(qItem.difficulty || "medium");
    setFormStatus(qItem.status || "unlearned");
    if (qItem.type === "MCQ" && Array.isArray(qItem.options)) {
      setFormMcqOptions([...qItem.options]);
      setFormCorrectOptionIndex(qItem.correctOptionIndex ?? 0);
    } else {
      setFormMcqOptions(["", ""]);
      setFormCorrectOptionIndex(0);
    }
    setFormError(null);
    setShowFormModal(true);
  };

  // Close Form Modal
  const handleCloseForm = () => {
    if (isSubmittingForm) return;
    setShowFormModal(false);
    setEditingQuestion(null);
    setFormError(null);
  };

  // Handle MCQ Option Add/Remove/Change
  const handleAddMcqOption = () => {
    if (formMcqOptions.length >= QUESTION_LIMITS.MAX_MCQ_OPTIONS) return;
    setFormMcqOptions([...formMcqOptions, ""]);
  };

  const handleRemoveMcqOption = (indexToRemove) => {
    if (formMcqOptions.length <= QUESTION_LIMITS.MIN_MCQ_OPTIONS) return;
    const next = formMcqOptions.filter((_, i) => i !== indexToRemove);
    setFormMcqOptions(next);
    if (formCorrectOptionIndex >= next.length) {
      setFormCorrectOptionIndex(next.length - 1);
    }
  };

  const handleMcqOptionChange = (idx, value) => {
    const next = [...formMcqOptions];
    next[idx] = value;
    setFormMcqOptions(next);
  };

  // Submit Create or Edit Form
  const handleSubmitForm = async (e) => {
    e.preventDefault();
    const trimmedQuestion = formQuestion.trim();
    if (!trimmedQuestion) {
      setFormError("Question text cannot be empty.");
      return;
    }
    if (trimmedQuestion.length > QUESTION_LIMITS.MAX_QUESTION_LENGTH) {
      setFormError(
        `Question text cannot exceed ${QUESTION_LIMITS.MAX_QUESTION_LENGTH} characters.`
      );
      return;
    }

    if (formType === "MCQ") {
      if (
        formMcqOptions.length < QUESTION_LIMITS.MIN_MCQ_OPTIONS ||
        formMcqOptions.length > QUESTION_LIMITS.MAX_MCQ_OPTIONS
      ) {
        setFormError(
          `MCQ questions must have between ${QUESTION_LIMITS.MIN_MCQ_OPTIONS} and ${QUESTION_LIMITS.MAX_MCQ_OPTIONS} options.`
        );
        return;
      }
      for (let i = 0; i < formMcqOptions.length; i++) {
        if (!formMcqOptions[i] || formMcqOptions[i].trim().length === 0) {
          setFormError(`MCQ option ${i + 1} cannot be empty.`);
          return;
        }
      }
    }

    setIsSubmittingForm(true);
    setFormError(null);
    setOperationError(null);

    try {
      const csrfToken = await getCsrfToken();
      if (editingQuestion) {
        const updated = await updateQuestion(editingQuestion.id, {
          type: formType,
          question: trimmedQuestion,
          answer: formAnswer.trim() || null,
          explanation: formExplanation.trim() || null,
          topic: formTopic.trim() || null,
          difficulty: formDifficulty,
          status: formStatus,
          options: formType === "MCQ" ? formMcqOptions : null,
          correctOptionIndex: formType === "MCQ" ? formCorrectOptionIndex : null,
          csrfToken,
        });

        setQuestions((prev) =>
          prev.map((q) => (q.id === editingQuestion.id ? { ...q, ...updated } : q))
        );
      } else {
        await createQuestion({
          type: formType,
          question: trimmedQuestion,
          answer: formAnswer.trim() || null,
          explanation: formExplanation.trim() || null,
          topic: formTopic.trim() || null,
          difficulty: formDifficulty,
          status: formStatus,
          options: formType === "MCQ" ? formMcqOptions : null,
          correctOptionIndex: formType === "MCQ" ? formCorrectOptionIndex : null,
          csrfToken,
        });
        await loadQuestions();
      }
      handleCloseForm();
    } catch (err) {
      setFormError(err?.message || "Failed to save question.");
    } finally {
      setIsSubmittingForm(false);
    }
  };

  // Quick Status Update
  const handleUpdateStatus = async (qItem, newStatus) => {
    if (qItem.status === newStatus) return;
    const prevQuestions = [...questions];
    setOperationError(null);

    // Optimistic update
    setQuestions((prev) =>
      prev.map((q) => (q.id === qItem.id ? { ...q, status: newStatus } : q))
    );

    try {
      const csrfToken = await getCsrfToken();
      await updateQuestionStatus(qItem.id, { status: newStatus, csrfToken });
    } catch (err) {
      setQuestions(prevQuestions);
      setOperationError(
        `Failed to update status: ${err?.message || "Server error"}`
      );
    }
  };

  // Practice Mode Handlers
  const handleStartPractice = (specificQuestion = null) => {
    if (questions.length === 0) {
      setIsPracticeMode(true);
      return;
    }
    if (specificQuestion) {
      const idx = questions.findIndex((q) => q.id === specificQuestion.id);
      setPracticeIndex(idx >= 0 ? idx : 0);
    } else {
      setPracticeIndex(0);
    }
    setIsAnswerRevealed(false);
    setSelectedMcqOption(null);
    setIsMcqChecked(false);
    setPracticeSuccessNotice(null);
    setIsPracticeMode(true);
  };

  const handleNextPractice = () => {
    if (questions.length === 0) return;
    setPracticeIndex((prev) => (prev + 1) % questions.length);
    setIsAnswerRevealed(false);
    setSelectedMcqOption(null);
    setIsMcqChecked(false);
    setPracticeSuccessNotice(null);
  };

  const handleRecordPracticeResult = async (currentQ, result) => {
    setIsSubmittingPractice(true);
    setPracticeSuccessNotice(null);
    try {
      const csrfToken = await getCsrfToken();
      const updated = await practiceQuestion(currentQ.id, { result, csrfToken });
      setQuestions((prev) =>
        prev.map((q) => (q.id === currentQ.id ? { ...q, ...updated } : q))
      );
      setPracticeSuccessNotice(
        result === "correct"
          ? "Marked correct! Keep up the momentum."
          : "Marked incorrect. Review the solution carefully."
      );
    } catch (err) {
      setOperationError(`Failed to record practice: ${err?.message || "Error"}`);
    } finally {
      setIsSubmittingPractice(false);
    }
  };

  // Open Delete Confirmation Modal
  const handleOpenDelete = (qItem) => {
    setDeletingQuestion(qItem);
    setDeleteError(null);
  };

  const handleCloseDelete = () => {
    if (isSubmittingDelete) return;
    setDeletingQuestion(null);
    setDeleteError(null);
  };

  const handleSubmitDelete = async () => {
    if (!deletingQuestion) return;
    setIsSubmittingDelete(true);
    setDeleteError(null);
    setOperationError(null);

    try {
      const csrfToken = await getCsrfToken();
      await deleteQuestion(deletingQuestion.id, { csrfToken });

      setQuestions((prev) => prev.filter((q) => q.id !== deletingQuestion.id));
      setTotal((prev) => Math.max(0, prev - 1));
      handleCloseDelete();

      if (questions.length <= 1 && offset > 0) {
        setOffset((prev) => Math.max(0, prev - PAGE_SIZE));
      }
    } catch (err) {
      setDeleteError(err?.message || "Failed to delete question.");
    } finally {
      setIsSubmittingDelete(false);
    }
  };

  // Active counts
  const unlearnedCount = useMemo(
    () => questions.filter((q) => q.status === "unlearned").length,
    [questions]
  );
  const learningCount = useMemo(
    () => questions.filter((q) => q.status === "learning").length,
    [questions]
  );
  const masteredCount = useMemo(
    () => questions.filter((q) => q.status === "mastered").length,
    [questions]
  );

  return (
    <div className="space-y-4 sm:space-y-5">
      {/* Top Banner Toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 border-b border-[#E6EAF2] pb-2.5">
        <div>
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-[#EEF3FF] px-2.5 py-0.5 text-xs font-semibold text-[#2948D8] border border-[#C7D7FE]">
              <span className="h-1.5 w-1.5 rounded-full bg-[#365CF5]" aria-hidden="true" />
              Total: {total}
            </span>
            <span className="inline-flex items-center rounded-full bg-[#F4F6FB] border border-[#E6EAF2] px-2 py-0.5 text-xs font-medium text-[#374151]">
              Unlearned: {unlearnedCount}
            </span>
            <span className="inline-flex items-center rounded-full bg-sky-50 px-2 py-0.5 text-xs font-medium text-sky-700">
              Learning: {learningCount}
            </span>
            <span className="inline-flex items-center rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
              Mastered: {masteredCount}
            </span>
          </div>
          <p className="mt-1 text-xs text-[#667085]">
            Collect important questions and track your understanding.
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => handleStartPractice()}
            className="inline-flex items-center gap-1.5 rounded-xl border border-[#DCE3EF] bg-white px-3.5 py-1.5 text-xs font-semibold text-[#374151] shadow-2xs hover:bg-[#F4F6FB] transition-colors"
          >
            <svg className="h-3.5 w-3.5 text-[#365CF5]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            Practice Mode
          </button>

          <button
            type="button"
            onClick={handleOpenCreate}
            className="inline-flex items-center gap-1.5 rounded-xl bg-[#365CF5] px-3.5 py-1.5 text-xs font-semibold text-white shadow-xs hover:bg-[#2848D8] focus-visible:outline-2 focus-visible:outline-[#A5B4FC] transition-colors cursor-pointer"
          >
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            New Question
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

      {/* Filters and Search Bar */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-2.5 bg-white p-2.5 rounded-xl border border-slate-200/90 shadow-2xs">
        {/* Filters Grid */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Type Filter */}
          <select
            value={typeFilter}
            onChange={(e) => {
              setTypeFilter(e.target.value);
              setOffset(0);
            }}
            aria-label="Filter by question type"
            className="rounded-xl border border-[#DCE3EF] bg-white px-2.5 py-1.5 text-xs font-medium text-[#374151] focus:border-[#365CF5] focus:outline-none focus:ring-1 focus:ring-[#A5B4FC]/40"
          >
            <option value="all">All Types</option>
            <option value="SHORT_ANSWER">Short Answer</option>
            <option value="MCQ">MCQ</option>
            <option value="CODING">Coding</option>
          </select>

          {/* Difficulty Filter */}
          <select
            value={difficultyFilter}
            onChange={(e) => {
              setDifficultyFilter(e.target.value);
              setOffset(0);
            }}
            aria-label="Filter by difficulty"
            className="rounded-xl border border-[#DCE3EF] bg-white px-2.5 py-1.5 text-xs font-medium text-[#374151] focus:border-[#365CF5] focus:outline-none focus:ring-1 focus:ring-[#A5B4FC]/40"
          >
            <option value="all">All Difficulties</option>
            <option value="easy">Easy</option>
            <option value="medium">Medium</option>
            <option value="hard">Hard</option>
          </select>

          {/* Status Filter */}
          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setOffset(0);
            }}
            aria-label="Filter by status"
            className="rounded-xl border border-[#DCE3EF] bg-white px-2.5 py-1.5 text-xs font-medium text-[#374151] focus:border-[#365CF5] focus:outline-none focus:ring-1 focus:ring-[#A5B4FC]/40"
          >
            <option value="all">All Statuses</option>
            <option value="unlearned">Unlearned</option>
            <option value="learning">Learning</option>
            <option value="mastered">Mastered</option>
          </select>

          {/* Topic Filter */}
          <input
            type="text"
            value={topicFilter}
            onChange={(e) => {
              setTopicFilter(e.target.value);
              setOffset(0);
            }}
            placeholder="Filter topic..."
            aria-label="Filter by topic"
            className="w-28 sm:w-36 rounded-xl border border-[#DCE3EF] bg-white px-2.5 py-1.5 text-xs text-[#111827] placeholder-[#8A94A6] focus:border-[#365CF5] focus:outline-none focus:ring-1 focus:ring-[#A5B4FC]/40"
          />
        </div>

        {/* Search Input */}
        <div className="relative w-full lg:w-60">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search questions..."
            aria-label="Search questions"
            className="w-full rounded-xl border border-[#DCE3EF] bg-white pl-8 pr-7 py-1.5 text-xs text-[#111827] placeholder-[#8A94A6] focus:border-[#365CF5] focus:outline-none focus:ring-1 focus:ring-[#A5B4FC]/40"
          />
          <svg
            className="absolute left-2.5 top-2 h-3.5 w-3.5 text-[#8A94A6]"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery("")}
              aria-label="Clear search"
              className="absolute right-2 top-1.5 text-[#8A94A6] hover:text-[#182230]"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {/* Main List Area */}
      {isLoading ? (
        <div className="flex flex-col items-center justify-center py-12 text-[#8A94A6]">
          <svg className="h-8 w-8 animate-spin text-[#365CF5] mb-3" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
          </svg>
          <p className="text-sm font-medium text-[#667085]">Loading questions...</p>
        </div>
      ) : error ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-6 text-center">
          <p className="text-sm text-rose-800 font-medium mb-3">{error}</p>
          <button
            type="button"
            onClick={() => loadQuestions()}
            className="rounded-xl bg-rose-600 hover:bg-rose-700 px-4 py-2 text-xs font-semibold text-white transition-colors"
          >
            Retry
          </button>
        </div>
      ) : questions.length === 0 ? (
        debouncedQuery || typeFilter !== "all" || difficultyFilter !== "all" || statusFilter !== "all" || topicFilter ? (
          <EmptyState
            title="No questions match your filters"
            description="Try modifying or clearing your filters and search keywords."
            icon={
              <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            }
          />
        ) : (
          <EmptyState
            title="No questions yet"
            description="Collect important questions and track your understanding."
            note="Click 'New Question' above to start building your placement question bank."
            icon={
              <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.75M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9 5.25h.008v.008H12v-.008z" />
              </svg>
            }
          />
        )
      ) : (
        <div className="space-y-3">
          {questions.map((qItem) => {
            return (
              <div
                key={qItem.id}
                className="group rounded-xl border border-slate-200/90 bg-white p-3.5 sm:p-4 shadow-2xs hover:border-slate-300 transition-colors"
              >
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                  {/* Left: Badges & Question */}
                  <div className="flex-1 min-w-0 space-y-2">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {/* Type Badge */}
                      <span className="inline-flex items-center rounded-md bg-slate-100 border border-slate-200 px-2 py-0.5 text-2xs font-semibold text-slate-700">
                        {qItem.type === "SHORT_ANSWER"
                          ? "Short Answer"
                          : qItem.type === "MCQ"
                            ? "MCQ"
                            : "Coding"}
                      </span>

                      {/* Difficulty Badge */}
                      <span
                        className={`inline-flex items-center rounded-md px-2 py-0.5 text-2xs font-semibold border ${qItem.difficulty === "easy"
                          ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                          : qItem.difficulty === "hard"
                            ? "bg-rose-50 text-rose-700 border-rose-200"
                            : "bg-amber-50 text-amber-700 border-amber-200"
                          }`}
                      >
                        {qItem.difficulty.charAt(0).toUpperCase() + qItem.difficulty.slice(1)}
                      </span>

                      {/* Status Badge */}
                      <span
                        className={`inline-flex items-center rounded-md px-2 py-0.5 text-2xs font-semibold border ${qItem.status === "mastered"
                          ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                          : qItem.status === "learning"
                            ? "bg-sky-50 text-sky-700 border-sky-200"
                            : "bg-slate-100 text-slate-600 border-slate-200"
                          }`}
                      >
                        {qItem.status.charAt(0).toUpperCase() + qItem.status.slice(1)}
                      </span>

                      {/* Topic Badge */}
                      {qItem.topic && (
                        <span className="inline-flex items-center rounded-md bg-slate-50 border border-slate-200 px-2 py-0.5 text-2xs font-medium text-slate-600">
                          #{qItem.topic}
                        </span>
                      )}

                      {/* Last Practiced Time */}
                      {qItem.lastPracticedAt && (
                        <span className="text-3xs text-slate-400">
                          Practiced: {formatTimestamp(qItem.lastPracticedAt)}
                        </span>
                      )}
                    </div>

                    {/* Question text */}
                    <p className="text-sm font-semibold text-slate-900 leading-snug whitespace-pre-wrap break-words">
                      {qItem.question}
                    </p>

                    {/* Quick Answer Preview / Details */}
                    {qItem.type === "MCQ" && Array.isArray(qItem.options) && (
                      <div className="mt-2 space-y-1 pl-1">
                        {qItem.options.map((opt, idx) => (
                          <div
                            key={idx}
                            className={`flex items-center gap-2 text-xs ${idx === qItem.correctOptionIndex
                              ? "text-[#2848D8] font-medium"
                              : "text-slate-500"
                              }`}
                          >
                            <span
                              className={`h-4 w-4 rounded-full flex items-center justify-center text-3xs border ${idx === qItem.correctOptionIndex
                                ? "border-[#365CF5] bg-[#EEF3FF] text-[#2848D8] font-bold"
                                : "border-[#DCE3EF] text-slate-400"
                                }`}
                            >
                              {String.fromCharCode(65 + idx)}
                            </span>
                            <span>{opt}</span>
                            {idx === qItem.correctOptionIndex && (
                              <span className="text-3xs text-[#365CF5] font-medium">✓ Correct</span>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Right Actions */}
                  <div className="flex items-center gap-1.5 shrink-0 self-end sm:self-start">
                    {/* Mastery Status Selector */}
                    <select
                      value={qItem.status}
                      onChange={(e) => handleUpdateStatus(qItem, e.target.value)}
                      aria-label={`Update mastery status for "${qItem.question}"`}
                      className="rounded-lg border border-[#E6EAF2] bg-[#F4F6FB] px-2 py-1 text-2xs font-medium text-[#344054] focus:outline-none focus:ring-1 focus:ring-[#365CF5]"
                    >
                      <option value="unlearned">Unlearned</option>
                      <option value="learning">Learning</option>
                      <option value="mastered">Mastered</option>
                    </select>

                    {/* Practice button */}
                    <button
                      type="button"
                      onClick={() => handleStartPractice(qItem)}
                      aria-label={`Practice question "${qItem.question}"`}
                      className="rounded-lg border border-[#DCE3EF] px-2.5 py-1 text-2xs font-semibold text-[#365CF5] hover:bg-[#EEF3FF] transition-colors"
                    >
                      Practice
                    </button>

                    {/* Edit button */}
                    <button
                      type="button"
                      onClick={() => handleOpenEdit(qItem)}
                      aria-label={`Edit question "${qItem.question}"`}
                      className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors"
                    >
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
                      </svg>
                    </button>

                    {/* Delete button */}
                    <button
                      type="button"
                      onClick={() => handleOpenDelete(qItem)}
                      aria-label={`Delete question "${qItem.question}"`}
                      className="rounded-lg p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-600 transition-colors"
                    >
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                      </svg>
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Pagination Controls */}
      {total > PAGE_SIZE && (
        <div className="flex items-center justify-between border-t border-slate-200 pt-4 text-xs text-slate-500">
          <div>
            Showing <span className="font-medium text-slate-900">{offset + 1}</span> to{" "}
            <span className="font-medium text-slate-900">
              {Math.min(offset + PAGE_SIZE, total)}
            </span>{" "}
            of <span className="font-medium text-slate-900">{total}</span> questions
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={offset === 0 || isLoading}
              onClick={() => setOffset((prev) => Math.max(0, prev - PAGE_SIZE))}
              className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 font-medium text-slate-700 shadow-2xs hover:bg-slate-50 disabled:opacity-40 transition-colors"
            >
              Previous
            </button>
            <button
              type="button"
              disabled={!hasMore || offset + PAGE_SIZE >= total || isLoading}
              onClick={() => setOffset((prev) => prev + PAGE_SIZE)}
              className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 font-medium text-slate-700 shadow-2xs hover:bg-slate-50 disabled:opacity-40 transition-colors"
            >
              Next
            </button>
          </div>
        </div>
      )}

      {/* Practice Mode Modal */}
      {isPracticeMode && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Practice Question"
          aria-labelledby="practice-modal-title"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs"
        >
          <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-3xl bg-white p-6 sm:p-8 shadow-2xl border border-slate-200 space-y-6">
            {questions.length === 0 ? (
              <div className="text-center py-6 space-y-4">
                <h2 id="practice-modal-title" className="text-lg font-bold text-slate-900">
                  No questions to practice
                </h2>
                <p className="text-sm text-slate-600">
                  There are no questions available to practice in your current filter view.
                </p>
                <button
                  type="button"
                  onClick={() => setIsPracticeMode(false)}
                  className="rounded-xl bg-[#365CF5] px-5 py-2 text-xs font-semibold text-white hover:bg-[#2848D8] transition-colors"
                >
                  Close
                </button>
              </div>
            ) : (
              (() => {
                const currentQ = questions[practiceIndex] || questions[0];
                return (
                  <>
                    {/* Header */}
                    <div className="flex items-center justify-between border-b border-[#E6EAF2] pb-4">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-semibold uppercase tracking-wider text-[#365CF5]">
                            Practice Mode
                          </span>
                          <span className="text-xs text-[#8A94A6]">
                            Question {practiceIndex + 1} of {questions.length}
                          </span>
                        </div>
                        <h2 id="practice-modal-title" className="text-base font-bold text-[#182230] mt-1">
                          Practice: {currentQ.topic ? `#${currentQ.topic}` : "Question"}
                        </h2>
                      </div>
                      <button
                        type="button"
                        onClick={() => setIsPracticeMode(false)}
                        aria-label="Exit practice mode"
                        className="rounded-lg p-1.5 text-[#8A94A6] hover:bg-[#F4F6FB] hover:text-[#182230] transition-colors"
                      >
                        ✕
                      </button>
                    </div>

                    {/* Practice Notice */}
                    {practiceSuccessNotice && (
                      <div className="rounded-xl bg-[#EEF3FF] border border-[#365CF5]/30 p-3 text-xs text-[#2848D8] font-medium">
                        {practiceSuccessNotice}
                      </div>
                    )}

                    {/* Question Card */}
                    <div className="space-y-4">
                      <div className="flex items-center gap-2">
                        <span className="rounded-md bg-[#F4F6FB] border border-[#E6EAF2] px-2 py-0.5 text-2xs font-semibold text-[#344054]">
                          {currentQ.type}
                        </span>
                        <span className="rounded-md bg-[#F4F6FB] border border-[#E6EAF2] px-2 py-0.5 text-2xs font-semibold text-[#344054]">
                          {currentQ.difficulty}
                        </span>
                        <span className="rounded-md bg-[#F4F6FB] border border-[#E6EAF2] px-2 py-0.5 text-2xs font-semibold text-[#344054]">
                          Status: {currentQ.status}
                        </span>
                      </div>

                      <div className="rounded-2xl bg-[#F7F8FA] p-5 border border-[#E6EAF2]">
                        <p className="text-base font-medium text-[#182230] leading-relaxed whitespace-pre-wrap">
                          {currentQ.question}
                        </p>
                      </div>

                      {/* If MCQ: Options Selection & Check */}
                      {currentQ.type === "MCQ" && Array.isArray(currentQ.options) && (
                        <div className="space-y-2 pt-2">
                          <p className="text-xs font-semibold text-[#182230]">Select an option:</p>
                          <div className="space-y-2">
                            {currentQ.options.map((opt, optIdx) => {
                              const isSelected = selectedMcqOption === optIdx;
                              const isCorrect = optIdx === currentQ.correctOptionIndex;
                              let optionClass = "border-[#E6EAF2] hover:border-[#365CF5]/40 bg-white text-[#182230]";

                              if (isMcqChecked) {
                                if (isCorrect) {
                                  optionClass = "border-emerald-500 bg-emerald-50/70 text-emerald-900 font-semibold";
                                } else if (isSelected && !isCorrect) {
                                  optionClass = "border-rose-400 bg-rose-50 text-rose-900 font-semibold";
                                }
                              } else if (isSelected) {
                                optionClass = "border-[#365CF5] bg-[#EEF3FF] text-[#182230] font-medium ring-1 ring-[#365CF5]";
                              }

                              return (
                                <button
                                  key={optIdx}
                                  type="button"
                                  disabled={isMcqChecked}
                                  onClick={() => setSelectedMcqOption(optIdx)}
                                  className={`w-full text-left flex items-center gap-3 p-3 rounded-xl border text-sm transition-all ${optionClass}`}
                                >
                                  <span className="h-6 w-6 rounded-full border border-[#DCE3EF] flex items-center justify-center text-xs font-bold shrink-0">
                                    {String.fromCharCode(65 + optIdx)}
                                  </span>
                                  <span className="flex-1">{opt}</span>
                                  {isMcqChecked && isCorrect && (
                                    <span className="text-xs text-emerald-700 font-bold shrink-0">✓ Correct Answer</span>
                                  )}
                                  {isMcqChecked && isSelected && !isCorrect && (
                                    <span className="text-xs text-rose-600 font-bold shrink-0">✕ Your Choice</span>
                                  )}
                                </button>
                              );
                            })}
                          </div>

                          {!isMcqChecked && (
                            <button
                              type="button"
                              disabled={selectedMcqOption === null}
                              onClick={() => {
                                setIsMcqChecked(true);
                                setIsAnswerRevealed(true);
                              }}
                              className="mt-2 rounded-xl bg-[#365CF5] px-4 py-2 text-xs font-semibold text-white hover:bg-[#2848D8] disabled:opacity-50 transition-colors"
                            >
                              Check Answer
                            </button>
                          )}
                        </div>
                      )}

                      {/* Reveal Answer / Solution Button */}
                      {!isAnswerRevealed && currentQ.type !== "MCQ" && (
                        <div className="pt-2">
                          <button
                            type="button"
                            onClick={() => setIsAnswerRevealed(true)}
                            className="rounded-xl border border-[#DCE3EF] bg-white px-4 py-2 text-xs font-semibold text-[#344054] hover:bg-[#F4F6FB] transition-colors"
                          >
                            Reveal Answer & Explanation
                          </button>
                        </div>
                      )}

                      {/* Revealed Answer & Explanation */}
                      {isAnswerRevealed && (
                        <div className="space-y-3 rounded-2xl bg-[#EFF6FF] border border-[#BFDBFE] p-5 animate-fade-in">
                          {currentQ.answer && (
                            <div>
                              <h4 className="text-xs font-bold uppercase tracking-wider text-[#182230] mb-1">
                                {currentQ.type === "CODING" ? "Solution / Implementation" : "Answer"}
                              </h4>
                              <p className={`text-sm text-[#182230] whitespace-pre-wrap ${currentQ.type === "CODING" ? "font-mono bg-white p-3 rounded-xl border border-[#E5E7EB] text-xs" : ""}`}>
                                {currentQ.answer}
                              </p>
                            </div>
                          )}

                          {currentQ.explanation && (
                            <div>
                              <h4 className="text-xs font-bold uppercase tracking-wider text-[#182230] mb-1">
                                Explanation
                              </h4>
                              <p className="text-xs text-[#344054] whitespace-pre-wrap leading-relaxed">
                                {currentQ.explanation}
                              </p>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Practice Result Buttons (Always Available) */}
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-4 border-t border-slate-200">
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            disabled={isSubmittingPractice}
                            onClick={() => handleRecordPracticeResult(currentQ, "correct")}
                            className="rounded-xl bg-emerald-600 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 transition-colors disabled:opacity-50"
                          >
                            Mark correct
                          </button>
                          <button
                            type="button"
                            disabled={isSubmittingPractice}
                            onClick={() => handleRecordPracticeResult(currentQ, "incorrect")}
                            className="rounded-xl bg-rose-600 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-rose-700 transition-colors disabled:opacity-50"
                          >
                            Mark incorrect
                          </button>
                        </div>

                        {/* Next question */}
                        <button
                          type="button"
                          onClick={handleNextPractice}
                          className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
                        >
                          Next question →
                        </button>
                      </div>
                    </div>
                  </>
                );
              })()
            )}
          </div>
        </div>
      )}

      {/* Create / Edit Question Modal */}
      {showFormModal && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="form-question-modal-title"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs"
        >
          <div className="w-full max-w-xl max-h-[90vh] overflow-y-auto rounded-3xl bg-white p-6 shadow-xl border border-slate-200">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <h2 id="form-question-modal-title" className="text-lg font-bold text-slate-900">
                {editingQuestion ? "Edit Question" : "New Question"}
              </h2>
              <button
                type="button"
                onClick={handleCloseForm}
                disabled={isSubmittingForm}
                aria-label="Close modal"
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSubmitForm} className="mt-4 space-y-4">
              {/* Type, Difficulty, Status Row */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label htmlFor="q-type" className="block text-xs font-semibold text-slate-700 mb-1">
                    Question Type <span className="text-rose-600">*</span>
                  </label>
                  <select
                    id="q-type"
                    value={formType}
                    onChange={(e) => setFormType(e.target.value)}
                    disabled={isSubmittingForm}
                    className="w-full rounded-xl border border-[#DCE3EF] bg-white px-3 py-2 text-xs font-medium text-[#344054] focus:border-[#365CF5] focus:outline-none focus:ring-1 focus:ring-[#365CF5]"
                  >
                    <option value="SHORT_ANSWER">Short Answer</option>
                    <option value="MCQ">MCQ</option>
                    <option value="CODING">Coding</option>
                  </select>
                </div>

                <div>
                  <label htmlFor="q-difficulty" className="block text-xs font-semibold text-[#182230] mb-1">
                    Difficulty
                  </label>
                  <select
                    id="q-difficulty"
                    value={formDifficulty}
                    onChange={(e) => setFormDifficulty(e.target.value)}
                    disabled={isSubmittingForm}
                    className="w-full rounded-xl border border-[#DCE3EF] bg-white px-3 py-2 text-xs font-medium text-[#344054] focus:border-[#365CF5] focus:outline-none focus:ring-1 focus:ring-[#365CF5]"
                  >
                    <option value="easy">Easy</option>
                    <option value="medium">Medium</option>
                    <option value="hard">Hard</option>
                  </select>
                </div>

                <div>
                  <label htmlFor="q-status" className="block text-xs font-semibold text-[#182230] mb-1">
                    Mastery Status
                  </label>
                  <select
                    id="q-status"
                    value={formStatus}
                    onChange={(e) => setFormStatus(e.target.value)}
                    disabled={isSubmittingForm}
                    className="w-full rounded-xl border border-[#DCE3EF] bg-white px-3 py-2 text-xs font-medium text-[#344054] focus:border-[#365CF5] focus:outline-none focus:ring-1 focus:ring-[#365CF5]"
                  >
                    <option value="unlearned">Unlearned</option>
                    <option value="learning">Learning</option>
                    <option value="mastered">Mastered</option>
                  </select>
                </div>
              </div>

              {/* Topic */}
              <div>
                <label htmlFor="q-topic" className="block text-xs font-semibold text-[#182230] mb-1">
                  Topic (Optional)
                </label>
                <input
                  id="q-topic"
                  type="text"
                  value={formTopic}
                  onChange={(e) => setFormTopic(e.target.value)}
                  maxLength={QUESTION_LIMITS.MAX_TOPIC_LENGTH}
                  placeholder="e.g. Arrays, Java Collections, SQL"
                  disabled={isSubmittingForm}
                  className="w-full rounded-xl border border-[#DCE3EF] bg-white px-3 py-2 text-xs text-[#182230] placeholder-[#8A94A6] focus:border-[#365CF5] focus:outline-none focus:ring-1 focus:ring-[#365CF5]"
                />
              </div>

              {/* Question Text */}
              <div>
                <label htmlFor="q-question" className="block text-xs font-semibold text-[#182230] mb-1">
                  Question <span className="text-rose-600">*</span>
                </label>
                <textarea
                  id="q-question"
                  value={formQuestion}
                  onChange={(e) => setFormQuestion(e.target.value)}
                  maxLength={QUESTION_LIMITS.MAX_QUESTION_LENGTH}
                  rows={3}
                  required
                  placeholder="Enter the question prompt..."
                  disabled={isSubmittingForm}
                  className="w-full rounded-xl border border-[#DCE3EF] bg-white px-3 py-2 text-sm text-[#182230] placeholder-[#8A94A6] focus:border-[#365CF5] focus:outline-none focus:ring-1 focus:ring-[#365CF5]"
                />
                <p className="mt-1 text-right text-3xs text-[#8A94A6]">
                  {formQuestion.length}/{QUESTION_LIMITS.MAX_QUESTION_LENGTH}
                </p>
              </div>

              {/* MCQ Options Builder */}
              {formType === "MCQ" && (
                <div className="space-y-3 rounded-2xl bg-[#F7F8FA] p-4 border border-[#E6EAF2]">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-[#182230]">
                      Options (2–6) & Correct Answer
                    </span>
                    <button
                      type="button"
                      disabled={formMcqOptions.length >= QUESTION_LIMITS.MAX_MCQ_OPTIONS || isSubmittingForm}
                      onClick={handleAddMcqOption}
                      className="text-xs font-semibold text-[#365CF5] hover:text-[#2848D8] disabled:opacity-40 transition-colors"
                    >
                      + Add Option
                    </button>
                  </div>

                  <div className="space-y-2">
                    {formMcqOptions.map((opt, idx) => (
                      <div key={idx} className="flex items-center gap-2">
                        <input
                          type="radio"
                          name="mcq-correct-option"
                          checked={formCorrectOptionIndex === idx}
                          onChange={() => setFormCorrectOptionIndex(idx)}
                          aria-label={`Mark option ${idx + 1} as correct`}
                          className="text-[#365CF5] focus:ring-[#365CF5]"
                        />
                        <span className="text-xs font-bold text-[#667085] w-4">
                          {String.fromCharCode(65 + idx)}.
                        </span>
                        <input
                          type="text"
                          value={opt}
                          onChange={(e) => handleMcqOptionChange(idx, e.target.value)}
                          maxLength={QUESTION_LIMITS.MAX_MCQ_OPTION_LENGTH}
                          placeholder={`Option ${idx + 1}`}
                          disabled={isSubmittingForm}
                          className="flex-1 rounded-xl border border-[#DCE3EF] bg-white px-3 py-1.5 text-xs text-[#182230] placeholder-[#8A94A6] focus:border-[#365CF5] focus:outline-none"
                        />
                        {formMcqOptions.length > QUESTION_LIMITS.MIN_MCQ_OPTIONS && (
                          <button
                            type="button"
                            onClick={() => handleRemoveMcqOption(idx)}
                            aria-label={`Remove option ${idx + 1}`}
                            className="p-1 text-[#8A94A6] hover:text-rose-600 text-xs transition-colors"
                          >
                            ✕
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                  <p className="text-3xs text-[#667085]">
                    Select the radio button next to the option that is the correct answer.
                  </p>
                </div>
              )}

              {/* Answer / Solution (for SHORT_ANSWER and CODING) */}
              {formType !== "MCQ" && (
                <div>
                  <label htmlFor="q-answer" className="block text-xs font-semibold text-[#182230] mb-1">
                    {formType === "CODING" ? "Solution Code / Implementation" : "Answer"} (Optional)
                  </label>
                  <textarea
                    id="q-answer"
                    value={formAnswer}
                    onChange={(e) => setFormAnswer(e.target.value)}
                    maxLength={QUESTION_LIMITS.MAX_ANSWER_LENGTH}
                    rows={formType === "CODING" ? 5 : 3}
                    placeholder={
                      formType === "CODING"
                        ? "Enter solution code or function implementation..."
                        : "Enter expected answer..."
                    }
                    disabled={isSubmittingForm}
                    className={`w-full rounded-xl border border-[#DCE3EF] bg-white px-3 py-2 text-sm text-[#182230] placeholder-[#8A94A6] focus:border-[#365CF5] focus:outline-none focus:ring-1 focus:ring-[#365CF5] ${formType === "CODING" ? "font-mono text-xs" : ""
                      }`}
                  />
                  <p className="mt-1 text-right text-3xs text-[#8A94A6]">
                    {formAnswer.length}/{QUESTION_LIMITS.MAX_ANSWER_LENGTH}
                  </p>
                </div>
              )}

              {/* Explanation */}
              <div>
                <label htmlFor="q-explanation" className="block text-xs font-semibold text-[#182230] mb-1">
                  Explanation / Notes (Optional)
                </label>
                <textarea
                  id="q-explanation"
                  value={formExplanation}
                  onChange={(e) => setFormExplanation(e.target.value)}
                  maxLength={QUESTION_LIMITS.MAX_EXPLANATION_LENGTH}
                  rows={2}
                  placeholder="Key insights, time/space complexity, or common edge cases..."
                  disabled={isSubmittingForm}
                  className="w-full rounded-xl border border-[#DCE3EF] bg-white px-3 py-2 text-xs text-[#182230] placeholder-[#8A94A6] focus:border-[#365CF5] focus:outline-none focus:ring-1 focus:ring-[#365CF5]"
                />
                <p className="mt-1 text-right text-3xs text-[#8A94A6]">
                  {formExplanation.length}/{QUESTION_LIMITS.MAX_EXPLANATION_LENGTH}
                </p>
              </div>

              {formError && (
                <div role="alert" className="rounded-lg bg-rose-50 p-3 text-xs text-rose-700 font-medium">
                  {formError}
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-[#E6EAF2]">
                <button
                  type="button"
                  onClick={handleCloseForm}
                  disabled={isSubmittingForm}
                  className="rounded-xl border border-[#DCE3EF] px-4 py-2 text-xs font-semibold text-[#344054] hover:bg-[#F4F6FB] transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingForm || !formQuestion.trim()}
                  className="rounded-xl bg-[#365CF5] px-4 py-2 text-xs font-semibold text-white hover:bg-[#2848D8] disabled:opacity-50 transition-colors"
                >
                  {isSubmittingForm ? "Saving..." : editingQuestion ? "Save Changes" : "Create Question"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deletingQuestion && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-q-modal-title"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs"
        >
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl border border-slate-200">
            <h2 id="delete-q-modal-title" className="text-lg font-bold text-slate-900">
              Delete Question
            </h2>
            <p className="mt-2 text-sm text-slate-600">
              Are you sure you want to delete this question?
            </p>
            <p className="mt-1 text-xs font-semibold text-slate-800 italic line-clamp-2">
              “{deletingQuestion.question}”
            </p>
            <div className="mt-3 rounded-xl bg-slate-50 border border-slate-200 p-3 text-xs text-slate-600">
              This question will be moved to a deleted state and excluded from your active question bank.
            </div>

            {deleteError && (
              <div role="alert" className="mt-3 rounded-lg bg-rose-50 p-3 text-xs text-rose-700">
                {deleteError}
              </div>
            )}

            <div className="mt-5 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={handleCloseDelete}
                disabled={isSubmittingDelete}
                className="rounded-xl border border-slate-300 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSubmitDelete}
                disabled={isSubmittingDelete}
                className="rounded-xl bg-rose-600 hover:bg-rose-700 px-4 py-2 text-xs font-semibold text-white disabled:opacity-50 transition-colors"
              >
                {isSubmittingDelete ? "Deleting..." : "Delete Question"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
