import {mat3, vec2} from 'gl-matrix';

import Target from '../target.js';
import Costume from '../costume.js';

import Shader from './shader.js';
import Rectangle from '../rectangle.js';
import {effectTransformColor, effectTransformPoint} from './effect-transform.js';
import {GraphicEffects} from '../effects.js';
import Silhouette from './silhouette.js';
import PenLayer from './pen-layer.js';
import Samplable from './samplable.js';

const __localPosition = vec2.create();
const __intersectionBoundsSelf = new Rectangle();
const __intersectionBoundsOther = new Rectangle();
const __rightHull: vec2[] = [];
const __blendColor = new Uint8ClampedArray(4);
const __sampleColor = new Uint8ClampedArray(4);
const BACKGROUND_COLOR = new Uint8ClampedArray([255, 255, 255]);

export default class Drawable {
    private transform: mat3 = mat3.create();
    private transformDirty = true;

    private inverseTransform: mat3 = mat3.create();
    private inverseTransformDirty = true;

    private convexHull: vec2[] = [];
    private convexHullDirty = true;

    private transformedHull: vec2[] = [];
    private transformedHullDirty = true;

    public target: Target;
    private costume: Costume;

    constructor(target: Target, costume: Costume) {
        this.target = target;
        // passing the costume explicitly here because a target's drawable and sprite are both initialized in the
        // Target constructor, so reaching into the target's `sprite` would introduce a subtle temporal coupling--
        // the sprite would have to be initialized before the drawable.
        this.costume = costume;
    }

    setTransformDirty() {
        this.transformDirty = true;
        this.inverseTransformDirty = true;
        this.transformedHullDirty = true;
    }

    setConvexHullDirty() {
        this.convexHullDirty = true;
    }

    setCostume(costume: Costume) {
        this.costume = costume;
        this.setConvexHullDirty();
        this.setTransformDirty();
    }


    private updateTransform() {
        const currentCostume = this.costume;
        const targetPosition = this.target.position;
        mat3.fromTranslation(this.transform, [targetPosition.x, targetPosition.y]);
        switch (this.target.rotationStyle) {
            case 'all around':
                mat3.rotate(this.transform, this.transform, -(this.target.direction - 90) * Math.PI / 180);
                break;
            case 'left-right':
                if (this.target.direction < 0) {
                    mat3.scale(this.transform, this.transform, [-1, 1]);
                }
                break;
            case 'don\'t rotate':
                break;
        }
        mat3.scale(this.transform, this.transform, [this.target.size * 0.01, this.target.size * 0.01]);
        const scalingFactor = 1 / currentCostume.bitmapResolution;
        // Rotation centers, unlike all other transforms, are in y-down coordinates.
        mat3.translate(this.transform, this.transform, [
            -currentCostume.rotationCenter.x * scalingFactor,
            (currentCostume.rotationCenter.y - currentCostume.dimensions.height) * scalingFactor,
        ]);
        mat3.scale(this.transform, this.transform, [
            currentCostume.dimensions.width * scalingFactor,
            currentCostume.dimensions.height * scalingFactor,
        ]);

        this.transformDirty = false;
    }

    private updateInverseTransform() {
        if (this.transformDirty) {
            this.updateTransform();
        }
        mat3.invert(this.inverseTransform, this.transform);
        this.inverseTransformDirty = false;
    }

    setUniforms(gl: WebGL2RenderingContext, shader: Shader) {
        if (this.transformDirty) {
            this.updateTransform();
        }

        gl.uniformMatrix3fv(shader.uniformLocations.u_transform, false, this.transform);

        const effects = this.target.effects;
        if (effects.bitmask !== 0) {
            gl.uniform1i(shader.uniformLocations.u_effects_bitmask, effects.bitmask);
            gl.uniform2f(
                shader.uniformLocations.u_dimensions,
                this.costume.dimensions.width,
                this.costume.dimensions.height,
            );
            gl.uniform4f(
                shader.uniformLocations.u_effects_color_fisheye_whirl_pixelate,
                effects.u_color,
                effects.u_fisheye,
                effects.u_whirl,
                effects.u_pixelate,
            );
            gl.uniform4f(
                shader.uniformLocations.u_effects_mosaic_brightness_ghost,
                effects.u_mosaic,
                effects.u_brightness,
                effects.u_ghost,
                0,
            );
        }
    }

    getAABB(result = new Rectangle()) {
        if (this.transformDirty) {
            this.updateTransform();
        }

        return Rectangle.fromMatrix(this.transform, result);
    }

