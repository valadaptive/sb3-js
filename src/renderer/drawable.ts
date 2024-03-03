import {mat3} from 'gl-matrix';
import Target from '../target.js';
import Shader from './shader.js';
import Rectangle from './rectangle.js';

export default class Drawable {
    private transform: mat3 = mat3.create();
    private transformDirty = true;
    private target: Target;

    constructor(target: Target) {
        this.target = target;
    }

    setTransformDirty() {
        this.transformDirty = true;
    }

    private updateTransform() {
        mat3.identity(this.transform);
        const currentCostume = this.target.sprite.costumes[this.target.currentCostume];
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
                this.target.sprite.costumes[this.target.currentCostume].dimensions.width,
                this.target.sprite.costumes[this.target.currentCostume].dimensions.height,
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
}
