'use client';
import { useEffect, useRef, useState, MouseEvent, useCallback } from 'react';
import type { PDFDocumentProxy, RenderTask } from 'pdfjs-dist/types/src/display/api';

// Type definitions for structured notes
interface PageNote {
  number: number;
  text: string;
  layout?: {
    blocks: Array<{
      type: string;
      text: string;
      bbox?: {
        x0: number;
        y0: number;
        x1: number;
        y1: number;
      }
    }>
  }
}

interface DocumentNotes {
  document: {
    pages: PageNote[];
    metadata: {
      total_pages: number;
    }
  }
}

interface PageNotes {
  [pageNumber: number]: string;
}

export default function PDFViewer() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const renderTaskRef = useRef<RenderTask & { pageNumber?: number } | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [scale, setScale] = useState(1.0); // Start with scale 1.0, will be adjusted by fitToPage
  const [pageNum, setPageNum] = useState(1);
  const [numPages, setNumPages] = useState<number | null>(null);
  const [pdfDoc, setPdfDoc] = useState<PDFDocumentProxy | null>(null);
  const [isPanning, setIsPanning] = useState(false);
  const [panPosition, setPanPosition] = useState({ x: 0, y: 0 });
  const [startPanPos, setStartPanPos] = useState({ x: 0, y: 0 });
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [fileName, setFileName] = useState('No file selected');
  const [isPageRendering, setIsPageRendering] = useState(false);
  const [pdfLoadSource, setPdfLoadSource] = useState<'default' | 'file' | null>(null);
  const [isEditingPage, setIsEditingPage] = useState(false);
  const [pageInputValue, setPageInputValue] = useState('');

  // Notes related state
  const [notes, setNotes] = useState<PageNotes>({});
  const [currentNote, setCurrentNote] = useState('');
  const MAX_NOTE_LENGTH = 10000; // Increased character limit for formatted notes

  // Create empty notes document structure (with option for single page or page range)
  const getEmptyNotes = (totalPages: number, specificPage?: number): DocumentNotes => {
    const emptyPages: PageNote[] = [];

    if (specificPage) {
      // Just create a structure for a specific page
      emptyPages.push({
        number: specificPage,
        text: "",
      });
    } else {
      // Create empty notes for specified number of pages
      for (let i = 1; i <= totalPages; i++) {
        emptyPages.push({
          number: i,
          text: "",
        });
      }
    }

    return {
      document: {
        pages: emptyPages,
        metadata: {
          total_pages: totalPages
        }
      }
    };
  };

  // This function is no longer needed since we handle parsing in the effect directly

  // Create or update the JSON structure when text changes
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const updateNoteJson = useCallback((newText: string): string => {
    try {
      let noteObj: DocumentNotes;

      // Try to parse existing note as JSON
      if (notes[pageNum]) {
        try {
          noteObj = JSON.parse(notes[pageNum]);
        } catch {
          // If current note isn't valid JSON, create new empty structure
          noteObj = getEmptyNotes(numPages || 1);
        }
      } else {
        // Create new empty structure if no existing note
        noteObj = getEmptyNotes(numPages || 1);
      }

      // Find the page to update
      const pageIndex = noteObj.document.pages.findIndex(
        (p: PageNote) => p.number === pageNum
      );

      if (pageIndex >= 0) {
        // Update existing page
        noteObj.document.pages[pageIndex].text = newText;
      } else {
        // Add new page
        noteObj.document.pages.push({
          number: pageNum,
          text: newText
        });
      }

      // Update total pages if needed
      noteObj.document.metadata.total_pages = Math.max(
        noteObj.document.metadata.total_pages,
        numPages || 1
      );

      return JSON.stringify(noteObj);
    } catch {
      console.error('Error updating note JSON');
      // Fallback to just storing the text
      return newText;
    }
  }, [notes, pageNum, numPages]);

  // Initialize notes structure when PDF loads and page count is available
  useEffect(() => {
    if (numPages && numPages > 0 && Object.keys(notes).length === 0) {
      // Create empty notes structure
      // We'll only create the structure for the first page initially
      // and create other pages on demand to avoid large JSON structures for big PDFs
      const emptyNotesObj = getEmptyNotes(1);
      const emptyNoteJson = JSON.stringify(emptyNotesObj);

      // Set first page as current (empty text)
      setCurrentNote("");

      // Set the empty note structure
      setNotes({ 1: emptyNoteJson });

      // Save to session storage
      sessionStorage.setItem('pdfNotes', JSON.stringify({ 1: emptyNoteJson }));
    }
  }, [numPages, notes]);

  // Effect to load notes from session storage when component mounts
  useEffect(() => {
    const savedNotes = sessionStorage.getItem('pdfNotes');
    if (savedNotes) {
      try {
        setNotes(JSON.parse(savedNotes));
      } catch (err) {
        console.error('Error parsing saved notes:', err);
      }
    }
  }, []);

  // Effect to update current note when page changes
  useEffect(() => {
    if (notes[pageNum]) {
      try {
        // Attempt to parse the JSON structure to extract just the text
        const noteObj = JSON.parse(notes[pageNum]);
        if (noteObj && noteObj.document && noteObj.document.pages) {
          // Find the page note that matches the current page
          const pageNote = noteObj.document.pages.find(p => p.number === pageNum);
          if (pageNote) {
            // Set just the text content, not the whole JSON
            setCurrentNote(pageNote.text);
            return;
          }
        }
      } catch {
        // Silently handle parsing errors and fall through to the fallback
      }

      // Fallback if there's an issue with parsing
      setCurrentNote(notes[pageNum]);
    } else if (numPages && numPages > 0) {
      // If no note exists for this page yet, create an empty note just for this page
      const emptyNotesObj = getEmptyNotes(numPages || 1, pageNum);
      const pageNote = emptyNotesObj.document.pages[0]; // We know this is the page we want

      if (pageNote) {
        // Start with empty text
        setCurrentNote("");

        // Update notes storage with this new page (empty)
        const updatedJson = updateNoteJson("");
        setNotes(prevNotes => ({
          ...prevNotes,
          [pageNum]: updatedJson
        }));
      } else {
        setCurrentNote('');
      }
    } else {
      setCurrentNote('');
    }
  }, [pageNum, notes, numPages]);

  // Save notes to session storage whenever they change
  useEffect(() => {
    sessionStorage.setItem('pdfNotes', JSON.stringify(notes));
  }, [notes]);

  // Handle note changes
  const handleNoteChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newText = e.target.value;
    // Enforce character limit
    if (newText.length <= MAX_NOTE_LENGTH) {
      setCurrentNote(newText);

      // Update JSON structure and store
      const updatedJson = updateNoteJson(newText);
      setNotes(prevNotes => ({
        ...prevNotes,
        [pageNum]: updatedJson
      }));
    }
  };

  const goToNextPage = () => {
    if (pageNum < (numPages || 1)) {
      console.log(`Moving to next page: ${pageNum + 1}`);
      setPageNum(prevPageNum => prevPageNum + 1);
    }
  };

  const goToPrevPage = () => {
    if (pageNum > 1) {
      console.log(`Moving to previous page: ${pageNum - 1}`);
      setPageNum(prevPageNum => prevPageNum - 1);
    }
  };

  const goToPage = (page: number) => {
    if (page >= 1 && page <= (numPages || 1)) {
      console.log(`Going to page: ${page}`);
      setPageNum(page);
    }
  };

  const handlePageInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    // Only allow numeric input
    const value = e.target.value.replace(/[^0-9]/g, '');
    setPageInputValue(value);
  };

  const handlePageInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      submitPageChange();
    } else if (e.key === 'Escape') {
      cancelPageEdit();
    }
  };

  const submitPageChange = () => {
    const newPage = parseInt(pageInputValue);
    if (!isNaN(newPage)) {
      goToPage(newPage);
    }
    setIsEditingPage(false);
  };

  const cancelPageEdit = () => {
    setIsEditingPage(false);
  };

  const startPageEdit = () => {
    setPageInputValue(pageNum.toString());
    setIsEditingPage(true);
  };

  // Simple zoom functions
  const zoomIn = () => {
    setScale(prevScale => Math.min(prevScale + 0.25, 5));
  };

  const zoomOut = () => {
    setScale(prevScale => Math.max(prevScale - 0.25, 0.5));
  };

  // Fit the PDF to the container size, wrapped in useCallback to avoid dependency cycles
  const fitToPage = useCallback(async () => {
    if (!pdfDoc || !containerRef.current) return;

    try {
      const page = await pdfDoc.getPage(pageNum);
      const viewport = page.getViewport({ scale: 1.0 }); // Get natural size
      const containerWidth = containerRef.current.clientWidth;
      const containerHeight = containerRef.current.clientHeight;

      // Calculate scale to fit width and height
      const scaleWidth = containerWidth / viewport.width;
      const scaleHeight = containerHeight / viewport.height;

      // Use the smaller scale to ensure the document fits in the container
      const newScale = Math.min(scaleWidth, scaleHeight);

      setScale(newScale);
      setPanPosition({ x: 0, y: 0 });
    } catch (error) {
      console.error('Error calculating fit to page:', error);
    }
  }, [pdfDoc, pageNum]);

  // Panning handlers
  const handleMouseDown = (e: MouseEvent<HTMLDivElement>) => {
    if (scale > 1) {
      setIsPanning(true);
      setStartPanPos({
        x: e.clientX - panPosition.x,
        y: e.clientY - panPosition.y
      });
    }
  };

  const handleMouseMove = (e: MouseEvent<HTMLDivElement>) => {
    if (!isPanning) return;

    const newX = e.clientX - startPanPos.x;
    const newY = e.clientY - startPanPos.y;

    setPanPosition({
      x: newX,
      y: newY
    });
  };

  const handleMouseUp = () => {
    setIsPanning(false);
  };

  const handleMouseLeave = () => {
    setIsPanning(false);
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (files && files[0] && files[0].type === 'application/pdf') {
      setPdfFile(files[0]);
      setFileName(files[0].name);
      setPageNum(1); // Reset to first page
      setPanPosition({ x: 0, y: 0 }); // Reset panning
      setError(null);
      setPdfLoadSource('file'); // Set source to file
      setIsEditingPage(false); // Close page editor if it's open
      // Clear all notes when a new PDF is uploaded
      setNotes({});
      setCurrentNote('');
      // Clear notes from session storage
      sessionStorage.removeItem('pdfNotes');
      // We'll create empty notes structure when numPages is updated
      // Important: Clear the current PDF doc to avoid conflict
      setPdfDoc(null);
    } else if (files && files[0]) {
      setError('Please select a valid PDF file');
    }
  };

  const handleUploadClick = () => {
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  // Unified PDF loading effect with source tracking
  useEffect(() => {
    let isCancelled = false;

    async function loadPDF() {
      // Skip if we're already loading or if we have the correct document loaded
      if ((pdfDoc && pdfLoadSource) || isPageRendering) {
        return;
      }

      try {
        setIsLoading(true);
        // Import pdfjs-dist dynamically for client-side rendering
        const pdfJS = await import('pdfjs-dist');
        const { getDocument } = pdfJS;

        // Set up the worker
        if (!pdfJS.GlobalWorkerOptions.workerSrc) {
          const workerSrc = new URL(
            'pdfjs-dist/build/pdf.worker.min.mjs',
            import.meta.url
          ).toString();
          pdfJS.GlobalWorkerOptions.workerSrc = workerSrc;
        }

        let loadingTask;

        // Load from file if available, otherwise load default
        if (pdfFile) {
          console.log('Loading PDF from uploaded file...');
          const arrayBuffer = await pdfFile.arrayBuffer();
          loadingTask = getDocument({ data: arrayBuffer });
          setPdfLoadSource('file');
        } else {
          console.log('Loading default PDF document...');
          loadingTask = getDocument('example.pdf');
          setPdfLoadSource('default');
          setFileName('example.pdf');
        }

        const pdf = await loadingTask.promise;

        if (!isCancelled) {
          console.log(`PDF loaded successfully with ${pdf.numPages} pages`);
          setPdfDoc(pdf as PDFDocumentProxy);
          setNumPages(pdf.numPages);
          setError(null);

          // Calculate initial scale to fit page
          setTimeout(() => {
            if (!isCancelled) {
              fitToPage();
            }
          }, 100);
        }
      } catch (error) {
        if (!isCancelled) {
          console.error('PDF loading error:', error);
          setError(
            error instanceof Error ? error.message : 'Failed to load PDF'
          );
          setIsLoading(false);
        }
      }
    }

    loadPDF();

    return () => {
      isCancelled = true;
    };
  }, [pdfFile, pdfDoc, pdfLoadSource, fitToPage, isPageRendering]);

  // Auto-focus the page input when editing
  useEffect(() => {
    if (isEditingPage) {
      // Add a small delay to ensure the input is rendered
      const timer = setTimeout(() => {
        const input = document.querySelector('input[aria-label="Enter page number"]') as HTMLInputElement;
        if (input) {
          input.focus();
          input.select();
        }
      }, 10);
      return () => clearTimeout(timer);
    }
  }, [isEditingPage]);

  // Render the current page whenever page number or scale changes
  useEffect(() => {
    let isCancelled = false;

    async function renderPage() {
      if (!pdfDoc) return;

      try {
        // Set page rendering state to true at the start
        setIsPageRendering(true);

        // Only show loading on initial load, not on page changes
        if (!canvasRef.current || !canvasRef.current.getContext('2d')?.getImageData(0, 0, 1, 1)) {
          setIsLoading(true);
        }
        console.log(`Rendering page ${pageNum} at scale ${scale}`);

        // Only reset pan position when changing pages, not when zooming
        if (!isCancelled && renderTaskRef.current && pageNum !== renderTaskRef.current.pageNumber) {
          setPanPosition({ x: 0, y: 0 });
        }

        // Get the requested page
        const page = await pdfDoc.getPage(pageNum);

        // Apply the scale to get the final viewport
        const viewport = page.getViewport({ scale: scale });

        // Prepare the canvas
        const canvas = canvasRef.current;
        if (!canvas) {
          console.error('Canvas reference is null');
          return;
        }

        // Set canvas dimensions based on viewport
        canvas.height = viewport.height;
        canvas.width = viewport.width;

        // Ensure no other render tasks are running
        if (renderTaskRef.current) {
          try {
            await renderTaskRef.current.promise;
          } catch (err) {
            // Ignore cancellation errors
            if (err instanceof Error && err.name !== 'RenderingCancelledException') {
              throw err;
            }
          }
        }

        // Render the page into the canvas
        const canvasContext = canvas.getContext('2d');
        if (!canvasContext) {
          console.error('Canvas context is null');
          return;
        }
        const renderContext = { canvasContext, viewport };
        const renderTask = page.render(renderContext);

        // Store the render task and the page number
        renderTaskRef.current = renderTask;
        renderTaskRef.current.pageNumber = pageNum;

        // Wait for rendering to finish
        await renderTask.promise;

        if (!isCancelled) {
          setIsLoading(false);
          // Set page rendering state to false when complete
          setIsPageRendering(false);
        }
      } catch (error) {
        if (!isCancelled) {
          console.error('PDF rendering error:', error);
          setError(
            error instanceof Error ? error.message : 'Failed to render PDF'
          );
          setIsLoading(false);
          setIsPageRendering(false); // Make sure to reset the rendering state on error
        }
      }
    }

    renderPage();

    // Cleanup function to cancel the render task if the component unmounts
    return () => {
      isCancelled = true;
      if (renderTaskRef.current) {
        renderTaskRef.current.cancel();
      }
    };
  }, [pdfDoc, pageNum, scale]);

  return (
    <div className="pdf-container mx-auto p-4 w-full">
      {error && (
        <div className="error-message bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
          Error: {error}
        </div>
      )}

      <div className="pdf-header flex items-center justify-between mb-4 bg-gray-100 p-3 rounded-lg">
        <div className="file-info flex items-center">
          <span className="font-medium mr-2">Current file:</span>
          <span className="text-gray-700 truncate max-w-xs">{fileName}</span>
        </div>

        <div className="upload-controls">
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileChange}
            accept="application/pdf"
            className="hidden"
            id="pdf-upload"
          />
          <button
            onClick={handleUploadClick}
            className="px-3 py-1 bg-green-600 text-white rounded hover:bg-green-700 transition flex items-center"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 mr-1" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="17 8 12 3 7 8" />
              <line x1="12" y1="3" x2="12" y2="15" />
            </svg>
            Upload PDF
          </button>
        </div>
      </div>

      <div className="pdf-controls flex items-center justify-between mb-4 bg-gray-100 p-3 rounded-lg">
        <div className="page-controls flex items-center space-x-2">
          <button
            onClick={goToPrevPage}
            disabled={isLoading || pageNum <= 1}
            className="px-3 py-1 bg-blue-500 text-white rounded disabled:bg-gray-300"
            aria-label="Previous page"
          >
            &lt; Prev
          </button>
          <div className="px-2 py-1 bg-gray-700 text-white font-medium rounded flex items-center">
            <span className="mr-1">Page</span>
            {isEditingPage ? (
              <input
                type="text"
                value={pageInputValue}
                onChange={handlePageInputChange}
                onKeyDown={handlePageInputKeyDown}
                onBlur={submitPageChange}
                autoFocus
                className="w-10 px-1 py-0 bg-gray-600 text-white text-center rounded mx-1"
                aria-label="Enter page number"
              />
            ) : (
              <button
                onClick={startPageEdit}
                className="w-10 mx-1 px-1 py-0 bg-gray-600 text-white text-center rounded hover:bg-gray-500 transition-colors"
                aria-label="Click to edit page number"
                title="Click to edit page number"
              >
                {pageNum}
              </button>
            )}
            <span>of {numPages || '?'}</span>
          </div>
          <button
            onClick={goToNextPage}
            disabled={isLoading || pageNum >= (numPages || 1)}
            className="px-3 py-1 bg-blue-500 text-white rounded disabled:bg-gray-300"
            aria-label="Next page"
          >
            Next &gt;
          </button>
        </div>

        <div className="zoom-controls flex items-center space-x-2">
          <button
            onClick={zoomOut}
            disabled={isLoading}
            className="px-3 py-1 bg-gray-500 text-white rounded disabled:bg-gray-300"
            aria-label="Zoom out"
          >
            -
          </button>
          <span className="text-sm font-medium bg-gray-700 text-white px-3 py-1 rounded w-20 text-center">
            {Math.round(scale * 100)}%
          </span>
          <button
            onClick={fitToPage}
            disabled={isLoading}
            className="px-3 py-1 bg-gray-500 text-white rounded disabled:bg-gray-300"
            aria-label="Fit to page"
          >
            Fit
          </button>
          <button
            onClick={zoomIn}
            disabled={isLoading}
            className="px-3 py-1 bg-gray-500 text-white rounded disabled:bg-gray-300"
            aria-label="Zoom in"
          >
            +
          </button>
        </div>
      </div>

      {/* Main content area with responsive design */}
      <div className="flex flex-col lg:flex-row gap-4">
        {/* PDF Viewer */}
        <div
          ref={containerRef}
          className="pdf-viewer relative border border-gray-300 rounded-lg overflow-auto lg:w-2/3"
          style={{
            height: '842px',  // Height of US Letter in points
            width: '100%',
            maxWidth: '100%', // Changed from fixed width to be responsive
            margin: '0 auto',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
          }}
        >
          {isLoading ? (
            <div className="loading-overlay absolute inset-0 bg-white bg-opacity-80 flex items-center justify-center z-10">
              <div className="loading-spinner w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
            </div>
          ) : isPageRendering && (
            <div className="page-transition-indicator absolute bottom-2 right-2 bg-gray-800 text-white text-xs px-2 py-1 rounded opacity-70">
              Loading page {pageNum}...
            </div>
          )}

          <div
            className="pdf-content"
            style={{
              transform: `translate(${panPosition.x}px, ${panPosition.y}px)`,
              transition: isPanning ? 'none' : 'transform 0.1s ease-out',
              cursor: isPanning ? 'grabbing' : (scale > 1 ? 'grab' : 'default'),
            }}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseLeave}
          >
            <canvas ref={canvasRef} />
          </div>

          {scale > 1 && !isLoading && (
            <div className="panning-instructions absolute top-2 left-2 bg-gray-800 text-white text-xs px-2 py-1 rounded opacity-70 pointer-events-none">
              Click and drag to pan
            </div>
          )}
        </div>

        {/* Notes Section */}
        <div className="notes-section lg:w-1/3 flex flex-col">
          <div className="bg-gray-100 p-3 rounded-lg mb-2">
            <h2 className="text-lg font-medium flex items-center justify-between">
              <span>Notes for Page {pageNum}</span>
              <span className="text-xs text-gray-500">
                {currentNote.length}/{MAX_NOTE_LENGTH} characters
              </span>
            </h2>
          </div>
          <textarea
            value={currentNote}
            onChange={handleNoteChange}
            placeholder="Add your notes for this page here..."
            className="w-full h-full min-h-[400px] p-3 border border-gray-300 rounded-lg resize-none focus:ring-2 focus:ring-blue-500 focus:border-transparent font-mono"
            maxLength={MAX_NOTE_LENGTH}
            style={{
              whiteSpace: 'pre-wrap',
              lineHeight: '1.5',
              fontSize: '14px',
              fontFamily: 'Consolas, Monaco, "Courier New", monospace'
            }}
          />
          <div className="mt-2 text-sm text-gray-500">
            <div>Notes are saved per page and will persist during this browser session.</div>
            <div className="mt-1">Formatting: Line breaks and spacing will be preserved as shown.</div>
          </div>
        </div>
      </div>
    </div>
  );
}