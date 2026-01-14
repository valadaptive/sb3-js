import {Block, SomeProtoBlock} from './block.js';
import Costume from './costume.js';
import {vm_stepEdgeActivatedHat} from './interpreter/edge-activated-hat.js';
import Sound from './sound.js';
import Target from './target.js';

export default class Sprite {
    public readonly name: string;
    public readonly costumes: Costume[];
    public readonly sounds: Sound[];
    public readonly isStage: boolean;
    public readonly scripts: Block[][];
    public readonly clones: Target[] = [];
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

    public getSoundByIndexOrName(indexOrName: string | number | boolean): Sound | null {
        // Scratch doesn't seem to play *any* sound if the input is a Boolean. It implicitly flows into the parseInt
        // path, but parseInt returns NaN for booleans so nothing matches.
        if (typeof indexOrName === 'boolean') return null;

        let index = -1;
        // First try looking the sound up by name. Scratch uses an exact equality check when doing this rather than
        // casting to a string. This means that numeric and string values are treated differently. For instance, an
        // indexOrName with the *numeric* value 2 will play the second sound, but an indexOrName with the *string* value
        // "2" will play the sound *named* "2" if one exists.
        if (typeof indexOrName === 'string') {
            index = this.soundIndicesByName.get(indexOrName) ?? -1;
        }
        // Look the sound up by numeric index. The `len > 0` check prevents a modulo 0 when wrapping.
        const len = this.sounds.length;
        if (index === -1 && len > 0) {
            const numIndex = typeof indexOrName === 'number' ? indexOrName : parseInt(indexOrName, 10);
            // Scratch wraps here for some reason. Note also that sounds are 1-indexed.
            if (Number.isFinite(numIndex)) {
                index = (((numIndex - 1) % len) + len) % len;
            }
        }
        if (index === -1) return null;
        return this.sounds[index];
    }

    destroy() {
        for (const costume of this.costumes) {
            costume.destroy();
        }
    }

    registerClone(clone: Target) {
        this.clones.push(clone);
    }

    unregisterClone(clone: Target) {
        const cloneIndex = this.clones.indexOf(clone);
        if (!cloneIndex) return;
        this.clones.splice(cloneIndex, 1);
    }
}
