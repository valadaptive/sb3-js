import {mat3, vec2} from 'gl-matrix';

import Target from '../target.js';
import Costume from '../costume.js';

import Shader from './shader.js';
import Rectangle from './rectangle.js';
import {effectTransformPoint} from './effect-transform.js';
import {GraphicEffects} from '../effects.js';

const __localPosition = vec2.create();

export default class Drawable {
    private transform: mat3 = mat3.create();
    private inverseTransform: mat3 = mat3.create();
    private transformDirty = true;
    private inverseTransformDirty = true;
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
    }

    setCostume(costume: Costume) {
        this.costume = costume;
        this.setTransformDirty();
    }

    private updateTransform() {
        mat3.identity(this.transform);
        const currentCostume = this.costume;
        const targetPosition = this.target.position;
        mat3.translate(this.transform, this.transform, [targetPosition.x, targetPosition.y]);
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

    isTouchingPoint(x: number, y: number) {
        if (this.inverseTransformDirty) {
            this.updateInverseTransform();
        }
        vec2.set(__localPosition, x, y);
        vec2.transformMat3(__localPosition, __localPosition, this.inverseTransform);
        if (__localPosition[0] < 0 || __localPosition[0] > 1 || __localPosition[1] < 0 || __localPosition[1] > 1) {
            return false;
        }
        // The texture's Y-axis is flipped
        __localPosition[1] = 1 - __localPosition[1];
        const effects = this.target.effects;
        if ((effects.bitmask & GraphicEffects.DISTORTION_EFFECTS) !== 0) {
            effectTransformPoint(effects, this.costume.dimensions, __localPosition, __localPosition);
        }
        return this.costume.skin
            ?.getSilhouette(this.target.size * 0.01)
            ?.isTouching(__localPosition[0], __localPosition[1]);
    }
}
