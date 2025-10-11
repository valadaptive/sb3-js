import {Block} from './block.js';
import Costume, {CostumeParams} from './costume.js';
import {GreenFlagEvent, KeyPressedEvent} from './events.js';
import IO from './io.js';
import Interpreter from './interpreter/interpreter.js';
import {Loader, WebLoader, ZipLoader, ZipSrc} from './loader.js';
import parseProject, {ParseProjectParams} from './parser.js';
import Project, {CreateMonitorEvent, QuestionEvent} from './project.js';
import Renderer from './renderer/renderer.js';
import Sound from './sound.js';
import Target from './target.js';
import {TypedEvent} from './typed-events.js';
import Thread from './interpreter/thread.js';
import Rectangle from './rectangle.js';
import {InternalStageElement} from './html/stage.js';
import {Theme, defaultTheme} from './theme.js';
import {Monitor, MonitorView} from './monitor.js';
import {RespondEvent} from './html/answer-box.js';
import anyAbortSignal from './util/any-abort-signal.js';
import AudioEngine from './audio/audio-engine.js';
import decodeADPCM from './audio/decode-adpcm.js';

/** Time between each interpreter step (aka framerate). */
const STEP_TIME = 1000 / 30;

export type RuntimeSettings = {
    theme?: Theme;
    username?: string;
};

export default class Runtime {
    public stepTime: number = STEP_TIME;
    public stageBounds = Rectangle.fromBounds(-240, 240, -180, 180);

    public audio: AudioEngine;
    private project: Project | null = null;
    private interpreter: Interpreter;
    public renderer: Renderer | null = null;
    private io: IO;
    private stage: InternalStageElement | null = null;
    private stageAbortController: AbortController | null = null;
    private theme: Theme;
    private monitorViews: Map<Monitor, {view: MonitorView<unknown>; abort: AbortController}> = new Map();

    private dragOffset: {x: number; y: number} | null = null;
    private draggedTarget: Target | null = null;

    private steppingInterval: NodeJS.Timeout | null = null;

    private unregisterPreviousProject: (() => void) | null = null;
    private unsetPreviousStage: (() => void) | null = null;

    constructor(settings?: RuntimeSettings) {
        this.audio = new AudioEngine();
        this.io = new IO();
        this.theme = settings?.theme ?? defaultTheme;
        this.interpreter = new Interpreter(this.stepTime, {
            io: this.io,
            stageBounds: this.stageBounds,
            renderer: null,
            audio: this.audio,
            theme: this.theme,
        });
        this.io.username = settings?.username ?? '';

        this.io.addEventListener('dragstart', event => {
            if (!this.project || !this.renderer) return;
            const {x, y} = event;
            const target = this.renderer.pick(this.project.targets, x, y);
            if (target?.draggable) {
                this.dragOffset = {x: target.position.x - x, y: target.position.y - y};
                this.draggedTarget = target;
                target.dragging = true;
                this.project.moveTargetToFront(target);
            }
        });

        this.io.addEventListener('dragstop', () => {
            if (this.draggedTarget) {
                this.draggedTarget.dragging = false;
            }
            this.draggedTarget = null;
            this.dragOffset = null;
        });
    }

    public async loadProjectFromLoader(loader: Loader, params?: ParseProjectParams): Promise<Project> {
        const manifest = await loader.loadProjectManifest();
        return parseProject(manifest, loader, this, params);
    }

    public async loadProjectFromID(id: string, params?: ParseProjectParams): Promise<Project> {
        const loader = new WebLoader(id, params?.signal);
        return this.loadProjectFromLoader(loader, params);
    }

    public async loadProjectFromZip(zip: ZipSrc, params?: ParseProjectParams): Promise<Project> {
        const loader = new ZipLoader(zip, params?.signal);
        return this.loadProjectFromLoader(loader, params);
    }

    public setProject(project: Project | null) {
        if (this.unregisterPreviousProject) {
            this.unregisterPreviousProject();
            this.unregisterPreviousProject = null;
        }

        this.project = project;
        if (!project) return;

        this.interpreter.setProject(project);

        const controller = new AbortController();
        project.addEventListener(
            'createmonitor',
            this.handleMonitorCreated.bind(this, controller.signal),
            {signal: controller.signal},
        );
        for (const {monitor} of project.monitors) {
            this.handleMonitorCreated(controller.signal, new CreateMonitorEvent(monitor));
        }
        project.addEventListener('question', this.handleQuestionAsked.bind(this), {signal: controller.signal});

        const unregisterProject = project.register();
        this.unregisterPreviousProject = () => {
            this.stopAll();
            this.project = null;
            this.stop();
            for (const {monitor} of project.monitors) {
                this.removeMonitorView(monitor);
            }
            this.penLayer?.clear();
            unregisterProject();
            controller.abort();
            this.interpreter.setProject(null);
        };
    }

