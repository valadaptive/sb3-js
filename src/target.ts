import {Block, SomeProtoBlock} from './block.js';
import {control_start_as_clone, event_whenstageclicked, event_whenthisspriteclicked} from './blocks.js';
import {GraphicEffects} from './effects.js';
import PenState from './pen-state.js';
import Project from './project.js';
import Drawable from './renderer/drawable.js';
import Rectangle from './rectangle.js';
import Runtime from './runtime.js';
import Sprite from './sprite.js';
import TextBubble from './renderer/text-bubble.js';
import AudioTarget from './audio/audio-target.js';

export type RotationStyle = 'all around' | 'left-right' | 'don\'t rotate';

/** The maximum number of clones that can exist in a single project (this limit is global, *not* per-sprite). */
const MAX_CLONES = 300;

/** The number of pixels a sprite is required to leave remaining onscreen around the edge of the stage. */
const FENCE_SIZE = 15;

/**
 * Reused memory location for storing targets' bounds temporarily.
 */
const __boundsRect = new Rectangle();

export type TextBubbleState = {
    type: 'say' | 'think' | 'ask';
    text: string;
    // The side a text bubble is rendered on is "sticky"--it doesn't change unless it has to.
    direction: 'left' | 'right';
    bubble: TextBubble | null;
    id: symbol;
};

export default class Target {
    public readonly runtime: Runtime;
    public readonly project: Project;
    public readonly sprite: Sprite;

    public isOriginal: boolean;
    public original: Target;
    private _position: {x: number; y: number};
    private _direction: number;
    private _size: number;
    private _visible: boolean;
    private _rotationStyle: RotationStyle;
    public draggable: boolean;
    private _currentCostume: number;

    public dragging: boolean;
    public tempo: number;
    public videoTransparency: number;
    public videoState: string;
    public effects: GraphicEffects;
    public textBubble: TextBubbleState | null = null;
    public penState: PenState;

    public variables: Map<string, string | number | boolean>;
    public lists: Map<string, (string | number | boolean)[]>;
    public edgeActivatedHatValues: Map<Block, boolean> = new Map();

    public audio;
    public drawable;

    private scriptListenerCleanup: (() => void);
    private scriptsByHatEventName: Map<string, Block[][]> = new Map();
    public click!: () => void;

    constructor(options: {
        runtime: Runtime;
        project: Project;
        sprite: Sprite;
        isOriginal: boolean;
        original?: Target;
        x: number;
        y: number;
        direction: number;
        size: number;
        visible: boolean;
        rotationStyle: RotationStyle;
        draggable: boolean;
        currentCostume: number;
        volume: number;
        tempo: number;
        videoTransparency: number;
        videoState: string;
        audio?: AudioTarget;
        effects?: GraphicEffects;
        penState?: PenState;
        variables: Map<string, string | number | boolean>;
        lists: Map<string, (string | number | boolean)[]>;
    }) {
        this.runtime = options.runtime;
        this.project = options.project;
        this.sprite = options.sprite;
        this.drawable = new Drawable(this, this.sprite.costumes[options.currentCostume]);
        this.audio = options.audio ? AudioTarget.fromExisting(options.audio) : new AudioTarget(this.runtime.audio);
        this.isOriginal = options.isOriginal;
        if (!this.isOriginal && !options.original) {
            throw new Error('Clones must reference an original target');
        }
        this.original = options.original ?? this;
        this._position = {x: options.x, y: options.y};
        this._direction = options.direction;
        this._size = options.size;
        this._visible = options.visible;
        this._rotationStyle = options.rotationStyle;
        this.draggable = options.draggable;
        this._currentCostume = options.currentCostume;
        this.dragging = false;
        this.volume = options.volume;
        this.tempo = options.tempo;
        this.videoTransparency = options.videoTransparency;
        this.videoState = options.videoState;
        this.effects = options.effects ? GraphicEffects.fromExisting(options.effects, this) : new GraphicEffects(this);
        this.penState = options.penState ? options.penState.clone() : new PenState();
        this.variables = options.variables;
        this.lists = options.lists;

        this.sprite.registerClone(this);
        this.audio.connect(this.runtime.audio);

        this.scriptListenerCleanup = this.setUpScriptListeners();
    }

    public clone() {
        if (this.project.cloneCount >= MAX_CLONES) return;
        const clone = this.createClone();
        this.project.cloneCount++;
        this.project.addTargetBehindTarget(clone, this);
        for (const script of clone.sprite.scripts) {
            const topBlock = script[0];
            if (!topBlock) continue;

            const proto = topBlock.proto as SomeProtoBlock;

            if (proto === control_start_as_clone) {
                this.runtime.launchScript(script, clone, null, false);
            }
        }
    }

