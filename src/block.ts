import BlockContext from './interpreter/block-context.js';
import Target from './target.js';
import {ColorCategory} from './theme.js';
import {TypedEventConstructor} from './typed-events.js';

// The type of a block input's value. An array represents a union of types, and an object represents an object whose
// values are of the given types.
export type BlockInputValue =
    | 'string'
    | 'number'
    | 'boolean'
    | 'null'
    | 'block'
    | {type: 'union'; values: BlockInputValue[]}
    | {type: 'array'; items: BlockInputValue}
    | {type: 'object'; values: {[x: string]: BlockInputValue}}
    | {type: 'instance'; of: new() => unknown}
    | {type: 'literal'; value: string}
    | BlockInput<string, BlockInputValue>;

export const objectInput = <T extends {[x: string]: BlockInputValue}>(values: T): {type: 'object'; values: T} => ({
    type: 'object',
    values,
});

export const instanceInput = <T>(of: new(...args: any[]) => T) => ({type: 'instance', of} as const);

export const literalInput = <T extends string>(value: T): {type: 'literal'; value: T} => ({type: 'literal', value});

export const arrayInput = <T extends BlockInputValue>(items: T): {type: 'array'; items: T} => ({
    type: 'array',
    items,
});

export const unionInput = <T extends BlockInputValue[]>(...values: T): {type: 'union'; values: T} => ({
    type: 'union',
    values,
});

type Decrement<I extends number> = [never, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9][I] & number;

/**
 * The part of BlockInputValueShapeFor that does the actual work. Only works up to 4 levels deep to avoid infinite type
 * instantiation errors.
 */
type BlockInputValueShapeForInner<T extends BlockInputValue, Iterations extends number> = Iterations extends 0 ?
    never :
    T extends 'string'
        ? string
        : T extends 'number'
            ? number
            : T extends 'boolean'
                ? boolean
                : T extends 'null'
                    ? null
                    : T extends 'block'
                        ? Block<ProtoBlock>
                        : T extends {type: 'union'; values: (infer UnionItem)[]}
                            ? UnionItem extends BlockInputValue
                                ? BlockInputValueShapeForInner<UnionItem, Decrement<Iterations>>
                                : never
                            : T extends {type: 'array'; items: infer ArrayItem}
                                ? ArrayItem extends BlockInputValue
                                    ?
                                    BlockInputValueShapeForInner<ArrayItem, Decrement<Iterations>>[]
                                    : never
                                : T extends {type: 'object'; values: {[x: string]: BlockInputValue}}
                                    ? {
                                        [K in keyof T['values']]: BlockInputValueShapeForInner<
                                        T['values'][K],
                                        Decrement<Iterations>
                                        >
                                    }
                                    : T extends {type: 'instance'; of: new() => infer Instance}
                                        ? Instance
                                        : T extends {type: 'literal'; value: infer LiteralValue extends string}
                                            ? LiteralValue
                                            :
                                            T extends BlockInput<string, infer Value>
                                                ? BlockInputValueShapeForInner<Value, Decrement<Iterations>> :
                                                never;

/** Map the user-defined BlockInput type to its TypeScript type. */
export type BlockInputValueShapeFor<T extends BlockInputValue> = BlockInputValueShapeForInner<T, 4>;

export class BlockInput<Type extends string = string, Value extends BlockInputValue = BlockInputValue> {
    type: Type;
    value: Value;
    unpluggedValue?: BlockInputValueShapeFor<Value>;

    constructor(type: Type, value: Value, opts: {unpluggedValue?: BlockInputValueShapeFor<Value>} = {}) {
        this.type = type;
        this.value = value;
        this.unpluggedValue = opts.unpluggedValue;
    }

    static validateInput<Value extends BlockInputValue>(
        valueType: Value,
        value: unknown,
    ): value is BlockInputValueShapeFor<Value> {
        if (valueType instanceof BlockInput) {
            return valueType.validate(value);
        }
        if (valueType === 'block') {
            return value instanceof Block;
        }
        if (valueType === 'string' || valueType === 'number' || valueType === 'boolean' || valueType === 'null') {
            return typeof value === valueType;
        }
        if (valueType.type === 'union') {
            return valueType.values.some(unionItem => BlockInput.validateInput(unionItem, value));
        }
        if (valueType.type === 'array') {
            if (!Array.isArray(value)) {
                return false;
            }
            return value.every(item => BlockInput.validateInput(valueType.items, item));
        }
        if (valueType.type === 'instance') {
            return value instanceof valueType.of;
        }
        if (valueType.type === 'literal') {
            return value === valueType.value;
        }
        if (valueType.type === 'object') {
            if (typeof value !== 'object' || value === null) {
                return false;
            }
            return Object.keys(valueType.values).every(key => {
                return (
                    Object.prototype.hasOwnProperty.call(value, key) &&
                    BlockInput.validateInput(valueType.values[key], value[key as keyof typeof value])
                );
            });
        }
        throw new Error(`Unhandled input type: ${valueType}`);
    }

    validate(value: unknown): value is BlockInputValueShapeFor<Value> {
        return BlockInput.validateInput(this.value, value);
    }
}

