import {Loader} from './loader.js';
import Project from './project.js';
import * as allBlocks from './blocks.js';
import Target from './target.js';
import Sprite from './sprite.js';
import {Schema, ObjectForSchema, validateJson, validateJsonOrError} from './schema.js';
import {Block, BlockInputValue, BlockInputValueShapeFor, ProtoBlock} from './block.js';
import Runtime from './runtime.js';
import {CustomBlockStub, makeCustomBlockStub} from './custom-blocks.js';
import {MonitorMode} from './monitor.js';

const enum ShadowInfo {
    /**
     * Unobscured shadow block (no block dropped into the input). This can be null if there is no shadow block (e.g. an
     * empty boolean input).
     */
    INPUT_SAME_BLOCK_SHADOW = 1,
    /** No shadow block, and there *is* a block dropped into the input. Seen in boolean inputs. */
    INPUT_BLOCK_NO_SHADOW = 2,
    /** A shadow block is present but obscured by a block dropped into the input. */
    INPUT_DIFF_BLOCK_SHADOW = 3,
}

const enum CompressedPrimitiveType {
    /** math_number */
    MATH_NUM_PRIMITIVE = 4,
    /** math_positive_number */
    POSITIVE_NUM_PRIMITIVE = 5,
    /** math_whole_number */
    WHOLE_NUM_PRIMITIVE = 6,
    /** math_integer */
    INTEGER_NUM_PRIMITIVE = 7,
    /** math_angle */
    ANGLE_NUM_PRIMITIVE = 8,
    /** colour_picker */
    COLOR_PICKER_PRIMITIVE = 9,
    /** text */
    TEXT_PRIMITIVE = 10,
    /** event_broadcast_menu */
    BROADCAST_PRIMITIVE = 11,
    /** data_variable */
    VAR_PRIMITIVE = 12,
    /** data_listcontents */
    LIST_PRIMITIVE = 13,
}

const sb3ScalarSchema = [
    'string',
    'number',
    'boolean',
] as const satisfies Schema;

const sb3CostumeSchema = {
    type: 'object',
    props: {
        name: 'string',
        bitmapResolution: 'number',
        dataFormat: [
            {type: 'literal', value: 'png'},
            {type: 'literal', value: 'svg'},
            {type: 'literal', value: 'jpg'},
        ],
        assetId: 'string',
        md5ext: 'string',
        rotationCenterX: 'number',
        rotationCenterY: 'number',
    },
    optional: ['bitmapResolution'],
} as const satisfies Schema;

const sb3SoundSchema = {
    type: 'object',
    props: {
        name: 'string',
        dataFormat: [
            {type: 'literal', value: 'wav'},
            {type: 'literal', value: 'mp3'},
        ],
        assetId: 'string',
        md5ext: 'string',
    },
} as const satisfies Schema;

const sb3VariableSchema = [
    {
        type: 'tuple',
        items: ['string', sb3ScalarSchema],
    },
    {
        type: 'tuple',
        items: ['string', sb3ScalarSchema, 'boolean'],
    },
] as const satisfies Schema;

const sb3ListSchema = {
    type: 'tuple',
    items: [
        'string',
        {
            type: 'array',
            items: sb3ScalarSchema,
        },
    ],
} as const satisfies Schema;

const sb3InputPrimitiveSchema = [
    {
        type: 'tuple',
        items: [
            [
                {type: 'literal', value: CompressedPrimitiveType.MATH_NUM_PRIMITIVE},
                {type: 'literal', value: CompressedPrimitiveType.POSITIVE_NUM_PRIMITIVE},
                {type: 'literal', value: CompressedPrimitiveType.WHOLE_NUM_PRIMITIVE},
                {type: 'literal', value: CompressedPrimitiveType.INTEGER_NUM_PRIMITIVE},
                {type: 'literal', value: CompressedPrimitiveType.ANGLE_NUM_PRIMITIVE},
                {type: 'literal', value: CompressedPrimitiveType.COLOR_PICKER_PRIMITIVE},
                {type: 'literal', value: CompressedPrimitiveType.TEXT_PRIMITIVE},
            ],
            sb3ScalarSchema,
        ],
    },
    {
        type: 'tuple',
        // name/ID pairs
        items: [
            [
                {type: 'literal', value: CompressedPrimitiveType.BROADCAST_PRIMITIVE},
                {type: 'literal', value: CompressedPrimitiveType.VAR_PRIMITIVE},
                {type: 'literal', value: CompressedPrimitiveType.LIST_PRIMITIVE},
            ],
            'string',
            'string',
        ],
    },
    {
        type: 'tuple',
        items: [
            [
                {type: 'literal', value: CompressedPrimitiveType.VAR_PRIMITIVE},
                {type: 'literal', value: CompressedPrimitiveType.LIST_PRIMITIVE},
            ],
            'string',
            'string',
            // top-level variable/list primitive; Scratch saves the x and y position of the block
            'number',
            'number',
        ],
    },
] as const satisfies Schema;
type Sb3InputPrimitive = ObjectForSchema<typeof sb3InputPrimitiveSchema>;

