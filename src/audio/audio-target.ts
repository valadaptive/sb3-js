import Sound from '../sound.js';
import AudioEngine from './audio-engine.js';

// Short transitions prevent clicks when changing audio parameters. Pan uses a small delay to match scratch-audio's
// workaround for environments which cannot smoothly change parameters immediately.
const DECAY_DURATION = 0.025;
const DECAY_WAIT = 0.05;

const clamp = (value: number, min: number, max: number) => {
    if (Number.isNaN(value)) return 0;
    return Math.max(min, Math.min(value, max));
};

type AudioTargetState = {
    volume: number;
    pitch: number;
    pan: number;
};

export default class AudioTarget {
    private readonly audio: AudioEngine;
    private readonly inputNode: GainNode;
    private readonly dryGainNode: GainNode;
    private readonly leftPanNode: GainNode;
    private readonly rightPanNode: GainNode;
    private readonly panGainNode: GainNode;
    private readonly outputNode: GainNode;
    private readonly playingSources: Map<Sound, AudioBufferSourceNode> = new Map();

    private _volume: number;
    private _pitch: number;
    private _pan: number;

    constructor(audio: AudioEngine, initialState: Partial<AudioTargetState> = {}) {
        this.audio = audio;
        this._volume = clamp(initialState.volume ?? 100, 0, 100);
        this._pitch = clamp(initialState.pitch ?? 0, -360, 360);
        this._pan = clamp(initialState.pan ?? 0, -100, 100);

        // Keep the graph stable while effects change. At zero pan the dry path preserves the source's channels. At any
        // other value, the two gain nodes and merger match Scratch's equal-power panner, including its stereo-to-mono
        // conversion before panning.
        const panEnabled = this._pan !== 0;
        const [leftGain, rightGain] = AudioTarget.panGains(this._pan);
        this.inputNode = new GainNode(audio.ctx);
        this.dryGainNode = new GainNode(audio.ctx, {gain: panEnabled ? 0 : 1});
        this.leftPanNode = new GainNode(audio.ctx, {gain: leftGain});
        this.rightPanNode = new GainNode(audio.ctx, {gain: rightGain});
        this.panGainNode = new GainNode(audio.ctx, {gain: panEnabled ? 1 : 0});
        this.outputNode = new GainNode(audio.ctx, {gain: this._volume * 0.01});

        const merger = audio.ctx.createChannelMerger(2);
        this.inputNode.connect(this.dryGainNode).connect(this.outputNode);
        this.inputNode.connect(this.leftPanNode).connect(merger, 0, 0);
        this.inputNode.connect(this.rightPanNode).connect(merger, 0, 1);
        merger.connect(this.panGainNode).connect(this.outputNode);
    }

    public static fromExisting(target: AudioTarget) {
        return new AudioTarget(target.audio, {
            volume: target.volume,
            pitch: target.pitch,
            pan: target.pan,
        });
    }

    public connect() {
        this.outputNode.connect(this.audio.ctx.destination);
    }

    public disconnect() {
        this.stopAllSounds();
        this.outputNode.disconnect();
        this.inputNode.disconnect();
        this.dryGainNode.disconnect();
        this.leftPanNode.disconnect();
        this.rightPanNode.disconnect();
        this.panGainNode.disconnect();
    }

    public play(sound: Sound): Promise<void> {
        const buffer = sound.buffer;
        // Ignore sounds that failed to decode.
        if (!buffer) return Promise.resolve();

        // Scratch restarts a sound if another instance of that same sound is already playing on this target.
        this.stop(sound);

        const source = this.audio.ctx.createBufferSource();
        source.buffer = buffer;
        source.playbackRate.value = this.pitchRatio;
        source.connect(this.inputNode);
        this.playingSources.set(sound, source);
        this.audio.resume();

        return new Promise<void>((resolve, reject) => {
            source.addEventListener('ended', () => {
                this.cleanUpSource(sound, source);
                resolve();
            }, {once: true});

            try {
                source.start();
            } catch (error) {
                this.cleanUpSource(sound, source);
                reject(error instanceof Error ? error : new Error(String(error)));
            }
        });
    }

