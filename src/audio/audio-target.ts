import Sound from '../sound.js';
import AudioEngine from './audio-engine.js';

export default class AudioTarget {
    private readonly inputNode: GainNode;
    private readonly ctx;
    private readonly playingBuffers: Map<Sound, AudioBufferSourceNode> = new Map();

    constructor(audio: AudioEngine) {
        this.ctx = audio.ctx;
        this.inputNode = new GainNode(this.ctx);
    }

    public connect(engine: AudioEngine) {
        this.inputNode.connect(engine.ctx.destination);
    }

    public disconnect() {
        this.stopAllSounds();
        this.inputNode.disconnect();
    }

    public play(sound: Sound) {
        const buffer = sound.buffer;
        // If this sound is already playing, restart it
        this.stop(sound);

        const source = this.ctx.createBufferSource();
        source.buffer = buffer;
        source.connect(this.inputNode);
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

    public setVolume(volume: number) {
        this.inputNode.gain.value = volume * 0.01;
    }
}
