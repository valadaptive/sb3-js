import {
    AnyInput,
    BlockInput,
    BooleanInput,
    VariableField,
    NumberInput,
    ProtoBlock,
    StackInput,
    StringField,
    StringInput,
    ColorInput,
    Block,
} from './block.js';
import {compare, equals, isInt, isWhiteSpace, toBoolean, toColor, toListIndex, toNumber, toString} from './cast.js';
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
    colorCategory: 'motion',
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
    colorCategory: 'motion',
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
    colorCategory: 'motion',
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
    colorCategory: 'motion',
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
    colorCategory: 'motion',
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
    colorCategory: 'motion',
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
    colorCategory: 'motion',
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
    colorCategory: 'motion',
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
    colorCategory: 'motion',
});

export const motion_pointindirection = new ProtoBlock({
    opcode: 'motion_pointindirection',
    inputs: {
        DIRECTION: NumberInput,
    },
    execute: function* ({DIRECTION}, ctx) {
        ctx.target.direction = toNumber(ctx.evaluateFast(DIRECTION));
    },
    colorCategory: 'motion',
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
    colorCategory: 'motion',
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
    colorCategory: 'motion',
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
    colorCategory: 'motion',
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
    colorCategory: 'motion',
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
    colorCategory: 'motion',
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
    colorCategory: 'motion',
});

export const motion_ifonedgebounce = new ProtoBlock({
    opcode: 'motion_ifonedgebounce',
    inputs: {},
    execute: function* (_, ctx) {
        const stageBounds = ctx.stageBounds;
        let targetBounds = ctx.target.drawable.getTightBounds();

        // Distance from the edge of the stage to the edge of the target
        const distLeft = Math.max(0, -stageBounds.left + targetBounds.left);
        const distRight = Math.max(0, stageBounds.right - targetBounds.right);
        const distBottom = Math.max(0, -stageBounds.bottom + targetBounds.bottom);
        const distTop = Math.max(0, stageBounds.top - targetBounds.top);
        let nearestEdge;
        let nearestDist = Infinity;
        if (distLeft < nearestDist) {
            nearestEdge = 'left';
            nearestDist = distLeft;
        }
        if (distRight < nearestDist) {
            nearestEdge = 'right';
            nearestDist = distRight;
        }
        if (distBottom < nearestDist) {
            nearestEdge = 'bottom';
            nearestDist = distBottom;
        }
        if (distTop < nearestDist) {
            nearestEdge = 'top';
            nearestDist = distTop;
        }
        if (nearestDist > 0) return; // Not touching any edge

        // Point away from the nearest edge
        const radians = (90 - ctx.target.direction) * Math.PI / 180;
        let dirx = Math.cos(radians);
        let diry = Math.sin(radians);
        switch (nearestEdge) {
            case 'left':
                dirx = Math.max(0.2, Math.abs(dirx));
                break;
            case 'right':
                dirx = -Math.max(0.2, Math.abs(dirx));
                break;
            case 'bottom':
                diry = Math.max(0.2, Math.abs(diry));
                break;
            case 'top':
                diry = -Math.max(0.2, Math.abs(diry));
                break;
        }
        const newDirection = (-Math.atan2(diry, dirx) * 180 / Math.PI) + 90;
        ctx.target.direction = newDirection;
        // Recalculate bounds after changing direction
        targetBounds = ctx.target.drawable.getTightBounds();
        // Move away from the edge
        let dx = 0;
        let dy = 0;
        if (targetBounds.left < stageBounds.left) {
            dx += stageBounds.left - targetBounds.left;
        }
        if (targetBounds.right > stageBounds.right) {
            dx += stageBounds.right - targetBounds.right;
        }
        if (targetBounds.bottom < stageBounds.bottom) {
            dy += stageBounds.bottom - targetBounds.bottom;
        }
        if (targetBounds.top > stageBounds.top) {
            dy += stageBounds.top - targetBounds.top;
        }
        ctx.target.moveTo(ctx.target.position.x + dx, ctx.target.position.y + dy);
    },
    colorCategory: 'motion',
});

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
    colorCategory: 'motion',
});

export const motion_xposition = new ProtoBlock({
    opcode: 'motion_xposition',
    inputs: {},
    execute: function* (_, ctx) {
        return ctx.target.position.x;
    },
    monitorLabel: () => 'x position',
    colorCategory: 'motion',
});

export const motion_yposition = new ProtoBlock({
    opcode: 'motion_yposition',
    inputs: {},
    execute: function* (_, ctx) {
        return ctx.target.position.y;
    },
    monitorLabel: () => 'y position',
    colorCategory: 'motion',
});