    public attachStage(stage: InternalStageElement | null) {
        if (this.unsetPreviousStage) {
            this.unsetPreviousStage();
            this.unsetPreviousStage = null;
        }

        if (!stage) return;

        const renderer = this.renderer = new Renderer(stage.canvas, this.stageBounds);
        this.interpreter.setRenderer(renderer);
        // Allow stage to receive keyboard events
        stage.tabIndex = 0;
        this.stageAbortController = this.setupEventListeners(stage);
        this.stage = stage;

        this.unsetPreviousStage = () => {
            this.renderer = null;
            this.interpreter.setRenderer(null);
            this.stage = null;
            renderer.destroy();
            this.stageAbortController?.abort();
            this.stageAbortController = null;
        };
    }

    private setupEventListeners(stage: InternalStageElement) {
        if (!this.renderer) return null;
        const abortController = new AbortController();
        const signal = abortController.signal;

        const stageCoordsFromPointerEvent = (event: PointerEvent): {x: number; y: number} => {
            const rect = stage.getBoundingClientRect();
            let x = (event.clientX - rect.left) * (this.stageBounds.width / rect.width);
            let y = (event.clientY - rect.top) * (this.stageBounds.height / rect.height);
            x = Math.max(
                this.stageBounds.left,
                Math.min(
                    this.stageBounds.right,
                    Math.round(x + this.stageBounds.left)));
            y = Math.max(
                this.stageBounds.bottom,
                Math.min(
                    this.stageBounds.top,
                    Math.round(y + this.stageBounds.bottom)));

            return {x, y: -y};
        };

        window.addEventListener('pointermove', event => {
            const {x, y} = stageCoordsFromPointerEvent(event);
            this.io.moveMouse(x, y);
        }, {signal});

        stage.canvas.addEventListener('pointerdown', event => {
            const {x, y} = stageCoordsFromPointerEvent(event);
            this.io.pressMouse(x, y);
            if (!this.project || !this.renderer) return;
            // If no target is clicked, always count the stage as being clicked even if it's transparent where the
            // cursor is.
            const clickedTarget = this.renderer.pick(this.project.targets, x, y) ?? this.project.stage;
            if (clickedTarget && !clickedTarget.draggable) {
                // Non-draggable targets start "when clicked" hats when mouse pressed
                clickedTarget?.click();
            }
        }, {signal});

        window.addEventListener('pointerup', event => {
            const {x, y} = stageCoordsFromPointerEvent(event);
            if (!this.project || !this.renderer) return;
            const clickedTarget = this.renderer.pick(this.project.targets, x, y) ?? this.project.stage;
            const wasDragging = clickedTarget?.dragging;
            this.io.releaseMouse(x, y);
            // Dragging targets don't count as being clicked. I can't tell where Scratch does this, but it does.
            if (clickedTarget && clickedTarget.draggable && !wasDragging) {
                // Draggable targets start "when clicked" hats when mouse released
                clickedTarget?.click();
            }
        }, {signal});

        stage.canvas.addEventListener('keydown', event => {
            const key = IO.domToScratchKey(event.key);
            if (key === null) return;

            event.preventDefault();
            this.io.pressKey(key);
            this.interpreter.startHats(new KeyPressedEvent(key));
        }, {signal});

        window.addEventListener('keyup', event => {
            const key = IO.domToScratchKey(event.key);
            if (key === null) return;

            this.io.releaseKey(key);
        }, {signal});

        signal.addEventListener('abort', () => {
            this.io.resetKeys();
        });

        return abortController;
    }

    public destroy() {
        this.setProject(null);
    }

    public start() {
        if (this.steppingInterval) return;
        this.steppingInterval = setInterval(this.step.bind(this), this.stepTime);
        // Step once immediately
        this.step();
    }

    public stop() {
        if (!this.steppingInterval) return;
        clearInterval(this.steppingInterval);
        this.steppingInterval = null;
    }

    public async loadSound(name: string, src: Blob): Promise<Sound> {
        const buffer = await src.arrayBuffer();
        let audioBuffer = null;
        try {
            audioBuffer = await this.audio.loadSound(buffer);
        } catch {
            try {
                audioBuffer = decodeADPCM(new Uint8Array(buffer));
            } catch (err) {
                // eslint-disable-next-line no-console
                console.warn(`Failed to decode sound "${name}"`, err);
            }
        }
        return new Sound(name, audioBuffer);
    }

    public async loadCostume(name: string, src: Blob, params: CostumeParams): Promise<Costume> {
        return Costume.load(name, src, params);
    }

    public requestRedraw() {
        this.interpreter.requestRedraw();
    }