    private cleanUpSource(sound: Sound, source: AudioBufferSourceNode) {
        // A newer source may already have replaced this one for the same sound.
        if (this.playingSources.get(sound) === source) {
            this.playingSources.delete(sound);
        }
        source.disconnect();
    }

    public stop(sound: Sound) {
        const source = this.playingSources.get(sound);
        if (!source) return;
        source.stop();
        this.cleanUpSource(sound, source);
    }

    public stopAllSounds() {
        for (const [sound, source] of this.playingSources) {
            source.stop();
            this.cleanUpSource(sound, source);
        }
    }

    private setImmediately(param: AudioParam, value: number) {
        const now = this.audio.ctx.currentTime;
        param.cancelScheduledValues(now);
        param.setValueAtTime(value, now);
    }

    private rampTo(param: AudioParam, value: number) {
        const now = this.audio.ctx.currentTime;
        param.cancelAndHoldAtTime(now);
        param.linearRampToValueAtTime(value, now + DECAY_DURATION);
    }

    private targetAt(param: AudioParam, value: number) {
        const now = this.audio.ctx.currentTime;
        param.cancelAndHoldAtTime(now);
        param.setTargetAtTime(value, now + DECAY_WAIT, DECAY_DURATION);
    }

    private static panGains(pan: number): [number, number] {
        const position = (pan + 100) / 200;
        return [
            Math.cos(position * Math.PI / 2),
            Math.sin(position * Math.PI / 2),
        ];
    }

    public get volume() {
        return this._volume;
    }

    public set volume(volume: number) {
        volume = clamp(volume, 0, 100);
        const changed = volume !== this._volume;
        this._volume = volume;

        const gain = volume * 0.01;
        if (this.playingSources.size === 0) {
            // Avoid leaving latent automation in a suspended context. The next sound should begin at the requested
            // volume rather than fading from the previous value when the context resumes.
            this.setImmediately(this.outputNode.gain, gain);
        } else if (changed) {
            this.rampTo(this.outputNode.gain, gain);
        }
    }

    public get pitch() {
        return this._pitch;
    }

    /** Pitch effect: 10 units maps to one semitone. */
    public set pitch(pitch: number) {
        pitch = clamp(pitch, -360, 360);
        if (pitch === this._pitch) return;
        this._pitch = pitch;

        const speedRatio = this.pitchRatio;
        for (const source of this.playingSources.values()) {
            source.playbackRate.value = speedRatio;
        }
    }

    private get pitchRatio() {
        return 2 ** (this._pitch / 120);
    }

    public get pan() {
        return this._pan;
    }

    /** Pan left/right effect. -100 is left, 100 is right, and 0 is centered. */
    public set pan(pan: number) {
        pan = clamp(pan, -100, 100);
        const changed = pan !== this._pan;
        this._pan = pan;

        const [leftGain, rightGain] = AudioTarget.panGains(pan);
        const dryGain = pan === 0 ? 1 : 0;
        const panGain = pan === 0 ? 0 : 1;
        if (this.playingSources.size === 0) {
            this.setImmediately(this.leftPanNode.gain, leftGain);
            this.setImmediately(this.rightPanNode.gain, rightGain);
            this.setImmediately(this.dryGainNode.gain, dryGain);
            this.setImmediately(this.panGainNode.gain, panGain);
        } else if (changed) {
            this.targetAt(this.leftPanNode.gain, leftGain);
            this.targetAt(this.rightPanNode.gain, rightGain);
            this.rampTo(this.dryGainNode.gain, dryGain);
            this.rampTo(this.panGainNode.gain, panGain);
        }
    }

    public clearEffects() {
        this.pitch = 0;
        this.pan = 0;
    }
}