export type BlockInputShape<T extends BlockInput> = T extends BlockInput<string, infer Value>
    ? BlockInputValueShapeFor<Value>
    : never;

export const NumberInput = new BlockInput('number', unionInput('number', 'string', 'boolean', 'block'));
export const StringInput = new BlockInput('string', unionInput('number', 'string', 'boolean', 'block'));
export const BooleanInput = new BlockInput(
    'boolean',
    unionInput('number', 'string', 'boolean', 'block'),
    {unpluggedValue: false},
);
// Used for custom block inputs. We could narrow these to number/string or boolean inputs but that would require parsing
// the proccode.
export const AnyInput = new BlockInput(
    'any',
    unionInput('number', 'string', 'boolean', 'block'),
    {unpluggedValue: false},
);
export const ColorInput = new BlockInput(
    'color',
    unionInput('number', 'string', 'boolean', 'block', objectInput({r: 'number', g: 'number', b: 'number'})),
);
export const SingleBlockInput = new BlockInput('block', 'block');
export const StackInput = new BlockInput('stack', arrayInput('block'), {unpluggedValue: []});
export const StringField = new BlockInput('string', 'string');
export const VariableField = new BlockInput('variable', objectInput({value: 'string', id: 'string'}));

export type BlockReturnType = ('string' | 'number' | 'boolean')[];

export type HatInfo = ({
    type: 'event';
    event: TypedEventConstructor;
} | {
    type: 'edgeActivated' | 'noop';
}) & {
    restartExistingThreads: boolean;
};

export type BlockGenerator = Generator<
//Promise<string | number | boolean | void> | typeof GET_CUSTOM_BLOCK_ARG | void,
unknown,
string | number | boolean | void,
string | number | boolean | void
>;

// TODO: concrete ProtoBlock instances are not currently a subtype of ProtoBlock due to variance.
export class ProtoBlock<
    MyOpCode extends string = string,
    MyInputs extends {[key: string]: BlockInput} = {[key: string]: BlockInput},
    MyReturnType extends BlockReturnType | null = BlockReturnType | null,
    MyHatInfo extends HatInfo | undefined = undefined,
> {
    /** Opcode used to uniquely identify the block. */
    public opcode;
    /** Arguments (and their types). */
    public inputs;
    /** The bit that actually runs the block. */
    public execute;
    /** All the types this block can return (or null if it's a stack block). */
    public returnType;
    /**
     * True if this is a reporter block that has no side effects (or control flow effects like yielding or waiting!) and
     * always produces the same output for a given input. This allows it to be constant-folded.
     */
    public pure;
    /**
     * Metadata about hat-block-related functionality, if this block is a hat block.
     */
    public hat: MyHatInfo | undefined;
    /**
     * Function to generate the label for a monitor of this block.
     */
    public monitorLabel;
    /**
     * Function to handle slider changes for a monitor of this block.
     */
    public monitorSliderHandler;
    /**
     * The category this block is in, which determines its monitor's color.
     */
    public colorCategory;

    constructor({opcode, inputs, execute, returnType, pure, hat, monitorLabel, monitorSliderHandler, colorCategory}: {
        opcode: MyOpCode;
        inputs: MyInputs;
        execute: MyHatInfo extends {type: 'event'; event: new (...args: any[]) => infer Evt}
            ? (
                inputValues: {[key in keyof MyInputs]: BlockInputShape<MyInputs[key]>},
                ctx: BlockContext,
                event: Evt
            ) => Generator<unknown, boolean, boolean>
            : (
                inputValues: {[key in keyof MyInputs]: BlockInputShape<MyInputs[key]>},
                ctx: BlockContext
            ) => BlockGenerator;
        returnType?: MyReturnType;
        pure?: boolean;
        hat?: MyHatInfo;
        monitorLabel?: (
            inputValues: {[key in keyof MyInputs]: BlockInputShape<MyInputs[key]>}
        ) => string;
        monitorSliderHandler?: (
            inputValues: {[key in keyof MyInputs]: BlockInputShape<MyInputs[key]>},
            target: Target,
            value: number,
        ) => void;
        colorCategory?: ColorCategory;
    }) {
        this.opcode = opcode;
        this.inputs = inputs;
        this.execute = execute;
        this.returnType = returnType ?? null;
        this.pure = !!pure;
        this.hat = hat;
        this.monitorLabel = monitorLabel;
        this.monitorSliderHandler = monitorSliderHandler;
        this.colorCategory = colorCategory;
    }

    public isHat(): this is ProtoBlock<MyOpCode, MyInputs, MyReturnType, HatInfo> {
        return !!this.hat;
    }
}

export type SomeProtoBlock = ProtoBlock<
string,
{[key: string]: BlockInput},
BlockReturnType | null,
HatInfo | undefined
>;

export class Block<P = unknown> {
    public proto: ProtoBlock;
    public id: string | symbol;

    public inputValues;

    constructor({proto, id, inputValues}: {
        proto: P;
        id: string | symbol;
        inputValues: P extends ProtoBlock<string, infer MyInputs>
            ? {[key in keyof MyInputs]: BlockInputShape<MyInputs[key]>}
            : never;
    }) {
        this.proto = proto as ProtoBlock;
        this.id = id;
        this.inputValues = inputValues;
    }
}
