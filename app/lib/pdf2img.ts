export interface PdfConversionResult {
    imageUrl: string;
    file: File | null;
    error?: string;
}

let pdfjsLib: any = null;
let isLoading = false;
let loadPromise: Promise<any> | null = null;

async function loadPdfJs(): Promise<any> {
    if (pdfjsLib) return pdfjsLib;
    if (loadPromise) return loadPromise;

    isLoading = true;
    // @ts-expect-error - pdfjs-dist/build/pdf.mjs is not a module
    loadPromise = import("pdfjs-dist/build/pdf.mjs").then((lib) => {
        // Let Vite bundle/serve the worker from the package
        lib.GlobalWorkerOptions.workerSrc = new URL(
            "pdfjs-dist/build/pdf.worker.mjs",
            import.meta.url
        ).toString();

        pdfjsLib = lib;
        isLoading = false;
        return lib;
    });

    return loadPromise;
}

export async function convertPdfToImage(
    file: File
): Promise<PdfConversionResult> {
    try {
        const lib = await loadPdfJs();

        const arrayBuffer = await file.arrayBuffer();
        const pdf = await lib.getDocument({ data: arrayBuffer }).promise;
        const page = await pdf.getPage(1);

        const viewport = page.getViewport({ scale: 4 });
        const canvas = document.createElement("canvas");
        const context = canvas.getContext("2d");

        canvas.width = viewport.width;
        canvas.height = viewport.height;

        if (context) {
            context.imageSmoothingEnabled = true;
            context.imageSmoothingQuality = "high";
        }

        await page.render({ canvasContext: context!, viewport }).promise;

        // Prefer toBlob; fallback to toDataURL for browsers where toBlob is null
        const blob: Blob | null = await new Promise((resolve) => {
            canvas.toBlob((b) => resolve(b), "image/png", 1.0);
        });

        let finalBlob = blob;
        if (!finalBlob) {
            const dataUrl = canvas.toDataURL("image/png", 1.0);
            const res = fetch(dataUrl).then((r) => r.blob());
            finalBlob = await res;
        }

        if (finalBlob) {
            const originalName = file.name.replace(/\.pdf$/i, "");
            const imageFile = new File([finalBlob], `${originalName}.png`, {
                type: "image/png",
            });
            return {
                imageUrl: URL.createObjectURL(finalBlob),
                file: imageFile,
            };
        }

        return {
            imageUrl: "",
            file: null,
            error: "Failed to create image blob",
        };
    } catch (err) {
        return {
            imageUrl: "",
            file: null,
            error: `Failed to convert PDF: ${err}`,
        };
    }
}