const sb3BlockInputSchema = [
    {
        type: 'tuple',
        items: [
            {type: 'literal', value: ShadowInfo.INPUT_SAME_BLOCK_SHADOW}, ['string', [sb3InputPrimitiveSchema, 'null']],
        ],
    },
    {
        type: 'tuple',
        items: [
            {type: 'literal', value: ShadowInfo.INPUT_BLOCK_NO_SHADOW},
            // unlike INPUT_SAME_BLOCK_SHADOW, this can be null
            ['string', 'null', sb3InputPrimitiveSchema],
        ],
    },
    {
        type: 'tuple',
        items: [
            {type: 'literal', value: ShadowInfo.INPUT_DIFF_BLOCK_SHADOW},
            // the block comes first, but note that the block can itself be a compressed primitive if it's a
            // data_variable or data_listcontents!
            ['string', [sb3InputPrimitiveSchema, 'null']],
            ['string', [sb3InputPrimitiveSchema, 'null']],
        ],
    },
] as const satisfies Schema;

const sb3BlockFieldSchema = [
    {
        type: 'tuple',
        // just the field value
        items: [['string', 'number', 'boolean', 'null']],
    },
    {
        type: 'tuple',
        // field value and field ID (can be null)
        items: [['string', 'number', 'boolean', 'null'], ['string', 'null']],
    },
] as const satisfies Schema;
type Sb3BlockField = ObjectForSchema<typeof sb3BlockFieldSchema>;

// There might also be a bunch of other properties that are dynamically set
const sb3MutationSchema = [
    {
        type: 'object',
        props: {
            tagName: 'string',
        },
    },
] as const satisfies Schema;

const sb3BlockSchema = {
    type: 'object',
    props: {
        opcode: 'string',
        next: ['string', 'null'],
        parent: ['string', 'null'],
        inputs: {type: 'map', items: sb3BlockInputSchema},
        fields: {type: 'map', items: sb3BlockFieldSchema},
        shadow: 'boolean',
        topLevel: 'boolean',
        mutation: sb3MutationSchema,
    },
    optional: ['mutation', 'parent', 'next'],
} as const satisfies Schema;
type Sb3Block = ObjectForSchema<typeof sb3BlockSchema>;

const sb3BlockOrPrimitiveSchema = [sb3BlockSchema, sb3InputPrimitiveSchema] as const satisfies Schema;

const sb3TargetSchema = {
    type: 'object',
    props: {
        isStage: 'boolean',
        name: 'string',
        volume: 'number',
        layerOrder: 'number',
        tempo: 'number',
        videoTransparency: 'number',
        videoState: 'string',
        costumes: {type: 'array', items: sb3CostumeSchema},
        sounds: {type: 'array', items: sb3SoundSchema},
        currentCostume: 'number',
        variables: {type: 'map', items: sb3VariableSchema},
        lists: {type: 'map', items: sb3ListSchema},
        blocks: {type: 'map', items: sb3BlockOrPrimitiveSchema},
    },
    optional: ['tempo', 'videoTransparency', 'videoState'],
} as const satisfies Schema;
type Sb3Target = ObjectForSchema<typeof sb3TargetSchema>;

const sb3SpriteTargetSchema = {
    type: 'object',
    props: Object.assign({}, sb3TargetSchema.props, {
        x: 'number',
        y: 'number',
        size: 'number',
        direction: 'number',
        visible: 'boolean',
        draggable: 'boolean',
        rotationStyle: [
            {type: 'literal', value: 'all around'},
            {type: 'literal', value: 'left-right'},
            {type: 'literal', value: 'don\'t rotate'},
        ],
    } as const),
} as const satisfies Schema;
type Sb3SpriteTarget = ObjectForSchema<typeof sb3SpriteTargetSchema>;

