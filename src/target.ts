import {SomeProtoBlock} from './block.js';
import {control_start_as_clone} from './blocks.js';
import Thread from './interpreter/thread.js';
import Project from './project.js';
import Drawable from './renderer/drawable.js';
import Runtime from './runtime.js';
import Sprite from './sprite.js';
import {TypedEvent} from './typed-events.js';

export type RotationStyle = 'all around' | 'left-right' | 'don\'t rotate';

const MAX_CLONES = 300;

export default class Target {
    public readonly runtime: Runtime;
    public readonly project: Project;
    public readonly sprite: Sprite;

    public isOriginal: boolean;
    public original: Target;
    public x: number;
    public y: number;
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

    public variables: Map<string, string | number | boolean>;
    public lists: Map<string, (string | number | boolean)[]>;

    private scriptListenerCleanup: (() => void);
    public drawable: Drawable | null = null;
    private hatListeners: Map<string, ((evt: TypedEvent) => Thread)[]> = new Map();

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
        variables: Map<string, string | number | boolean>;
        lists: Map<string, (string | number | boolean)[]>;
    }) {
        this.runtime = options.runtime;
        this.project = options.project;
        this.sprite = options.sprite;
        this.isOriginal = options.isOriginal;
        if (!this.isOriginal && !options.original) {
            throw new Error('Clones must reference an original target');
        }
        this.original = options.original ?? this;
        this.x = options.x;
        this.y = options.y;
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
        const original = this.original;
        const clone = new Target({
            isOriginal: false,
            original,
            runtime: original.runtime,
            project: original.project,
            sprite: original.sprite,
            x: original.x,
            y: original.y,
            direction: original.direction,
            size: original.size,
            visible: original.visible,
            rotationStyle: original.rotationStyle,
            draggable: original.draggable,
            currentCostume: original.currentCostume,
            volume: original.volume,
            tempo: original.tempo,
            videoTransparency: original.videoTransparency,
            videoState: original.videoState,
            variables: new Map(original.variables),
            lists: new Map(original.lists),
        });
        return clone;
    }

    public remove() {
        this.project.removeTarget(this);
    }

    private setUpScriptListeners(): () => void {
        const abortController = new AbortController();
        const signal = abortController.signal;

        for (const script of this.sprite.scripts) {
            const topBlock = script[0];
            if (!topBlock) continue;

            const proto = topBlock.proto as SomeProtoBlock;

            if (proto.hat && proto.hat.type === 'event') {
                const hat = proto.hat;
                const eventName = hat.event.EVENT_NAME;

                const onEvent = (evt: TypedEvent) => {
                    return this.runtime.launchScript(script, this, evt, hat.restartExistingThreads);
                };
                this.addHatListener(eventName, onEvent, signal);
            }
        }

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
        this.x = x;
        this.y = y;
        if (this.drawable) {
            this.drawable.setTransformDirty();
        }
        this.runtime.requestRedraw();
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
            this.drawable.setTransformDirty();
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
}
