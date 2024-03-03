export class GraphicEffects {
    public bitmask: number;

    public color!: number;
    public fisheye!: number;
    public whirl!: number;
    public pixelate!: number;
    public mosaic!: number;
    public brightness!: number;
    public ghost!: number;

    public static EFFECT_COLOR = 1 << 0;
    public static EFFECT_FISHEYE = 1 << 1;
    public static EFFECT_WHIRL = 1 << 2;
    public static EFFECT_PIXELATE = 1 << 3;
    public static EFFECT_MOSAIC = 1 << 4;
    public static EFFECT_BRIGHTNESS = 1 << 5;
    public static EFFECT_GHOST = 1 << 6;

    private effectValues = {
        color: 0,
        fisheye: 0,
        whirl: 0,
        pixelate: 0,
        mosaic: 0,
        brightness: 0,
        ghost: 0,
    };

    public constructor() {
        this.bitmask = 0;

        const effectNames = Object.keys(this.effectValues) as (keyof typeof GraphicEffects.prototype.effectValues)[];
        for (let i = 0; i < effectNames.length; i++) {
            const effectName = effectNames[i];
            let setter;
            // We need to clamp effect values before sending them to the shader so that they *semantically* never go
            // outside of their range (e.g. setting ghost to -100 then changing it by 5 should result in 5, not -95).
            switch (effectName) {
                case 'brightness':
                    setter = (value: number) => {
                        this.effectValues[effectName] = Math.max(-100, Math.min(value, 100));
                        this.bitmask = value === 0 ? this.bitmask & ~(1 << i) : this.bitmask | (1 << i);
                    };
                    break;
                case 'ghost':
                    setter = (value: number) => {
                        this.effectValues[effectName] = Math.max(0, Math.min(value, 100));
                        this.bitmask = value === 0 ? this.bitmask & ~(1 << i) : this.bitmask | (1 << i);
                    };
                    break;
                default:
                    setter = (value: number) => {
                        this.effectValues[effectName] = value;
                        this.bitmask = value === 0 ? this.bitmask & ~(1 << i) : this.bitmask | (1 << i);
                    };
            }
            Object.defineProperty(this, effectName, {
                get: () => {
                    return this.effectValues[effectName];
                },
                set: setter,
            });
        }
    }

    public clone() {
        const clone = new GraphicEffects();
        clone.bitmask = this.bitmask;
        clone.effectValues = {...this.effectValues};
        return clone;
    }

    public clear() {
        this.bitmask = 0;
        this.effectValues = {
            color: 0,
            fisheye: 0,
            whirl: 0,
            pixelate: 0,
            mosaic: 0,
            brightness: 0,
            ghost: 0,
        };
    }

    /** Get the color effect as a uniform to be sent to the shader. */
    public get u_color() {
        return (((this.color / 200) % 1) + 1) % 1;
    }

    /** Get the fisheye effect as a uniform to be sent to the shader. */
    public get u_fisheye() {
        return Math.max(0, (this.fisheye + 100.0) / 100);
    }

    /** Get the whirl effect as a uniform to be sent to the shader. */
    public get u_whirl() {
        return this.whirl * Math.PI / 180;
    }

    /** Get the pixelate effect as a uniform to be sent to the shader. */
    public get u_pixelate() {
        return Math.abs(this.pixelate) / 10;
    }

    /** Get the mosaic effect as a uniform to be sent to the shader. */
    public get u_mosaic() {
        let value = this.mosaic;
        value = Math.round((Math.abs(value) + 10) / 10);
        value = Math.max(1, Math.min(value, 512));
        return value;
    }

    /** Get the brightness effect as a uniform to be sent to the shader. */
    public get u_brightness() {
        return Math.max(-100, Math.min(this.brightness, 100)) / 100;
    }

    /** Get the ghost effect as a uniform to be sent to the shader. */
    public get u_ghost() {
        return 1 - (Math.max(0, Math.min(this.ghost, 100)) / 100);
    }
}
