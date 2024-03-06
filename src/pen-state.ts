import {vec3, vec4} from 'gl-matrix';
import {hsvToRgb, rgbToHsv} from './renderer/color-conversions.js';

const __hsv = vec3.create();
const __rgbNorm = vec3.create();

export default class PenState {
    public down = false;
    private _color = 200 / 3;
    private _saturation = 100;
    private _brightness = 100;
    private _transparency = 0;
    private _legacyShade = 50; // Used for Scratch 2 change/set pen param blocks
    private _thickness = 1;
    private _rgba = vec4.create();
    private rgbDirty = true;

    get color() {
        return this._color;
    }

    set color(color) {
        // The Scratch code is supposed to wrap from 0 to 100 but wraps from 0 to 101 instead--another certified Scratch
        // Foundation banger!
        this._color = ((color % 101) + 101) % 101;
        this.rgbDirty = true;
    }

    get saturation() {
        return this._saturation;
    }

    set saturation(saturation) {
        this._saturation = Math.max(0, Math.min(saturation, 100));
        this.rgbDirty = true;
    }

    get brightness() {
        return this._brightness;
    }

    set brightness(brightness) {
        this._brightness = Math.max(0, Math.min(brightness, 100));
        this.rgbDirty = true;
    }

    get transparency() {
        return this._transparency;
    }

    set transparency(transparency) {
        this._transparency = Math.max(0, Math.min(transparency, 100));
    }

    get legacyShade() {
        return this._legacyShade;
    }

    set legacyShade(legacyShade) {
        this._legacyShade = ((legacyShade % 200) + 200) % 200;
    }

    get thickness() {
        return this._thickness;
    }

    set thickness(thickness) {
        this._thickness = Math.max(1, Math.min(thickness, 1200));
    }

    get rgba() {
        if (this.rgbDirty) {
            this.rgbDirty = false;
            __hsv[0] = this._color * 0.01;
            __hsv[1] = this._saturation * 0.01;
            __hsv[2] = this._brightness * 0.01;
            hsvToRgb(__hsv, this._rgba as vec3);
        }
        this._rgba[3] = 1 - (this._transparency * 0.01);
        return this._rgba;
    }

    setFromRgbaInt(rgba: Uint8ClampedArray) {
        __rgbNorm[0] = rgba[0] / 255;
        __rgbNorm[1] = rgba[1] / 255;
        __rgbNorm[2] = rgba[2] / 255;
        rgbToHsv(__rgbNorm, __hsv);
        this._color = __hsv[0] * 100;
        this._saturation = __hsv[1] * 100;
        this._brightness = __hsv[2] * 100;
        this._transparency = 100 - (rgba[3] / 255 * 100);
        this.rgbDirty = true;
    }

    public clone() {
        const pen = new PenState();
        pen.down = this.down;
        pen._color = this._color;
        pen._saturation = this._saturation;
        pen._brightness = this._brightness;
        pen.thickness = this.thickness;
        return pen;
    }

    public updateLegacyColor() {
        __hsv[0] = this._color * 0.01;
        __hsv[1] = 1;
        __hsv[2] = 1;
        const rgb = hsvToRgb(__hsv, __rgbNorm);
        const shade = (this._legacyShade > 100) ? 200 - this._legacyShade : this._legacyShade;
        if (shade < 50) {
            const t = (10 + shade) / 60;
            rgb[0] *= t;
            rgb[1] *= t;
            rgb[2] *= t;
        } else {
            const t = (shade - 50) / 60;
            rgb[0] = (rgb[0] * (1 - t)) + t;
            rgb[1] = (rgb[1] * (1 - t)) + t;
            rgb[2] = (rgb[2] * (1 - t)) + t;
        }
        const hsv = rgbToHsv(rgb, __hsv);
        this._color = hsv[0] * 100;
        this._saturation = hsv[1] * 100;
        this._brightness = hsv[2] * 100;
        this.rgbDirty = true;
    }
}
