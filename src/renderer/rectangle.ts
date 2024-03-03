import {mat3} from 'gl-matrix';

/** "Scratch-space" (positive y = up) rectangle / bounding box. */
export default class Rectangle {
    public left: number;
    public right: number;
    public bottom: number;
    public top: number;

    constructor() {
        this.left = -Infinity;
        this.right = Infinity;
        this.bottom = -Infinity;
        this.top = Infinity;
    }

    public static fromBounds(left: number, right: number, bottom: number, top: number, result = new Rectangle()) {
        result.left = left;
        result.right = right;
        result.bottom = bottom;
        result.top = top;
        return result;
    }

    public static fromMatrix(matrix: mat3, result = new Rectangle()) {
        // Adapted somewhat from https://github.com/LLK/scratch-render/blob/develop/docs/Rectangle-AABB-Matrix.md
        const xa = matrix[0] / 2;
        const xb = matrix[3] / 2;
        const absx = Math.abs(xa) + Math.abs(xb);
        const sumx = xa + xb + matrix[6];

        const ya = matrix[1] / 2;
        const yb = matrix[4] / 2;
        const absy = Math.abs(ya) + Math.abs(yb);
        const sumy = ya + yb + matrix[7];

        result.left = sumx - absx;
        result.right = sumx + absx;
        result.bottom = sumy - absy;
        result.top = sumy + absy;

        return result;
    }

    get width() {
        return this.right - this.left;
    }

    get height() {
        return this.top - this.bottom;
    }
}
