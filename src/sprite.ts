import {Block} from './block.js';
import Costume from './costume.js';
import Sound from './sound.js';

export default class Sprite {
    public readonly name: string;
    public readonly costumes: Costume[];
    public readonly sounds: Sound[];
    public readonly isStage: boolean;
    public readonly scripts: Block[][];
    public readonly clones: Sprite[] = [];

    private costumeIndicesByName: Map<string, number>;
    private soundIndicesByName: Map<string, number>;

    constructor({name, costumes, sounds, isStage, scripts}: {
        name: string;
        costumes: Costume[];
        sounds: Sound[];
        isStage?: boolean;
        scripts: Block[][];
    }) {
        this.name = name;
        this.costumes = costumes;
        this.sounds = sounds;
        this.isStage = !!isStage;
        this.scripts = scripts;

        this.costumeIndicesByName = new Map(costumes.map((costume, i) => [costume.name, i]));
        this.soundIndicesByName = new Map(sounds.map((sound, i) => [sound.name, i]));
    }

    public getCostumeIndexByName(name: string): number {
        return this.costumeIndicesByName.get(name) ?? -1;
    }

    public getSoundByName(name: string): Sound | null {
        const index = this.soundIndicesByName.get(name);
        if (typeof index === 'undefined') return null;
        return this.sounds[index];
    }
}