export const motion_direction = new ProtoBlock({
    opcode: 'motion_direction',
    inputs: {},
    execute: function* (_, ctx) {
        return ctx.target.direction;
    },
    monitorLabel: () => 'y position',
    colorCategory: 'motion',
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

    return ctx.startHats(new SwitchBackdropEvent(stage.sprite.costumes[stage.currentCostume].name));
};

export const looks_sayforsecs = new ProtoBlock({
    opcode: 'looks_sayforsecs',
    inputs: {
        MESSAGE: StringInput,
        SECS: NumberInput,
    },
    execute: function* ({MESSAGE, SECS}, ctx) {
        const message = ctx.evaluateFast(MESSAGE);
        const duration = toNumber(ctx.evaluateFast(SECS)) * 1000;
        const bubbleId = ctx.target.setTextBubble('say', message);
        yield* ctx.waitForMS(duration);
        // Don't clear the bubble if it's been changed since we set it
        if (ctx.target.textBubble?.id === bubbleId) ctx.target.setTextBubble('say', '');
    },
    colorCategory: 'looks',
});

export const looks_say = new ProtoBlock({
    opcode: 'looks_say',
    inputs: {
        MESSAGE: StringInput,
    },
    execute: function* ({MESSAGE}, ctx) {
        const message = ctx.evaluateFast(MESSAGE);
        ctx.target.setTextBubble('say', message);
    },
    colorCategory: 'looks',
});

export const looks_thinkforsecs = new ProtoBlock({
    opcode: 'looks_thinkforsecs',
    inputs: {
        MESSAGE: StringInput,
        SECS: NumberInput,
    },
    execute: function* ({MESSAGE, SECS}, ctx) {
        const message = ctx.evaluateFast(MESSAGE);
        const duration = toNumber(ctx.evaluateFast(SECS)) * 1000;
        const bubbleId = ctx.target.setTextBubble('think', message);
        yield* ctx.waitForMS(duration);
        // Don't clear the bubble if it's been changed since we set it
        if (ctx.target.textBubble?.id === bubbleId) ctx.target.setTextBubble('think', '');
    },
    colorCategory: 'looks',
});

export const looks_think = new ProtoBlock({
    opcode: 'looks_think',
    inputs: {
        MESSAGE: StringInput,
    },
    execute: function* ({MESSAGE}, ctx) {
        const message = ctx.evaluateFast(MESSAGE);
        ctx.target.setTextBubble('think', message);
    },
    colorCategory: 'looks',
});

export const looks_costume = new ProtoBlock({
    opcode: 'looks_costume',
    inputs: {
        COSTUME: StringField,
    },
    execute: function* ({COSTUME}) {
        return COSTUME;
    },
    pure: true,
    colorCategory: 'looks',
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
    colorCategory: 'looks',
});

export const looks_nextcostume = new ProtoBlock({
    opcode: 'looks_nextcostume',
    inputs: {},
    execute: function* (_, ctx) {
        ctx.target.currentCostume++;
    },
    colorCategory: 'looks',
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
    colorCategory: 'looks',
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
    colorCategory: 'looks',
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
    colorCategory: 'looks',
});

export const looks_nextbackdrop = new ProtoBlock({
    opcode: 'looks_nextbackdrop',
    inputs: {},
    execute: function* (_, ctx) {
        // TODO: trigger "when backdrop switches to" hats
        ctx.stage.currentCostume++;
    },
    colorCategory: 'looks',
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
    colorCategory: 'looks',
});

export const looks_setsizeto = new ProtoBlock({
    opcode: 'looks_setsizeto',
    inputs: {
        SIZE: NumberInput,
    },
    execute: function* ({SIZE}, ctx) {
        ctx.target.size = toNumber(ctx.evaluateFast(SIZE));
    },
    colorCategory: 'looks',
});

export const looks_show = new ProtoBlock({
    opcode: 'looks_show',
    inputs: {},
    execute: function* (_, ctx) {
        ctx.target.visible = true;
    },
    colorCategory: 'looks',
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
    colorCategory: 'looks',
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
    colorCategory: 'looks',
});

export const looks_cleargraphiceffects = new ProtoBlock({
    opcode: 'looks_cleargraphiceffects',
    inputs: {},
    execute: function* (_, ctx) {
        ctx.target.effects.clear();
        if (ctx.target.visible) ctx.target.runtime.requestRedraw();
    },
    colorCategory: 'looks',
});

export const looks_hide = new ProtoBlock({
    opcode: 'looks_hide',
    inputs: {},
    execute: function* (_, ctx) {
        ctx.target.visible = false;
    },
    colorCategory: 'looks',
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
    colorCategory: 'looks',
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
    colorCategory: 'looks',
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
    monitorLabel({NUMBER_NAME}) {
        return `costume ${NUMBER_NAME}`;
    },
    colorCategory: 'looks',
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
    monitorLabel({NUMBER_NAME}) {
        return `backdrop ${NUMBER_NAME}`;
    },
    colorCategory: 'looks',
});

export const looks_size = new ProtoBlock({
    opcode: 'looks_size',
    inputs: {},
    execute: function* (_, ctx) {
        return ctx.target.size;
    },
    monitorLabel: () => 'size',
    colorCategory: 'looks',
});

/**
 * Sound
 */

export const sound_sounds_menu = new ProtoBlock({
    opcode: 'sound_sounds_menu',
    inputs: {
        SOUND_MENU: StringField,
    },
    execute: function* ({SOUND_MENU}) {
        return SOUND_MENU;
    },
    pure: true,
    colorCategory: 'sound',
});

export const sound_playuntildone = new ProtoBlock({
    opcode: 'sound_playuntildone',
    inputs: {
        SOUND_MENU: StringInput,
    },
    execute: function* ({SOUND_MENU}, ctx) {
        const soundName = toString(ctx.evaluateFast(SOUND_MENU));
        const sound = ctx.target.sprite.getSoundByName(soundName);
        if (!sound) return;
        yield* ctx.await(ctx.target.audio.play(sound));
    },
    colorCategory: 'sound',
});

export const sound_play = new ProtoBlock({
    opcode: 'sound_play',
    inputs: {
        SOUND_MENU: StringInput,
    },
    execute: function* ({SOUND_MENU}, ctx) {
        const soundName = toString(ctx.evaluateFast(SOUND_MENU));
        const sound = ctx.target.sprite.getSoundByName(soundName);
        if (!sound) return;
        ctx.target.audio.play(sound);
    },
    colorCategory: 'sound',
});

export const sound_stopallsounds = new ProtoBlock({
    opcode: 'sound_stopallsounds',
    inputs: {},
    execute: function* (_, ctx) {
        ctx.target.audio.stopAllSounds();
    },
    colorCategory: 'sound',
});

export const sound_changeeffectby = new ProtoBlock({
    opcode: 'sound_changeeffectby',
    inputs: {
        EFFECT: StringField,
        VALUE: NumberInput,
    },
    execute: function* ({EFFECT, VALUE}, ctx) {
        const effect = EFFECT.toLowerCase();
        const value = toNumber(ctx.evaluateFast(VALUE));
        switch (effect) {
            case 'pitch':
                ctx.target.audio.pitch += value;
                break;
            case 'pan':
                ctx.target.audio.pan += value;
                break;
        }
    },
    colorCategory: 'sound',
});

export const sound_seteffectto = new ProtoBlock({
    opcode: 'sound_seteffectto',
    inputs: {
        EFFECT: StringField,
        VALUE: NumberInput,
    },
    execute: function* ({EFFECT, VALUE}, ctx) {
        const effect = EFFECT.toLowerCase();
        const value = toNumber(ctx.evaluateFast(VALUE));
        switch (effect) {
            case 'pitch':
                ctx.target.audio.pitch = value;
                break;
            case 'pan':
                ctx.target.audio.pan = value;
                break;
        }
    },
    colorCategory: 'sound',
});

export const sound_cleareffects = new ProtoBlock({
    opcode: 'sound_cleareffects',
    inputs: {},
    execute: function* (_, ctx) {
        ctx.target.audio.clearEffects();
    },
    colorCategory: 'sound',
});

export const sound_changevolumeby = new ProtoBlock({
    opcode: 'sound_changevolumeby',
    inputs: {
        VOLUME: NumberInput,
    },
    execute: function* ({VOLUME}, ctx) {
        const volume = toNumber(ctx.evaluateFast(VOLUME));
        ctx.target.volume += volume;
        // Yield until the next tick.
        yield* ctx.await(Promise.resolve());
    },
    colorCategory: 'sound',
});

export const sound_setvolumeto = new ProtoBlock({
    opcode: 'sound_setvolumeto',
    inputs: {
        VOLUME: NumberInput,
    },
    execute: function* ({VOLUME}, ctx) {
        ctx.target.volume = toNumber(ctx.evaluateFast(VOLUME));
        // Yield until the next tick.
        yield* ctx.await(Promise.resolve());
    },
    colorCategory: 'sound',
});

export const sound_volume = new ProtoBlock({
    opcode: 'sound_volume',
    inputs: {},
    execute: function* (_, ctx) {
        return ctx.target.volume;
    },
    monitorLabel: () => 'volume',
    colorCategory: 'sound',
});

/**
 * Events
 */

export const event_whenflagclicked = new ProtoBlock({
    opcode: 'event_whenflagclicked',
    inputs: {},
    execute: function* () {
        return true;
    },
    hat: {
        type: 'event',
        restartExistingThreads: true,
        event: GreenFlagEvent,
    },
    colorCategory: 'event',
});

export const event_whenkeypressed = new ProtoBlock({
    opcode: 'event_whenkeypressed',
    inputs: {
        KEY_OPTION: StringField,
    },
    execute: function* ({KEY_OPTION}, ctx, event) {
        const key = IO.keyArgToScratchKey(KEY_OPTION);
        if (key === null) return false;
        const keyPressed = key === 'any' ?
            true :
            event.key === key;

        return keyPressed;
    },
    hat: {
        type: 'event',
        restartExistingThreads: false,
        event: KeyPressedEvent,
    },
    colorCategory: 'event',
});

// The "when clicked" blocks don't do any event filtering--they're dispatched directly on the proper targets.
export const event_whenthisspriteclicked = new ProtoBlock({
    opcode: 'event_whenthisspriteclicked',
    inputs: {},
    execute: function* () {},
    hat: {
        type: 'noop',
        restartExistingThreads: true,
    },
    colorCategory: 'event',
});

export const event_whenstageclicked = new ProtoBlock({
    opcode: 'event_whenstageclicked',
    inputs: {},
    execute: function* () {},
    hat: {
        type: 'noop',
        restartExistingThreads: true,
    },
    colorCategory: 'event',
});

export const event_whenbackdropswitchesto = new ProtoBlock({
    opcode: 'event_whenbackdropswitchesto',
    inputs: {
        BACKDROP: StringField,
    },
    execute: function* ({BACKDROP}, ctx, event) {
        return BACKDROP.toUpperCase() === event.backdrop;
    },
    hat: {
        type: 'event',
        restartExistingThreads: true,
        event: SwitchBackdropEvent,
    },
    colorCategory: 'event',
});

export const event_whengreaterthan = new ProtoBlock({
    opcode: 'event_whengreaterthan',
    inputs: {
        WHENGREATERTHANMENU: StringField,
        VALUE: NumberInput,
    },
    execute: function* ({WHENGREATERTHANMENU, VALUE}, ctx) {
        const menuOption = WHENGREATERTHANMENU.toLowerCase();
        const threshold = toNumber(ctx.evaluateFast(VALUE));
        const value = menuOption === 'loudness' ?
            ctx.audio?.getLoudness() ?? -1 :
            (ctx.project.currentMSecs - ctx.project.timerStart) / 1000;
        return value > threshold;
    },
    hat: {
        type: 'edgeActivated',
        restartExistingThreads: false,
    },
    colorCategory: 'event',
});

export const event_whenbroadcastreceived = new ProtoBlock({
    opcode: 'event_whenbroadcastreceived',
    inputs: {
        BROADCAST_OPTION: VariableField,
    },
    execute: function* ({BROADCAST_OPTION}, ctx, event) {
        return BROADCAST_OPTION.value.toUpperCase() === event.broadcast;
    },
    hat: {
        type: 'event',
        restartExistingThreads: true,
        event: BroadcastEvent,
    },
    colorCategory: 'event',
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
    colorCategory: 'event',
});

export const event_broadcast = new ProtoBlock({
    opcode: 'event_broadcast',
    inputs: {
        BROADCAST_INPUT: StringInput,
    },
    execute: function* ({BROADCAST_INPUT}, ctx) {
        const broadcast = toString(ctx.evaluateFast(BROADCAST_INPUT));
        ctx.startHats(new BroadcastEvent(broadcast));
    },
    colorCategory: 'event',
});

export const event_broadcastandwait = new ProtoBlock({
    opcode: 'event_broadcastandwait',
    inputs: {
        BROADCAST_INPUT: StringInput,
    },
    execute: function* ({BROADCAST_INPUT}, ctx) {
        const broadcast = toString(ctx.evaluateFast(BROADCAST_INPUT));
        const startedThreads = ctx.startHats(new BroadcastEvent(broadcast));
        if (startedThreads) {
            yield* ctx.waitOnThreads(startedThreads);
        }
    },
    colorCategory: 'event',
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
    colorCategory: 'control',
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
    colorCategory: 'control',
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
    colorCategory: 'control',
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
    colorCategory: 'control',
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
    colorCategory: 'control',
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
    colorCategory: 'control',
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
    colorCategory: 'control',
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
    colorCategory: 'control',
});

export const control_start_as_clone = new ProtoBlock({
    opcode: 'control_start_as_clone',
    inputs: {},
    execute: function* () {},
    colorCategory: 'control',
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
    colorCategory: 'control',
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
    colorCategory: 'control',
});

export const control_delete_this_clone = new ProtoBlock({
    opcode: 'control_delete_this_clone',
    inputs: {},
    execute: function* (_, ctx) {
        if (!ctx.target.isOriginal) ctx.target.remove();
    },
    colorCategory: 'control',
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
    colorCategory: 'sensing',
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
        } else if (target === '_edge_') {
            return ctx.target.isTouchingEdge();
        } else {
            const other = ctx.project.getTargetByName(target);
            if (other) {
                const isTouching = ctx.target.drawable.isTouchingDrawable(other.drawable);
                return isTouching;
            }
        }
    },
    returnType: ['boolean'],
    colorCategory: 'sensing',
});

