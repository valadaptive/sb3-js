import {SomeProtoBlock} from './block.js';
import {control_start_as_clone, event_whenstageclicked, event_whenthisspriteclicked} from './blocks.js';
import {GraphicEffects} from './effects.js';
import Thread from './interpreter/thread.js';
import Project from './project.js';
import Drawable from './renderer/drawable.js';
import Rectangle from './rectangle.js';
import Runtime from './runtime.js';
import Sprite from './sprite.js';
import {TypedEvent} from './typed-events.js';
import TextBubble from './renderer/text-bubble.js';

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

    public volume: number;
    public tempo: number;
    public videoTransparency: number;
    public videoState: string;
    public effects: GraphicEffects;
    public textBubble: TextBubbleState | null = null;

    public variables: Map<string, string | number | boolean>;
    public lists: Map<string, (string | number | boolean)[]>;

    private scriptListenerCleanup: (() => void);
    public drawable;
    private hatListeners: Map<string, ((evt: TypedEvent) => Thread)[]> = new Map();
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
        effects?: GraphicEffects;
        variables: Map<string, string | number | boolean>;
        lists: Map<string, (string | number | boolean)[]>;
    }) {
        this.runtime = options.runtime;
        this.project = options.project;
        this.sprite = options.sprite;
        this.drawable = new Drawable(this, this.sprite.costumes[options.currentCostume]);
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
        this.volume = options.volume;
        this.tempo = options.tempo;
        this.videoTransparency = options.videoTransparency;
        this.videoState = options.videoState;
        this.effects = options.effects ? GraphicEffects.fromExisting(options.effects, this) : new GraphicEffects(this);
        this.variables = options.variables;
        this.lists = options.lists;

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
            effects: this.effects,
            variables: new Map(this.variables),
            lists: newLists,
        });
        return clone;
    }

    public remove() {
        this.project.removeTarget(this);
    }

    public reset() {
        this.effects.clear();
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

            if (proto.hat.type === 'event') {
                const hat = proto.hat;
                const eventName = hat.event.EVENT_NAME;

                const onEvent = (evt: TypedEvent) => {
                    return this.runtime.launchScript(script, this, evt, hat.restartExistingThreads);
                };
                this.addHatListener(eventName, onEvent, signal);
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
    private addHatListener<T extends string>(
        eventName: T, listener: (evt: TypedEvent<T>) => Thread, signal: AbortSignal) {
        let hatListeners = this.hatListeners.get(eventName);
        if (!hatListeners) {
            hatListeners = [];
            this.hatListeners.set(eventName, hatListeners);
        }
        hatListeners.push(listener as (evt: TypedEvent) => Thread);
        signal.addEventListener('abort', () => {
            const index = hatListeners!.indexOf(listener as (evt: TypedEvent) => Thread);
            if (index !== -1) {
                hatListeners!.splice(index, 1);
            }
        }, {once: true});
    }

    public fireHatListener<T extends string>(eventName: T, evt: TypedEvent<T>) {
        const listeners = this.hatListeners.get(eventName);
        if (!listeners) return null;

        const startedThreads = [];
        for (const listener of listeners) {
            startedThreads.push(listener(evt));
        }
        return startedThreads;
    }

    public destroy() {
        this.scriptListenerCleanup();
        this.runtime.stopTargetThreads(this);
    }

    public moveTo(x: number, y: number): void {
        if (this.sprite.isStage) return;

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

        this._position.x = x;
        this._position.y = y;
        if (this.drawable) {
            this.drawable.setTransformDirty();
        }
        this.runtime.requestRedraw();
    }

    /**
     * Set the text bubble for this target. If the text is empty, the text bubble will be removed.
     * @param type The type of text bubble to set.
     * @param text The text in the bubble.
     * @returns A symbol that can be used to identify this text bubble. This is used in "say/think for () secs" so that
     * they only remove the text bubble they created.
     */
    public setTextBubble(type: 'say' | 'think' | 'ask', text: string): symbol {
        const id = Symbol('TEXT_BUBBLE');
        if (text === '') {
            this.textBubble?.bubble?.destroy();
            this.textBubble = null;
            return id;
        }

        if (this.textBubble) {
            this.textBubble.type = type;
            this.textBubble.text = text;
            this.textBubble.id = id;
        } else {
            this.textBubble = {type, text, bubble: null, direction: 'left', id};
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
        this.runtime.requestRedraw();
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
        this.runtime.requestRedraw();
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
        this.runtime.requestRedraw();
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
        this.runtime.requestRedraw();
    }

    get visible(): boolean {
        return this._visible;
    }

    set visible(visible: boolean) {
        if (this.sprite.isStage) return;
        this._visible = visible;
        this.runtime.requestRedraw();
    }

    public isTouchingEdge(): boolean {
        const bounds = this.drawable.getTightBounds(__boundsRect);
        return bounds.left < this.runtime.stageBounds.left ||
            bounds.right > this.runtime.stageBounds.right ||
            bounds.top > this.runtime.stageBounds.top ||
            bounds.bottom < this.runtime.stageBounds.bottom;
    }
}
