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

    static load(name: string, blob: Blob, params: CostumeParams): Promise<Costume> {
        const image = document.createElement('img');
        const url = URL.createObjectURL(blob);

        image.src = url;

        if (image.complete) {
            URL.revokeObjectURL(url);
            return Promise.resolve(new Costume(
                name, image, {width: image.naturalWidth, height: image.naturalHeight}, params));
        }

        return new Promise((resolve, reject) => {
            const abortController = new AbortController();
            const signal = abortController.signal;

            image.addEventListener('load', () => {
                resolve(new Costume(
                    name, image, {width: image.naturalWidth, height: image.naturalHeight}, params));
                URL.revokeObjectURL(url);
                abortController.abort();
            }, {signal});

            image.addEventListener('error', () => {
                reject(new Error(`Failed to load image: ${image.src}`));
                URL.revokeObjectURL(url);
                abortController.abort();
            }, {signal});
        });
    }
}
