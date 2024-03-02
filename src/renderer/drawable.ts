import {mat3} from 'gl-matrix';
import Target from '../target.js';
import Shader from './shader.js';

export default class Drawable {
    private gl: WebGL2RenderingContext;
    private transform: mat3 = mat3.create();
    private transformDirty = true;
    private target: Target;

    constructor(gl: WebGL2RenderingContext, target: Target) {
        this.gl = gl;
        this.target = target;
    }

    setTransformDirty() {
        this.transformDirty = true;
    }

    private updateTransform() {
        mat3.identity(this.transform);
        const currentCostume = this.target.sprite.costumes[this.target.currentCostume];
        mat3.translate(this.transform, this.transform, [this.target.x, this.target.y]);
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

    setUniforms(shader: Shader) {
        if (this.transformDirty) {
            this.updateTransform();
        }

        this.gl.uniformMatrix3fv(shader.uniformLocations.u_transform, false, this.transform);
    }
}
