import {SomeProtoBlock} from './block.js';
import Drawable from './renderer/drawable.js';
import Runtime from './runtime.js';
import Sprite from './sprite.js';
import {TypedEvent, TypedEventTarget} from './typed-events.js';

export type RotationStyle = 'all around' | 'left-right' | 'don\'t rotate';

export default class Target {
    public readonly runtime: Runtime;
    public readonly sprite: Sprite;

    public x: number = 0;
    public y: number = 0;
    private _direction: number = 90;
    private _size: number = 100;
    public visible: boolean = true;
    private _rotationStyle: RotationStyle = 'all around';
    public draggable: boolean = false;
    public layerOrder: number = 0;
    public currentCostume: number = 0;

    public volume: number = 100;
    public tempo: number = 60;
    public videoTransparency: number = 50;
    public videoState: string = 'off';

    public variables: Map<string, string | number | boolean>;
    public lists: Map<string, (string | number | boolean)[]>;

    private scriptListenerCleanup: (() => void);
    public drawable: Drawable | null = null;

    constructor(options: {
        runtime: Runtime;
        sprite: Sprite;
        x: number;
        y: number;
        direction: number;
        size: number;
        visible: boolean;
        rotationStyle: RotationStyle;
        draggable: boolean;
        layerOrder: number;
        currentCostume: number;
        volume: number;
        tempo: number;
        videoTransparency: number;
        videoState: string;
        variables: Map<string, string | number | boolean>;
        lists: Map<string, (string | number | boolean)[]>;
    }) {
        this.runtime = options.runtime;
        this.sprite = options.sprite;
        this.x = options.x;
        this.y = options.y;
        this.direction = options.direction;
        this.size = options.size;
        this.visible = options.visible;
        this.rotationStyle = options.rotationStyle;
        this.draggable = options.draggable;
        this.layerOrder = options.layerOrder;
        this.currentCostume = options.currentCostume;
        this.volume = options.volume;
        this.tempo = options.tempo;
        this.videoTransparency = options.videoTransparency;
        this.videoState = options.videoState;
        this.variables = options.variables;
        this.lists = options.lists;

        this.scriptListenerCleanup = this.setUpScriptListeners();
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
                const eventName = new hat.event().type as
                    (Runtime extends TypedEventTarget<infer Evt>
                        ? Evt extends TypedEvent<infer Name>
                            ? Name
                            : never
                        : never);

                const onEvent = (evt: TypedEvent) => {
                    this.runtime.launchScript(script, this, evt, hat.restartExistingThreads);
                };
                // Register event handler on the runtime to execute this script when its hat block event is fired
                this.runtime.addEventListener(eventName, onEvent, {signal});
            }
        }

        return () => {
            abortController.abort();
        };
    }

    public destroy() {
        this.scriptListenerCleanup();
    }

    public moveTo(x: number, y: number): void {
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

    set direction(val: number) {
        this._direction = val % 360;
        if (this._direction < 0) {
            this._direction += 360;
        }
        if (this.drawable) {
            this.drawable.setTransformDirty();
        }
        this.runtime.requestRedraw();
    }

    get size(): number {
        return this._size;
    }

    set size(val: number) {
        this._size = val;
        if (this.drawable) {
            this.drawable.setTransformDirty();
        }
        this.runtime.requestRedraw();
    }

    get rotationStyle(): RotationStyle {
        return this._rotationStyle;
    }

    set rotationStyle(val: RotationStyle) {
        this._rotationStyle = val;
        if (this.drawable) {
            this.drawable.setTransformDirty();
        }
        this.runtime.requestRedraw();
    }
}
