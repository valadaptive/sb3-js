export default class Sound {
    public name: string;
    public buffer: AudioBuffer | null;

    constructor(name: string, buffer: AudioBuffer | null) {
        this.name = name;
        this.buffer = buffer;
    }
}
