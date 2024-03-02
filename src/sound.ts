export default class Sound {
    public name: string;
    public buffer: AudioBuffer | null;
    private audioContext: AudioContext;

    constructor(name: string, buffer: AudioBuffer | null, audioContext: AudioContext) {
        this.name = name;
        this.buffer = buffer;
        this.audioContext = audioContext;
    }
}
