"use client";

import React, { useState, useEffect, useRef } from "react";
import { SourceViewer, ContentUnit } from "@/components/SourceViewer";

interface ProcessingJob {
  id: string;
  state: string;
  stage: string;
  progress_percent: number;
  attempt_number: number;
  error_detail?: any;
}

interface Source {
  id: string;
  course_id: string;
  title: string;
  source_type: string;
  file_path: string;
  file_size_bytes: number;
  status: string;
  error_message?: string | null;
  source_metadata: Record<string, any>;
  processing_jobs: ProcessingJob[];
}

export default function Home() {
  const [sources, setSources] = useState<Source[]>([]);
  const [selectedSource, setSelectedSource] = useState<Source | null>(null);
  const [units, setUnits] = useState<ContentUnit[]>([]);
  const [activeUnit, setActiveUnit] = useState<ContentUnit | null>(null);
  const [targetPage, setTargetPage] = useState<number>(1);
  const [filterType, setFilterType] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [isUploading, setIsUploading] = useState<boolean>(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [apiOnline, setApiOnline] = useState<boolean | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Health check
  useEffect(() => {
    const checkHealth = async () => {
      try {
        const res = await fetch("http://localhost:8000/health");
        setApiOnline(res.ok);
      } catch (e) {
        setApiOnline(false);
      }
    };
    checkHealth();
    const interval = setInterval(checkHealth, 5000);
    return () => clearInterval(interval);
  }, []);

  // Fetch sources list on mount
  useEffect(() => {
    fetchSources();
  }, []);

  const fetchSources = async () => {
    try {
      const res = await fetch("http://localhost:8000/api/sources");
      if (res.ok) {
        const data = await res.json();
        setSources(data);
        if (data.length > 0 && !selectedSource) {
          selectSource(data[0]);
        }
      }
    } catch (e) {
      console.error("Error fetching sources:", e);
    }
  };

  const selectSource = async (source: Source) => {
    setSelectedSource(source);
    setActiveUnit(null);
    setTargetPage(1);

    // If source is completed, fetch its units
    if (source.status === "completed") {
      fetchUnits(source.id);
    } else {
      setUnits([]);
    }
  };

  const fetchUnits = async (sourceId: string) => {
    try {
      const res = await fetch(`http://localhost:8000/api/sources/${sourceId}/units`);
      if (res.ok) {
        const data: ContentUnit[] = await res.json();
        setUnits(data);
        if (data.length > 0) {
          setActiveUnit(data[0]);
          setTargetPage(data[0].page_number || 1);
        }
      }
    } catch (e) {
      console.error("Error fetching units:", e);
    }
  };

  // Poll selected source if still processing
  useEffect(() => {
    if (!selectedSource || selectedSource.status === "completed" || selectedSource.status === "failed") {
      return;
    }

    const interval = setInterval(async () => {
      try {
        const res = await fetch(`http://localhost:8000/api/sources/${selectedSource.id}`);
        if (res.ok) {
          const updatedSource: Source = await res.json();
          setSelectedSource(updatedSource);
          // Also update in sources list
          setSources((prev) =>
            prev.map((s) => (s.id === updatedSource.id ? updatedSource : s))
          );

          if (updatedSource.status === "completed") {
            clearInterval(interval);
            fetchUnits(updatedSource.id);
          }
        }
      } catch (e) {
        console.error("Polling error:", e);
      }
    }, 800);

    return () => clearInterval(interval);
  }, [selectedSource]);

  // Upload handler
  const handleUpload = async (file: File) => {
    if (!file.name.toLowerCase().endsWith(".pdf")) {
      setUploadError("Step 0 only accepts PDF documents (.pdf)");
      return;
    }

    setIsUploading(true);
    setUploadError(null);

    const formData = new FormData();
    formData.append("file", file);
    formData.append("title", file.name.replace(".pdf", ""));

    try {
      const res = await fetch("http://localhost:8000/api/sources/upload", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || "Upload failed");
      }

      const newSource: Source = await res.json();
      setSources((prev) => [newSource, ...prev]);
      setSelectedSource(newSource);
      setUnits([]);
      setActiveUnit(null);
    } catch (e: any) {
      setUploadError(e.message || "Upload failed");
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  // Quick helper to test with fixture
  const handleLoadSamplePdf = async () => {
    setIsUploading(true);
    setUploadError(null);
    try {
      // Fetch sample PDF from static endpoint or create simple blob
      // Check if existing sample source is already uploaded
      const existing = sources.find((s) => s.title.includes("sample_textbook") || s.title.includes("Introduction to AI"));
      if (existing) {
        selectSource(existing);
        setIsUploading(false);
        return;
      }

      // Upload via backend
      const res = await fetch("http://localhost:8000/storage/sources/sample_textbook.pdf");
      let blob: Blob;
      if (res.ok) {
        blob = await res.blob();
      } else {
        // Fallback: trigger upload of file
        throw new Error("Click 'Choose PDF' to upload a document.");
      }
      const file = new File([blob], "sample_textbook.pdf", { type: "application/pdf" });
      await handleUpload(file);
    } catch (e: any) {
      setUploadError(e.message || "Failed to load sample textbook.");
      setIsUploading(false);
    }
  };

  // Filtering units
  const filteredUnits = units.filter((u) => {
    const matchesFilter = filterType === "all" || u.unit_type === filterType;
    const matchesQuery = !searchQuery || u.content.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesFilter && matchesQuery;
  });

  const totalPages = units.length > 0 ? Math.max(...units.map((u) => u.page_number || 1)) : 1;
  const currentJob = selectedSource?.processing_jobs?.[0];

  return (
    <div className="min-h-screen bg-[#090a0f] text-zinc-100 flex flex-col font-sans selection:bg-indigo-500/30">
      {/* Top Navigation */}
      <header className="sticky top-0 z-50 border-b border-zinc-800/80 bg-[#090a0f]/80 px-6 py-3.5 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-tr from-indigo-600 to-violet-500 shadow-lg shadow-indigo-500/25">
              <span className="font-mono text-base font-black text-white">G</span>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold tracking-tight text-white text-base">GIDE</span>
                <span className="text-zinc-500 font-mono text-xs">/</span>
                <span className="text-xs font-medium text-zinc-400">Source-Grounded Adaptive Tutor</span>
              </div>
              <p className="text-[11px] text-zinc-500">
                Track D: Personalized Tutoring & Adaptive Learning • Multimodal AI Hackathon 2026
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Phase Badge */}
            <div className="flex items-center gap-1.5 rounded-full border border-indigo-500/30 bg-indigo-500/10 px-3 py-1 text-xs font-medium text-indigo-300">
              <span className="h-1.5 w-1.5 rounded-full bg-indigo-400 animate-pulse" />
              <span>Phase 1 — Step 0: PDF Provenance Slice</span>
            </div>

            {/* Backend Health Badge */}
            <div className="flex items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-900/60 px-2.5 py-1 text-xs">
              <span className={`h-2 w-2 rounded-full ${apiOnline ? "bg-emerald-400" : apiOnline === false ? "bg-rose-500" : "bg-amber-400 animate-pulse"}`} />
              <span className="font-mono text-[11px] text-zinc-400">
                {apiOnline ? "API Online" : apiOnline === false ? "API Disconnected" : "Checking..."}
              </span>
            </div>
          </div>
        </div>
      </header>

      {/* Main Workspace */}
      <main className="mx-auto flex w-full max-w-7xl flex-1 gap-6 p-6">
        {/* Left Column: Upload & Provenance Units List */}
        <div className="flex w-[480px] shrink-0 flex-col gap-5">
          {/* Upload Card */}
          <div className="rounded-2xl border border-zinc-800/80 bg-zinc-950/60 p-5 shadow-xl backdrop-blur-sm">
            <div className="flex items-center justify-between pb-3 border-b border-zinc-800/60">
              <div>
                <h2 className="text-sm font-semibold text-zinc-200">Ingest Knowledge Source</h2>
                <p className="text-xs text-zinc-500">Upload a textbook or paper (PDF)</p>
              </div>
              <span className="rounded bg-zinc-900 px-2 py-0.5 text-[10px] font-mono text-zinc-400 border border-zinc-800">
                PyMuPDF + Arq
              </span>
            </div>

            <div className="mt-4 flex flex-col gap-3">
              <div
                onClick={() => fileInputRef.current?.click()}
                className="group flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-zinc-800 p-6 text-center transition-all hover:border-indigo-500/60 hover:bg-indigo-500/[0.03]"
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-zinc-900 text-zinc-400 group-hover:bg-indigo-500/10 group-hover:text-indigo-400 transition-colors">
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                  </svg>
                </div>
                <p className="mt-2 text-xs font-medium text-zinc-300 group-hover:text-indigo-300">
                  Click to select PDF or drag & drop
                </p>
                <p className="text-[11px] text-zinc-500">Supports structured pages, headings & vector diagrams</p>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,application/pdf"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleUpload(file);
                  }}
                />
              </div>

              {uploadError && (
                <div className="rounded-lg border border-rose-500/20 bg-rose-500/10 p-2.5 text-xs text-rose-300">
                  {uploadError}
                </div>
              )}

              {/* Source Switcher / Selector */}
              {sources.length > 0 && (
                <div className="mt-1">
                  <label className="text-[11px] font-medium text-zinc-400">Ingested Sources ({sources.length})</label>
                  <select
                    value={selectedSource?.id || ""}
                    onChange={(e) => {
                      const found = sources.find((s) => s.id === e.target.value);
                      if (found) selectSource(found);
                    }}
                    className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-xs text-zinc-200 outline-none focus:border-indigo-500"
                  >
                    {sources.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.title} ({s.status})
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          </div>

          {/* Job Processing Tracker */}
          {selectedSource && (
            <div className="rounded-2xl border border-zinc-800/80 bg-zinc-950/60 p-4 shadow-xl backdrop-blur-sm">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-zinc-300">Processing Job State</span>
                <span
                  className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${
                    selectedSource.status === "completed"
                      ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                      : selectedSource.status === "processing"
                      ? "bg-amber-500/10 text-amber-400 border border-amber-500/20 animate-pulse"
                      : selectedSource.status === "failed"
                      ? "bg-rose-500/10 text-rose-400 border border-rose-500/20"
                      : "bg-zinc-800 text-zinc-400"
                  }`}
                >
                  {selectedSource.status}
                </span>
              </div>

              {currentJob && (
                <div className="mt-3">
                  <div className="flex justify-between text-[11px] text-zinc-400 mb-1">
                    <span>Stage: <strong className="text-zinc-200">{currentJob.stage}</strong></span>
                    <span>{currentJob.progress_percent}%</span>
                  </div>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-zinc-900 border border-zinc-800">
                    <div
                      className="h-full bg-gradient-to-r from-indigo-500 to-emerald-400 transition-all duration-300"
                      style={{ width: `${currentJob.progress_percent}%` }}
                    />
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Extracted Content Units Stream */}
          <div className="flex flex-1 flex-col overflow-hidden rounded-2xl border border-zinc-800/80 bg-zinc-950/60 shadow-xl backdrop-blur-sm">
            <div className="border-b border-zinc-800/80 p-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-xs font-semibold text-zinc-200">
                    Content Units Stream ({units.length})
                  </h3>
                  <p className="text-[11px] text-zinc-500">Immutable physical source citations</p>
                </div>
                <div className="flex gap-1">
                  {(["all", "heading", "text", "diagram"] as const).map((t) => (
                    <button
                      key={t}
                      onClick={() => setFilterType(t)}
                      className={`rounded px-2 py-0.5 text-[10px] font-medium capitalize transition-colors ${
                        filterType === t
                          ? "bg-indigo-600 text-white"
                          : "bg-zinc-900 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
                      }`}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </div>

              {/* Search query box */}
              <input
                type="text"
                placeholder="Search unit text..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="mt-3 w-full rounded-lg border border-zinc-800 bg-zinc-900/80 px-3 py-1.5 text-xs text-zinc-200 placeholder-zinc-500 outline-none focus:border-indigo-500/60"
              />
            </div>

            {/* List of Units */}
            <div className="flex-1 overflow-y-auto p-3 space-y-2.5 max-h-[520px]">
              {filteredUnits.length === 0 ? (
                <div className="p-8 text-center text-xs text-zinc-500">
                  {units.length === 0
                    ? selectedSource?.status === "processing"
                      ? "Extracting units in Arq worker..."
                      : "No units extracted yet."
                    : "No matching units found."}
                </div>
              ) : (
                filteredUnits.map((unit) => {
                  const isSelected = activeUnit?.id === unit.id;
                  return (
                    <div
                      key={unit.id}
                      onClick={() => {
                        setActiveUnit(unit);
                        if (unit.page_number) setTargetPage(unit.page_number);
                      }}
                      className={`group cursor-pointer rounded-xl border p-3 transition-all ${
                        isSelected
                          ? "border-emerald-500/50 bg-emerald-950/20 shadow-lg shadow-emerald-500/5"
                          : "border-zinc-850 bg-zinc-900/40 hover:border-zinc-700 hover:bg-zinc-900/80"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span
                            className={`rounded px-1.5 py-0.5 font-mono text-[10px] font-bold ${
                              isSelected
                                ? "bg-emerald-500 text-zinc-950"
                                : "bg-zinc-800 text-zinc-300"
                            }`}
                          >
                            Page {unit.page_number}
                          </span>
                          <span className="font-mono text-[10px] text-zinc-500">
                            Unit #{unit.sequence_index}
                          </span>
                        </div>
                        <span
                          className={`rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider ${
                            unit.unit_type === "heading"
                              ? "bg-purple-500/10 text-purple-400 border border-purple-500/20"
                              : unit.unit_type === "diagram"
                              ? "bg-indigo-500/10 text-indigo-400 border border-indigo-500/20"
                              : "bg-zinc-800 text-zinc-400"
                          }`}
                        >
                          {unit.unit_type}
                        </span>
                      </div>

                      <p
                        className={`mt-2 text-xs leading-relaxed line-clamp-3 ${
                          isSelected ? "text-zinc-100 font-medium" : "text-zinc-300"
                        }`}
                      >
                        {unit.content}
                      </p>

                      {unit.image_path && (
                        <div className="mt-2.5 overflow-hidden rounded-lg border border-zinc-800 bg-black/40 p-1.5">
                          <img
                            src={`http://localhost:8000/storage/${unit.image_path}`}
                            alt="Extracted figure"
                            className="max-h-24 w-full object-contain rounded"
                          />
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>

        {/* Right Column: SourceViewer Component */}
        <div className="flex flex-1 flex-col">
          <SourceViewer
            sourceId={selectedSource?.id || null}
            sourceTitle={selectedSource?.title || null}
            targetPage={targetPage}
            activeUnit={activeUnit}
            totalPages={totalPages}
            onPageChange={(page) => setTargetPage(page)}
          />
        </div>
      </main>
    </div>
  );
}