const sb3ScalarMonitorSchema = {
    type: 'object',
    props: {
        id: 'string',
        mode: [
            {type: 'literal', value: 'default'},
            {type: 'literal', value: 'slider'},
            {type: 'literal', value: 'large'},
        ],
        opcode: 'string',
        params: {type: 'map', items: 'string'},
        spriteName: ['string', 'null'],
        visible: 'boolean',
        x: 'number',
        y: 'number',
        sliderMin: 'number',
        sliderMax: 'number',
        isDiscrete: 'boolean',
    },
    optional: ['x', 'y'],
} as const satisfies Schema;

const sb3ListMonitorSchema = {
    type: 'object',
    props: {
        id: 'string',
        mode: {type: 'literal', value: 'list'},
        opcode: 'string',
        params: {type: 'map', items: 'string'},
        spriteName: ['string', 'null'],
        visible: 'boolean',
        x: 'number',
        y: 'number',
        width: 'number',
        height: 'number',
    },
    optional: ['x', 'y'],
} as const satisfies Schema;

const sb3MonitorSchema = [sb3ScalarMonitorSchema, sb3ListMonitorSchema] as const satisfies Schema;
type Sb3Monitor = ObjectForSchema<typeof sb3MonitorSchema>;

const sb3ProjectSchema = {
    type: 'object',
    props: {
        targets: {
            type: 'array',
            items: sb3TargetSchema,
        },
        monitors: {
            type: 'array',
            items: sb3MonitorSchema,
        },
    },
    optional: ['monitors'],
} as const satisfies Schema;

const getBlockByOpcode = (opcode: string) => {
    const block = allBlocks[opcode as keyof typeof allBlocks];
    if (!block) {
        // TODO: replace with no-op block
        throw new Error(`Unknown block: ${opcode}`);
    }
    return block;
};

const isCompressedPrimitive = (input: Sb3Block | Sb3InputPrimitive): input is Sb3InputPrimitive => Array.isArray(input);

const parseCompressedPrimitive = (primitive: Sb3InputPrimitive) => {
    const [primType, value, id] = primitive;

    switch (primType) {
        case CompressedPrimitiveType.MATH_NUM_PRIMITIVE:
        case CompressedPrimitiveType.POSITIVE_NUM_PRIMITIVE:
        case CompressedPrimitiveType.WHOLE_NUM_PRIMITIVE:
        case CompressedPrimitiveType.INTEGER_NUM_PRIMITIVE:
        case CompressedPrimitiveType.ANGLE_NUM_PRIMITIVE:
        case CompressedPrimitiveType.COLOR_PICKER_PRIMITIVE:
        case CompressedPrimitiveType.TEXT_PRIMITIVE:
            return value;

        case CompressedPrimitiveType.VAR_PRIMITIVE: {
            return new Block({
                proto: allBlocks.data_variable,
                id,
                inputValues: {VARIABLE: {value, id}},
            });
        }
        case CompressedPrimitiveType.LIST_PRIMITIVE: {
            return new Block({
                proto: allBlocks.data_listcontents,
                id,
                inputValues: {LIST: {value, id}},
            });
        }
        case CompressedPrimitiveType.BROADCAST_PRIMITIVE:
            return new Block({
                proto: allBlocks.event_broadcast_menu,
                id,
                inputValues: {BROADCAST_OPTION: {value, id}},
            });
    }
};