const evaluateColorInput = (
    color: string | number | boolean | Block | {r: number; g: number; b: number},
    ctx: BlockContext,
    dst: Uint8ClampedArray,
) => {
    if (typeof color === 'object' && !(color instanceof Block)) {
        return new Uint8ClampedArray([color.r, color.g, color.b, 255]);
    } else {
        return toColor(ctx.evaluateFast(color), dst);
    }
};

const __color = new Uint8ClampedArray(4);
export const sensing_touchingcolor = new ProtoBlock({
    opcode: 'sensing_touchingcolor',
    inputs: {
        COLOR: ColorInput,
    },
    execute: function* ({COLOR}, ctx) {
        const color = evaluateColorInput(COLOR, ctx, __color);
        const isTouching = ctx.target.drawable.isTouchingColor(
            ctx.project.targets,
            ctx.renderer?.penLayer ?? null,
            color,
            ctx.stageBounds,
        );
        return isTouching;
    },
    colorCategory: 'sensing',
});

const __color2 = new Uint8ClampedArray(3);
export const sensing_coloristouchingcolor = new ProtoBlock({
    opcode: 'sensing_coloristouchingcolor',
    inputs: {
        COLOR: ColorInput,
        COLOR2: ColorInput,
    },
    execute: function* ({COLOR, COLOR2}, ctx) {
        const color = evaluateColorInput(COLOR, ctx, __color);
        const color2 = evaluateColorInput(COLOR2, ctx, __color2);
        // COLOR is the mask and COLOR2 is the target color, as opposed to "touching color" where COLOR is the target
        // color. Why? Ask Scratch.
        const isTouching = ctx.target.drawable.isTouchingColor(
            ctx.project.targets,
            ctx.renderer?.penLayer ?? null,
            color2,
            ctx.stageBounds,
            color,
        );
        return isTouching;
    },
    colorCategory: 'sensing',
});

