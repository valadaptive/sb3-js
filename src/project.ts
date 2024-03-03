import Target from './target.js';
import Sprite from './sprite.js';

export default class Project {
    public readonly targets: Target[] = [];
    public readonly sprites: Sprite[] = [];
    public stage: Target | null = null;
    public cloneCount = 0;

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

    public addTargetWithSprite(sprite: Sprite, target: Target) {
        if (sprite.isStage) {
            if (this.stage) throw new Error('Cannot have multiple stage targets');
            this.stage = target;
        }
        this.targets.push(target);
        this.sprites.push(sprite);
    }

    public getTargetByName(name: string): Target | null {
        return this.targets.find(target => target.sprite.name === name && target.isOriginal) ?? null;
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

    public addTargetBehindTarget(target: Target, otherTarget: Target) {
        const currentIndex = this.targets.indexOf(otherTarget);

        this.targets.splice(currentIndex, 0, target);
    }

    public stopAll() {
        // Remove all clones and reset targets' state
        let nextOriginalTargetIndex = 0;
        for (let i = 0; i < this.targets.length; i++) {
            const target = this.targets[i];
            if (target.isOriginal) {
                this.targets[nextOriginalTargetIndex] = target;
                target.reset();
                nextOriginalTargetIndex++;
            } else {
                target.destroy();
            }
        }
        this.targets.length = nextOriginalTargetIndex;
    }

    public removeTarget(target: Target) {
        const index = this.targets.indexOf(target);
        if (index === -1) return;

        this.targets.splice(index, 1);
        target.destroy();
    }
}
