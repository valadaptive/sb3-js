import {Block, SomeProtoBlock} from './block.js';
import Costume from './costume.js';
import {vm_stepEdgeActivatedHat} from './interpreter/edge-activated-hat.js';
import Sound from './sound.js';

export default class Sprite {
    public readonly name: string;
    public readonly costumes: Costume[];
    public readonly sounds: Sound[];
    public readonly isStage: boolean;
    public readonly scripts: Block[][];
    public readonly clones: Sprite[] = [];
    public readonly edgeActivatedScripts: {hat: SomeProtoBlock; script: Block[]}[] = [];

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

        for (const script of scripts) {
            if (script.length === 0) continue;
            const topBlock = script[0];
            if ((topBlock.proto as SomeProtoBlock).hat?.type === 'edgeActivated') {
                // Wrap all edge-activated hats in this helper block that implements their functionality.
                const wrapperBlock = new Block({
                    proto: vm_stepEdgeActivatedHat,
                    inputValues: {
                        PREDICATE: topBlock,
                        SCRIPT: script.slice(1),
                    },
                    id: Symbol('EDGE_ACTIVATED_HAT_WRAPPER'),
                });
                this.edgeActivatedScripts.push({hat: topBlock.proto, script: [wrapperBlock]});
                break;
            }
        }

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

    destroy() {
        for (const costume of this.costumes) {
            costume.destroy();
        }
    }
}