export const sensing_distancetomenu = new ProtoBlock({
    opcode: 'sensing_distancetomenu',
    inputs: {
        DISTANCETOMENU: StringField,
    },
    execute: function* ({DISTANCETOMENU}) {
        return DISTANCETOMENU;
    },
    pure: true,
    colorCategory: 'sensing',
});

export const sensing_distanceto = new ProtoBlock({
    opcode: 'sensing_distanceto',
    inputs: {
        DISTANCETOMENU: StringInput,
    },
    execute: function* ({DISTANCETOMENU}, ctx) {
        if (ctx.target.sprite.isStage) return 10000;

        const target = toString(ctx.evaluateFast(DISTANCETOMENU));
        let targetX, targetY;
        if (target === '_mouse_') {
            targetX = ctx.io.mousePosition.x;
            targetY = ctx.io.mousePosition.y;
        } else {
            const other = ctx.project.getTargetByName(target);
            if (other) {
                targetX = other.position.x;
                targetY = other.position.y;
            } else {
                return 10000;
            }
        }


        const dx = ctx.target.position.x - targetX;
        const dy = ctx.target.position.y - targetY;
        return Math.sqrt((dx * dx) + (dy * dy));

        return 0;
    },
    returnType: ['number'],
    colorCategory: 'sensing',
});

