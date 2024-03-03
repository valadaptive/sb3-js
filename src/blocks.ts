import {
    BlockInput,
    BooleanInput,
    VariableField,
    NumberInput,
    ProtoBlock,
    StackInput,
    StringField,
    StringInput,
} from './block.js';
import {compare, equals, isInt, isWhiteSpace, toBoolean, toListIndex, toNumber, toString} from './cast.js';
import {BroadcastEvent, GreenFlagEvent, KeyPressedEvent, SwitchBackdropEvent} from './events.js';
import IO from './io.js';
import Target from './target.js';

import BlockContext from './interpreter/block-context.js';
import Thread from './interpreter/thread.js';

/**
 * Motion
 */

export const motion_movesteps = new ProtoBlock({
    opcode: 'motion_movesteps',
    inputs: {
        STEPS: NumberInput,
    },
    execute: function* ({STEPS}, ctx) {
        const steps = toNumber(ctx.evaluateFast(STEPS));
        const radians = (90 - ctx.target.direction) * Math.PI / 180;
        const dx = steps * Math.cos(radians);
        const dy = steps * Math.sin(radians);
        const position = ctx.target.position;
        ctx.target.moveTo(position.x + dx, position.y + dy);
    },
});

export const motion_turnright = new ProtoBlock({
    opcode: 'motion_turnright',
    inputs: {
        DEGREES: NumberInput,
    },
    execute: function* ({DEGREES}, ctx) {
        const degrees = toNumber(ctx.evaluateFast(DEGREES));
        ctx.target.direction += degrees;
    },
});

export const motion_turnleft = new ProtoBlock({
    opcode: 'motion_turnleft',
    inputs: {
        DEGREES: NumberInput,
    },
    execute: function* ({DEGREES}, ctx) {
        const degrees = toNumber(ctx.evaluateFast(DEGREES));
        ctx.target.direction -= degrees;
    },
});

export const motion_goto_menu = new ProtoBlock({
    opcode: 'motion_goto_menu',
    inputs: {
        TO: StringField,
    },
    execute: function* ({TO}) {
        return TO;
    },
    pure: true,
});

const getPositionByName = (name: string, ctx: BlockContext): {x: number; y: number} | null => {
    if (name === '_mouse_') {
        const x = ctx.io.mousePosition.x;
        const y = ctx.io.mousePosition.y;
        return {x, y};
    }

    if (name === '_random_') {
        const x = (Math.random() * ctx.stageBounds.width) + ctx.stageBounds.left;
        const y = (Math.random() * ctx.stageBounds.height) + ctx.stageBounds.bottom;
        return {x, y};
    }

    const other = ctx.project.getTargetByName(name);
    if (other) return other.position;

    return null;
};

export const motion_goto = new ProtoBlock({
    opcode: 'motion_goto',
    inputs: {
        TO: StringInput,
    },
    execute: function* ({TO}, ctx) {
        const target = toString(ctx.evaluateFast(TO));
        const position = getPositionByName(target, ctx);
        if (position) {
            ctx.target.moveTo(position.x, position.y);
        }
    },
});

export const motion_gotoxy = new ProtoBlock({
    opcode: 'motion_gotoxy',
    inputs: {
        X: NumberInput,
        Y: NumberInput,
    },
    execute: function* ({X, Y}, ctx) {
        const x = toNumber(ctx.evaluateFast(X));
        const y = toNumber(ctx.evaluateFast(Y));
        ctx.target.moveTo(x, y);
    },
});

const glideTo = function* (
    startX: number,
    startY: number,
    endX: number,
    endY: number,
    duration: number,
    ctx: BlockContext,
) {
    const start = ctx.currentTime;
    let t;
    while ((t = (ctx.currentTime - start) / duration) < 1) {
        ctx.target.moveTo((startX * (1 - t)) + (endX * t), (startY * (1 - t)) + (endY * t));
        yield;
    }
    ctx.target.moveTo(endX, endY);
};

export const motion_glideto = new ProtoBlock({
    opcode: 'motion_glideto',
    inputs: {
        SECS: NumberInput,
        TO: StringInput,
    },
    execute: function* ({SECS, TO}, ctx) {
        const duration = toNumber(ctx.evaluateFast(SECS)) * 1000;
        const target = toString(ctx.evaluateFast(TO));
        const position = getPositionByName(target, ctx);
        if (position) {
            const position = ctx.target.position;
            yield* glideTo(position.x, position.y, position.x, position.y, duration, ctx);
        }
    },
});

export const motion_glideto_menu = new ProtoBlock({
    opcode: 'motion_glideto_menu',
    inputs: {
        TO: StringField,
    },
    execute: function* ({TO}) {
        return TO;
    },
    pure: true,
});

export const motion_glidesecstoxy = new ProtoBlock({
    opcode: 'motion_glidesecstoxy',
    inputs: {
        SECS: NumberInput,
        X: NumberInput,
        Y: NumberInput,
    },
    execute: function* ({SECS, X, Y}, ctx) {
        const duration = toNumber(ctx.evaluateFast(SECS)) * 1000;
        const endX = toNumber(ctx.evaluateFast(X));
        const endY = toNumber(ctx.evaluateFast(Y));

        const position = ctx.target.position;
        yield* glideTo(position.x, position.y, endX, endY, duration, ctx);
    },
});

export const motion_pointindirection = new ProtoBlock({
    opcode: 'motion_pointindirection',
    inputs: {
        DIRECTION: NumberInput,
    },
    execute: function* ({DIRECTION}, ctx) {
        ctx.target.direction = toNumber(ctx.evaluateFast(DIRECTION));
    },
});

