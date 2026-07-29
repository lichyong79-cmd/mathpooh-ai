# SOS51 Canvas render lock fix

- PDF.js visible page canvas render is now single-flight.
- Previous render task is cancelled before a new page render starts.
- Crop selection changes no longer re-render the PDF page; only the preview is refreshed.
- RenderingCancelledException is ignored as expected cancellation.
- AI queue concurrency remains 3 because materialization uses independent offscreen canvases.
