/**
 * A 2D affine transformation matrix. Stored in column-major order as 3 columns of 2 rows:
 *
 * ```
 * | m[0]  m[2]  m[4] |
 * | m[1]  m[3]  m[5] |
 * ```
 *
 * The omitted third row is always `[0, 0, 1]`, which is what makes the transform affine and lets us store 6 numbers
 * instead of 9. This is exactly the layout GLSL calls `mat3x2`, so a `Mat2D` can be handed to `uniformMatrix3x2fv`
 * as-is.
 */
export type Mat2D = Float32Array;

/**
 * Multiply `a` by `b` and store the result in `dst`. Either input may alias `dst`.
 */
const multiply = (dst: Mat2D, a: Mat2D, b: Mat2D): Mat2D => {
    const a0 = a[0], a1 = a[1], a2 = a[2], a3 = a[3], a4 = a[4], a5 = a[5];
    const b0 = b[0], b1 = b[1], b2 = b[2], b3 = b[3], b4 = b[4], b5 = b[5];

    dst[0] = (a0 * b0) + (a2 * b1);
    dst[1] = (a1 * b0) + (a3 * b1);
    dst[2] = (a0 * b2) + (a2 * b3);
    dst[3] = (a1 * b2) + (a3 * b3);
    dst[4] = (a0 * b4) + (a2 * b5) + a4;
    dst[5] = (a1 * b4) + (a3 * b5) + a5;

    return dst;
};

export const mat2d = {
    multiply,

    /** Create a new identity matrix. */
    create(): Mat2D {
        const dst = new Float32Array(6);
        dst[0] = 1;
        dst[3] = 1;
        return dst;
    },

    /** Set `dst` to the identity matrix. */
    identity(dst: Mat2D): Mat2D {
        dst[0] = 1;
        dst[1] = 0;
        dst[2] = 0;
        dst[3] = 1;
        dst[4] = 0;
        dst[5] = 0;
        return dst;
    },

    /** Copy `src` into `dst`. */
    copy(dst: Mat2D, src: Mat2D): Mat2D {
        dst.set(src);
        return dst;
    },

    /** Set `dst` to a matrix that translates by (`x`, `y`). */
    fromTranslation(dst: Mat2D, x: number, y: number): Mat2D {
        dst[0] = 1;
        dst[1] = 0;
        dst[2] = 0;
        dst[3] = 1;
        dst[4] = x;
        dst[5] = y;
        return dst;
    },

    /** Set `dst` to a matrix that scales by (`x`, `y`). */
    fromScaling(dst: Mat2D, x: number, y: number): Mat2D {
        dst[0] = x;
        dst[1] = 0;
        dst[2] = 0;
        dst[3] = y;
        dst[4] = 0;
        dst[5] = 0;
        return dst;
    },

    /** Set `dst` to a matrix that rotates counterclockwise by `rad` radians. */
    fromRotation(dst: Mat2D, rad: number): Mat2D {
        const s = Math.sin(rad);
        const c = Math.cos(rad);
        dst[0] = c;
        dst[1] = s;
        dst[2] = -s;
        dst[3] = c;
        dst[4] = 0;
        dst[5] = 0;
        return dst;
    },

    /**
     * Translate `m` by (`x`, `y`) and store the result in `dst`. The translation is applied in `m`'s local space (i.e.
     * `dst = m * translation`). `m` may alias `dst`.
     */
    translate(dst: Mat2D, m: Mat2D, x: number, y: number): Mat2D {
        const m0 = m[0], m1 = m[1], m2 = m[2], m3 = m[3];

        dst[0] = m0;
        dst[1] = m1;
        dst[2] = m2;
        dst[3] = m3;
        dst[4] = (m0 * x) + (m2 * y) + m[4];
        dst[5] = (m1 * x) + (m3 * y) + m[5];

        return dst;
    },

    /**
     * Scale `m` by (`x`, `y`) and store the result in `dst`. The scale is applied in `m`'s local space (i.e.
     * `dst = m * scale`). `m` may alias `dst`.
     */
    scale(dst: Mat2D, m: Mat2D, x: number, y: number): Mat2D {
        dst[0] = m[0] * x;
        dst[1] = m[1] * x;
        dst[2] = m[2] * y;
        dst[3] = m[3] * y;
        dst[4] = m[4];
        dst[5] = m[5];

        return dst;
    },

    /**
     * Rotate `m` counterclockwise by `rad` radians and store the result in `dst`. The rotation is applied in `m`'s
     * local space (i.e. `dst = m * rotation`). `m` may alias `dst`.
     */
    rotate(dst: Mat2D, m: Mat2D, rad: number): Mat2D {
        const m0 = m[0], m1 = m[1], m2 = m[2], m3 = m[3];
        const s = Math.sin(rad);
        const c = Math.cos(rad);

        dst[0] = (m0 * c) + (m2 * s);
        dst[1] = (m1 * c) + (m3 * s);
        dst[2] = (m2 * c) - (m0 * s);
        dst[3] = (m3 * c) - (m1 * s);
        dst[4] = m[4];
        dst[5] = m[5];

        return dst;
    },

    /**
     * Invert `m` and store the result in `dst`. `m` may alias `dst`.
     * @returns `dst`, or null if `m` is singular (e.g. scaled to zero), in which case `dst` is left untouched.
     */
    invert(dst: Mat2D, m: Mat2D): Mat2D | null {
        const m0 = m[0], m1 = m[1], m2 = m[2], m3 = m[3], m4 = m[4], m5 = m[5];

        const det = (m0 * m3) - (m1 * m2);
        if (det === 0) return null;
        const invDet = 1 / det;

        dst[0] = m3 * invDet;
        dst[1] = -m1 * invDet;
        dst[2] = -m2 * invDet;
        dst[3] = m0 * invDet;
        dst[4] = ((m2 * m5) - (m3 * m4)) * invDet;
        dst[5] = ((m1 * m4) - (m0 * m5)) * invDet;

        return dst;
    },
};
