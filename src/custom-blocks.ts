import {Block, BlockInput, ProtoBlock, AnyInput} from './block.js';
import {STOP_THIS_SCRIPT} from './interpreter/thread.js';

const STUB = function*() {};

export type CustomBlockStub = {
    proto: ProtoBlock;
    init: (childScript: Block[] | null) => void;
};

/**
 * Create a stub for a custom block. This is needed because in the parser, we replace each procedures_call block with
 * the proto block returned here when parsing scripts, so we can't pass in the child script until all the custom blocks
 * have been gathered.
 */
export const makeCustomBlockStub = (
    proccode: string,
    argumentids: string[],
    argumentnames: string[],
    argumentdefaults: (string | number | boolean)[],
    warp: boolean,
) => {
    const inputs: Record<string, BlockInput> = {};

    const argIdsToNames: Record<string, string> = {};
    const argDefaults: Record<string, string | number | boolean> = {};
    for (let i = 0; i < argumentids.length; i++) {
        const argumentId = argumentids[i];
        const argumentName = argumentnames[i];
        const argumentDefault = argumentdefaults[i];

        // Input type that can take any value and defaults to `false` like unplugged Boolean inputs. This lets us handle
        // unplugged inputs without having to parse the proccode.
        inputs[argumentId] = AnyInput;
        argIdsToNames[argumentId] = argumentName;
        argDefaults[argumentId] = argumentDefault;
    }

    const proto = new ProtoBlock({
        opcode: proccode,
        inputs,
        execute: STUB,
    });

    return {
        proto,
        init: (childScript: Block[] | null) => {
            proto.execute = function*(args, ctx) {
                if (!childScript) return;

                // Evaluate the custom block arguments
                const params: Record<string, string | number | boolean> = {};
                for (const argId in args) {
                    if (!Object.prototype.hasOwnProperty.call(args, argId)) continue;
                    const argName = argIdsToNames[argId];
                    const argValue = yield* ctx.evaluate(args[argId] as string | number | boolean | Block);
                    params[argName] = argValue ?? argDefaults[argId];
                }

                ctx.pushFrame(proto, params, warp);
                if (!ctx.warpMode && ctx.isRecursiveCall(proto)) {
                    // TODO: if there are no visual updates, this isn't enough to prevent a busy-loop of recursive calls
                    // that causes an InternalError from excessive recursion. scratch-vm is more than happy to do so
                    // since it has its own call stack and will loop forever, eating up more and more memory.
                    yield;
                }
                try {
                    yield* ctx.evaluate(childScript);
                } catch (e) {
                    if (e !== STOP_THIS_SCRIPT) throw e;
                }
                ctx.popFrame(warp);
            };
        },
    };
};