    private createClone(): Target {
        // Deep-clone lists
        const newLists = new Map<string, (string | number | boolean)[]>();
        for (const [name, list] of this.lists) {
            newLists.set(name, list.slice(0));
        }
        const clone = new Target({
            isOriginal: false,
            original: this.original,
            x: this._position.x,
            y: this._position.y,
            runtime: this.runtime,
            project: this.project,
            sprite: this.sprite,
            direction: this.direction,
            size: this.size,
            visible: this.visible,
            rotationStyle: this.rotationStyle,
            draggable: this.draggable,
            currentCostume: this.currentCostume,
            volume: this.volume,
            tempo: this.tempo,
            videoTransparency: this.videoTransparency,
            videoState: this.videoState,
            audio: this.audio,
            effects: this.effects,
            penState: this.penState,
            variables: new Map(this.variables),
            lists: newLists,
        });
        for (const [hat, value] of this.edgeActivatedHatValues) {
            clone.edgeActivatedHatValues.set(hat, value);
        }
        return clone;
    }

    public remove() {
        this.project.removeTarget(this);
        this.destroy();
    }

    public reset() {
        this.effects.clear();
        this.setTextBubble('say', '');
        this.audio.stopAllSounds();
        this.audio.clearEffects();
    }

    private setUpScriptListeners(): () => void {
        const abortController = new AbortController();
        const signal = abortController.signal;
        const clickHandlers: (() => void)[] = [];

        for (const script of this.sprite.scripts) {
            const topBlock = script[0];
            if (!topBlock) continue;

            const proto = topBlock.proto as SomeProtoBlock;
            if (!proto.hat) continue;

            switch (proto.hat.type) {
                case 'event': {
                    this.addHatListener(script, signal);
                    break;
                }
                case 'edgeActivated': {
                    this.edgeActivatedHatValues.set(topBlock, false);
                    break;
                }
            }

            if (proto === event_whenthisspriteclicked || proto === event_whenstageclicked) {
                clickHandlers.push(() =>
                    this.runtime.launchScript(script, this, null, proto.hat!.restartExistingThreads));
            }
        }

        this.click = () => {
            for (const handler of clickHandlers) {
                handler();
            }
        };

        return () => {
            abortController.abort();
        };
    }

    /**
     * Add an event listener for a hat block event. Unlike EventTarget, these listeners will always be fired in the
     * targets' current execution order.
     */
    private addHatListener(script: Block[], signal: AbortSignal) {
        const topBlock = script[0];
        if (!topBlock) return;
        const protoBlock = topBlock.proto as SomeProtoBlock;
        const hatInfo = protoBlock.hat!;
        if (hatInfo.type !== 'event') {
            throw new Error(`Expected event hat, got ${hatInfo.type}`);
        }
        let hatScripts = this.scriptsByHatEventName.get(hatInfo.event.EVENT_NAME);
        if (!hatScripts) {
            hatScripts = [];
            this.scriptsByHatEventName.set(hatInfo.event.EVENT_NAME, hatScripts);
        }
        hatScripts.push(script);
        signal.addEventListener('abort', () => {
            const index = hatScripts.indexOf(script);
            if (index !== -1) {
                hatScripts.splice(index, 1);
            }
        }, {once: true});
    }

    public getScriptsByHat(opcode: string) {
        return this.scriptsByHatEventName.get(opcode) ?? null;
    }

    public destroy() {
        this.reset();
        this.audio.disconnect();
        this.sprite.unregisterClone(this);
        this.scriptListenerCleanup();
        this.runtime.stopTargetThreads(this);
    }