    getTightBounds(result = new Rectangle()) {
        if (this.transformedHullDirty) {
            this.updateTransformedHull();
        }

        let left = Infinity;
        let right = -Infinity;
        let top = -Infinity;
        let bottom = Infinity;

        for (const point of this.transformedHull) {
            left = Math.min(left, point[0]);
            right = Math.max(right, point[0]);
            top = Math.max(top, point[1]);
            bottom = Math.min(bottom, point[1]);
        }

        // Each convex hull point is the center of a pixel. However, said pixels each have area. We must take into
        // account the size of the pixels when calculating the bounds. The pixel dimensions depend on the scale and
        // rotation (as we're treating pixels as squares, which change dimensions when rotated). Note that Scratch
        // doesn't do this (even though it really should). I do so here because I'm pedantic.
        const xa = this.transform[0] / 2;
        const xb = this.transform[3] / 2;
        const halfPixelX =
            (Math.abs(xa) + Math.abs(xb)) / this.costume.dimensions.width;
        const ya = this.transform[1] / 2;
        const yb = this.transform[4] / 2;
        const halfPixelY =
            (Math.abs(ya) + Math.abs(yb)) / this.costume.dimensions.height;
        left -= halfPixelX;
        right += halfPixelX;
        bottom -= halfPixelY;
        top += halfPixelY;

        return Rectangle.fromBounds(left, right, bottom, top, result);
    }

    /**
     * Return the best pixel-snapped bounds currently available, used to estimate the area needed for touching queries.
     * Uses the convex hull if available, otherwise uses the tight bounds.
     */
    getSamplingBounds(result = new Rectangle()) {
        // Note that this isn't transformedHullDirty, but convexHullDirty. Transforming the hull isn't expensive
        // compared to calculating it in the first place, and saves a lot of pixel checks.
        if (this.convexHullDirty) {
            return this.getAABB(result).expandToInt();
        }
        return this.getTightBounds(result).expandToInt();
    }

    /**
     * Get the texture-space position within this drawable of a given Scratch-space point. Requires the inverse
     * transform to be up-to-date.
     */
    private getLocalPosition(x: number, y: number, dst: vec2) {
        vec2.set(dst, x + 0.5, y + 0.5);
        vec2.transformMat3(dst, dst, this.inverseTransform);
        // Our texture's Y-axis is flipped
        __localPosition[1] = 1 - __localPosition[1];
        return __localPosition;
    }

    /**
     * Check whether a given point collides with this drawable. Requires the inverse transform to be up-to-date. Faster
     * than `isTouchingPoint` when called in a loop.
     */
    checkPointCollision(x: number, y: number, silhouette: Silhouette) {
        const localPosition = this.getLocalPosition(x, y, __localPosition);
        if (localPosition[0] < 0 || localPosition[0] > 1 || localPosition[1] < 0 || localPosition[1] > 1) {
            return false;
        }
        const effects = this.target.effects;
        if ((effects.bitmask & GraphicEffects.DISTORTION_EFFECTS) !== 0) {
            effectTransformPoint(effects, this.costume.dimensions, localPosition, localPosition);
        }
        return silhouette.isTouching(localPosition[0], localPosition[1]);
    }

    /**
     * Sample this drawable's color at a given (Scratch-space) point. Requires the inverse transform to be up-to-date.
     * Faster than `isTouchingPoint` when called in a loop.
     */
    sampleColorAtPoint(
        x: number,
        y: number,
        silhouette: Silhouette,
        dst: Uint8ClampedArray,
        effectMask: number,
    ) {
        const localPosition = this.getLocalPosition(x, y, __localPosition);
        const effects = this.target.effects;
        if ((effects.bitmask & effectMask & GraphicEffects.DISTORTION_EFFECTS) !== 0) {
            effectTransformPoint(effects, this.costume.dimensions, localPosition, localPosition);
        }
        const textureColor = silhouette.sample(localPosition[0], localPosition[1], dst);
        if (effects.bitmask & effectMask & GraphicEffects.COLOR_EFFECTS) {
            effectTransformColor(effects, textureColor, effectMask);
        }
        return textureColor;
    }

    public isTouchingPoint(x: number, y: number) {
        const silhouette = this.costume.skin?.getSilhouette(this.target.size * 0.01);
        if (!silhouette) return false;
        if (this.inverseTransformDirty) {
            this.updateInverseTransform();
        }
        return this.checkPointCollision(x, y, silhouette);
    }

