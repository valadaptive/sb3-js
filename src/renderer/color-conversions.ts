import {vec3} from 'gl-matrix';

/**
 * Convert an RGB color (in 0..1) to an HSV color (in 0..1).
 * Taken from https://web.archive.org/web/20190723013736/http://lolengine.net/blog/2013/01/13/fast-rgb-to-hsv.
 */
export const rgbToHsv = ([r, g, b]: vec3, dst: vec3) => {
    let K = 0;

    if (g < b) {
        const tmp = g;
        g = b;
        b = tmp;
        K = -1;
    }

    if (r < g) {
        const tmp = r;
        r = g;
        g = tmp;
        K = (-2 / 6) - K;
    }

    if (g < b) {
        const tmp = g;
        g = b;
        b = tmp;
        K = -K;
    }

    const chroma = r - b;
    dst[0] = Math.abs(K + ((g - b) / ((6 * chroma) + 1e-20))); // hue
    dst[1] = chroma / (r + 1e-20); // saturation
    dst[2] = r; // value

    return dst;
};

/**
 * Convert an HSV color (in 0..1) to an RGB color (in 0..1).
 * Taken from https://github.com/stolk/hsvbench.
 */
export const hsvToRgb = ([h, s, v]: vec3, dst: vec3) => {
    const h6 = h * 6;
    const r = Math.max(0, Math.min(Math.abs(h6 - 3) - 1, 1));
    const g = Math.max(0, Math.min(2 - Math.abs(h6 - 2), 1));
    const b = Math.max(0, Math.min(2 - Math.abs(h6 - 4), 1));

    const is = 1 - s;
    dst[0] = v * ((s * r) + is);
    dst[1] = v * ((s * g) + is);
    dst[2] = v * ((s * b) + is);

    return dst;
};