    public moveTo(x: number, y: number, fromDrag = false): void {
        // When dragging, don't move sprite from motion blocks
        if (this.sprite.isStage || (this.dragging && !fromDrag)) return;

        // Fencing: keep the sprite visible on the stage by preventing it from moving completely off the edge.
        const dx = x - this._position.x;
        const dy = y - this._position.y;
        const fenceBounds = this.drawable.getAABB(__boundsRect);
        const inset = Math.min(FENCE_SIZE, Math.floor(Math.min(fenceBounds.width, fenceBounds.height) / 2));

        const stageRight = this.runtime.stageBounds.right - inset;
        const stageLeft = this.runtime.stageBounds.left + inset;
        const stageTop = this.runtime.stageBounds.top - inset;
        const stageBottom = this.runtime.stageBounds.bottom + inset;

        if (fenceBounds.right + dx < stageLeft) {
            x = Math.ceil(this._position.x - (stageRight + fenceBounds.right));
        } else if (fenceBounds.left + dx > stageRight) {
            x = Math.floor(this._position.x + (stageRight - fenceBounds.left));
        }

        if (fenceBounds.top + dy < stageBottom) {
            y = Math.ceil(this._position.y - (stageTop + fenceBounds.top));
        } else if (fenceBounds.bottom + dy > stageTop) {
            y = Math.floor(this._position.y + (stageTop - fenceBounds.bottom));
        }

        const shouldDrawPenLine = this.penState.down && !fromDrag;

        if (shouldDrawPenLine) {
            this.runtime.penLayer?.penLine(
                this._position.x,
                this._position.y,
                x,
                y,
                this.penState.rgba,
                this.penState.thickness,
            );
        }

        this._position.x = x;
        this._position.y = y;
        if (this.drawable) {
            this.drawable.setTransformDirty();
        }

        if (this.visible || shouldDrawPenLine) this.runtime.requestRedraw();
    }

    /**
     * Set the text bubble for this target. If the text is empty, the text bubble will be removed.
     * @param type The type of text bubble to set.
     * @param text The text in the bubble.
     * @returns A symbol that can be used to identify this text bubble. This is used in "say/think for () secs" so that
     * they only remove the text bubble they created.
     */
    public setTextBubble(type: 'say' | 'think' | 'ask', text: string | number | boolean): symbol {
        const id = Symbol('TEXT_BUBBLE');
        if (text === '') {
            this.textBubble?.bubble?.destroy();
            this.textBubble = null;
            return id;
        }

        let formattedText = text;
        if (typeof text === 'number' && Math.abs(text) >= 0.01 && text % 1 !== 0) {
            formattedText = text.toFixed(2);
        }

        if (this.textBubble) {
            this.textBubble.type = type;
            this.textBubble.text = String(formattedText);
            this.textBubble.id = id;
        } else {
            this.textBubble = {type, text: String(formattedText), bubble: null, direction: 'left', id};
        }
        return id;
    }

    get position(): {readonly x: number; readonly y: number} {
        return this._position;
    }

    set position({x, y}) {
        this.moveTo(x, y);
    }

    get direction(): number {
        return this._direction;
    }

    set direction(deg: number) {
        if (this.sprite.isStage) return;
        // Wrap degrees from -180 to 180. Not sure if there's any way to make this expression less unwieldy.
        this._direction = ((((deg + 180) % 360) + 360) % 360) - 180;
        if (this.drawable) {
            this.drawable.setTransformDirty();
        }
        if (this.visible) this.runtime.requestRedraw();
    }

    get size(): number {
        return this._size;
    }

    set size(size: number) {
        if (this.sprite.isStage) return;
        this._size = size;
        if (this.drawable) {
            this.drawable.setTransformDirty();
        }
        if (this.visible) this.runtime.requestRedraw();
    }

    get rotationStyle(): RotationStyle {
        return this._rotationStyle;
    }

    set rotationStyle(style: RotationStyle) {
        if (this.sprite.isStage) return;
        this._rotationStyle = style;
        if (this.drawable) {
            this.drawable.setTransformDirty();
        }
        if (this.visible) this.runtime.requestRedraw();
    }

    get currentCostume(): number {
        return this._currentCostume;
    }

    set currentCostume(index: number) {
        if (Number.isFinite(index)) {
            const len = this.sprite.costumes.length;
            // Wrapping modulo (always positive)
            index = ((Math.round(index) % len) + len) % len;
        } else {
            index = 0;
        }

        this._currentCostume = index;
        if (this.drawable) {
            this.drawable.setCostume(this.sprite.costumes[index]);
        }
        if (this.visible) this.runtime.requestRedraw();
    }

    get visible(): boolean {
        return this._visible;
    }

    set visible(visible: boolean) {
        if (this.sprite.isStage) return;
        this._visible = visible;
        if (visible) this.runtime.requestRedraw();
    }

    public isTouchingEdge(): boolean {
        const renderer = this.runtime.renderer;
        if (!renderer) return false;
        const bounds = renderer.getTightBoundsForTarget(this, __boundsRect);
        return bounds.left < this.runtime.stageBounds.left ||
            bounds.right > this.runtime.stageBounds.right ||
            bounds.top > this.runtime.stageBounds.top ||
            bounds.bottom < this.runtime.stageBounds.bottom;
    }

    public get volume(): number {
        return this.audio.volume;
    }

    public set volume(volume: number) {
        this.audio.volume = volume;
    }
}