const parseBlockInput = (
    inputName: string,
    jsonInput: string | null | Sb3InputPrimitive,
    jsonTarget: Sb3Target,
    protoBlock: ProtoBlock,
    customBlocks: CustomBlocks,
): BlockInputValueShapeFor<BlockInputValue> => {
    const protoInput = protoBlock.inputs[inputName];
    if (!protoInput) {
        throw new Error(`Block input ${inputName} does not exist on ${protoBlock.opcode}`);
    }

    if (jsonInput === null) {
        if (typeof protoInput.unpluggedValue === 'undefined') {
            throw new Error(`Block input ${inputName} is missing`);
        }
        return protoInput.unpluggedValue;
    }

    let parsedInput;

    // block ID
    if (typeof jsonInput === 'string') {
        if (!Object.prototype.hasOwnProperty.call(jsonTarget.blocks, jsonInput)) {
            throw new Error(`Block input ${inputName} points to block ${jsonInput} which does not exist`);
        }
        if (protoInput.type === 'stack') {
            const jsonBlock = jsonTarget.blocks[jsonInput];
            if (!jsonBlock) {
                throw new Error(`Block with ID ${jsonInput} does not exist`);
            }
            if (isCompressedPrimitive(jsonBlock)) {
                throw new Error(`Block stack input ${inputName} points to block ${jsonInput} which is a compressed primitive`);
            }
            parsedInput = parseScript(jsonBlock, jsonInput, jsonTarget, customBlocks);
        } else if (protoInput.type === 'custom_block') {
            // Only procedures_definition uses this input type
            const jsonBlockProto = jsonTarget.blocks[jsonInput];
            if (!jsonBlockProto) {
                throw new Error(`Custom block prototype ${jsonInput} does not exist`);
            }
            if (isCompressedPrimitive(jsonBlockProto)) {
                throw new Error(`Block stack input ${inputName} points to block ${jsonInput} which is a compressed primitive`);
            }
            parsedInput = parseCustomBlockPrototype(jsonBlockProto, jsonInput);
        } else {
            const jsonBlock = jsonTarget.blocks[jsonInput];
            if (isCompressedPrimitive(jsonBlock)) {
                parsedInput = parseCompressedPrimitive(jsonBlock);
            } else {
                parsedInput = parseBlock(jsonBlock, jsonInput, jsonTarget, customBlocks);
            }
        }
    } else {
        // compressed primitive
        parsedInput = parseCompressedPrimitive(jsonInput);
    }

    if (!protoInput.validate(parsedInput)) {
        throw new Error(`Block input ${inputName} has invalid value ${JSON.stringify(parsedInput)}`);
    }

    return parsedInput;
};

const parseBlockField = (fieldName: string, jsonField: Sb3BlockField, protoBlock: ProtoBlock) => {
    let fieldValue;
    if (jsonField[1] === null || jsonField.length === 1) {
        fieldValue = jsonField[0];
    } else {
        fieldValue = {value: jsonField[0], id: jsonField[1]};
    }
    const protoInput = protoBlock.inputs[fieldName];
    if (!protoInput) {
        throw new Error(`Block field ${fieldName} does not exist on ${protoBlock.opcode}`);
    }
    if (!protoInput.validate(fieldValue)) {
        throw new Error(`Block field ${fieldName} has invalid value ${JSON.stringify(fieldValue)}`);
    }
    return fieldValue;
};

const parseBlock = (
    jsonBlock: Sb3Block,
    blockId: string,
    jsonTarget: Sb3Target,
    customBlocks: CustomBlocks,
): Block => {
    let protoBlock;
    // procedures_call blocks are replaced with Block instances whose proto is the custom block's definition
    if (jsonBlock.opcode === 'procedures_call') {
        if (!jsonBlock.mutation) {
            throw new Error('Custom block is missing mutation');
        }
        if (!('proccode' in jsonBlock.mutation) || typeof jsonBlock.mutation.proccode !== 'string') {
            throw new Error('Custom block mutation is missing proccode');
        }
        const customBlockDefinition = customBlocks.get(jsonBlock.mutation.proccode);
        if (!customBlockDefinition) {
            throw new Error(`Custom block "${jsonBlock.mutation.proccode}" does not exist`);
        }
        protoBlock = customBlockDefinition.proto;
    } else {
        protoBlock = getBlockByOpcode(jsonBlock.opcode) as unknown as ProtoBlock;
    }

    const inputValues: Record<string, BlockInputValueShapeFor<BlockInputValue>> = {};

    for (const inputName in protoBlock.inputs) {
        if (!Object.prototype.hasOwnProperty.call(protoBlock.inputs, inputName)) {
            continue;
        }

        if (Object.prototype.hasOwnProperty.call(jsonBlock.inputs, inputName)) {
            const input = jsonBlock.inputs[inputName];
            if (input[0] > ShadowInfo.INPUT_DIFF_BLOCK_SHADOW) {
                throw new Error(`Unknown shadow info: ${input[0]}`);
            }

            inputValues[inputName] = parseBlockInput(inputName, input[1], jsonTarget, protoBlock, customBlocks);
        } else if (Object.prototype.hasOwnProperty.call(jsonBlock.fields, inputName)) {
            inputValues[inputName] = parseBlockField(inputName, jsonBlock.fields[inputName], protoBlock);
        } else if (typeof protoBlock.inputs[inputName].unpluggedValue !== 'undefined') {
            // Note that we specifically check if the type !== undefined, not the truthiness value of it, because the
            // most important "unplugged value" we care about is `false`, for unplugged Boolean inputs.
            inputValues[inputName] = protoBlock.inputs[inputName].unpluggedValue!;
        } else {
            throw new Error(`Block input ${inputName} is missing`);
        }
    }

    const block = new Block({
        proto: protoBlock,
        id: blockId,
        inputValues,
    });
    return block;
};