export const motion_pointtowards_menu = new ProtoBlock({
    opcode: 'motion_pointtowards_menu',
    inputs: {
        TOWARDS: StringField,
    },
    execute: function* ({TOWARDS}) {
        return TOWARDS;
    },
    pure: true,
});

export const motion_pointtowards = new ProtoBlock({
    opcode: 'motion_pointtowards',
    inputs: {
        TOWARDS: StringInput,
    },
    execute: function* ({TOWARDS}, ctx) {
        const target = toString(ctx.evaluateFast(TOWARDS));
        if (target === '_random_') {
            ctx.target.direction = Math.round(Math.random() * 360);
            return;
        }
        const position = getPositionByName(target, ctx);
        if (position) {
            const targetPosition = ctx.target.position;
            const dx = position.x - targetPosition.x;
            const dy = position.y - targetPosition.y;
            ctx.target.direction = (-Math.atan2(dy, dx) * 180 / Math.PI) + 90;
        }
    },
});

export const motion_changexby = new ProtoBlock({
    opcode: 'motion_changexby',
    inputs: {
        DX: NumberInput,
    },
    execute: function* ({DX}, ctx) {
        const dx = toNumber(ctx.evaluateFast(DX));
        const position = ctx.target.position;
        ctx.target.moveTo(position.x + dx, position.y);
    },
});

export const motion_setx = new ProtoBlock({
    opcode: 'motion_setx',
    inputs: {
        X: NumberInput,
    },
    execute: function* ({X}, ctx) {
        const x = toNumber(ctx.evaluateFast(X));
        ctx.target.moveTo(x, ctx.target.position.y);
    },
});

export const motion_changeyby = new ProtoBlock({
    opcode: 'motion_changeyby',
    inputs: {
        DY: NumberInput,
    },
    execute: function* ({DY}, ctx) {
        const dy = toNumber(ctx.evaluateFast(DY));
        const position = ctx.target.position;
        ctx.target.moveTo(position.x, position.y + dy);
    },
});

export const motion_sety = new ProtoBlock({
    opcode: 'motion_sety',
    inputs: {
        Y: NumberInput,
    },
    execute: function* ({Y}, ctx) {
        const y = toNumber(ctx.evaluateFast(Y));
        ctx.target.moveTo(ctx.target.position.x, y);
    },
});

// TODO: motion_ifonedgebounce (requires sprite fencing)

export const motion_setrotationstyle = new ProtoBlock({
    opcode: 'motion_setrotationstyle',
    inputs: {
        STYLE: StringField,
    },
    execute: function* ({STYLE}, ctx) {
        if (STYLE === 'left-right' || STYLE === 'don\'t rotate' || STYLE === 'all around') {
            ctx.target.rotationStyle = STYLE;
        }
    },
});

export const motion_xposition = new ProtoBlock({
    opcode: 'motion_xposition',
    inputs: {},
    execute: function* (_, ctx) {
        return ctx.target.position.x;
    },
});

export const motion_yposition = new ProtoBlock({
    opcode: 'motion_yposition',
    inputs: {},
    execute: function* (_, ctx) {
        return ctx.target.position.y;
    },
});

export const motion_direction = new ProtoBlock({
    opcode: 'motion_direction',
    inputs: {},
    execute: function* (_, ctx) {
        return ctx.target.direction;
    },
});

/**
 * Looks
 */

const setCostume = function(target: Target, costume: string | number | boolean) {
    if (typeof costume === 'number') {
        target.currentCostume = costume - 1;
        return;
    }

    const costumeIndex = target.sprite.getCostumeIndexByName(toString(costume));
    if (costumeIndex !== -1) {
        target.currentCostume = costumeIndex;
    } else if (costume === 'next costume') {
        target.currentCostume++;
    } else if (costume === 'previous costume') {
        target.currentCostume--;
    } else if (!(isNaN(Number(costume)) || isWhiteSpace(costume))) {
        // TODO: Scratch uses a raw Number cast here. Are there any compat issues from using Cast.toNumber instead?
        target.currentCostume = Number(costume) - 1;
    }
};

const setBackdrop = function(backdrop: string | number | boolean, ctx: BlockContext): Thread[] | null {
    const stage = ctx.stage;
    if (typeof backdrop === 'number') {
        stage.currentCostume = backdrop - 1;
        return null;
    }

    const costumeIndex = stage.sprite.getCostumeIndexByName(toString(backdrop));
    if (costumeIndex !== -1) {
        stage.currentCostume = costumeIndex;
    } else if (backdrop === 'next backdrop') {
        stage.currentCostume++;
    } else if (backdrop === 'previous backdrop') {
        stage.currentCostume--;
    } else if (backdrop === 'random backdrop') {
        const numBackdrops = stage.sprite.costumes.length;
        if (numBackdrops <= 1) return null;
        // Always choose a different backdrop. Note that Math.floor(Math.random()) is already exclusive on the upper
        // bound, so by subtracting 1 from numBackdrops we're actually excluding the index of the last backdrop.
        let newBackdrop = Math.floor(Math.random() * (numBackdrops - 1));
        // Now we get back that last index, and guarantee we get a different backdrop from the current one.
        if (newBackdrop >= stage.currentCostume) newBackdrop++;

        stage.currentCostume = newBackdrop;
    } else if (!(isNaN(Number(backdrop)) || isWhiteSpace(backdrop))) {
        // TODO: Scratch uses a raw Number cast here. Are there any compat issues from using Cast.toNumber instead?
        stage.currentCostume = Number(backdrop) - 1;
    }

    return ctx.startHats('switchbackdrop', new SwitchBackdropEvent(stage.sprite.costumes[stage.currentCostume].name));
};

