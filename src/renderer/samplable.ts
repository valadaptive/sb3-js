import Rectangle from '../rectangle.js';
import Silhouette from './silhouette.js';

export default interface Samplable {
    sampleColorAtPoint(
        x: number,
        y: number,
        silhouette: Silhouette,
        dst: Uint8ClampedArray,
        effectMask: number,
    ): Uint8ClampedArray;

    checkPointCollision(x: number, y: number, silhouette: Silhouette): boolean;

    getSamplingBounds(result?: Rectangle): Rectangle;
}
