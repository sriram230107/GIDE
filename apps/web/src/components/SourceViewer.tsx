"use client";

import React, { useState, useEffect } from "react";

export interface ContentUnit {
  id: string;
  source_id: string;
  source_type: string;
  unit_type: "text" | "heading" | "diagram";
  content: string;
  vision_caption?: string | null;
  ocr_text?: string | null;
  page_number?: number | null;
  slide_number?: number | null;
  time_start?: number | null;
  time_end?: number | null;
  image_path?: string | null;
  bounding_box?: {
    x0: number;
    y0: number;
    x1: number;
    y1: number;
  } | null;
  sequence_index: number;
  unit_metadata?: Record<string, any>;
}

interface SourceViewerProps {
  sourceId: string | null;
  sourceTitle: string | null;
  targetPage: number;
  activeUnit: ContentUnit | null;
  totalPages?: number;
  onPageChange?: (page: number) => void;
}

export function SourceViewer({
  sourceId,
  sourceTitle,
  targetPage,
  activeUnit,
  totalPages = 1,
  onPageChange,
}: SourceViewerProps) {
  const [currentPage, setCurrentPage] = useState<number>(targetPage || 1);
  const [zoomLevel, setZoomLevel] = useState<number>(100);
  const [viewMode, setViewMode] = useState<"embedded" | "diagram">("embedded");

  // Keep internal page in sync when parent targetPage updates
  useEffect(() => {
    if (targetPage && targetPage > 0) {
      setCurrentPage(targetPage);
    }
  }, [targetPage]);

  const handlePrevPage = () => {
    const next = Math.max(1, currentPage - 1);
    setCurrentPage(next);
    onPageChange?.(next);
  };

  const handleNextPage = () => {
    const next = Math.min(totalPages, currentPage + 1);
    setCurrentPage(next);
    onPageChange?.(next);
  };

  if (!sourceId) {
    return (
      <div className="flex h-full min-h-[580px] flex-col items-center justify-center rounded-2xl border border-dashed border-zinc-800 bg-zinc-950/60 p-8 text-center backdrop-blur-sm">
        <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-zinc-900 border border-zinc-800 text-zinc-500 shadow-inner">
          <svg className="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
          </svg>
        </div>
        <h3 className="text-base font-medium text-zinc-300">No Document Selected</h3>
        <p className="mt-1.5 max-w-xs text-xs text-zinc-500">
          Upload a textbook PDF or click on an extracted ContentUnit to inspect its exact source location.
        </p>
      </div>
    );
  }

  const pdfUrl = `http://localhost:8000/storage/sources/${sourceId}.pdf#page=${currentPage}`;
  const diagramUrl = activeUnit?.image_path ? `http://localhost:8000/storage/${activeUnit.image_path}` : null;

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-950 shadow-2xl">
      {/* Viewer Header */}
      <div className="flex flex-wrap items-center justify-between border-b border-zinc-800/80 bg-zinc-900/70 px-4 py-3 backdrop-blur-md gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-zinc-100 max-w-[220px] truncate" title={sourceTitle || "Document"}>
                {sourceTitle || "Source Document"}
              </span>
              <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-400 border border-emerald-500/20">
                PDF Provenance Sync
              </span>
            </div>
            <p className="text-[11px] text-zinc-500">
              Synchronized to Physical Page <strong className="text-zinc-300">#{currentPage}</strong>
            </p>
          </div>
        </div>

        {/* Page navigation controls */}
        <div className="flex items-center gap-2">
          {activeUnit?.image_path && (
            <div className="flex rounded-lg border border-zinc-800 bg-zinc-900 p-0.5 text-xs">
              <button
                onClick={() => setViewMode("embedded")}
                className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-all ${
                  viewMode === "embedded" ? "bg-zinc-800 text-white shadow-sm" : "text-zinc-400 hover:text-zinc-200"
                }`}
              >
                PDF Page
              </button>
              <button
                onClick={() => setViewMode("diagram")}
                className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-all ${
                  viewMode === "diagram" ? "bg-indigo-600 text-white shadow-sm" : "text-zinc-400 hover:text-zinc-200"
                }`}
              >
                Extracted Vector
              </button>
            </div>
          )}

          <div className="flex items-center rounded-lg border border-zinc-800 bg-zinc-900 px-1 py-0.5">
            <button
              onClick={handlePrevPage}
              disabled={currentPage <= 1}
              className="rounded p-1 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100 disabled:opacity-30 disabled:hover:bg-transparent"
              title="Previous Page"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <span className="px-2.5 text-xs font-mono font-medium text-zinc-200">
              {currentPage} / {totalPages || 1}
            </span>
            <button
              onClick={handleNextPage}
              disabled={currentPage >= totalPages}
              className="rounded p-1 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100 disabled:opacity-30 disabled:hover:bg-transparent"
              title="Next Page"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </div>

          <a
            href={pdfUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 rounded-lg border border-zinc-800 bg-zinc-900 px-2.5 py-1.5 text-[11px] font-medium text-zinc-300 hover:bg-zinc-800 hover:text-white transition-colors"
            title="Open in Native Viewer"
          >
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
            </svg>
            <span>Raw</span>
          </a>
        </div>
      </div>

      {/* Primary Display Area */}
      <div className="relative flex-1 bg-zinc-900/40 min-h-[500px]">
        {viewMode === "diagram" && diagramUrl ? (
          <div className="flex h-full w-full flex-col items-center justify-center p-6 bg-zinc-950">
            <div className="relative max-h-full max-w-full overflow-hidden rounded-xl border border-zinc-800 bg-black/60 p-4 shadow-xl">
              <img
                src={diagramUrl}
                alt="Extracted Diagram"
                className="max-h-[460px] object-contain rounded-lg"
              />
              <div className="mt-3 flex items-center justify-between text-xs text-zinc-400">
                <span>Vector / Diagram Render for Page {currentPage}</span>
                <a
                  href={diagramUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-indigo-400 hover:underline"
                >
                  View full image
                </a>
              </div>
            </div>
          </div>
        ) : (
          <iframe
            key={`${sourceId}-page-${currentPage}`}
            src={pdfUrl}
            className="h-full w-full min-h-[540px] border-0"
            title={`Source Document Viewer - Page ${currentPage}`}
          />
        )}

        {/* Active Provenance Floating Overlay Card */}
        {activeUnit && (
          <div className="absolute bottom-4 left-4 right-4 rounded-xl border border-zinc-700/60 bg-zinc-950/90 p-3.5 backdrop-blur-xl shadow-2xl transition-all">
            <div className="flex items-center justify-between gap-2 border-b border-zinc-800/80 pb-2">
              <div className="flex items-center gap-2">
                <span className="flex h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
                <span className="text-xs font-semibold text-zinc-200">
                  Physical Provenance: Unit #{activeUnit.sequence_index}
                </span>
                <span className="rounded bg-zinc-800 px-1.5 py-0.5 text-[10px] font-mono text-zinc-300 uppercase">
                  {activeUnit.unit_type}
                </span>
              </div>
              {activeUnit.bounding_box && (
                <span className="text-[10px] font-mono text-zinc-400 bg-zinc-900 px-2 py-0.5 rounded border border-zinc-800">
                  Box: [{activeUnit.bounding_box.x0}, {activeUnit.bounding_box.y0}] → [{activeUnit.bounding_box.x1}, {activeUnit.bounding_box.y1}]
                </span>
              )}
            </div>
            <p className="mt-2 line-clamp-2 text-xs text-zinc-300 font-sans leading-relaxed">
              "{activeUnit.content}"
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