export const looks_costume = new ProtoBlock({
    opcode: 'looks_costume',
    inputs: {
        COSTUME: StringField,
    },
    execute: function* ({COSTUME}) {
        return COSTUME;
    },
    pure: true,
});

export const looks_switchcostumeto = new ProtoBlock({
    opcode: 'looks_switchcostumeto',
    inputs: {
        COSTUME: StringInput,
    },
    execute: function* ({COSTUME}, ctx) {
        const costume = ctx.evaluateFast(COSTUME);
        setCostume(ctx.target, costume);
    },
});

export const looks_nextcostume = new ProtoBlock({
    opcode: 'looks_nextcostume',
    inputs: {},
    execute: function* (_, ctx) {
        ctx.target.currentCostume++;
    },
});

export const looks_backdrops = new ProtoBlock({
    opcode: 'looks_backdrops',
    inputs: {
        BACKDROP: StringField,
    },
    execute: function* ({BACKDROP}) {
        return BACKDROP;
    },
    pure: true,
});

export const looks_switchbackdropto = new ProtoBlock({
    opcode: 'looks_switchbackdropto',
    inputs: {
        BACKDROP: StringInput,
    },
    execute: function* ({BACKDROP}, ctx) {
        // TODO: trigger "when backdrop switches to" hats
        const costume = ctx.evaluateFast(BACKDROP);
        setBackdrop(costume, ctx);
    },
});

export const looks_switchbackdroptoandwait = new ProtoBlock({
    opcode: 'looks_switchbackdroptoandwait',
    inputs: {
        BACKDROP: StringInput,
    },
    execute: function* ({BACKDROP}, ctx) {
        // TODO: trigger "when backdrop switches to" hats
        const costume = ctx.evaluateFast(BACKDROP);
        const startedThreads = setBackdrop(costume, ctx);
        if (startedThreads) {
            yield* ctx.waitOnThreads(startedThreads);
        }
    },
});

export const looks_nextbackdrop = new ProtoBlock({
    opcode: 'looks_nextbackdrop',
    inputs: {},
    execute: function* (_, ctx) {
        // TODO: trigger "when backdrop switches to" hats
        ctx.stage.currentCostume++;
    },
});

export const looks_changesizeby = new ProtoBlock({
    opcode: 'looks_changesizeby',
    inputs: {
        CHANGE: NumberInput,
    },
    execute: function* ({CHANGE}, ctx) {
        const change = toNumber(ctx.evaluateFast(CHANGE));
        ctx.target.size += change;
    },
});

export const looks_setsizeto = new ProtoBlock({
    opcode: 'looks_setsizeto',
    inputs: {
        SIZE: NumberInput,
    },
    execute: function* ({SIZE}, ctx) {
        ctx.target.size = toNumber(ctx.evaluateFast(SIZE));
    },
});

export const looks_show = new ProtoBlock({
    opcode: 'looks_show',
    inputs: {},
    execute: function* (_, ctx) {
        ctx.target.visible = true;
    },
});

export const looks_changeeffectby = new ProtoBlock({
    opcode: 'looks_changeeffectby',
    inputs: {
        EFFECT: StringField,
        CHANGE: NumberInput,
    },
    execute: function* ({EFFECT, CHANGE}, ctx) {
        const change = toNumber(ctx.evaluateFast(CHANGE));
        const effect = EFFECT.toLowerCase();
        if (
            effect === 'color' ||
            effect === 'brightness' ||
            effect === 'fisheye' ||
            effect === 'whirl' ||
            effect === 'pixelate' ||
            effect === 'mosaic' ||
            effect === 'ghost'
        ) ctx.target.effects[effect] += change;
        if (ctx.target.visible) ctx.target.runtime.requestRedraw();
    },
});

export const looks_seteffectto = new ProtoBlock({
    opcode: 'looks_seteffectto',
    inputs: {
        EFFECT: StringField,
        VALUE: NumberInput,
    },
    execute: function* ({EFFECT, VALUE}, ctx) {
        const value = toNumber(ctx.evaluateFast(VALUE));
        const effect = EFFECT.toLowerCase();
        if (
            effect === 'color' ||
            effect === 'brightness' ||
            effect === 'fisheye' ||
            effect === 'whirl' ||
            effect === 'pixelate' ||
            effect === 'mosaic' ||
            effect === 'ghost'
        ) ctx.target.effects[effect] = value;
        if (ctx.target.visible) ctx.target.runtime.requestRedraw();
    },
});

export const looks_cleargraphiceffects = new ProtoBlock({
    opcode: 'looks_cleargraphiceffects',
    inputs: {},
    execute: function* (_, ctx) {
        ctx.target.effects.clear();
        if (ctx.target.visible) ctx.target.runtime.requestRedraw();
    },
});

export const looks_hide = new ProtoBlock({
    opcode: 'looks_hide',
    inputs: {},
    execute: function* (_, ctx) {
        ctx.target.visible = false;
    },
});

export const looks_gotofrontback = new ProtoBlock({
    opcode: 'looks_gotofrontback',
    inputs: {
        FRONT_BACK: StringField,
    },
    execute: function* ({FRONT_BACK}, ctx) {
        if (FRONT_BACK === 'front') {
            ctx.project.moveTargetToFront(ctx.target);
        } else if (FRONT_BACK === 'back') {
            ctx.project.moveTargetToBack(ctx.target);
        }
    },
});

export const looks_goforwardbackwardlayers = new ProtoBlock({
    opcode: 'looks_goforwardbackwardlayers',
    inputs: {
        NUM: NumberInput,
        FORWARD_BACKWARD: StringField,
    },
    execute: function* ({NUM, FORWARD_BACKWARD}, ctx) {
        let num = toNumber(ctx.evaluateFast(NUM));
        if (FORWARD_BACKWARD === 'backward') num = -num;
        ctx.project.moveTargetForwardBackwardLayers(ctx.target, num);
    },
});

