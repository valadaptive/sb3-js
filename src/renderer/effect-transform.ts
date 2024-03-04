import {vec2, vec3} from 'gl-matrix';
import {GraphicEffects} from '../effects.js';

/**
 * Convert an RGB color (in 0..1) to an HSV color (in 0..1).
 * Taken from https://web.archive.org/web/20190723013736/http://lolengine.net/blog/2013/01/13/fast-rgb-to-hsv.
 */
const rgbToHsv = ([r, g, b]: vec3, dst: vec3) => {
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
const hsvToRgb = ([h, s, v]: vec3, dst: vec3) => {
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

const __hsv = vec3.create();
const __rgb = vec3.create();

/**
 * Apply a graphic-effect transformation to a color.
 * @param effects The graphic effects to apply.
 * @param color The RGBA color to be transformed.
 * @param mask Additional effect mask to apply.
 */
export const effectTransformColor = (
    effects: GraphicEffects,
    color: Uint8ClampedArray,
    mask: number,
) => {
    // Fully transparent colors are not affected by any effects.
    if (color[3] === 0) return color;

    const effectMask = effects.bitmask & mask;

    const enableColor = !!(effectMask & GraphicEffects.EFFECT_COLOR);
    const enableBrightness = !!(effectMask & GraphicEffects.EFFECT_BRIGHTNESS);

    let r = color[0] / 255;
    let g = color[1] / 255;
    let b = color[2] / 255;
    let a = color[3] / 255;

    if (enableColor || enableBrightness) {
        // Un-premultiply by alpha.
        let rS = r / a;
        let gS = g / a;
        let bS = b / a;

        if (enableColor) {
            // vec3 hsv = rgb2hsv(unmultiplied);
            rgbToHsv([rS, gS, bS], __hsv);
            // const float minLightness = 0.055;
            // const float minSaturation = 0.09;
            // hsv.z = max(hsv.z, minLightness);
            __hsv[2] = Math.max(__hsv[2], 0.055);
            // hsv.y = max(hsv.y, minSaturation);
            __hsv[1] = Math.max(__hsv[1], 0.09);

            // float color_effect = u_effects_color_fisheye_whirl_pixelate.x;
            const colorEffect = effects.u_color;
            // hsv.x = fract(hsv.x + color_effect);
            __hsv[0] = (__hsv[0] + colorEffect) % 1;
            // unmultiplied = hsv2rgb(hsv);
            hsvToRgb(__hsv, __rgb);
            rS = __rgb[0];
            gS = __rgb[1];
            bS = __rgb[2];
        }

        if (enableBrightness) {
            // unmultiplied = clamp(unmultiplied + u_effects_mosaic_brightness_ghost.y, vec3(0.0), vec3(1.0));
            rS = Math.max(0, Math.min(rS + effects.u_brightness, 1));
            gS = Math.max(0, Math.min(gS + effects.u_brightness, 1));
            bS = Math.max(0, Math.min(bS + effects.u_brightness, 1));
        }

        // Premultiply by alpha.
        r = rS * a;
        g = gS * a;
        b = bS * a;
    }

    if (effectMask & GraphicEffects.EFFECT_GHOST) {
        // color *= u_effects_mosaic_brightness_ghost.z;
        r *= effects.u_ghost;
        g *= effects.u_ghost;
        b *= effects.u_ghost;
        a *= effects.u_ghost;
    }

    color[0] = r * 255;
    color[1] = g * 255;
    color[2] = b * 255;
    color[3] = a * 255;
};

/**
 * Apply a graphic-effect transformation to a point.
 * @param effects The graphic effects to apply.
 * @param dimensions The dimensions of the costume.
 * @param src The point to be transformed.
 * @param dst The point to store the transformed result in. This can alias `src`.
 */
export const effectTransformPoint = (
    effects: GraphicEffects,
    dimensions: {width: number; height: number},
    src: vec2,
    dst: vec2,
) => {
    vec2.copy(dst, src);
    const effectMask = effects.bitmask;

    if (effectMask & GraphicEffects.EFFECT_MOSAIC) {
        // coord = fract(coord * mosaic);
        const mosaic = effects.u_mosaic;
        dst[0] = (dst[0] * mosaic) % 1;
        dst[1] = (dst[1] * mosaic) % 1;
    }

    if (effectMask & GraphicEffects.EFFECT_PIXELATE) {
        // vec2 pixelTexelSize = u_dimensions / pixelate;
        const texelWidth = dimensions.width / effects.u_pixelate;
        const texelHeight = dimensions.height / effects.u_pixelate;
        // coord = (floor(coord * pixelTexelSize) + CENTER) / pixelTexelSize;
        dst[0] = (Math.floor(dst[0] * texelWidth) + 0.5) / texelWidth;
        dst[1] = (Math.floor(dst[1] * texelHeight) + 0.5) / texelHeight;
    }

    if (effectMask & GraphicEffects.EFFECT_WHIRL) {
        // vec2 offset = coord - CENTER;
        const offsetX = dst[0] - 0.5;
        const offsetY = dst[1] - 0.5;
        // float magnitude = length(offset);
        const magnitude = Math.sqrt((offsetX * offsetX) + (offsetY * offsetY));
        // float whirlFactor = max(1.0 - (magnitude * 2.0), 0.0);
        const whirlFactor = Math.max(1 - (magnitude * 2), 0);
        // float whirl = u_effects_color_fisheye_whirl_pixelate.z;
        const whirl = effects.u_whirl;
        // float whirlActual = whirl * whirlFactor * whirlFactor;
        const whirlActual = whirl * whirlFactor * whirlFactor;
        // float sinWhirl = sin(whirlActual);
        const sinWhirl = Math.sin(whirlActual);
        // float cosWhirl = cos(whirlActual);
        const cosWhirl = Math.cos(whirlActual);
        // offset = vec2(
        //     offset.x * cosWhirl - offset.y * sinWhirl,
        //     offset.x * sinWhirl + offset.y * cosWhirl
        // );
        // coord = offset + CENTER;
        dst[0] = ((offsetX * cosWhirl) - (offsetY * sinWhirl)) + 0.5;
        dst[1] = ((offsetX * sinWhirl) + (offsetY * cosWhirl)) + 0.5;
    }

    if (effectMask & GraphicEffects.EFFECT_FISHEYE) {
        // vec2 v = (coord - CENTER) * 2.0;
        const vx = (dst[0] - 0.5) * 2;
        const vy = (dst[1] - 0.5) * 2;
        // float radius = length(v);
        const radius = Math.sqrt((vx * vx) + (vy * vy));
        // float fisheye = u_effects_color_fisheye_whirl_pixelate.y;
        const fisheye = effects.u_fisheye;
        // float r = pow(min(radius, 1.0), fisheye) * max(1.0, radius);
        const r = Math.pow(Math.min(radius, 1), fisheye) * Math.max(1, radius);
        // vec2 unit = v / radius;
        // coord = CENTER + (unit * r * 0.5);
        dst[0] = (vx / radius * r * 0.5) + 0.5;
        dst[1] = (vy / radius * r * 0.5) + 0.5;
    }
};