// There might also be a bunch of other properties that are dynamically set
const sb3CustomBlockMutationSchema = [
    {
        type: 'object',
        props: {
            proccode: 'string',
            argumentids: 'string',
            argumentnames: 'string',
            argumentdefaults: 'string',
            warp: ['string', 'boolean'],
        },
    },
] as const satisfies Schema;

const arrayStringSchema = {type: 'array', items: 'string'} as const satisfies Schema;
const arrayScalarSchema = {type: 'array', items: ['string', 'number', 'boolean']} as const satisfies Schema;

type CustomBlocks = Map<string, CustomBlockStub & {jsonBlock: Sb3Block; blockId: string}>;

const EMPTY_MAP = new Map<never, never>();

// Parse a procedures_prototype into a ProtoBlock stub.
const parseCustomBlockPrototype = (
    jsonBlock: Sb3Block,
    blockId: string,
): CustomBlockStub => {
    const mutation = jsonBlock.mutation;
    if (!mutation) {
        throw new Error(`Custom block ${blockId} is missing mutation`);
    }
    if (!validateJson(sb3CustomBlockMutationSchema, mutation)) {
        validateJsonOrError(sb3CustomBlockMutationSchema, mutation);
        throw new Error(`Invalid mutation: ${JSON.stringify(mutation)}`);
    }

    const argumentids = JSON.parse(mutation.argumentids);
    const argumentnames = JSON.parse(mutation.argumentnames);
    const argumentdefaults = JSON.parse(mutation.argumentdefaults);

    if (!validateJson(arrayStringSchema, argumentids)) {
        throw new Error(`Invalid argumentids: ${JSON.stringify(mutation.argumentids)}`);
    }
    if (!validateJson(arrayStringSchema, argumentnames)) {
        throw new Error(`Invalid argumentnames: ${JSON.stringify(mutation.argumentnames)}`);
    }
    if (!validateJson(arrayScalarSchema, argumentdefaults)) {
        throw new Error(`Invalid argumentdefaults: ${JSON.stringify(mutation.argumentdefaults)}`);
    }

    return Object.assign(makeCustomBlockStub(
        mutation.proccode,
        argumentids,
        argumentnames,
        argumentdefaults,
        mutation.warp === 'true' || mutation.warp === true,
    ), {jsonBlock, blockId});
};

const parseCustomBlockDefinition = (
    jsonBlock: Sb3Block,
    blockId: string,
    jsonTarget: Sb3Target,
): CustomBlockStub & {jsonBlock: Sb3Block; blockId: string} => {
    if (!('custom_block' in jsonBlock.inputs)) {
        throw new Error(`Custom block ${blockId} is missing custom_block input`);
    }
    // parseBlockInput will parse the custom_block input and call parseCustomBlockPrototype above.
    const customBlockDefinition = parseBlockInput(
        'custom_block',
        jsonBlock.inputs.custom_block[1],
        jsonTarget,
        allBlocks.procedures_definition as unknown as ProtoBlock,
        EMPTY_MAP,
    );
    return Object.assign(customBlockDefinition as unknown as CustomBlockStub, {jsonBlock, blockId});
};

const parseScript = (
    jsonBlock: Sb3Block,
    blockId: string,
    jsonTarget: Sb3Target,
    customBlocks: CustomBlocks,
): Block[] => {
    const blocks: Block[] = [];
    let currentBlock: Sb3Block | Sb3InputPrimitive | null = jsonBlock;
    let currentBlockId: string | null | undefined = blockId;

    while (true) {
        blocks.push(parseBlock(currentBlock, currentBlockId!, jsonTarget, customBlocks));
        if (typeof currentBlock.next !== 'string') {
            break;
        }
        if (!Object.prototype.hasOwnProperty.call(jsonTarget.blocks, currentBlock.next)) {
            throw new Error(`Block ${currentBlock.opcode} has next block ${currentBlock.next} which does not exist`);
        }
        currentBlock = jsonTarget.blocks[currentBlock.next];
        if (isCompressedPrimitive(currentBlock)) {
            throw new Error(`Unexpected compressed primitive with ID ${currentBlockId} in script`);
        }
        currentBlockId = currentBlock.next;
    }

    return blocks;
};