    public launchScript(
        script: Block[],
        target: Target,
        event: TypedEvent | null,
        restartExistingThreads: boolean,
    ) {
        return this.interpreter.launch(script, target, event, restartExistingThreads);
    }

    public get penLayer() {
        return this.renderer?.penLayer;
    }

    public greenFlag() {
        this.stopAll();
        this.interpreter.startHats(new GreenFlagEvent());
    }

    public stopAll() {
        this.interpreter.stopAllThreads();
        this.project?.stopAll();
    }

    public stopTargetThreads(target: Target, exceptFor?: Thread) {
        this.interpreter.stopTargetThreads(target, exceptFor);
    }

    private step() {
        if (!this.project) {
            throw new Error('Cannot step without a project');
        }
        this.project.step();

        if (this.draggedTarget && this.dragOffset) {
            const {x, y} = this.io.mousePosition;
            this.draggedTarget.moveTo(x + this.dragOffset.x, y + this.dragOffset.y, true);
        }

        // Loudness updates once per frame
        this.audio.resetCachedLoudness();

        for (const target of this.project.targets) {
            for (const {hat, script} of target.sprite.edgeActivatedScripts) {
                this.interpreter.launch(script, target, null, hat.hat!.restartExistingThreads);
            }
        }

        this.interpreter.stepThreads();
        // Step monitors after threads to capture the latest values
        this.stepMonitors();
        this.renderer?.draw(this.project.targets);
    }

    private stepMonitors() {
        if (!this.project) return;
        const {monitors, stage} = this.project;
        if (!stage) throw new Error('Project has no stage');

        for (const {monitor, updateMonitorBlock} of monitors) {
            if (!monitor.visible) continue;
            this.interpreter.launch([updateMonitorBlock], monitor.target ?? stage, null, true);
        }
    }

    private handleMonitorUpdated(monitor: Monitor) {
        if (!this.project || !this.stage) return;

        if (!monitor.visible) {
            this.removeMonitorView(monitor);
            return;
        }

        // Fetch or create the view for this monitor
        let viewAndAbortController = this.monitorViews.get(monitor);
        if (!viewAndAbortController) {
            const view = this.stage.createMonitorView() as MonitorView<unknown>;
            const abort = new AbortController();
            viewAndAbortController = {
                view,
                abort,
            };
            this.monitorViews.set(monitor, viewAndAbortController);
            view.addEventListener('sliderchange', event => {
                const sliderHandler = monitor.block.proto.monitorSliderHandler;
                if (!sliderHandler) return;
                const target = monitor.target ?? this.project?.stage;
                if (!target) {
                    throw new Error('Project not set');
                }
                sliderHandler(monitor.block.inputValues, target, event.value);
            }, {signal: abort.signal});
        }

        const {view} = viewAndAbortController;
        view.update(monitor);

        // First time showing this monitor and there's no position yet. We need to render the monitor once to get
        // its size, then once more to position it.
        if (!monitor.position) {
            const monitorRects = [];
            for (const {monitor: otherMonitor} of this.project.monitors) {
                if (otherMonitor === monitor) continue;
                const viewAndAbortController = this.monitorViews.get(otherMonitor);
                if (!viewAndAbortController) continue;
                const bounds = viewAndAbortController.view.getBounds();
                if (bounds) monitorRects.push(bounds);
            }
            monitor.update({position: view.layout(monitorRects)});
            view.update(monitor);
        }

        const colorCategory = monitor.block.proto.colorCategory;
        if (colorCategory) view.setColor(this.theme.text, this.theme.blocks[colorCategory].primary);
    }

    private handleMonitorCreated(signal: AbortSignal, event: CreateMonitorEvent) {
        if (!this.stage) return;
        const {monitor} = event;
        monitor.addEventListener('updatemonitor', this.handleMonitorUpdated.bind(this, monitor), {signal});
    }

    private removeMonitorView(monitor: Monitor) {
        const viewAndAbortController = this.monitorViews.get(monitor);
        if (viewAndAbortController) {
            viewAndAbortController.view.remove();
            viewAndAbortController.abort.abort();
            this.monitorViews.delete(monitor);
        }
    }

    private handleQuestionAsked(event: QuestionEvent) {
        if (!this.stage) return;
        const answerBox = this.stage.answerBox;
        const question = event.question;
        // Need to cancel the event handler either when the stage is unregistered or when we get an answer
        const answerController = new AbortController();

        answerBox.addEventListener('respond', event => {
            answerBox.hide();
            question.respond((event as RespondEvent).answer);
            answerController.abort();
        }, {signal: anyAbortSignal(this.stageAbortController?.signal, answerController.signal)});

        question.addEventListener('cancel', () => {
            answerBox.hide();
            answerController.abort();
        }, {signal: anyAbortSignal(this.stageAbortController?.signal, answerController.signal)});

        answerBox.show();
    }
}