export const sensing_askandwait = new ProtoBlock({
    opcode: 'sensing_askandwait',
    inputs: {
        QUESTION: StringInput,
    },
    execute: function* ({QUESTION}, ctx) {
        const question = ctx.evaluateFast(QUESTION);
        yield* ctx.ask(question);
    },
    colorCategory: 'sensing',
});

export const sensing_answer = new ProtoBlock({
    opcode: 'sensing_answer',
    inputs: {},
    execute: function* (_, ctx) {
        return ctx.project.answer;
    },
    returnType: ['string'],
    monitorLabel: () => 'answer',
    colorCategory: 'sensing',
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
    colorCategory: 'sensing',
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
    colorCategory: 'sensing',
});

export const sensing_mousedown = new ProtoBlock({
    opcode: 'sensing_mousedown',
    inputs: {},
    execute: function* (_, ctx) {
        return ctx.io.mouseDown;
    },
    returnType: ['boolean'],
    colorCategory: 'sensing',
});

export const sensing_mousex = new ProtoBlock({
    opcode: 'sensing_mousex',
    inputs: {},
    execute: function* (_, ctx) {
        return ctx.io.mousePosition.x;
    },
    returnType: ['boolean'],
    colorCategory: 'sensing',
});

export const sensing_mousey = new ProtoBlock({
    opcode: 'sensing_mousey',
    inputs: {},
    execute: function* (_, ctx) {
        return ctx.io.mousePosition.y;
    },
    returnType: ['boolean'],
    colorCategory: 'sensing',
});

export const sensing_loudness = new ProtoBlock({
    opcode: 'sensing_loudness',
    inputs: {},
    execute: function* (_, ctx) {
        return ctx.audio?.getLoudness() ?? -1;
    },
    returnType: ['number'],
    monitorLabel: () => 'loudness',
    colorCategory: 'sensing',
});

export const sensing_timer = new ProtoBlock({
    opcode: 'sensing_timer',
    inputs: {},
    execute: function* (_, ctx) {
        return (ctx.project.currentMSecs - ctx.project.timerStart) / 1000;
    },
    returnType: ['number'],
    monitorLabel: () => 'timer',
    colorCategory: 'sensing',
});

export const sensing_resettimer = new ProtoBlock({
    opcode: 'sensing_resettimer',
    inputs: {},
    execute: function* (_, ctx) {
        ctx.project.timerStart = ctx.project.currentMSecs;
    },
    colorCategory: 'sensing',
});

export const sensing_of_object_menu = new ProtoBlock({
    opcode: 'sensing_of_object_menu',
    inputs: {
        OBJECT: StringField,
    },
    execute: function* ({OBJECT}) {
        return OBJECT;
    },
    pure: true,
    colorCategory: 'sensing',
});

export const sensing_of = new ProtoBlock({
    opcode: 'sensing_of',
    inputs: {
        PROPERTY: StringField,
        OBJECT: StringInput,
    },
    execute: function* ({PROPERTY, OBJECT}, ctx) {
        let target;
        if (OBJECT === '_stage_') {
            target = ctx.stage;
        } else {
            target = ctx.project.getTargetByName(toString(ctx.evaluateFast(OBJECT)));
        }
        if (!target) return 0;

        // Check for specific attributes
        if (target.sprite.isStage) {
            switch (PROPERTY) {
                case 'background #':
                case 'backdrop #': return target.currentCostume + 1;
                case 'backdrop name': return target.sprite.costumes[target.currentCostume].name;
                case 'volume': return target.volume;
            }
        } else {
            switch (PROPERTY) {
                case 'x position': return target.position.x;
                case 'y position': return target.position.y;
                case 'direction': return target.direction;
                case 'costume #': return target.currentCostume + 1;
                case 'costume name': return target.sprite.costumes[target.currentCostume].name;
                case 'size': return target.size;
                case 'volume': return target.volume;
            }
        }

        // Local variables
        const varValue = target.variables.get(toString(PROPERTY));

        // Return 0 if all else fails
        return varValue ?? 0;
    },
    colorCategory: 'sensing',
});

export const sensing_current = new ProtoBlock({
    opcode: 'sensing_current',
    inputs: {
        CURRENTMENU: StringField,
    },
    execute: function* ({CURRENTMENU}) {
        const date = new Date();
        switch (CURRENTMENU.toLowerCase()) {
            case 'year': return date.getFullYear();
            case 'month': return date.getMonth() + 1;
            case 'date': return date.getDate();
            case 'dayofweek': return date.getDay() + 1;
            case 'hour': return date.getHours();
            case 'minute': return date.getMinutes();
            case 'second': return date.getSeconds();
        }
        return 0;
    },
    monitorLabel: ({CURRENTMENU}) => {
        const current = CURRENTMENU.toLowerCase();
        if (current === 'dayofweek') return 'day of week';
        return current;
    },
    colorCategory: 'sensing',
});

export const sensing_dayssince2000 = new ProtoBlock({
    opcode: 'sensing_dayssince2000',
    inputs: {},
    execute: function* () {
        const start = new Date(2000, 0, 1);
        const now = new Date();
        let delta = now.getTime() - start.getTime();
        // TODO: Scratch does a more convoluted thing here that I *think* is mathematically equivalent
        delta += start.getTimezoneOffset() * 60 * 1000;
        return delta / (1000 * 60 * 60 * 24);
    },
    returnType: ['number'],
    monitorLabel: () => 'days since 2000',
    colorCategory: 'sensing',
});

