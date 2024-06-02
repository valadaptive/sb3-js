import Target from './target.js';
import Sprite from './sprite.js';
import {
    Monitor,
    updateMonitor,
    ScalarMonitor,
    ListMonitor,
    ScalarMonitorParams,
    ListMonitorParams,
    listMonitorContents,
} from './monitor.js';
import {Block, BlockInputShape, BlockInputValueShapeFor, ProtoBlock, VariableField} from './block.js';
import {TypedEvent, TypedEventTarget} from './typed-events.js';
import Thread, {ThreadStatus} from './interpreter/thread.js';
import {data_listcontents} from './blocks.js';

export class CreateMonitorEvent extends TypedEvent<'createmonitor'> {
    constructor(public readonly monitor: Monitor) {
        super('createmonitor');
    }
}

export class QuestionEvent extends TypedEvent<'question'> {
    constructor(public readonly question: Question) {
        super('question');
    }
}

export class AnswerEvent extends TypedEvent<'answer'> {
    constructor(public readonly answer: string) {
        super('answer');
    }
}

export class QuestionCancelEvent extends TypedEvent<'cancel'> {
    constructor() {
        super('cancel');
    }
}

export class Question extends TypedEventTarget<AnswerEvent | QuestionCancelEvent> {
    constructor(
        public readonly prompt: string | number | boolean,
        public readonly target: Target,
        public readonly thread: Thread,
        public readonly threadGeneration: number,
    ) {
        super();
    }

    respond(answer: string) {
        this.dispatchEvent(new AnswerEvent(answer));
    }

    cancel() {
        this.dispatchEvent(new QuestionCancelEvent());
    }
}

export default class Project extends TypedEventTarget<CreateMonitorEvent | QuestionEvent> {
    public readonly targets: Target[] = [];
    public readonly sprites: Sprite[] = [];
    public readonly monitors: readonly {
        monitor: Monitor;
        updateMonitorBlock: Block<typeof updateMonitor>;
    }[] = [];
    public stage: Target | null = null;
    public cloneCount = 0;
    public timerStart: number = Date.now();
    public currentMSecs: number = this.timerStart;
    public answer = '';

    private questionQueue: Question[] = [];

    register(): () => void {
        const unregisterCallbacks: (() => void)[] = [];

        for (const target of this.targets) {
            unregisterCallbacks.push(target.destroy.bind(target));
        }

        for (const sprite of this.sprites) {
            unregisterCallbacks.push(sprite.destroy.bind(sprite));
        }

        return () => {
            for (const unregister of unregisterCallbacks) {
                unregister();
            }
        };
    }

    public addTargetWithSprite(sprite: Sprite, target: Target) {
        if (sprite.isStage) {
            if (this.stage) throw new Error('Cannot have multiple stage targets');
            this.stage = target;
        }
        this.targets.push(target);
        this.sprites.push(sprite);
    }

    public getTargetByName(name: string): Target | null {
        return this.targets.find(target => target.sprite.name === name && target.isOriginal) ?? null;
    }

    public moveTargetToFront(target: Target) {
        if (target.sprite.isStage) return;
        const currentIndex = this.targets.indexOf(target);
        if (currentIndex === -1) return;

        this.targets.splice(currentIndex, 1);
        this.targets.push(target);
    }

    public moveTargetToBack(target: Target) {
        if (target.sprite.isStage) return;
        const currentIndex = this.targets.indexOf(target);
        if (currentIndex === -1) return;

        this.targets.splice(currentIndex, 1);
        // Index 0 is reserved for the stage
        this.targets.splice(1, 0, target);
    }

    public moveTargetForwardBackwardLayers(target: Target, n: number) {
        if (target.sprite.isStage) return;
        const currentIndex = this.targets.indexOf(target);
        if (currentIndex === -1) return;

        const newIndex = currentIndex + n;

        this.targets.splice(currentIndex, 1);
        // splice properly handles clamping the upper bound, but we need to clamp the lower bound ourselves because
        // index 0 is reserved for the stage
        this.targets.splice(Math.max(newIndex, 1), 0, target);
    }

    public addTargetBehindTarget(target: Target, otherTarget: Target) {
        const currentIndex = this.targets.indexOf(otherTarget);

        this.targets.splice(currentIndex, 0, target);
    }

    public stopAll() {
        // Remove all clones and reset targets' state
        let nextOriginalTargetIndex = 0;
        for (let i = 0; i < this.targets.length; i++) {
            const target = this.targets[i];
            if (target.isOriginal) {
                this.targets[nextOriginalTargetIndex] = target;
                target.reset();
                nextOriginalTargetIndex++;
            } else {
                target.destroy();
            }
        }
        this.cloneCount = 0;
        this.targets.length = nextOriginalTargetIndex;
        // Reset timer when the project is stopped
        this.timerStart = this.currentMSecs;
        // Clear question queue immediately
        while (this.questionQueue.length > 0) {
            this.questionQueue.shift()!.cancel();
        }
    }