export const looks_costumenumbername = new ProtoBlock({
    opcode: 'looks_costumenumbername',
    inputs: {
        NUMBER_NAME: StringField,
    },
    execute: function* ({NUMBER_NAME}, ctx) {
        if (NUMBER_NAME === 'number') return ctx.target.currentCostume + 1;
        return ctx.target.sprite.costumes[ctx.target.currentCostume].name;
    },
    pure: true,
});

export const looks_backdropnumbername = new ProtoBlock({
    opcode: 'looks_backdropnumbername',
    inputs: {
        NUMBER_NAME: StringField,
    },
    execute: function* ({NUMBER_NAME}, ctx) {
        if (NUMBER_NAME === 'number') return ctx.stage.currentCostume + 1;
        return ctx.stage.sprite.costumes[ctx.stage.currentCostume].name;
    },
    pure: true,
});

export const looks_size = new ProtoBlock({
    opcode: 'looks_size',
    inputs: {},
    execute: function* (_, ctx) {
        return ctx.target.size;
    },
    pure: true,
});

/**
 * Events
 */

export const event_whenflagclicked = new ProtoBlock({
    opcode: 'event_whenflagclicked',
    inputs: {},
    execute: function* () {},
    hat: {
        type: 'event',
        restartExistingThreads: true,
        event: GreenFlagEvent,
    },
});

export const event_whenkeypressed = new ProtoBlock({
    opcode: 'event_whenkeypressed',
    inputs: {
        KEY_OPTION: StringField,
    },
    execute: function* ({KEY_OPTION}, ctx, event) {
        const key = IO.keyArgToScratchKey(KEY_OPTION);
        if (key === null) return;
        const keyPressed = key === 'any' ?
            true :
            event.key === key;

        if (!keyPressed) {
            yield* ctx.stopThisScript();
        }
    },
    hat: {
        type: 'event',
        restartExistingThreads: false,
        event: KeyPressedEvent,
    },
});

export const event_whenbackdropswitchesto = new ProtoBlock({
    opcode: 'event_whenbackdropswitchesto',
    inputs: {
        BACKDROP: StringField,
    },
    execute: function* ({BACKDROP}, ctx, event) {
        if (BACKDROP.toUpperCase() !== event.backdrop) {
            yield* ctx.stopThisScript();
        }
    },
    hat: {
        type: 'event',
        restartExistingThreads: true,
        event: SwitchBackdropEvent,
    },
});

export const event_whenbroadcastreceived = new ProtoBlock({
    opcode: 'event_whenbroadcastreceived',
    inputs: {
        BROADCAST_OPTION: VariableField,
    },
    execute: function* ({BROADCAST_OPTION}, ctx, event) {
        if (event.broadcast !== BROADCAST_OPTION.value.toUpperCase()) {
            yield* ctx.stopThisScript();
        }
    },
    hat: {
        type: 'event',
        restartExistingThreads: false,
        event: BroadcastEvent,
    },
});

export const event_broadcast_menu = new ProtoBlock({
    opcode: 'event_broadcast_menu',
    inputs: {
        BROADCAST_OPTION: VariableField,
    },
    execute: function* ({BROADCAST_OPTION}) {
        return BROADCAST_OPTION.value;
    },
    pure: true,
});

export const event_broadcast = new ProtoBlock({
    opcode: 'event_broadcast',
    inputs: {
        BROADCAST_INPUT: StringInput,
    },
    execute: function* ({BROADCAST_INPUT}, ctx) {
        const broadcast = toString(ctx.evaluateFast(BROADCAST_INPUT));
        ctx.startHats('broadcast', new BroadcastEvent(broadcast));
    },
});

export const event_broadcastandwait = new ProtoBlock({
    opcode: 'event_broadcastandwait',
    inputs: {
        BROADCAST_INPUT: StringInput,
    },
    execute: function* ({BROADCAST_INPUT}, ctx) {
        const broadcast = toString(ctx.evaluateFast(BROADCAST_INPUT));
        const startedThreads = ctx.startHats('broadcast', new BroadcastEvent(broadcast));
        if (startedThreads) {
            yield* ctx.waitOnThreads(startedThreads);
        }
    },
});

/**
 * Control
 */

export const control_wait = new ProtoBlock({
    opcode: 'control_wait',
    inputs: {
        DURATION: NumberInput,
    },
    execute: function* ({DURATION}, ctx) {
        const duration = toNumber(ctx.evaluateFast(DURATION));
        yield* ctx.waitForMS(duration * 1000);
    },
});

export const control_repeat = new ProtoBlock({
    opcode: 'control_repeat',
    inputs: {
        TIMES: NumberInput,
        SUBSTACK: StackInput,
    },
    execute: function* ({TIMES, SUBSTACK}, ctx) {
        const times = Math.round(toNumber(ctx.evaluateFast(TIMES)));
        for (let i = 0; i < times; i++) {
            yield* ctx.evaluate(SUBSTACK);
            yield;
        }
    },
});

export const control_forever = new ProtoBlock({
    opcode: 'control_forever',
    inputs: {
        SUBSTACK: StackInput,
    },
    execute: function* ({SUBSTACK}, ctx) {
        while (true) {
            yield* ctx.evaluate(SUBSTACK);
            yield;
        }
    },
});

export const control_if = new ProtoBlock({
    opcode: 'control_if',
    inputs: {
        CONDITION: BooleanInput,
        SUBSTACK: StackInput,
    },
    execute: function* ({CONDITION, SUBSTACK}, ctx) {
        if (toBoolean(ctx.evaluateFast(CONDITION))) {
            yield* ctx.evaluate(SUBSTACK);
        }
    },
});

