import {NumberInput, ProtoBlock, StackInput, StringInput} from './block.js';
import {isWhiteSpace, toNumber, toString} from './cast.js';
import {GreenFlagEvent} from './events.js';
import BlockContext from './interpreter/block-context.js';
import Target from './target.js';

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
        ctx.target.moveTo(ctx.target.x + dx, ctx.target.y + dy);
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
        TO: StringInput,
    },
    execute: function* ({TO}, ctx) {
        return ctx.evaluateFast(TO);
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
        const x = (Math.random() * ctx.stageSize.width) - (ctx.stageSize.width / 2);
        const y = (Math.random() * ctx.stageSize.height) - (ctx.stageSize.height / 2);
        return {x, y};
    }

    const other = ctx.project.getTargetByName(name);
    if (other) return {x: other.x, y: other.y};

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
            yield* glideTo(ctx.target.x, ctx.target.y, position.x, position.y, duration, ctx);
        }
    },
});

export const motion_glideto_menu = new ProtoBlock({
    opcode: 'motion_glideto_menu',
    inputs: {
        TO: StringInput,
    },
    execute: function* ({TO}, ctx) {
        return ctx.evaluateFast(TO);
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

        yield* glideTo(ctx.target.x, ctx.target.y, endX, endY, duration, ctx);
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
        TOWARDS: StringInput,
    },
    execute: function* ({TOWARDS}, ctx) {
        return ctx.evaluateFast(TOWARDS);
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
            const dx = position.x - ctx.target.x;
            const dy = position.y - ctx.target.y;
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
        ctx.target.moveTo(ctx.target.x + dx, ctx.target.y);
    },
});

export const motion_setx = new ProtoBlock({
    opcode: 'motion_setx',
    inputs: {
        X: NumberInput,
    },
    execute: function* ({X}, ctx) {
        const x = toNumber(ctx.evaluateFast(X));
        ctx.target.moveTo(x, ctx.target.y);
    },
});

export const motion_changeyby = new ProtoBlock({
    opcode: 'motion_changeyby',
    inputs: {
        DY: NumberInput,
    },
    execute: function* ({DY}, ctx) {
        const dy = toNumber(ctx.evaluateFast(DY));
        ctx.target.moveTo(ctx.target.x, ctx.target.y + dy);
    },
});

export const motion_sety = new ProtoBlock({
    opcode: 'motion_sety',
    inputs: {
        Y: NumberInput,
    },
    execute: function* ({Y}, ctx) {
        const y = toNumber(ctx.evaluateFast(Y));
        ctx.target.moveTo(ctx.target.x, y);
    },
});

// TODO: motion_ifonedgebounce (requires sprite fencing)

export const motion_setrotationstyle = new ProtoBlock({
    opcode: 'motion_setrotationstyle',
    inputs: {
        STYLE: StringInput,
    },
    execute: function* ({STYLE}, ctx) {
        const style = toString(ctx.evaluateFast(STYLE));
        if (style === 'left-right' || style === 'don\'t rotate' || style === 'all around') {
            ctx.target.rotationStyle = style;
        }
    },
});

export const motion_xposition = new ProtoBlock({
    opcode: 'motion_xposition',
    inputs: {},
    execute: function* (_, ctx) {
        return ctx.target.x;
    },
    pure: true,
});

export const motion_yposition = new ProtoBlock({
    opcode: 'motion_yposition',
    inputs: {},
    execute: function* (_, ctx) {
        return ctx.target.y;
    },
    pure: true,
});

export const motion_direction = new ProtoBlock({
    opcode: 'motion_direction',
    inputs: {},
    execute: function* (_, ctx) {
        return ctx.target.direction;
    },
    pure: true,
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

const setBackdrop = function(stage: Target, backdrop: string | number | boolean) {
    if (typeof backdrop === 'number') {
        stage.currentCostume = backdrop - 1;
        return;
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
        if (numBackdrops <= 1) return;
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
};

export const looks_costume = new ProtoBlock({
    opcode: 'looks_costume',
    inputs: {
        COSTUME: StringInput,
    },
    execute: function* ({COSTUME}, ctx) {
        return ctx.evaluateFast(COSTUME);
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
        BACKDROP: StringInput,
    },
    execute: function* ({BACKDROP}, ctx) {
        return ctx.evaluateFast(BACKDROP);
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
        setBackdrop(ctx.stage, costume);
    },
});

// TODO: "switch backdrop to and wait" (requires thread parking support)

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
        FRONT_BACK: StringInput,
    },
    execute: function* ({FRONT_BACK}, ctx) {
        const frontBack = toString(ctx.evaluateFast(FRONT_BACK));
        if (frontBack === 'front') {
            ctx.project.moveTargetToFront(ctx.target);
        } else if (frontBack === 'back') {
            ctx.project.moveTargetToBack(ctx.target);
        }
    },
});

export const looks_goforwardbackwardlayers = new ProtoBlock({
    opcode: 'looks_goforwardbackwardlayers',
    inputs: {
        NUM: NumberInput,
        FORWARD_BACKWARD: StringInput,
    },
    execute: function* ({NUM, FORWARD_BACKWARD}, ctx) {
        let num = toNumber(ctx.evaluateFast(NUM));
        const forwardBackward = toString(ctx.evaluateFast(FORWARD_BACKWARD));
        if (forwardBackward === 'backward') num = -num;
        ctx.project.moveTargetForwardBackwardLayers(ctx.target, num);
    },
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