    isTouchingTargets(others: Target[], stageBounds: Rectangle) {
        const myBounds = this.getSamplingBounds(__intersectionBoundsSelf);
        const mySilhouette = this.costume.skin?.getSilhouette(this.target.size * 0.01);
        if (!mySilhouette) return false;
        if (this.inverseTransformDirty) {
            this.updateInverseTransform();
        }

        const candidates = this.candidatesTouching(others, null, stageBounds);

        if (candidates.length === 0) return false;
        const candidatesBounds = new Rectangle();
        // Set these to infinity and -infinity so that the first candidate's bounds will overwrite them.
        candidatesBounds.left = Infinity;
        candidatesBounds.right = -Infinity;
        candidatesBounds.bottom = Infinity;
        candidatesBounds.top = -Infinity;

        for (const candidate of candidates) {
            let bounds = candidate.samplable.getSamplingBounds(__intersectionBoundsOther);
            bounds = Rectangle.intersection(stageBounds, bounds, __intersectionBoundsOther);
            bounds = Rectangle.intersection(myBounds, bounds, __intersectionBoundsOther);
            Rectangle.union(bounds, candidatesBounds, candidatesBounds);
        }

        for (let x = candidatesBounds.left; x < candidatesBounds.right; x++) {
            for (let y = candidatesBounds.bottom; y < candidatesBounds.top; y++) {
                const thisMatches = this.checkPointCollision(x, y, mySilhouette);
                if (!thisMatches) continue;
                for (let i = 0; i < candidates.length; i++) {
                    if (candidates[i].samplable.checkPointCollision(x, y, candidates[i].silhouette)) {
                        return true;
                    }
                }
            }
        }
        return false;
    }

    /**
     * Checks if two colors are "close enough" to match for the purposes of "touching color", checking only the high
     * bits.
     * @param a First color to check.
     * @param b Second color to check.
     * @returns whether the colors match.
     */
    static colorMatches(a: Uint8ClampedArray, b: Uint8ClampedArray) {
        return (
            (a[0] & 0b11111000) === (b[0] & 0b11111000) &&
            (a[1] & 0b11111000) === (b[1] & 0b11111000) &&
            (a[2] & 0b11110000) === (b[2] & 0b11110000)
        );
    }

    /**
     * Checks if two colors are "close enough" to match for the purposes of "color is touching color", meant for the
     * color of the drawable we're checking on.
     * @param a First color to check.
     * @param b Second color to check.
     * @returns whether the colors match.
     */
    static maskMatches(a: Uint8ClampedArray, b: Uint8ClampedArray) {
        return (
            a[3] > 0 &&
            (a[0] & 0b11111100) === (b[0] & 0b11111100) &&
            (a[1] & 0b11111100) === (b[1] & 0b11111100) &&
            (a[2] & 0b11111100) === (b[2] & 0b11111100)
        );
    }

    /**
     * Sample every target in the given list at a given Scratch-space point. Expects all the targets' drawables to have
     * up-to-date inverse transforms.
     * @param targets The targets to sample, in lowest-first order.
     * @param x X position of the point to sample.
     * @param y Y position of the point to sample.
     * @param dst Destination to write the color to.
     * @returns The sampled color.
     */
    static sampleStageAtPointUnchecked(
        targets: {samplable: Samplable; silhouette: Silhouette}[],
        x: number,
        y: number,
        dst: Uint8ClampedArray,
    ) {
        dst[0] = dst[1] = dst[2] = 0;
        let blendAlpha = 1;
        for (let i = targets.length - 1; i >= 0 && blendAlpha !== 0; i--) {
            const {samplable, silhouette} = targets[i];
            // Ignore ghost effect
            samplable.sampleColorAtPoint(x, y, silhouette, __blendColor, ~0);
            // Apply alpha blending for premultiplied alpha
            dst[0] += __blendColor[0] * blendAlpha;
            dst[1] += __blendColor[1] * blendAlpha;
            dst[2] += __blendColor[2] * blendAlpha;
            blendAlpha *= (1 - (__blendColor[3] / 255));
        }
        // Finally, there's the white background
        dst[0] += blendAlpha * 255;
        dst[1] += blendAlpha * 255;
        dst[2] += blendAlpha * 255;

        return dst;
    }