export const control_if_else = new ProtoBlock({
    opcode: 'control_if_else',
    inputs: {
        CONDITION: BooleanInput,
        SUBSTACK: StackInput,
        SUBSTACK2: StackInput,
    },
    execute: function* ({CONDITION, SUBSTACK, SUBSTACK2}, ctx) {
        if (toBoolean(ctx.evaluateFast(CONDITION))) {
            yield* ctx.evaluate(SUBSTACK);
        } else {
            yield* ctx.evaluate(SUBSTACK2);
        }
    },
});

export const control_wait_until = new ProtoBlock({
    opcode: 'control_wait_until',
    inputs: {
        CONDITION: BooleanInput,
    },
    execute: function* ({CONDITION}, ctx) {
        // TODO: not sure if evaluateFast will be correct here
        while (!toBoolean(yield* ctx.evaluate(CONDITION))) {
            yield;
        }
    },
});

export const control_repeat_until = new ProtoBlock({
    opcode: 'control_repeat_until',
    inputs: {
        CONDITION: BooleanInput,
        SUBSTACK: StackInput,
    },
    execute: function* ({CONDITION, SUBSTACK}, ctx) {
        // Note that we can't use evaluateFast here because it's not re-entrant!
        while (!toBoolean(yield* ctx.evaluate(CONDITION))) {
            yield* ctx.evaluate(SUBSTACK);
            yield;
        }
    },
});

export const control_stop = new ProtoBlock({
    opcode: 'control_stop',
    inputs: {
        STOP_OPTION: StringField,
    },
    execute: function* ({STOP_OPTION}, ctx) {
        if (STOP_OPTION === 'all') {
            yield* ctx.stopAll();
        } else if (STOP_OPTION === 'this script') {
            yield* ctx.stopThisScript();
        } else if (STOP_OPTION === 'other scripts in sprite') {
            ctx.stopOtherTargetThreads();
        }
    },
});

export const control_start_as_clone = new ProtoBlock({
    opcode: 'control_start_as_clone',
    inputs: {},
    execute: function* () {},
});

export const control_create_clone_of_menu = new ProtoBlock({
    opcode: 'control_create_clone_of_menu',
    inputs: {
        CLONE_OPTION: StringField,
    },
    execute: function* ({CLONE_OPTION}) {
        return CLONE_OPTION;
    },
    pure: true,
});

export const control_create_clone_of = new ProtoBlock({
    opcode: 'control_create_clone_of',
    inputs: {
        CLONE_OPTION: StringInput,
    },
    execute: function* ({CLONE_OPTION}, ctx) {
        const cloneOption = toString(ctx.evaluateFast(CLONE_OPTION));
        if (cloneOption === '_myself_') {
            ctx.target.clone();
        } else {
            const other = ctx.project.getTargetByName(cloneOption);
            if (other) other.clone();
        }
    },
});

export const control_delete_this_clone = new ProtoBlock({
    opcode: 'control_delete_this_clone',
    inputs: {},
    execute: function* (_, ctx) {
        ctx.target.remove();
    },
});

/**
 * Sensing
 */

export const sensing_touchingobjectmenu = new ProtoBlock({
    opcode: 'sensing_touchingobjectmenu',
    inputs: {
        TOUCHINGOBJECTMENU: StringField,
    },
    execute: function* ({TOUCHINGOBJECTMENU}) {
        return TOUCHINGOBJECTMENU;
    },
    pure: true,
});

export const sensing_touchingobject = new ProtoBlock({
    opcode: 'sensing_touchingobject',
    inputs: {
        TOUCHINGOBJECTMENU: StringInput,
    },
    execute: function* ({TOUCHINGOBJECTMENU}, ctx) {
        const target = toString(ctx.evaluateFast(TOUCHINGOBJECTMENU));
        if (target === '_mouse_') {
            const {x, y} = ctx.io.mousePosition;
            const isTouching = ctx.target.drawable.isTouchingPoint(x, y);
            return isTouching;
        } else {
            // TODO
            return false;
        }
    },
    returnType: ['boolean'],
});

export const sensing_keyoptions = new ProtoBlock({
    opcode: 'sensing_keyoptions',
    inputs: {
        KEY_OPTION: StringField,
    },
    execute: function* ({KEY_OPTION}) {
        return KEY_OPTION;
    },
    pure: true,
});

export const sensing_keypressed = new ProtoBlock({
    opcode: 'sensing_keypressed',
    inputs: {
        KEY_OPTION: StringInput,
    },
    execute: function* ({KEY_OPTION}, ctx) {
        const key = IO.keyArgToScratchKey(ctx.evaluateFast(KEY_OPTION));
        if (key === null) return false;
        return key === 'any' ? ctx.io.isAnyKeyPressed() : ctx.io.isKeyPressed(key);
    },
    returnType: ['boolean'],
});

export const sensing_mousedown = new ProtoBlock({
    opcode: 'sensing_mousedown',
    inputs: {},
    execute: function* (_, ctx) {
        return ctx.io.mouseDown;
    },
    returnType: ['boolean'],
});

export const sensing_mousex = new ProtoBlock({
    opcode: 'sensing_mousex',
    inputs: {},
    execute: function* (_, ctx) {
        return ctx.io.mousePosition.x;
    },
    returnType: ['boolean'],
});

export const sensing_mousey = new ProtoBlock({
    opcode: 'sensing_mousey',
    inputs: {},
    execute: function* (_, ctx) {
        return ctx.io.mousePosition.y;
    },
    returnType: ['boolean'],
});

/**
 * Operators
 */

