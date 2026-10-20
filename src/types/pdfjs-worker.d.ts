// Die Worker-Module von pdf.js haben keine eigenen Typen. Importiert werden sie nur
// wegen ihres Nebeneffekts (`globalThis.pdfjsWorker`, „Fake Worker“ ohne eigenen Thread).
declare module 'pdfjs-dist/build/pdf.worker.min.mjs'
declare module 'pdfjs-dist/legacy/build/pdf.worker.mjs'
