export default class Sound {
    public name: string;
    public buffer: AudioBuffer;
    private audioContext: AudioContext;

    constructor(name: string, buffer: AudioBuffer, audioContext: AudioContext) {
        this.name = name;
        this.buffer = buffer;
        this.audioContext = audioContext;
    }
}