export const operator_add = new ProtoBlock({
    opcode: 'operator_add',
    inputs: {
        NUM1: NumberInput,
        NUM2: NumberInput,
    },
    execute: function* ({NUM1, NUM2}, ctx) {
        const a = toNumber(ctx.evaluateFast(NUM1));
        const b = toNumber(ctx.evaluateFast(NUM2));
        return toNumber(a) + toNumber(b);
    },
    pure: true,
    returnType: ['number'],
});

export const operator_subtract = new ProtoBlock({
    opcode: 'operator_subtract',
    inputs: {
        NUM1: NumberInput,
        NUM2: NumberInput,
    },
    execute: function* ({NUM1, NUM2}, ctx) {
        const a = toNumber(ctx.evaluateFast(NUM1));
        const b = toNumber(ctx.evaluateFast(NUM2));
        return toNumber(a) - toNumber(b);
    },
    pure: true,
    returnType: ['number'],
});

export const operator_multiply = new ProtoBlock({
    opcode: 'operator_multiply',
    inputs: {
        NUM1: NumberInput,
        NUM2: NumberInput,
    },
    execute: function* ({NUM1, NUM2}, ctx) {
        const a = toNumber(ctx.evaluateFast(NUM1));
        const b = toNumber(ctx.evaluateFast(NUM2));
        return toNumber(a) * toNumber(b);
    },
    pure: true,
    returnType: ['number'],
});

export const operator_divide = new ProtoBlock({
    opcode: 'operator_divide',
    inputs: {
        NUM1: NumberInput,
        NUM2: NumberInput,
    },
    execute: function* ({NUM1, NUM2}, ctx) {
        const a = toNumber(ctx.evaluateFast(NUM1));
        const b = toNumber(ctx.evaluateFast(NUM2));
        return toNumber(a) / toNumber(b);
    },
    pure: true,
    returnType: ['number'],
});

export const operator_random = new ProtoBlock({
    opcode: 'operator_random',
    inputs: {
        FROM: NumberInput,
        TO: NumberInput,
    },
    execute: function* ({FROM, TO}, ctx) {
        const origFrom = ctx.evaluateFast(FROM);
        const origTo = ctx.evaluateFast(TO);
        let from = toNumber(origFrom);
        let to = toNumber(origTo);
        if (from > to) [from, to] = [to, from];
        // If both arguments are "int-ish", return an integer. Otherwise, return a float.
        if (isInt(origFrom) && isInt(origTo)) {
            return Math.floor(Math.random() * (to - from + 1)) + from;
        }
        return (Math.random() * (to - from)) + from;
    },
    returnType: ['number'],
});

export const operator_lt = new ProtoBlock({
    opcode: 'operator_lt',
    inputs: {
        OPERAND1: NumberInput,
        OPERAND2: NumberInput,
    },
    execute: function* ({OPERAND1, OPERAND2}, ctx) {
        const a = toNumber(ctx.evaluateFast(OPERAND1));
        const b = toNumber(ctx.evaluateFast(OPERAND2));
        return compare(a, b) < 0;
    },
    pure: true,
    returnType: ['boolean'],
});

export const operator_equals = new ProtoBlock({
    opcode: 'operator_equals',
    inputs: {
        OPERAND1: NumberInput,
        OPERAND2: NumberInput,
    },
    execute: function* ({OPERAND1, OPERAND2}, ctx) {
        const a = ctx.evaluateFast(OPERAND1);
        const b = ctx.evaluateFast(OPERAND2);
        return compare(a, b) === 0;
    },
    pure: true,
    returnType: ['boolean'],
});

export const operator_gt = new ProtoBlock({
    opcode: 'operator_gt',
    inputs: {
        OPERAND1: NumberInput,
        OPERAND2: NumberInput,
    },
    execute: function* ({OPERAND1, OPERAND2}, ctx) {
        const a = toNumber(ctx.evaluateFast(OPERAND1));
        const b = toNumber(ctx.evaluateFast(OPERAND2));
        return compare(a, b) > 0;
    },
    pure: true,
    returnType: ['boolean'],
});

export const operator_and = new ProtoBlock({
    opcode: 'operator_and',
    inputs: {
        OPERAND1: BooleanInput,
        OPERAND2: BooleanInput,
    },
    execute: function* ({OPERAND1, OPERAND2}, ctx) {
        const a = toBoolean(ctx.evaluateFast(OPERAND1));
        const b = toBoolean(ctx.evaluateFast(OPERAND2));
        return a && b;
    },
    pure: true,
    returnType: ['boolean'],
});

export const operator_or = new ProtoBlock({
    opcode: 'operator_or',
    inputs: {
        OPERAND1: BooleanInput,
        OPERAND2: BooleanInput,
    },
    execute: function* ({OPERAND1, OPERAND2}, ctx) {
        const a = toBoolean(ctx.evaluateFast(OPERAND1));
        const b = toBoolean(ctx.evaluateFast(OPERAND2));
        return a || b;
    },
    pure: true,
    returnType: ['boolean'],
});

export const operator_not = new ProtoBlock({
    opcode: 'operator_not',
    inputs: {
        OPERAND: BooleanInput,
    },
    execute: function* ({OPERAND}, ctx) {
        return !toBoolean(ctx.evaluateFast(OPERAND));
    },
    pure: true,
    returnType: ['boolean'],
});

export const operator_join = new ProtoBlock({
    opcode: 'operator_join',
    inputs: {
        STRING1: StringInput,
        STRING2: StringInput,
    },
    execute: function* ({STRING1, STRING2}, ctx) {
        const a = toString(ctx.evaluateFast(STRING1));
        const b = toString(ctx.evaluateFast(STRING2));
        return a + b;
    },
    pure: true,
    returnType: ['string'],
});

