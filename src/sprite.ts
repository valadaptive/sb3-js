import {Block} from './block.js';
import Costume from './costume.js';
import Sound from './sound.js';

export default class Sprite {
    public name: string;
    public costumes: Costume[];
    public sounds: Sound[];
    public isStage: boolean;
    public scripts: Block[][];

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
    }
}
