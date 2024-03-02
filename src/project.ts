import Target from './target.js';
import Sprite from './sprite.js';

export default class Project {
    public readonly targets: Target[];
    public readonly sprites: Sprite[];
    public readonly stage: Target;

    constructor(sprites: Sprite[], targets: Target[]) {
        this.targets = targets;
        this.sprites = sprites;
        const stage = targets.find(target => target.sprite.isStage);
        if (!stage) {
            throw new Error('No stage found');
        }
        this.stage = stage;
    }

    register(): () => void {
        const unregisterCallbacks: (() => void)[] = [];

        for (const target of this.targets) {
            unregisterCallbacks.push(target.destroy.bind(target));
        }

        return () => {
            for (const unregister of unregisterCallbacks) {
                unregister();
            }
        };
    }

    public getTargetByName(name: string): Target | null {
        return this.targets.find(target => target.sprite.name === name) ?? null;
    }

    public moveTargetToFront(target: Target) {
        if (target.sprite.isStage) return;
        const currentIndex = this.targets.indexOf(target);
        if (currentIndex === -1) return;

        this.targets.splice(currentIndex, 1);
        this.targets.push(target);
    }

    public moveTargetToBack(target: Target) {
        if (target.sprite.isStage) return;
        const currentIndex = this.targets.indexOf(target);
        if (currentIndex === -1) return;

        this.targets.splice(currentIndex, 1);
        // Index 0 is reserved for the stage
        this.targets.splice(1, 0, target);
    }

    public moveTargetForwardBackwardLayers(target: Target, n: number) {
        if (target.sprite.isStage) return;
        const currentIndex = this.targets.indexOf(target);
        if (currentIndex === -1) return;

        const newIndex = currentIndex + n;

        this.targets.splice(currentIndex, 1);
        // splice properly handles clamping the upper bound, but we need to clamp the lower bound ourselves because
        // index 0 is reserved for the stage
        this.targets.splice(Math.max(newIndex, 1), 0, target);
    }
}