export const sensing_username = new ProtoBlock({
    opcode: 'sensing_username',
    inputs: {},
    execute: function* (_, ctx) {
        return ctx.io.username;
    },
    monitorLabel: () => 'username',
    colorCategory: 'sensing',
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
    colorCategory: 'operator',
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
    colorCategory: 'operator',
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
    colorCategory: 'operator',
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
    colorCategory: 'operator',
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
    colorCategory: 'operator',
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
    colorCategory: 'operator',
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
    colorCategory: 'operator',
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
    colorCategory: 'operator',
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
    colorCategory: 'operator',
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
    colorCategory: 'operator',
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
    colorCategory: 'operator',
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
    colorCategory: 'operator',
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
    colorCategory: 'operator',
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
    colorCategory: 'operator',
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
    colorCategory: 'operator',
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
    colorCategory: 'operator',
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
    colorCategory: 'operator',
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
    colorCategory: 'operator',
});

/**
 * Data
 */

export const data_variable = new ProtoBlock({
    opcode: 'data_variable',
    inputs: {
        VARIABLE: VariableField,
    },
    execute: function* ({VARIABLE}, ctx) {
        return ctx.lookupOrCreateVariable(VARIABLE.value);
    },
    monitorLabel({VARIABLE}) {
        return VARIABLE.value;
    },
    monitorSliderHandler({VARIABLE}, target, value) {
        target.variables.set(VARIABLE.value, value);
    },
    colorCategory: 'data',
});

export const data_setvariableto = new ProtoBlock({
    opcode: 'data_setvariableto',
    inputs: {
        VARIABLE: VariableField,
        VALUE: NumberInput,
    },
    execute: function* ({VARIABLE, VALUE}, ctx) {
        const value = ctx.evaluateFast(VALUE);
        if (ctx.target.variables.has(VARIABLE.value)) {
            ctx.target.variables.set(VARIABLE.value, value);
        } else {
            ctx.stage.variables.set(VARIABLE.value, value);
        }
    },
    colorCategory: 'data',
});

export const data_changevariableby = new ProtoBlock({
    opcode: 'data_changevariableby',
    inputs: {
        VARIABLE: VariableField,
        VALUE: NumberInput,
    },
    execute: function* ({VARIABLE, VALUE}, ctx) {
        const increment = toNumber(ctx.evaluateFast(VALUE));
        const value = toNumber(ctx.lookupOrCreateVariable(VARIABLE.value));
        if (ctx.target.variables.has(VARIABLE.value)) {
            ctx.target.variables.set(VARIABLE.value, value + increment);
        } else {
            ctx.stage.variables.set(VARIABLE.value, value + increment);
        }
    },
    colorCategory: 'data',
});

export const data_showvariable = new ProtoBlock({
    opcode: 'data_showvariable',
    inputs: {
        VARIABLE: VariableField,
    },
    execute: function* ({VARIABLE}, ctx) {
        const varTarget = ctx.stage.variables.has(VARIABLE.value) ? null : ctx.target;
        const monitor = ctx.project.getOrCreateMonitorFor(
            data_variable,
            {VARIABLE: {id: VARIABLE.id, value: VARIABLE.value}},
            varTarget,
        );
        monitor.update({visible: true});
    },
    colorCategory: 'data',
});

export const data_hidevariable = new ProtoBlock({
    opcode: 'data_hidevariable',
    inputs: {
        VARIABLE: VariableField,
    },
    execute: function* ({VARIABLE}, ctx) {
        const varTarget = ctx.stage.variables.has(VARIABLE.value) ? null : ctx.target;
        const monitor = ctx.project.getOrCreateMonitorFor(
            data_variable,
            {VARIABLE: {id: VARIABLE.id, value: VARIABLE.value}},
            varTarget,
        );
        monitor.update({visible: false});
    },
    colorCategory: 'data',
});

export const data_listcontents = new ProtoBlock({
    opcode: 'data_listcontents',
    inputs: {
        LIST: VariableField,
    },
    execute: function* ({LIST}, ctx) {
        const list = ctx.lookupOrCreateList(LIST.value);

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
    colorCategory: 'data_lists',
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
        ctx.lookupOrCreateList(LIST.value).push(item);
    },
    colorCategory: 'data_lists',
});

export const data_deleteoflist = new ProtoBlock({
    opcode: 'data_deleteoflist',
    inputs: {
        INDEX: NumberInput,
        LIST: VariableField,
    },
    execute: function* ({INDEX, LIST}, ctx) {
        const index = ctx.evaluateFast(INDEX);
        const list = ctx.lookupOrCreateList(LIST.value);
        if (index === 'all') {
            list.length = 0;
            return;
        }
        const numIndex = toListIndex(index, list.length);
        if (numIndex !== 0) list.splice(numIndex - 1, 1);
    },
    colorCategory: 'data_lists',
});

export const data_deletealloflist = new ProtoBlock({
    opcode: 'data_deletealloflist',
    inputs: {
        LIST: VariableField,
    },
    execute: function* ({LIST}, ctx) {
        ctx.lookupOrCreateList(LIST.value).length = 0;
    },
    colorCategory: 'data_lists',
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
        const list = ctx.lookupOrCreateList(LIST.value);
        const numIndex = toListIndex(index, list.length);
        if (numIndex !== 0) list.splice(numIndex - 1, 0, item);
    },
    colorCategory: 'data_lists',
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
        const list = ctx.lookupOrCreateList(LIST.value);
        const numIndex = toListIndex(index, list.length);
        if (numIndex !== 0) list[numIndex - 1] = item;
    },
    colorCategory: 'data_lists',
});