const contentTypeForDataFormat = {
    png: 'image/png',
    svg: 'image/svg+xml',
    jpg: 'image/jpeg',
    wav: 'audio/wav',
    mp3: 'audio/mpeg',
} as const;

const parseTarget = async(
    jsonTarget: Sb3Target | Sb3SpriteTarget,
    loader: Loader,
    runtime: Runtime,
    project: Project,
): Promise<{sprite: Sprite; target: Target; layerOrder: number}> => {
    const scripts: Block[][] = [];
    const topLevelBlocks: {block: Sb3Block; id: string}[] = [];
    for (const blockId in jsonTarget.blocks) {
        if (!Object.prototype.hasOwnProperty.call(jsonTarget.blocks, blockId)) {
            continue;
        }
        const block = jsonTarget.blocks[blockId];
        if (!isCompressedPrimitive(block) && block.topLevel) {
            topLevelBlocks.push({block, id: blockId});
        }
    }

    // First pass: parse all the custom block definitions so that we can replace all procedures_call blocks with the
    // coresponding custom block ProtoBlocks. Keep in mind that custom blocks can call other custom blocks, so we can't
    // just parse all custom blocks first then parse other scripts.
    const customBlocks: CustomBlocks = new Map();
    for (const {block, id} of topLevelBlocks) {
        if (block.opcode === 'procedures_definition') {
            const customBlock = parseCustomBlockDefinition(block, id, jsonTarget);
            customBlocks.set(customBlock.proto.opcode, customBlock);
        }
    }

    // Second pass: parse all the top-level scripts now that we have all the custom block definitions
    for (const {block, id} of topLevelBlocks) {
        if (block.opcode !== 'procedures_definition') {
            const parsedScript = parseScript(block, id, jsonTarget, customBlocks);
            scripts.push(parsedScript);
        }
    }

    // Third pass: parse the scripts contained within the custom block definitions
    for (const {init, jsonBlock, blockId} of customBlocks.values()) {
        const childScript = parseScript(jsonBlock, blockId, jsonTarget, customBlocks);
        init(childScript);
    }

    const variables = new Map<string, string | number | boolean>();
    for (const [name, value] of Object.values(jsonTarget.variables)) {
        variables.set(name, value);
    }

    const lists = new Map<string, (string | number | boolean)[]>();
    for (const [name, value] of Object.values(jsonTarget.lists)) {
        lists.set(name, value);
    }

    const costumePromises = jsonTarget.costumes.map(costume => loader.loadAsset(
        costume.md5ext,
        contentTypeForDataFormat[costume.dataFormat],
    )
        .then(asset => runtime.loadCostume(costume.name, asset, {
            rotationCenter: {x: costume.rotationCenterX, y: costume.rotationCenterY},
            bitmapResolution: costume.bitmapResolution ?? 1,
            type: costume.dataFormat === 'svg' ? 'svg' : 'bitmap',
        })));

    const soundPromises = jsonTarget.sounds.map(sound => loader.loadAsset(
        sound.md5ext,
        contentTypeForDataFormat[sound.dataFormat],
    )
        .then(asset => runtime.loadSound(sound.name, asset)));

    const [costumes, sounds] = await Promise.all([Promise.all(costumePromises), Promise.all(soundPromises)]);

    const sprite = new Sprite({
        name: jsonTarget.name,
        costumes,
        sounds,
        isStage: jsonTarget.isStage,
        scripts,
    });

    const target = new Target({
        runtime,
        project,
        sprite,
        isOriginal: true,
        x: 'x' in jsonTarget ? jsonTarget.x : 0,
        y: 'y' in jsonTarget ? jsonTarget.y : 0,
        direction: 'direction' in jsonTarget ? jsonTarget.direction : 90,
        size: 'size' in jsonTarget ? jsonTarget.size : 100,
        visible: 'visible' in jsonTarget ? jsonTarget.visible : true,
        rotationStyle: 'rotationStyle' in jsonTarget ? jsonTarget.rotationStyle : 'all around',
        draggable: 'draggable' in jsonTarget ? jsonTarget.draggable : false,
        currentCostume: jsonTarget.currentCostume,
        volume: jsonTarget.volume,
        tempo: jsonTarget.tempo ?? 60,
        videoTransparency: jsonTarget.videoTransparency ?? 50,
        videoState: jsonTarget.videoState ?? 'off',
        variables,
        lists,
    });

    return {sprite, target, layerOrder: jsonTarget.layerOrder};
};

