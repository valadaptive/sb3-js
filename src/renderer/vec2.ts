import type {Mat2D} from './mat2d.js';

/** A 2D vector, stored as `[x, y]`. */
export type Vec2 = Float32Array;

export const vec2 = {
    /** Create a new zero vector. */
    create(): Vec2 {
        return new Float32Array(2);
    },

    /** Create a new vector with the given components. */
    fromValues(x: number, y: number): Vec2 {
        const dst = new Float32Array(2);
        dst[0] = x;
        dst[1] = y;
        return dst;
    },

    /** Set `dst`'s components. */
    set(dst: Vec2, x: number, y: number): Vec2 {
        dst[0] = x;
        dst[1] = y;
        return dst;
    },

    /** Copy `src` into `dst`. */
    copy(dst: Vec2, src: Vec2): Vec2 {
        dst[0] = src[0];
        dst[1] = src[1];
        return dst;
    },

    /**
     * Transform `src` by the affine matrix `m` and store the result in `dst`. `src` may alias `dst`.
     */
    transformMat2D(dst: Vec2, src: Vec2, m: Mat2D): Vec2 {
        const x = src[0], y = src[1];
        dst[0] = (m[0] * x) + (m[2] * y) + m[4];
        dst[1] = (m[1] * x) + (m[3] * y) + m[5];
        return dst;
    },
};