export const data_itemoflist = new ProtoBlock({
    opcode: 'data_itemoflist',
    inputs: {
        INDEX: NumberInput,
        LIST: VariableField,
    },
    execute: function* ({INDEX, LIST}, ctx) {
        const index = ctx.evaluateFast(INDEX);
        const list = ctx.lookupOrCreateList(LIST.value);
        const numIndex = toListIndex(index, list.length);
        if (numIndex !== 0) return list[numIndex - 1];
        return '';
    },
    colorCategory: 'data_lists',
});

export const data_itemnumoflist = new ProtoBlock({
    opcode: 'data_itemnumoflist',
    inputs: {
        ITEM: StringInput,
        LIST: VariableField,
    },
    execute: function* ({ITEM, LIST}, ctx) {
        const item = ctx.evaluateFast(ITEM);
        const list = ctx.lookupOrCreateList(LIST.value);

        // Use Scratch-style equality test.
        for (let i = 0; i < list.length; i++) {
            if (equals(list[i], item)) return i + 1;
        }

        return 0;
    },
    returnType: ['number'],
    colorCategory: 'data_lists',
});

export const data_lengthoflist = new ProtoBlock({
    opcode: 'data_lengthoflist',
    inputs: {
        LIST: VariableField,
    },
    execute: function* ({LIST}, ctx) {
        return ctx.lookupOrCreateList(LIST.value).length;
    },
    returnType: ['number'],
    colorCategory: 'data_lists',
});

export const data_listcontainsitem = new ProtoBlock({
    opcode: 'data_listcontainsitem',
    inputs: {
        ITEM: StringInput,
        LIST: VariableField,
    },
    execute: function* ({ITEM, LIST}, ctx) {
        const item = ctx.evaluateFast(ITEM);
        const list = ctx.lookupOrCreateList(LIST.value);
        for (const listItem of list) {
            if (equals(listItem, item)) return true;
        }
        return false;
    },
    returnType: ['boolean'],
    colorCategory: 'data_lists',
});

export const data_showlist = new ProtoBlock({
    opcode: 'data_showlist',
    inputs: {
        LIST: VariableField,
    },
    execute: function* ({LIST}, ctx) {
        const varTarget = ctx.stage.lists.has(LIST.value) ? null : ctx.target;
        const monitor = ctx.project.getOrCreateMonitorFor(
            data_listcontents,
            {LIST: {id: LIST.id, value: LIST.value}},
            varTarget,
        );
        monitor.update({visible: true});
    },
    colorCategory: 'data_lists',
});

export const data_hidelist = new ProtoBlock({
    opcode: 'data_hidelist',
    inputs: {
        LIST: VariableField,
    },
    execute: function* ({LIST}, ctx) {
        const varTarget = ctx.stage.lists.has(LIST.value) ? null : ctx.target;
        const monitor = ctx.project.getOrCreateMonitorFor(
            data_listcontents,
            {LIST: {id: LIST.id, value: LIST.value}},
            varTarget,
        );
        monitor.update({visible: false});
    },
    colorCategory: 'data_lists',
});

/**
 * Pen
 */

export const pen_clear = new ProtoBlock({
    opcode: 'pen_clear',
    inputs: {},
    execute: function* (_, ctx) {
        ctx.renderer?.penLayer.clear();
        ctx.target.runtime.requestRedraw();
    },
    colorCategory: 'extensions',
});

export const pen_stamp = new ProtoBlock({
    opcode: 'pen_stamp',
    inputs: {},
    execute: function* (_, ctx) {
        ctx.renderer?.stamp(ctx.target);
        ctx.target.runtime.requestRedraw();
    },
    colorCategory: 'extensions',
});

export const pen_penDown = new ProtoBlock({
    opcode: 'pen_penDown',
    inputs: {},
    execute: function* (_, ctx) {
        ctx.target.penState.down = true;
        // Move so we draw a pen dot
        ctx.target.moveTo(ctx.target.position.x, ctx.target.position.y);
    },
    colorCategory: 'extensions',
});

export const pen_penUp = new ProtoBlock({
    opcode: 'pen_penUp',
    inputs: {},
    execute: function* (_, ctx) {
        ctx.target.penState.down = false;
    },
    colorCategory: 'extensions',
});

const __color3 = new Uint8ClampedArray(4);
export const pen_setPenColorToColor = new ProtoBlock({
    opcode: 'pen_setPenColorToColor',
    inputs: {
        COLOR: ColorInput,
    },
    execute: function* ({COLOR}, ctx) {
        evaluateColorInput(COLOR, ctx, __color3);
        ctx.target.penState.setFromRgbaInt(__color3);
    },
    colorCategory: 'extensions',
});

export const pen_menu_colorParam = new ProtoBlock({
    opcode: 'pen_menu_colorParam',
    inputs: {
        colorParam: StringField,
    },
    execute: function* ({colorParam}) {
        return colorParam;
    },
    pure: true,
    colorCategory: 'extensions',
});

export const pen_changePenColorParamBy = new ProtoBlock({
    opcode: 'pen_changePenColorParamBy',
    inputs: {
        COLOR_PARAM: StringInput,
        VALUE: NumberInput,
    },
    execute: function* ({COLOR_PARAM, VALUE}, ctx) {
        const param = toString(ctx.evaluateFast(COLOR_PARAM));
        const value = toNumber(ctx.evaluateFast(VALUE));
        if (param === 'color' || param === 'saturation' || param === 'brightness' || param === 'transparency') {
            ctx.target.penState[param] += value;
        }
    },
    colorCategory: 'extensions',
});

