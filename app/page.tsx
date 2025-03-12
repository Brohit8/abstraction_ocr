'use client';
import { useEffect, useRef, useState } from 'react';

export default function PDFViewer() {
  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  const renderTaskRef = useRef(null);
  const fileInputRef = useRef(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [scale, setScale] = useState(1.0); // Start with scale 1.0, will be adjusted by fitToPage
  const [pageNum, setPageNum] = useState(1);
  const [numPages, setNumPages] = useState(null);
  const [pdfDoc, setPdfDoc] = useState(null);
  const [isPanning, setIsPanning] = useState(false);
  const [panPosition, setPanPosition] = useState({ x: 0, y: 0 });
  const [startPanPos, setStartPanPos] = useState({ x: 0, y: 0 });
  const [pdfFile, setPdfFile] = useState(null);
  const [fileName, setFileName] = useState('No file selected');

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

  // Simple zoom functions
  const zoomIn = () => {
    setScale(prevScale => Math.min(prevScale + 0.25, 5));
  };

  const zoomOut = () => {
    setScale(prevScale => Math.max(prevScale - 0.25, 0.5));
  };

  // Fit the PDF to the container size - this previously worked
  const fitToPage = async () => {
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
  };

  // Panning handlers
  const handleMouseDown = (e) => {
    if (scale > 1) {
      setIsPanning(true);
      setStartPanPos({
        x: e.clientX - panPosition.x,
        y: e.clientY - panPosition.y
      });
    }
  };

  const handleMouseMove = (e) => {
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

  const handleFileChange = (event) => {
    const file = event.target.files[0];
    if (file && file.type === 'application/pdf') {
      setPdfFile(file);
      setFileName(file.name);
      setPageNum(1); // Reset to first page
      setPanPosition({ x: 0, y: 0 }); // Reset panning
      setError(null);
    } else if (file) {
      setError('Please select a valid PDF file');
    }
  };

  const handleUploadClick = () => {
    fileInputRef.current.click();
  };

  // Load the PDF document
  useEffect(() => {
    let isCancelled = false;

    async function loadPDF() {
      // If no file selected and no PDF is loaded, use example.pdf
      if (!pdfFile && !pdfDoc) {
        try {
          setIsLoading(true);
          console.log('Loading default PDF document...');

          // Import pdfjs-dist dynamically for client-side rendering
          const pdfJS = await import('pdfjs-dist');

          // Set up the worker
          const workerSrc = new URL(
            'pdfjs-dist/build/pdf.worker.min.mjs',
            import.meta.url
          ).toString();

          pdfJS.GlobalWorkerOptions.workerSrc = workerSrc;

          // Load the default PDF document
          const loadingTask = pdfJS.getDocument('example.pdf');
          const pdf = await loadingTask.promise;

          if (!isCancelled) {
            console.log(`Default PDF loaded successfully with ${pdf.numPages} pages`);
            setPdfDoc(pdf);
            setNumPages(pdf.numPages);
            setFileName('example.pdf');
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
            setError(error.message || 'Failed to load PDF');
            setIsLoading(false);
          }
        }
      }
    }

    loadPDF();

    return () => {
      isCancelled = true;
    };
  }, []);

  // Handle uploaded PDF file
  useEffect(() => {
    let isCancelled = false;

    async function loadUploadedPDF() {
      if (!pdfFile) return;

      try {
        setIsLoading(true);
        console.log('Loading uploaded PDF document...');

        // Import pdfjs-dist dynamically for client-side rendering
        const pdfJS = await import('pdfjs-dist');

        // Set up the worker if not already set
        if (!pdfJS.GlobalWorkerOptions.workerSrc) {
          const workerSrc = new URL(
            'pdfjs-dist/build/pdf.worker.min.mjs',
            import.meta.url
          ).toString();

          pdfJS.GlobalWorkerOptions.workerSrc = workerSrc;
        }

        // Convert the file to ArrayBuffer
        const arrayBuffer = await pdfFile.arrayBuffer();

        // Load the PDF document from ArrayBuffer
        const loadingTask = pdfJS.getDocument({ data: arrayBuffer });
        const pdf = await loadingTask.promise;

        if (!isCancelled) {
          console.log(`Uploaded PDF loaded successfully with ${pdf.numPages} pages`);
          setPdfDoc(pdf);
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
          setError(error.message || 'Failed to load PDF');
          setIsLoading(false);
        }
      }
    }

    loadUploadedPDF();

    return () => {
      isCancelled = true;
    };
  }, [pdfFile]);

  // Render the current page whenever page number or scale changes
  useEffect(() => {
    let isCancelled = false;

    async function renderPage() {
      if (!pdfDoc) return;

      try {
        // Only show loading on initial load, not on page changes
        if (!canvasRef.current || !canvasRef.current.getContext('2d').getImageData(0, 0, 1, 1)) {
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
            if (err && err.name !== 'RenderingCancelledException') {
              throw err;
            }
          }
        }

        // Render the page into the canvas
        const canvasContext = canvas.getContext('2d');
        const renderContext = { canvasContext, viewport };
        const renderTask = page.render(renderContext);

        // Store the render task and the page number
        renderTaskRef.current = renderTask;
        renderTaskRef.current.pageNumber = pageNum;

        // Wait for rendering to finish
        await renderTask.promise;

        if (!isCancelled) {
          setIsLoading(false);
        }
      } catch (error) {
        if (!isCancelled) {
          console.error('PDF rendering error:', error);
          setError(error.message || 'Failed to render PDF');
          setIsLoading(false);
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
    <div className="pdf-container max-w-4xl mx-auto p-4">
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
          <span className="px-2 py-1 bg-gray-700 text-white font-medium rounded">
            Page {pageNum} of {numPages || '?'}
          </span>
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

      <div
        ref={containerRef}
        className="pdf-viewer relative border border-gray-300 rounded-lg overflow-auto"
        style={{
          height: '842px',  // Height of US Letter in points
          width: '100%',
          maxWidth: '612px', // Width of US Letter in points
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
        ) : renderTaskRef.current && pageNum !== renderTaskRef.current.pageNumber && (
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
    </div>
  );
}