const parseMonitor = (
    jsonMonitor: Sb3Monitor,
    runtime: Runtime,
    project: Project,
) => {
    const target = jsonMonitor.spriteName === null ? null : project.getTargetByName(jsonMonitor.spriteName);
    const monitorProtoBlock = getBlockByOpcode(jsonMonitor.opcode) as ProtoBlock;
    if (!monitorProtoBlock) {
        throw new Error(`Unknown monitor block: ${jsonMonitor.opcode}`);
    }
    const inputValues: Record<string, BlockInputValueShapeFor<BlockInputValue>> = {};
    for (const inputName in monitorProtoBlock.inputs) {
        if (!Object.prototype.hasOwnProperty.call(monitorProtoBlock.inputs, inputName)) {
            continue;
        }

        if (!Object.prototype.hasOwnProperty.call(jsonMonitor.params, inputName)) {
            throw new Error(`Monitor input ${inputName} is missing`);
        }

        const input = monitorProtoBlock.inputs[inputName as keyof typeof monitorProtoBlock.inputs];
        let param;
        if ((jsonMonitor.opcode === 'data_variable' && inputName === 'VARIABLE') ||
            (jsonMonitor.opcode === 'data_listcontents' && inputName === 'LIST')) {
            param = {value: jsonMonitor.params[inputName], id: jsonMonitor.params[inputName]};
        } else {
            param = jsonMonitor.params[inputName];
        }
        if (!input.validate(param)) {
            throw new Error(`Monitor input ${inputName} has invalid value ${param}`);
        }
        inputValues[inputName] = param;
    }
    let mode: MonitorMode;
    switch (jsonMonitor.mode) {
        case 'default':
            mode = {mode: 'default'};
            break;
        case 'slider':
            mode = {
                mode: 'slider',
                min: jsonMonitor.sliderMin,
                max: jsonMonitor.sliderMax,
                isDiscrete: jsonMonitor.isDiscrete,
            };
            break;
        case 'large':
            mode = {mode: 'large'};
            break;
        case 'list':
            mode = {mode: 'list', size: {width: jsonMonitor.width, height: jsonMonitor.height}};
            break;
    }

    project.getOrCreateMonitorFor(
        monitorProtoBlock,
        inputValues,
        target,
        {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            mode: mode as any,
            visible: jsonMonitor.visible,
            position: jsonMonitor.x !== undefined && jsonMonitor.y !== undefined ?
                {x: jsonMonitor.x, y: jsonMonitor.y} :
                null,
        },
    );
};

const parseProject = async(projectJsonString: string, loader: Loader, runtime: Runtime): Promise<Project> => {
    const projectJson = JSON.parse(projectJsonString) as unknown;
    if (!validateJson(sb3ProjectSchema, projectJson)) {
        validateJsonOrError(sb3ProjectSchema, projectJson);
        throw new Error('Invalid project JSON');
    }
    const jsonTargets = projectJson.targets;

    const project = new Project();

    const parsedTargetPromises: Promise<{sprite: Sprite; target: Target; layerOrder: number}>[] = [];

    for (const jsonTarget of jsonTargets) {
        parsedTargetPromises.push(parseTarget(jsonTarget, loader, runtime, project));
    }

    const parsedTargets = await Promise.all(parsedTargetPromises);

    parsedTargets.sort((a, b) => a.layerOrder - b.layerOrder);

    for (const parsedTarget of parsedTargets) {
        const {sprite, target} = parsedTarget;
        project.addTargetWithSprite(sprite, target);
    }

    if (!project.stage) {
        throw new Error('No stage target found in project');
    }

    if (projectJson.monitors) {
        for (const jsonMonitor of projectJson.monitors) {
            if (!validateJson(sb3MonitorSchema, jsonMonitor)) {
                validateJsonOrError(sb3MonitorSchema, jsonMonitor);
                throw new Error('Invalid monitor JSON');
            }
            parseMonitor(jsonMonitor, runtime, project);
        }
    }

    return project;
};

export default parseProject;