    /**
     * Enumerate every target from the given list that could potentially be touching this drawable. Also updates their
     * silhouettes and inverse transforms. Returns targets in lowest-first order.
     * @param targets The targets to check.
     * @param stageBounds Stage bounds--targets outside this will not be matched.
     * @returns Every target that could be touching this drawable, along with their silhouettes.
     */
    private candidatesTouching(
        targets: Target[],
        penLayer: PenLayer | null,
        stageBounds: Rectangle,
    ): {samplable: Samplable; silhouette: Silhouette}[] {
        let myBounds = this.getSamplingBounds(__intersectionBoundsSelf);
        myBounds = Rectangle.intersection(stageBounds, myBounds, __intersectionBoundsSelf);
        const candidates: {samplable: Samplable; silhouette: Silhouette}[] = [];
        for (let i = 0; i < targets.length; i++) {
            const target = targets[i];
            if (target !== this.target) {
                const drawable = target.drawable;
                let otherBounds = drawable.getSamplingBounds(__intersectionBoundsOther);
                otherBounds = Rectangle.intersection(stageBounds, otherBounds, __intersectionBoundsOther);
                if (otherBounds.intersects(myBounds)) {
                    const silhouette = drawable.costume.skin?.getSilhouette(target.size * 0.01);
                    if (silhouette) {
                        if (drawable.inverseTransformDirty) {
                            drawable.updateInverseTransform();
                        }
                        candidates.push({samplable: drawable, silhouette});
                    }
                }
            }
            // Add the pen layer after the stage
            if (target.sprite.isStage && penLayer) {
                candidates.push({samplable: penLayer, silhouette: penLayer.getSilhouette()});
            }

        }
        return candidates;
    }

    /**
     * Check whether this drawable is touching a given color, sampling from all given targets.
     * @param targets The targets to check.
     * @param color The color to check if we're touching.
     * @param stageBounds Stage bounds--pixels outside this will not be checked.
     * @param colorMask Optionally, mask the check to places where the drawable's color matches this one.
     * @returns whether this drawable is touching the given color.
     */
    isTouchingColor(
        targets: Target[],
        penLayer: PenLayer | null,
        color: Uint8ClampedArray,
        stageBounds: Rectangle,
        colorMask: Uint8ClampedArray | null = null,
    ) {
        const mySilhouette = this.costume.skin?.getSilhouette(this.target.size * 0.01);
        if (!mySilhouette) return false;
        let myBounds = this.getSamplingBounds(__intersectionBoundsSelf);
        myBounds = Rectangle.intersection(stageBounds, myBounds, __intersectionBoundsSelf);
        if (this.inverseTransformDirty) {
            this.updateInverseTransform();
        }
        const hasMask = !!colorMask;

        const candidates = this.candidatesTouching(targets, penLayer, stageBounds);
        let candidatesBounds = new Rectangle();
        if (Drawable.colorMatches(color, BACKGROUND_COLOR)) {
            // If we are checking for the background color, we can't limit the check to other sprites' bounds. The
            // background color spans the entire stage.
            candidatesBounds = Rectangle.fromOther(myBounds, candidatesBounds);
        } else {
            if (candidates.length === 0) return false;
            // Set these to infinity and -infinity so that the first candidate's bounds will overwrite them.
            candidatesBounds.left = Infinity;
            candidatesBounds.right = -Infinity;
            candidatesBounds.bottom = Infinity;
            candidatesBounds.top = -Infinity;

            for (const candidate of candidates) {
                let bounds = candidate.samplable.getSamplingBounds(__intersectionBoundsOther);
                bounds = Rectangle.intersection(stageBounds, bounds, __intersectionBoundsOther);
                bounds = Rectangle.intersection(myBounds, bounds, __intersectionBoundsOther);
                Rectangle.union(bounds, candidatesBounds, candidatesBounds);
            }
        }

        for (let x = candidatesBounds.left; x < candidatesBounds.right; x++) {
            for (let y = candidatesBounds.bottom; y < candidatesBounds.top; y++) {
                const thisMatches = hasMask ?
                    Drawable.maskMatches(
                        this.sampleColorAtPoint(x, y, mySilhouette, __sampleColor, ~GraphicEffects.EFFECT_GHOST),
                        colorMask,
                    ) :
                    this.checkPointCollision(x, y, mySilhouette);
                if (!thisMatches) continue;
                const sampledColor = Drawable.sampleStageAtPointUnchecked(candidates, x, y, __sampleColor);
                if (Drawable.colorMatches(color, sampledColor)) {
                    return true;
                }
            }
        }
        return false;
    }

