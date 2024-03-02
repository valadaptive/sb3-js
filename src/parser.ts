import {Loader} from './loader.js';
import Project from './project.js';
import * as allBlocks from './blocks.js';
import Target from './target.js';
import Sprite from './sprite.js';
import {Schema, ObjectForSchema, validateJson, validateJsonOrError} from './schema.js';
import {Block, BlockInputValue, BlockInputValueShapeFor, ProtoBlock} from './block.js';
import Runtime from './runtime.js';

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
        // for broadcast primitives, they save the name of the broadcast and the ID
        items: [
            {type: 'literal', value: CompressedPrimitiveType.BROADCAST_PRIMITIVE},
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
        items: [{type: 'literal', value: ShadowInfo.INPUT_SAME_BLOCK_SHADOW}, ['string', sb3InputPrimitiveSchema]],
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
            ['string', sb3InputPrimitiveSchema],
            ['string', sb3InputPrimitiveSchema],
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
        // TODO: mutation for custom blocks. future note: mutation also exists on "stop []" to control the block shape,
        // and does *not* have the properties you would expect from a custom block mutation!
    },
} as const satisfies Schema;
type Sb3Block = ObjectForSchema<typeof sb3BlockSchema>;

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
        blocks: {type: 'map', items: sb3BlockSchema},
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

const sb3ProjectSchema = {
    type: 'object',
    props: {
        targets: {
            type: 'array',
            items: sb3TargetSchema,
        },
    },
} as const satisfies Schema;

const getBlockByOpcode = (opcode: string) => {
    const block = allBlocks[opcode as keyof typeof allBlocks];
    if (!block) {
        // TODO: replace with no-op block
        throw new Error(`Unknown block: ${opcode}`);
    }
    return block;
};

const parseBlockInput = (
    inputName: string,
    jsonInput: string | null | Sb3InputPrimitive,
    jsonTarget: Sb3Target,
    protoBlock: ProtoBlock,
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
            parsedInput = parseScript(jsonTarget.blocks[jsonInput], jsonInput, jsonTarget);
        } else {
            parsedInput = parseBlock(jsonTarget.blocks[jsonInput], jsonInput, jsonTarget);
        }
    } else {
        // compressed primitive
        const [, value] = jsonInput;

        // TODO: does any further validation need to be done here?
        return value;
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

const parseBlock = (jsonBlock: Sb3Block, blockId: string, jsonTarget: Sb3Target): Block => {
    const protoBlock = getBlockByOpcode(jsonBlock.opcode) as unknown as ProtoBlock;

    const inputValues: Record<string, BlockInputValueShapeFor<BlockInputValue>> = {};

    for (const inputName in jsonBlock.inputs) {
        if (!Object.prototype.hasOwnProperty.call(jsonBlock.inputs, inputName)) {
            continue;
        }

        const input = jsonBlock.inputs[inputName];
        if (input[0] > ShadowInfo.INPUT_DIFF_BLOCK_SHADOW) {
            throw new Error(`Unknown shadow info: ${input[0]}`);
        }

        inputValues[inputName] = parseBlockInput(inputName, input[1], jsonTarget, protoBlock);
    }

    for (const fieldName in jsonBlock.fields) {
        if (!Object.prototype.hasOwnProperty.call(jsonBlock.fields, fieldName)) {
            continue;
        }

        inputValues[fieldName] = parseBlockField(fieldName, jsonBlock.fields[fieldName], protoBlock);
    }

    const block = new Block({
        proto: protoBlock,
        id: blockId,
        inputValues,
    });
    return block;
};

const parseScript = (jsonBlock: Sb3Block, blockId: string, jsonTarget: Sb3Target): Block[] | null => {
    const blocks: Block[] = [];
    let currentBlock: Sb3Block | null = jsonBlock;

    while (true) {
        blocks.push(parseBlock(currentBlock, blockId, jsonTarget));
        if (currentBlock.next === null) {
            break;
        }
        if (!Object.prototype.hasOwnProperty.call(jsonTarget.blocks, currentBlock.next)) {
            throw new Error(`Block ${currentBlock.opcode} has next block ${currentBlock.next} which does not exist`);
        }
        currentBlock = jsonTarget.blocks[currentBlock.next];
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
): Promise<{sprite: Sprite; target: Target}> => {
    const scripts: Block[][] = [];
    for (const blockId in jsonTarget.blocks) {
        if (!Object.prototype.hasOwnProperty.call(jsonTarget.blocks, blockId)) {
            continue;
        }

        const block = jsonTarget.blocks[blockId];
        if (block.topLevel) {
            const parsedBlock = parseScript(block, blockId, jsonTarget);
            if (parsedBlock) {
                scripts.push(parsedBlock);
            }
        }
    }

    const variables = new Map<string, string | number | boolean>();
    for (const [id, value] of Object.entries(jsonTarget.variables)) {
        variables.set(id, value[1]);
    }

    const lists = new Map<string, (string | number | boolean)[]>();
    for (const [id, value] of Object.entries(jsonTarget.lists)) {
        lists.set(id, value[1]);
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
        sprite,
        x: 'x' in jsonTarget ? jsonTarget.x : 0,
        y: 'y' in jsonTarget ? jsonTarget.y : 0,
        direction: 'direction' in jsonTarget ? jsonTarget.direction : 90,
        size: 'size' in jsonTarget ? jsonTarget.size : 100,
        visible: 'visible' in jsonTarget ? jsonTarget.visible : true,
        rotationStyle: 'rotationStyle' in jsonTarget ? jsonTarget.rotationStyle : 'all around',
        draggable: 'draggable' in jsonTarget ? jsonTarget.draggable : false,
        currentCostume: jsonTarget.currentCostume,
        volume: jsonTarget.volume,
        layerOrder: jsonTarget.layerOrder,
        tempo: jsonTarget.tempo ?? 60,
        videoTransparency: jsonTarget.videoTransparency ?? 50,
        videoState: jsonTarget.videoState ?? 'off',
        variables,
        lists,
    });

    return {sprite, target};
};

const parseProject = async(projectJsonString: string, loader: Loader, runtime: Runtime): Promise<Project> => {
    const projectJson = JSON.parse(projectJsonString) as unknown;
    if (!validateJson(sb3ProjectSchema, projectJson)) {
        validateJsonOrError(sb3ProjectSchema, projectJson);
        throw new Error('Invalid project JSON');
    }
    const jsonTargets = projectJson.targets;

    const targets: Target[] = [];
    const sprites: Sprite[] = [];

    const parsedTargetPromises: Promise<{sprite: Sprite; target: Target}>[] = [];

    for (const jsonTarget of jsonTargets) {
        parsedTargetPromises.push(parseTarget(jsonTarget, loader, runtime));
    }

    const parsedTargets = await Promise.all(parsedTargetPromises);

    for (const parsedTarget of parsedTargets) {
        const {sprite, target} = parsedTarget;
        targets.push(target);
        sprites.push(sprite);
    }

    return new Project(sprites, targets);
};

export default parseProject;
