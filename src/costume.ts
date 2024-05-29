import loadSVG from './load-svg.js';
import Skin from './renderer/skin.js';

export type CostumeParams = {
    rotationCenter: {x: number; y: number};
    bitmapResolution: number;
    type: 'bitmap' | 'svg';
};

export default class Costume {
    public name;
    public image;
    public dimensions: {
        width: number;
        height: number;
    };
    public rotationCenter: {
        x: number;
        y: number;
    };
    public bitmapResolution: number;
    public type: 'bitmap' | 'svg';
    public skin: Skin | null = null;

    constructor(
        name: string,
        image: HTMLImageElement,
        dimensions: {width: number; height: number},
        params: CostumeParams,
    ) {
        this.name = name;
        this.image = image;
        this.dimensions = dimensions;
        this.rotationCenter = params.rotationCenter;
        this.bitmapResolution = params.bitmapResolution;
        this.type = params.type;
    }

    private static async waitForImageToLoad(image: HTMLImageElement): Promise<void> {
        if (image.complete) {
            return Promise.resolve();
        }

        return new Promise((resolve, reject) => {
            const abortController = new AbortController();
            const signal = abortController.signal;

            image.addEventListener('load', () => {
                resolve();
                URL.revokeObjectURL(image.src);
                abortController.abort();
            }, {signal});

            image.addEventListener('error', () => {
                reject(new Error(`Failed to load image: ${image.src}`));
                URL.revokeObjectURL(image.src);
                abortController.abort();
            }, {signal});
        });
    }

    static async load(name: string, blob: Blob, params: CostumeParams): Promise<Costume> {
        const image = document.createElement('img');

        if (params.type === 'svg') {
            const {url, viewBox} = await loadSVG(blob);
            image.src = url;

            // SVG costumes' rotation centers are offset by the x and y values of the viewBox
            params = {
                ...params,
                rotationCenter: {
                    x: params.rotationCenter.x - viewBox.left,
                    y: params.rotationCenter.y - viewBox.bottom,
                },
            };
        } else {
            image.src = URL.createObjectURL(blob);
        }

        await Costume.waitForImageToLoad(image);
        return new Costume(name, image, {width: image.naturalWidth, height: image.naturalHeight}, params);
    }

    destroy() {
        URL.revokeObjectURL(this.image.src);
    }
}