export const operator_letter_of = new ProtoBlock({
    opcode: 'operator_letter_of',
    inputs: {
        LETTER: NumberInput,
        STRING: StringInput,
    },
    execute: function* ({LETTER, STRING}, ctx) {
        const letter = toNumber(ctx.evaluateFast(LETTER));
        const string = toString(ctx.evaluateFast(STRING));
        if (letter < 1 || letter > string.length) return '';
        return string[letter - 1];
    },
    pure: true,
    returnType: ['string'],
});

export const operator_length = new ProtoBlock({
    opcode: 'operator_length',
    inputs: {
        STRING: StringInput,
    },
    execute: function* ({STRING}, ctx) {
        const string = toString(ctx.evaluateFast(STRING));
        return string.length;
    },
    pure: true,
    returnType: ['number'],
});

export const operator_contains = new ProtoBlock({
    opcode: 'operator_contains',
    inputs: {
        STRING1: StringInput,
        STRING2: StringInput,
    },
    execute: function* ({STRING1, STRING2}, ctx) {
        const a = toString(ctx.evaluateFast(STRING1));
        const b = toString(ctx.evaluateFast(STRING2));
        if (a.includes(b)) return true;
        return a.toLowerCase().includes(b.toLowerCase());
    },
    pure: true,
    returnType: ['boolean'],
});

export const operator_mod = new ProtoBlock({
    opcode: 'operator_mod',
    inputs: {
        NUM1: NumberInput,
        NUM2: NumberInput,
    },
    execute: function* ({NUM1, NUM2}, ctx) {
        const a = toNumber(ctx.evaluateFast(NUM1));
        const b = toNumber(ctx.evaluateFast(NUM2));
        // Floor-division modulus ("wrapping" behavior)
        return ((a % b) + b) % b;
    },
    pure: true,
    returnType: ['number'],
});

export const operator_round = new ProtoBlock({
    opcode: 'operator_round',
    inputs: {
        NUM: NumberInput,
    },
    execute: function* ({NUM}, ctx) {
        const num = toNumber(ctx.evaluateFast(NUM));
        return Math.round(num);
    },
    pure: true,
    returnType: ['number'],
});

export const operator_mathop = new ProtoBlock({
    opcode: 'operator_mathop',
    inputs: {
        OPERATOR: StringField,
        NUM: NumberInput,
    },
    execute: function* ({OPERATOR, NUM}, ctx) {
        const num = toNumber(ctx.evaluateFast(NUM));
        switch (OPERATOR) {
            case 'abs': return Math.abs(num);
            case 'floor': return Math.floor(num);
            case 'ceiling': return Math.ceil(num);
            case 'sqrt': return Math.sqrt(num);
            case 'sin': return Math.sin(num * Math.PI / 180);
            case 'cos': return Math.cos(num * Math.PI / 180);
            // TODO: Scratch returns Infinity for asymptotes
            case 'tan': return Math.tan(num * Math.PI / 180);
            case 'asin': return Math.asin(num) * 180 / Math.PI;
            case 'acos': return Math.acos(num) * 180 / Math.PI;
            case 'atan': return Math.atan(num) * 180 / Math.PI;
            case 'ln': return Math.log(num);
            // TODO: Scratch does Math.log(num) / Math.LN10, which is less precise and gives slightly different results.
            // Does that really matter?
            case 'log': return Math.log10(num);
            case 'e ^': return Math.exp(num);
            case '10 ^': return Math.pow(10, num);
            default: return 0;
        }
    },
    pure: true,
    returnType: ['number'],
});

/**
 * Data
 */

const lookupOrCreateVariable = (name: string, ctx: BlockContext): number | string | boolean => {
    let value = ctx.target.variables.get(name);
    // Check local variables first, then global variables
    if (value === undefined) value = ctx.stage.variables.get(name);
    if (value !== undefined) return value;
    // Create the variable locally if it doesn't exist
    ctx.target.variables.set(name, 0);
    return 0;
};

const lookupOrCreateList = (name: string, ctx: BlockContext): (number | string | boolean)[] => {
    let value = ctx.target.lists.get(name);
    // Check local lists first, then global lists
    if (value === undefined) value = ctx.stage.lists.get(name);
    if (value !== undefined) return value;
    const list: (number | string | boolean)[] = [];
    ctx.target.lists.set(name, list);
    return list;
};

export const data_variable = new ProtoBlock({
    opcode: 'data_variable',
    inputs: {
        VARIABLE: VariableField,
    },
    execute: function* ({VARIABLE}, ctx) {
        return lookupOrCreateVariable(VARIABLE.id, ctx);
    },
});

export const data_setvariableto = new ProtoBlock({
    opcode: 'data_setvariableto',
    inputs: {
        VARIABLE: VariableField,
        VALUE: NumberInput,
    },
    execute: function* ({VARIABLE, VALUE}, ctx) {
        const value = ctx.evaluateFast(VALUE);
        ctx.target.variables.set(VARIABLE.id, value);
    },
});

export const data_changevariableby = new ProtoBlock({
    opcode: 'data_changevariableby',
    inputs: {
        VARIABLE: VariableField,
        VALUE: NumberInput,
    },
    execute: function* ({VARIABLE, VALUE}, ctx) {
        const increment = toNumber(ctx.evaluateFast(VALUE));
        const value = toNumber(lookupOrCreateVariable(VARIABLE.id, ctx));
        ctx.target.variables.set(VARIABLE.id, value + increment);
    },
});

