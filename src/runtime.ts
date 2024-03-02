import {Block} from './block.js';
import {STAGE_SIZE} from './constants.js';
import Costume, {CostumeParams} from './costume.js';
import {GreenFlagEvent} from './events.js';
import Interpreter from './interpreter/interpreter.js';
import {Loader, WebLoader, ZipLoader, ZipSrc} from './loader.js';
import parseProject from './parser.js';
import Project from './project.js';
import Renderer from './renderer/renderer.js';
import Sound from './sound.js';
import Target from './target.js';
import {TypedEvent, TypedEventTarget} from './typed-events.js';

/** Time between each interpreter step (aka framerate). */
const STEP_TIME = 1000 / 30;

export default class Runtime extends TypedEventTarget<GreenFlagEvent> {
    public stepTime: number = STEP_TIME;
    public stageSize = STAGE_SIZE;

    private audioContext: AudioContext;
    private project: Project | null = null;
    private interpreter: Interpreter;
    private renderer: Renderer | null = null;
    private steppingInterval: NodeJS.Timeout | null = null;

    private unregisterPreviousProject: (() => void) | null = null;

    constructor() {
        super();
        this.audioContext = new AudioContext();
        this.interpreter = new Interpreter(this.stepTime);
    }

    public async loadProjectFromLoader(loader: Loader): Promise<Project> {
        const manifest = await loader.loadProjectManifest();
        return parseProject(manifest, loader, this);
    }

    public async loadProjectFromID(id: string): Promise<Project> {
        const loader = new WebLoader(id);
        return this.loadProjectFromLoader(loader);
    }

    public async loadProjectFromZip(zip: ZipSrc): Promise<Project> {
        const loader = new ZipLoader(zip);
        return this.loadProjectFromLoader(loader);
    }

    public setProject(project: Project | null) {
        if (this.unregisterPreviousProject) {
            this.unregisterPreviousProject();
            this.unregisterPreviousProject = null;
        }

        this.project = project;
        if (!project) return;

        this.unregisterPreviousProject = project.register();
    }

    public setCanvas(canvas: HTMLCanvasElement) {
        this.renderer = new Renderer(canvas, this.stageSize);
    }

    public destroy() {
        this.stop();
        this.setProject(null);
    }

    public start() {
        if (this.steppingInterval) return;
        this.steppingInterval = setInterval(this.step.bind(this), this.stepTime);
    }

    public stop() {
        if (!this.steppingInterval) return;
        clearInterval(this.steppingInterval);
        this.steppingInterval = null;
    }

    public async loadSound(name: string, src: Blob): Promise<Sound> {
        const buffer = await src.arrayBuffer();
        const audioBuffer = await this.audioContext.decodeAudioData(buffer);
        return new Sound(name, audioBuffer, this.audioContext);
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
        this.interpreter.launch(script, target, event, restartExistingThreads);
    }

    public greenFlag() {
        this.dispatchEvent(new GreenFlagEvent());
    }

    public stopAll() {
        this.interpreter.stopAll();
    }

    private step() {
        if (!this.project) {
            throw new Error('Cannot step without a project');
        }
        this.interpreter.stepThreads();
        this.renderer?.draw(this.project.targets);
    }
}
