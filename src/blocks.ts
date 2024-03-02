import {NumberInput, ProtoBlock, StackInput, StringInput} from './block.js';
import {toNumber, toString} from './cast.js';
import {GreenFlagEvent} from './events.js';

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

export const motion_goto = new ProtoBlock({
    opcode: 'motion_goto',
    inputs: {
        TO: StringInput,
    },
    execute: function* ({TO}, ctx) {
        const target = toString(ctx.evaluateFast(TO));
        if (target === '_mouse_') {
            const x = ctx.io.mousePosition.x;
            const y = ctx.io.mousePosition.y;
            ctx.target.moveTo(x, y);
        } else if (target === '_random_') {
            const x = (Math.random() * ctx.stageSize.width) - (ctx.stageSize.width / 2);
            const y = (Math.random() * ctx.stageSize.height) - (ctx.stageSize.height / 2);
            ctx.target.moveTo(x, y);
        } else {
            const other = ctx.project.getTargetByName(target);
            if (other) {
                ctx.target.moveTo(other.x, other.y);
            }
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

export const motion_pointindirection = new ProtoBlock({
    opcode: 'motion_pointindirection',
    inputs: {
        DIRECTION: NumberInput,
    },
    execute: function* ({DIRECTION}, ctx) {
        ctx.target.direction = toNumber(ctx.evaluateFast(DIRECTION));
    },
});


/**
 * Looks
 */

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
        const timer = new Promise<void>(resolve => {
            setTimeout(resolve, duration * 1000);
        });
        yield* ctx.await(timer);
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