    /**
     * Recalculate this drawable's convex hull (used for the tight bounding box) after a change to the costume or
     * distortion effects.
     */
    private updateConvexHull() {
        const silhouette = this.costume.skin?.getSilhouette(this.target.size * 0.01);
        if (!silhouette) {
            this.convexHull.length = 0;
            return;
        }
        const width = silhouette.width;
        const height = silhouette.height;
        const effects = this.target.effects;
        const costumeDimensions = this.costume.dimensions;

        /**
         * Return the determinant of two vectors, the vector from A to B and the vector from A to C.
         *
         * The determinant is useful in this case to know if AC is counter-clockwise from AB.
         * A positive value means that AC is counter-clockwise from AB. A negative value means AC is clockwise from AB.
         */
        const determinant = (A: vec2, B: vec2, C: vec2) => {
            // AB = B - A
            // AC = C - A
            // det (AB BC) = AB0 * AC1 - AB1 * AC0
            return (((B[0] - A[0]) * (C[1] - A[1])) - ((B[1] - A[1]) * (C[0] - A[0])));
        };

        const leftHull = this.convexHull;
        leftHull.length = 0;
        const rightHull = __rightHull;
        rightHull.length = 0;
        const pixelPos = vec2.create();
        const effectPos = vec2.create();
        let currentPoint: vec2 | undefined;
        const useEffects = (effects.bitmask & GraphicEffects.DISTORTION_EFFECTS) !== 0;

        // Not Scratch-space: y increases as we go downwards.
        for (let y = 0; y < height; y++) {
            pixelPos[1] = ((height - y - 1) + 0.5) / height;

            let x;
            // Move rightwards until we hit an opaque pixel.
            for (x = 0; x < width; x++) {
                pixelPos[0] = (x + 0.5) / width;
                let pixelX = x;
                let pixelY = y;
                if (useEffects) {
                    effectTransformPoint(effects, costumeDimensions, pixelPos, pixelPos);
                    pixelX = Math.floor(pixelPos[0] * width);
                    pixelY = height - Math.floor(pixelPos[1] * height) - 1;
                }

                if (silhouette.sampleTexelAlpha(pixelX, pixelY) > 0) {
                    currentPoint = vec2.copy(vec2.create(), pixelPos);
                    break;
                }
            }

            // No opaque pixels. Try again on the next line.
            if (x >= width) {
                continue;
            }

            // If appending the current point to the left hull makes a counterclockwise turn, we want to append the
            // current point to it. Otherwise, we remove hull points until the current point makes a counterclockwise
            // turn with the last two points.
            while (leftHull.length >= 2) {
                if (determinant(leftHull[leftHull.length - 1], leftHull[leftHull.length - 2], currentPoint!) < 0) {
                    break;
                }
                leftHull.pop();
            }
            leftHull.push(currentPoint!);

            // Now we repeat the process for the right side: move leftwards from the right.
            for (x = width - 1; x >= 0; x--) {
                pixelPos[0] = (x + 0.5) / width;
                let pixelX = x;
                let pixelY = y;
                if (useEffects) {
                    effectTransformPoint(effects, costumeDimensions, pixelPos, effectPos);
                    pixelX = Math.floor(pixelPos[0] * width);
                    pixelY = height - Math.floor(pixelPos[1] * height) - 1;
                }

                if (silhouette.sampleTexelAlpha(pixelX, pixelY) > 0) {
                    currentPoint = vec2.copy(vec2.create(), pixelPos);
                    break;
                }
            }

            // Now we remove hull points until the current point makes a *clockwise* turn with the last two points--
            // note the > 0 insteaf of < 0.
            while (rightHull.length >= 2) {
                if (determinant(rightHull[rightHull.length - 1], rightHull[rightHull.length - 2], currentPoint!) > 0) {
                    break;
                }
                rightHull.pop();
            }
            rightHull.push(currentPoint!);
        }

        // Concatenate the two hulls, adding the points from the right in reverse so all the points are clockwise.
        for (let i = rightHull.length - 1; i >= 0; i--) {
            leftHull.push(rightHull[i]);
        }
    }

    private updateTransformedHull() {
        if (this.transformDirty) {
            this.updateTransform();
        }

        if (this.convexHullDirty) {
            this.updateConvexHull();
        }

        const hull = this.convexHull;
        const transformedHull = this.transformedHull;
        // Reuse existing hull points instead of allocating new ones.
        if (transformedHull.length > hull.length) transformedHull.length = hull.length;
        for (let i = 0; i < hull.length; i++) {
            let point = hull[i];
            if (!point) point = vec2.create();
            const transformedPoint = vec2.transformMat3(point, point, this.transform);
            transformedHull[i] = transformedPoint;
        }
    }
}