export const data_listcontents = new ProtoBlock({
    opcode: 'data_listcontents',
    inputs: {
        LIST: VariableField,
    },
    execute: function* ({LIST}, ctx) {
        const list = lookupOrCreateList(LIST.id, ctx);

        // If the list is all single letters, join them together. Otherwise, join with spaces.
        let allSingleLetters = true;
        for (const item of list) {
            if (typeof item !== 'string' || item.length !== 1) {
                allSingleLetters = false;
                break;
            }
        }

        if (allSingleLetters) {
            return list.join('');
        }
        return list.join(' ');
    },
});

export const data_addtolist = new ProtoBlock({
    opcode: 'data_addtolist',
    inputs: {
        ITEM: StringInput,
        LIST: VariableField,
    },
    execute: function* ({ITEM, LIST}, ctx) {
        const item = ctx.evaluateFast(ITEM);
        // TODO: Scratch limits lists to 200000 items. Not sure if that behavior is worth replicating
        lookupOrCreateList(LIST.id, ctx).push(item);
    },
});

export const data_deleteoflist = new ProtoBlock({
    opcode: 'data_deleteoflist',
    inputs: {
        INDEX: NumberInput,
        LIST: VariableField,
    },
    execute: function* ({INDEX, LIST}, ctx) {
        const index = ctx.evaluateFast(INDEX);
        const list = lookupOrCreateList(LIST.id, ctx);
        if (index === 'all') {
            list.length = 0;
            return;
        }
        const numIndex = toListIndex(index, list.length);
        if (numIndex !== 0) list.splice(numIndex - 1, 1);
    },
});

export const data_deletealloflist = new ProtoBlock({
    opcode: 'data_deletealloflist',
    inputs: {
        LIST: VariableField,
    },
    execute: function* ({LIST}, ctx) {
        lookupOrCreateList(LIST.id, ctx).length = 0;
    },
});

export const data_insertatlist = new ProtoBlock({
    opcode: 'data_insertatlist',
    inputs: {
        ITEM: StringInput,
        INDEX: NumberInput,
        LIST: VariableField,
    },
    execute: function* ({ITEM, INDEX, LIST}, ctx) {
        const item = ctx.evaluateFast(ITEM);
        const index = ctx.evaluateFast(INDEX);
        const list = lookupOrCreateList(LIST.id, ctx);
        const numIndex = toListIndex(index, list.length);
        if (numIndex !== 0) list.splice(numIndex - 1, 0, item);
    },
});

export const data_replaceitemoflist = new ProtoBlock({
    opcode: 'data_replaceitemoflist',
    inputs: {
        ITEM: StringInput,
        INDEX: NumberInput,
        LIST: VariableField,
    },
    execute: function* ({ITEM, INDEX, LIST}, ctx) {
        const item = ctx.evaluateFast(ITEM);
        const index = ctx.evaluateFast(INDEX);
        const list = lookupOrCreateList(LIST.id, ctx);
        const numIndex = toListIndex(index, list.length);
        if (numIndex !== 0) list[numIndex - 1] = item;
    },
});

export const data_itemoflist = new ProtoBlock({
    opcode: 'data_itemoflist',
    inputs: {
        INDEX: NumberInput,
        LIST: VariableField,
    },
    execute: function* ({INDEX, LIST}, ctx) {
        const index = ctx.evaluateFast(INDEX);
        const list = lookupOrCreateList(LIST.id, ctx);
        const numIndex = toListIndex(index, list.length);
        if (numIndex !== 0) return list[numIndex - 1];
        return '';
    },
});

export const data_itemnumoflist = new ProtoBlock({
    opcode: 'data_itemnumoflist',
    inputs: {
        ITEM: StringInput,
        LIST: VariableField,
    },
    execute: function* ({ITEM, LIST}, ctx) {
        const item = ctx.evaluateFast(ITEM);
        const list = lookupOrCreateList(LIST.id, ctx);

        // Use Scratch-style equality test.
        for (let i = 0; i < list.length; i++) {
            if (equals(list[i], item)) return i + 1;
        }

        return 0;
    },
    returnType: ['number'],
});

export const data_lengthoflist = new ProtoBlock({
    opcode: 'data_lengthoflist',
    inputs: {
        LIST: VariableField,
    },
    execute: function* ({LIST}, ctx) {
        return lookupOrCreateList(LIST.id, ctx).length;
    },
    returnType: ['number'],
});

export const data_listcontainsitem = new ProtoBlock({
    opcode: 'data_listcontainsitem',
    inputs: {
        ITEM: StringInput,
        LIST: VariableField,
    },
    execute: function* ({ITEM, LIST}, ctx) {
        const item = ctx.evaluateFast(ITEM);
        const list = lookupOrCreateList(LIST.id, ctx);
        for (const listItem of list) {
            if (equals(listItem, item)) return true;
        }
        return false;
    },
    returnType: ['boolean'],
});

/**
 * Custom Blocks
 */

// This block doesn't do anything, and is replaced by the parser with the actual custom block prototype. It exists so
// that the parser can parse a procedures_definition as a normal block.
export const procedures_definition = new ProtoBlock({
    opcode: 'procedures_definition',
    inputs: {
        custom_block: new BlockInput('custom_block', {type: 'object', values: {}}),
    },
    execute: function* () {},
});

export const argument_reporter_string_number = new ProtoBlock({
    opcode: 'argument_reporter_string_number',
    inputs: {
        VALUE: StringField,
    },
    execute: function* ({VALUE}, ctx) {
        return ctx.getParam(VALUE);
    },
});

export const argument_reporter_boolean = new ProtoBlock({
    opcode: 'argument_reporter_boolean',
    inputs: {
        VALUE: StringField,
    },
    execute: function* ({VALUE}, ctx) {
        return ctx.getParam(VALUE);
    },
});
