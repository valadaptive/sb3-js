import Sound from '../sound.js';
import AudioEngine from './audio-engine.js';

export default class AudioTarget {
    private readonly destinationNode: GainNode;
    private readonly audio: AudioEngine;
    private readonly playingBuffers: Map<Sound, AudioBufferSourceNode> = new Map();
    private _volume = 100;
    private _pitch = 0;
    private _pan = 0;
    private pannerNode: StereoPannerNode;

    constructor(audio: AudioEngine) {
        this.audio = audio;
        this.destinationNode = new GainNode(this.audio.ctx);
        this.pannerNode = new StereoPannerNode(this.audio.ctx);
    }

    public static fromExisting(target: AudioTarget) {
        const newTarget = new AudioTarget(target.audio);
        newTarget.volume = target.volume;
        newTarget.pitch = target.pitch;
        newTarget.pan = target.pan;
        return newTarget;
    }

    public connect(engine: AudioEngine) {
        this.destinationNode.connect(engine.ctx.destination);
    }

    public disconnect() {
        this.stopAllSounds();
        this.destinationNode.disconnect();
    }

    public play(sound: Sound) {
        const buffer = sound.buffer;
        // If this sound is already playing, restart it
        this.stop(sound);

        const source = this.audio.ctx.createBufferSource();
        source.buffer = buffer;
        source.connect(this.destinationNode);
        this.playingBuffers.set(sound, source);

        return new Promise(resolve => {
            source.start();
            source.addEventListener('ended', resolve, {once: true});
        });
    }

    public stop(sound: Sound) {
        const playingBuffer = this.playingBuffers.get(sound);
        if (!playingBuffer) return;
        playingBuffer.stop();
        playingBuffer.disconnect();
        this.playingBuffers.delete(sound);
    }

    public stopAllSounds() {
        for (const playingBuffer of this.playingBuffers.values()) {
            playingBuffer.stop();
            playingBuffer.disconnect();
        }
        this.playingBuffers.clear();
    }

    public get volume() {
        return this._volume;
    }

    public set volume(volume: number) {
        this._volume = volume;
        this.destinationNode.gain.value = volume * 0.01;
    }

    public get pitch() {
        return this._pitch;
    }

    /**
     * Pitch effect--10 units maps to 1 semitone.
     */
    public set pitch(pitch: number) {
        // Clamp to 3 octaves up or down
        pitch = Math.max(-360, Math.min(pitch, 360));

        this._pitch = pitch;
        // Scaled so that 10 units = 1 semitone
        const speedRatio = 2 ** (pitch / 120);
        for (const playingBuffer of this.playingBuffers.values()) {
            playingBuffer.playbackRate.value = speedRatio;
        }
    }

    public get pan() {
        return this._pan;
    }

    /**
     * Pan left/right effect. -100 is left, 100 is right, 0 is center.
     * Unlike the Scratch version, this doesn't convert stereo to mono when enabled. I have no idea why Scratch
     * implemented this using two gain nodes and a channel mixer instead of the StereoPannerNode featured prominently in
     * the MDN docs, but I'm sure the top minds at Bocoup had a perfectly good reason for it.
     */
    public set pan(pan: number) {
        // Clamp value (needs to be done so that e.g. setting pan to 150 then changing it by -10 sets it to 90, not 140)
        pan = Math.max(-100, Math.min(pan, 100));

        if (pan === 0 && this._pan !== 0) {
            for (const playingBuffer of this.playingBuffers.values()) {
                playingBuffer.disconnect(this.pannerNode);
                playingBuffer.connect(this.destinationNode);
            }
            this.pannerNode.disconnect();
        } else if (pan !== 0 && this._pan === 0) {
            for (const playingBuffer of this.playingBuffers.values()) {
                playingBuffer.disconnect(this.destinationNode);
                playingBuffer.connect(this.pannerNode);
            }
            this.pannerNode.connect(this.destinationNode);
        }
        this._pan = pan;
        this.pannerNode.pan.value = pan * 0.01;
    }

    public clearEffects() {
        this.pitch = 0;
        this.pan = 0;
    }
}