export const pen_setPenColorParamTo = new ProtoBlock({
    opcode: 'pen_setPenColorParamTo',
    inputs: {
        COLOR_PARAM: StringInput,
        VALUE: NumberInput,
    },
    execute: function* ({COLOR_PARAM, VALUE}, ctx) {
        const param = toString(ctx.evaluateFast(COLOR_PARAM));
        const value = toNumber(ctx.evaluateFast(VALUE));
        if (param === 'color' || param === 'saturation' || param === 'brightness' || param === 'transparency') {
            ctx.target.penState[param] = value;
        }
    },
    colorCategory: 'extensions',
});

export const pen_changePenSizeBy = new ProtoBlock({
    opcode: 'pen_changePenSizeBy',
    inputs: {
        SIZE: NumberInput,
    },
    execute: function* ({SIZE}, ctx) {
        const size = toNumber(ctx.evaluateFast(SIZE));
        ctx.target.penState.thickness += size;
    },
    colorCategory: 'extensions',
});

export const pen_setPenSizeTo = new ProtoBlock({
    opcode: 'pen_setPenSizeTo',
    inputs: {
        SIZE: NumberInput,
    },
    execute: function* ({SIZE}, ctx) {
        const size = toNumber(ctx.evaluateFast(SIZE));
        ctx.target.penState.thickness = size;
    },
    colorCategory: 'extensions',
});

// Legacy 2.0 "set pen color to"
export const pen_setPenHueToNumber = new ProtoBlock({
    opcode: 'pen_setPenHueToNumber',
    inputs: {
        HUE: NumberInput,
    },
    execute: function* ({HUE}, ctx) {
        const hue = toNumber(ctx.evaluateFast(HUE));
        // Unlike the 3.0 version, this wraps in the correct range
        ctx.target.penState.color = (((hue * 0.5) % 100) + 100) % 100;
        ctx.target.penState.transparency = 0; // Not sure why this is here, but Scratch does it
        ctx.target.penState.updateLegacyColor();
    },
    colorCategory: 'extensions',
});

// Legacy 2.0 "change pen color by"
export const pen_changePenHueBy = new ProtoBlock({
    opcode: 'pen_changePenHueBy',
    inputs: {
        HUE: NumberInput,
    },
    execute: function* ({HUE}, ctx) {
        const hue = toNumber(ctx.evaluateFast(HUE));
        // Unlike the 3.0 version, this wraps in the correct range
        ctx.target.penState.color = ctx.target.penState.color + ((((hue * 0.5) % 100) + 100) % 100);
        ctx.target.penState.updateLegacyColor();
    },
    colorCategory: 'extensions',
});

// Legacy 2.0 "set pen shade to"
export const pen_setPenShadeToNumber = new ProtoBlock({
    opcode: 'pen_setPenShadeToNumber',
    inputs: {
        SHADE: NumberInput,
    },
    execute: function* ({SHADE}, ctx) {
        const shade = toNumber(ctx.evaluateFast(SHADE));
        ctx.target.penState.legacyShade = shade;
        ctx.target.penState.updateLegacyColor();
    },
    colorCategory: 'extensions',
});

// Legacy 2.0 "change pen shade by"
export const pen_changePenShadeBy = new ProtoBlock({
    opcode: 'pen_changePenShadeBy',
    inputs: {
        SHADE: NumberInput,
    },
    execute: function* ({SHADE}, ctx) {
        const shade = toNumber(ctx.evaluateFast(SHADE));
        ctx.target.penState.legacyShade += shade;
        ctx.target.penState.updateLegacyColor();
    },
    colorCategory: 'extensions',
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
    colorCategory: 'procedures',
});

export const argument_reporter_string_number = new ProtoBlock({
    opcode: 'argument_reporter_string_number',
    inputs: {
        VALUE: StringField,
    },
    execute: function* ({VALUE}, ctx) {
        return ctx.getParam(VALUE);
    },
    colorCategory: 'procedures',
});

export const argument_reporter_boolean = new ProtoBlock({
    opcode: 'argument_reporter_boolean',
    inputs: {
        VALUE: StringField,
    },
    execute: function* ({VALUE}, ctx) {
        return ctx.getParam(VALUE);
    },
    colorCategory: 'procedures',
});

/**
 * Internal
 */
export const internal_noop = new ProtoBlock({
    opcode: 'internal_noop',
    inputs: {},
    execute: function* () {},
    colorCategory: 'procedures',
});

const consoleBlock = (fn: 'log' | 'warn' | 'error') =>
    new ProtoBlock({
        opcode: 'internal_scratchAddons_' + fn,
        inputs: {
            arg0: AnyInput,
        },
        execute: function* ({arg0}, ctx) {
            const message = ctx.evaluateFast(arg0);
            let prefix: string[] = [];
            if (arg0 instanceof Block) {
                const opcode = arg0.proto.opcode;
                const text =
                    opcode === 'data_variable' ?
                        (arg0.inputValues.VARIABLE as typeof VariableField.value.values).value :
                        opcode === 'data_listcontents' ?
                            (arg0.inputValues.LIST as typeof VariableField.value.values).value :
                            opcode === 'argument_reporter_string_number' ?
                                arg0.inputValues.VALUE as string :
                                opcode === 'argument_reporter_boolean' ?
                                    arg0.inputValues.VALUE as string :
                                    opcode.split('_')[1];
                prefix = [
                    '%c %s ',
                    'background-color:' + ctx.theme.blocks[arg0.proto.colorCategory].primary + ';' +
                    'color:' + ctx.theme.text + ';' +
                    'border-radius:2em',
                    text,
                ];
            }
            // eslint-disable-next-line no-console
            console[fn](...prefix, message);
        },
        colorCategory: 'procedures',
    });

export const internal_scratchAddons_log = consoleBlock('log');
export const internal_scratchAddons_warn = consoleBlock('warn');
export const internal_scratchAddons_error = consoleBlock('error');
