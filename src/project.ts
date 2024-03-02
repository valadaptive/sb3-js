import Target from './target.js';
import Sprite from './sprite.js';

export default class Project {
    public targets!: Target[];
    public sprites!: Sprite[];

    constructor(sprites: Sprite[], targets: Target[]) {
        this.targets = targets;
        this.sprites = sprites;
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
}
