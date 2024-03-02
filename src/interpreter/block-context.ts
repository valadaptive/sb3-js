import {Block, BlockGenerator} from '../block.js';
import IO from '../io.js';
import Project from '../project.js';
import Target from '../target.js';

import Interpreter from './interpreter.js';
import Thread, {ThreadStatus} from './thread.js';

export type BlockContextParams = {
    io: IO;
    stageSize: {width: number; height: number};
};

export default class BlockContext {
    public interpreter: Interpreter;
    public io: IO;
    public stageSize: {width: number; height: number};
    public project!: Project;
    public target!: Target;
    public thread!: Thread;

    constructor(interpreter: Interpreter, params: BlockContextParams) {
        this.interpreter = interpreter;
        this.io = params.io;
        this.stageSize = params.stageSize;
    }

    *evaluate(input: Block | Block[] | string | number | boolean): BlockGenerator {
        if (Array.isArray(input)) {
            return yield* this.thread.evaluateScript(input);
        }
        if (typeof input === 'string' || typeof input === 'number' || typeof input === 'boolean') {
            return input;
        }
        return yield* this.thread.evaluateBlock(input);
    }

    /**
     * Faster version of evaluate that doesn't require a generator. Blocks are *not* allowed to perform side effects
     * before calling this, as it works by throwing a promise and then re-calling the block function with the resolved
     * value if it needs to evaluate an asynchronous reporter.
     * @param input The input to evaluate.
     */
    evaluateFast(input: Block | string | number | boolean): string | number | boolean {
        const generator = this.evaluate(input);
        const {done, value} = generator.next();
        if (done) {
            if (typeof value === 'undefined' || value === null) {
                throw new Error('Block returned undefined or null');
            }
            return value;
        } else {
            throw new Error('Operand tried to yield (currently not supported)');
        }
    }

    /**
     * Yield the current thread and move on to the next one.
     */
    *yieldThread() {
        yield;
    }

    /**
     * Await a promise. This is only necessary to get the correct type for the promise result, because TypeScript isn't
     * expressive enough to have the type of a yield expression depend on the type of the expression being yielded:
     * https://github.com/microsoft/TypeScript/issues/36967
     * @param promise The promise to await.
     * @returns The result of the promise.
     */
    *await<T>(promise: Promise<T>): Generator<Promise<T>, T, T> {
        return yield promise;
    }

    stopThread() {
        this.thread.status = ThreadStatus.DONE;
    }
}
