import {vec2} from 'gl-matrix';
import {GraphicEffects} from '../effects.js';

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
