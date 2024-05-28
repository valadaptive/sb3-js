import {Block, BlockInput, ProtoBlock, VariableField, instanceInput} from './block.js';
import Rectangle from './rectangle.js';
import Target from './target.js';
import {TypedEvent, TypedEventTarget} from './typed-events.js';

export class MonitorSliderChangeEvent extends TypedEvent<'sliderchange'> {
    constructor(public readonly value: number, eventInitDict?: EventInit) {
        super('sliderchange', eventInitDict);
    }
}

export interface MonitorView extends TypedEventTarget<MonitorSliderChangeEvent> {
    update(monitor: Monitor): void;
    setColor(fg: string, bg: string): void;
    getBounds(): Rectangle | null;
    layout(monitorRects: Rectangle[]): {x: number; y: number} | null;
    remove(): void;
}

export class UpdateMonitorEvent extends TypedEvent<'updatemonitor'> {
    constructor(public readonly monitor: Monitor) {
        super('updatemonitor');
    }
}

export type BaseMonitorParams = ScalarMonitorParams | ListMonitorParams;

export type MonitorMode =
    | {mode: 'default'}
    | {mode: 'large'}
    | {mode: 'slider'; min: number; max: number; isDiscrete: boolean}
    | {mode: 'list'; size: {width: number; height: number}};

type ScalarMonitorMode = Exclude<MonitorMode, {mode: 'list'}>;
type ListMonitorMode = MonitorMode & {mode: 'list'};

export type ScalarMonitorParams = {
    label: string;
    value: string | number | boolean | (string | number | boolean)[];
    visible: boolean;
    position: {x: number; y: number} | null;
    mode: ScalarMonitorMode;
};

export type ListMonitorParams = {
    label: string;
    value: string | number | boolean | (string | number | boolean)[];
    visible: boolean;
    position: {x: number; y: number} | null;
    mode: ListMonitorMode;
};

class BaseMonitor extends TypedEventTarget<UpdateMonitorEvent> {
    public target: Target | null;
    public readonly block: Block;

    protected _label: string;
    protected _value: string | number | boolean | (string | number | boolean)[] | null;
    protected _visible: boolean;
    protected _position: {x: number; y: number} | null;
    protected _mode: MonitorMode = {mode: 'default'};

    constructor(target: Target | null, block: Block, params: Omit<BaseMonitorParams, 'value'>) {
        super();
        this.target = target;
        this.block = block;

        this._label = params.label;
        this._value = null;
        this._visible = params.visible;
        this._position = params.position;
        this._mode = params.mode;
    }

    get label() {
        return this._label;
    }

    get value() {
        return this._value;
    }

    get visible() {
        return this._visible;
    }

    get position(): {x: number; y: number} | null {
        return this._position;
    }

    get mode() {
        return this._mode;
    }

    public update({label, value, visible, position, mode}: Partial<BaseMonitorParams>) {
        let changed = false;
        if (typeof label !== 'undefined') {
            changed ||= this._label !== label;
            this._label = label;
        }
        if (typeof value !== 'undefined') {
            // Always consider arrays to be changed (it's faster than a deep comparison)
            changed ||= this._value !== value || Array.isArray(value);
            this._value = value;
        }
        if (typeof visible !== 'undefined') {
            changed ||= this._visible !== visible;
            this._visible = visible;
        }
        if (typeof position !== 'undefined') {
            changed ||= this._position === null || position === null ?
                this._position === position :
                this._position.x !== position.x || this._position.y !== position.y;
            this._position = position;
        }
        if (typeof mode !== 'undefined') {
            changed ||= this._mode !== mode;
            this._mode = mode;
        }
        if (changed) this.dispatchEvent(new UpdateMonitorEvent(this as Monitor));
    }
}

export class ScalarMonitor extends BaseMonitor {
    constructor(target: Target | null, block: Block, params: Omit<ScalarMonitorParams, 'value'>) {
        super(target, block, params);
    }

    get mode(): ScalarMonitorMode {
        return this._mode as ScalarMonitorMode;
    }

    public update(params: Partial<ScalarMonitorParams>): void {
        super.update(params);
    }

    get value() {
        return this._value as string | number | boolean;
    }
}

export class ListMonitor extends BaseMonitor {
    constructor(
        target: Target | null,
        block: Block,
        params: Omit<ListMonitorParams, 'value'>,
    ) {
        super(target, block, params);
    }

    get mode(): ListMonitorMode {
        return this._mode as ListMonitorMode;
    }

    public update(params: Partial<ListMonitorParams>): void {
        super.update(params);
    }

    get value() {
        return this._value as (string | number | boolean)[];
    }
}

export type Monitor = ListMonitor | ScalarMonitor;

const MonitorInput = new BlockInput('monitor', instanceInput(BaseMonitor));

export const updateMonitor = new ProtoBlock({
    opcode: 'vm_update_monitor',
    inputs: {
        MONITOR: MonitorInput,
    },
    execute: function* ({MONITOR}, ctx) {
        const value = (yield* ctx.evaluate(MONITOR.block)) as string | number | boolean | (string | number | boolean)[];
        MONITOR.update({value});
    },
});

export const listMonitorContents = new ProtoBlock({
    opcode: 'vm_list_monitor_contents',
    inputs: {
        LIST: VariableField,
    },
    execute: function* ({LIST}, ctx) {
        // TODO: remove this once there's some strict return type validation and blocks can return arbitrary types.
        // This is fine for now because this block will never be executed outside "update monitor" threads.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return ctx.lookupOrCreateList(LIST.value) as any;
    },
    monitorLabel: ({LIST}) => LIST.value,
    colorCategory: 'data_lists',
});