    private askNextQuestion() {
        if (this.questionQueue.length === 0) return;
        const question = this.questionQueue[0];

        let bubbleId: symbol | undefined;
        if (!question.target.sprite.isStage) {
            bubbleId = question.target.setTextBubble('ask', question.prompt);
        }

        const onAnswerOrCancel = (event: AnswerEvent | QuestionCancelEvent) => {
            this.questionQueue.shift();
            this.askNextQuestion();
            if (event instanceof AnswerEvent) this.answer = event.answer;
            if (bubbleId && question.target.textBubble?.id === bubbleId) {
                question.target.setTextBubble('ask', '');
            }
        };

        this.dispatchEvent(new QuestionEvent(question));
        question.addEventListener('answer', onAnswerOrCancel);
        question.addEventListener('cancel', onAnswerOrCancel);
    }

    public async ask(question: Question) {
        this.questionQueue.push(question);
        if (this.questionQueue.length === 1) {
            this.askNextQuestion();
        }

        await new Promise(resolve => {
            question.addEventListener('answer', resolve);
            question.addEventListener('cancel', resolve);
        });
    }

    public step() {
        for (let i = 0; i < this.questionQueue.length; i++) {
            const question = this.questionQueue[i];
            // Filter out questions being asked by threads that are no longer running or have been restarted
            if (
                question.thread.status === ThreadStatus.DONE ||
                question.thread.generation !== question.threadGeneration
            ) {
                this.questionQueue.splice(i, 1);
                i--;
                // Remove the question from the queue before emitting the cancel event so that askNextQuestion doesn't
                // try to ask the same question again
                question.cancel();
            }
        }
    }

    public removeTarget(target: Target) {
        const index = this.targets.indexOf(target);
        if (index === -1) return;

        if (!target.isOriginal) {
            this.cloneCount--;
        }

        this.targets.splice(index, 1);
        target.destroy();
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    public getOrCreateMonitorFor<P extends ProtoBlock<string, any>>(
        proto: P,
        inputValues: P extends ProtoBlock<string, infer MyInputs>
            ? {[key in keyof MyInputs]: BlockInputShape<MyInputs[key]>}
            : never,
        target: Target | null,
        params?: Partial<ScalarMonitorParams> | Partial<ListMonitorParams>,
    ): Monitor {
        if (proto === data_listcontents) {
            // data_listcontents returns a stringified list; we want to replace it with a block that returns the list
            // itself
            proto = listMonitorContents as P;
        }
        for (const {monitor} of this.monitors) {
            const innerBlock = monitor.block;
            if (innerBlock.proto !== proto) continue;
            if (monitor.target !== target) continue;
            for (const key in proto.inputs) {
                if (!Object.prototype.hasOwnProperty.call(proto.inputs, key)) continue;
                // If variable field, check if the variable names match. Otherwise, do normal comparison. Special-casing
                // this is a bit ugly, but I want to phase out VariableField and just use variable names everywhere so
                // we can remove this code then.
                const inputsMatch = proto .inputs[key] === VariableField ?
                    (innerBlock.inputValues[key] as BlockInputValueShapeFor<typeof VariableField>).value ===
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        (inputValues[key] as any).value :
                    innerBlock.inputValues[key] === inputValues[key];
                if (!inputsMatch) {
                    continue;
                }
                return monitor;
            }
        }
        const monitoredBlock = new Block({proto, inputValues, id: Symbol('createdMonitor')});
        if (!proto.monitorLabel) {
            throw new Error(`Block ${proto.opcode} must have a monitor label function in order to be monitored`);
        }
        const monitorMode = params?.mode ?? {mode: 'default'};
        let monitor;
        if (monitorMode.mode === 'list') {
            monitor = new ListMonitor(target, monitoredBlock, Object.assign({
                visible: true,
                mode: 'list',
                position: null,
                label: proto.monitorLabel(inputValues),
                size: {width: 0, height: 0},
            }, (params ?? {}) as Partial<ListMonitorParams>));
        } else {
            monitor = new ScalarMonitor(target, monitoredBlock, Object.assign({
                visible: true,
                mode: 'default',
                position: null,
                label: proto.monitorLabel(inputValues),
            }, (params ?? {}) as Partial<ScalarMonitorParams>));
        }

        this.addMonitor(monitor);
        return monitor;
    }

    private addMonitor(monitor: Monitor) {
        const updateMonitorBlock = new Block({
            proto: updateMonitor,
            id: Symbol('updateMonitor'),
            inputValues: {MONITOR: monitor},
        });
        (this.monitors as {
            monitor: Monitor;
            updateMonitorBlock: Block;
        }[]).push({monitor, updateMonitorBlock});
        this.dispatchEvent(new CreateMonitorEvent(monitor));
    }
}
