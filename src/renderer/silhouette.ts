// Optimized Math.min and Math.max for integers
// Taken from https://web.archive.org/web/20190716181049/http://guihaire.com/code/?p=549
const intMin = (i: number, j: number) => j ^ ((i ^ j) & ((i - j) >> 31));
const intMax = (i: number, j: number) => i ^ ((i ^ j) & ((i - j) >> 31));

export default class Silhouette {
    private data!: Uint8ClampedArray;
    public width!: number;
    public height!: number;

    constructor(image: HTMLImageElement | ImageData) {
        this.update(image);
    }

    update(image: HTMLImageElement | ImageData) {
        let imageData;
        if (image instanceof HTMLImageElement) {
            if (!image.complete) {
                throw new Error('Image not loaded');
            }
            const canvas = document.createElement('canvas');
            canvas.width = image.width;
            canvas.height = image.height;
            const ctx = canvas.getContext('2d');
            if (!ctx) {
                throw new Error('Failed to create 2d context');
            }
            ctx.drawImage(image, 0, 0);
            imageData = ctx.getImageData(0, 0, image.width, image.height);
        } else {
            imageData = image;
        }
        this.data = imageData.data;
        this.width = imageData.width;
        this.height = imageData.height;
    }

    /**
     * Sample the silhouette at the given point. Writes a premultiplied color into an RGBA array (0-255).
     * @param x Normalized x-coordinate (0 to 1).
     * @param y Normalized y-coordinate (0 to 1).
     * @param dst The destination array to write the result (RGBA) to.
     */
    public sample(x: number, y: number, dst: Uint8ClampedArray): void {
        this.sampleTexel(Math.floor(x * this.width), Math.floor(y * this.height), dst);
    }

    public sampleTexel(x: number, y: number, dst: Uint8ClampedArray) {
        x = intMin(intMax(x, 0), this.width - 1);
        y = intMin(intMax(y, 0), this.height - 1);
        const index = ((y * this.width) + x) * 4;
        // Premultiply alpha
        const alpha = this.data[index + 3] / 255;
        dst[0] = this.data[index] * alpha;
        dst[1] = this.data[index + 1] * alpha;
        dst[2] = this.data[index + 2] * alpha;
        dst[3] = this.data[index + 3];
    }

    /**
     * Check if the silhouette is touching the given point.
     * @param x Normalized x-coordinate (0 to 1).
     * @param y Normalized y-coordinate (0 to 1).
     * @returns True if the alpha value at the given point is greater than 0.
     */
    public isTouching(x: number, y: number): boolean {
        return this.sampleTexelAlpha(Math.floor(x * this.width), Math.floor(y * this.height)) > 0;
    }

    public sampleTexelAlpha(x: number, y: number) {
        x = intMin(intMax(x, 0), this.width - 1);
        y = intMin(intMax(y, 0), this.height - 1);
        const index = ((y * this.width) + x) * 4;
        return this.data[index + 3];
    }
}
