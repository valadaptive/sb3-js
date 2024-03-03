export const vertexShader = `
in vec2 a_position;
uniform vec2 u_stageSize;
uniform mat3 u_transform;
out vec2 v_texCoord;

void main() {
    gl_Position = vec4(u_transform * vec3((a_position), 1.0) / vec3(u_stageSize * 0.5, 1.0), 1.0);
    v_texCoord = vec2(a_position.x, 1.0 - a_position.y);
}
`;

export const fragmentShader = `
in vec2 v_texCoord;
uniform sampler2D u_texture;
out vec4 fragColor;

const float EPSILON = 1e-3;
const vec2 CENTER = vec2(0.5, 0.5);

#ifdef GRAPHIC_EFFECTS
uniform vec4 u_effects_color_fisheye_whirl_pixelate;
uniform vec4 u_effects_mosaic_brightness_ghost;
uniform vec2 u_dimensions;
uniform int u_effects_bitmask;
const int EFFECT_COLOR = 1 << 0;
const int EFFECT_FISHEYE = 1 << 1;
const int EFFECT_WHIRL = 1 << 2;
const int EFFECT_PIXELATE = 1 << 3;
const int EFFECT_MOSAIC = 1 << 4;
const int EFFECT_BRIGHTNESS = 1 << 5;
const int EFFECT_GHOST = 1 << 6;

// Taken from https://web.archive.org/web/20200114094229/http://lolengine.net/blog/2013/07/27/rgb-to-hsv-in-glsl
vec3 rgb2hsv(vec3 c)
{
    vec4 K = vec4(0.0, -1.0 / 3.0, 2.0 / 3.0, -1.0);
    vec4 p = c.g < c.b ? vec4(c.bg, K.wz) : vec4(c.gb, K.xy);
    vec4 q = c.r < p.x ? vec4(p.xyw, c.r) : vec4(c.r, p.yzx);

    float d = q.x - min(q.w, q.y);
    float e = 1.0e-10;
    return vec3(abs(q.z + (q.w - q.y) / (6.0 * d + e)), d / (q.x + e), q.x);
}
vec3 hsv2rgb(vec3 c)
{
    vec4 K = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
    vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
    return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
}

#endif

void main() {
    vec2 coord = v_texCoord;

    #ifdef GRAPHIC_EFFECTS
    if ((u_effects_bitmask & EFFECT_MOSAIC) != 0) {
        float mosaic = u_effects_mosaic_brightness_ghost.x;
        coord = fract(coord * mosaic);
    }

    if ((u_effects_bitmask & EFFECT_PIXELATE) != 0) {
        float pixelate = u_effects_color_fisheye_whirl_pixelate.w;
        vec2 pixelTexelSize = u_dimensions / pixelate;
        coord = (floor(coord * pixelTexelSize) + CENTER) / pixelTexelSize;
    }

    if ((u_effects_bitmask & EFFECT_WHIRL) != 0) {
        vec2 offset = coord - CENTER;
        float magnitude = length(offset);
        float whirlFactor = max(1.0 - (magnitude * 2.0), 0.0);
        float whirl = u_effects_color_fisheye_whirl_pixelate.z;
        float whirlActual = whirl * whirlFactor * whirlFactor;
        float sinWhirl = sin(whirlActual);
        float cosWhirl = cos(whirlActual);
        offset = vec2(
            offset.x * cosWhirl - offset.y * sinWhirl,
            offset.x * sinWhirl + offset.y * cosWhirl
        );
        coord = offset + CENTER;
    }

    if ((u_effects_bitmask & EFFECT_FISHEYE) != 0) {
        vec2 v = (coord - CENTER) * 2.0;
        float radius = length(v);
        float fisheye = u_effects_color_fisheye_whirl_pixelate.y;
        float r = pow(min(radius, 1.0), fisheye) * max(1.0, radius);
        vec2 unit = v / radius;
        coord = CENTER + (unit * r * 0.5);
    }
    #endif

    vec4 color = texture(u_texture, coord);

    #ifdef GRAPHIC_EFFECTS
    if ((u_effects_bitmask & (EFFECT_COLOR | EFFECT_BRIGHTNESS)) != 0) {
        vec3 unmultiplied = color.rgb / max(color.a, EPSILON);

        if ((u_effects_bitmask & EFFECT_COLOR) != 0) {
            vec3 hsv = rgb2hsv(unmultiplied);
            const float minLightness = 0.055;
            const float minSaturation = 0.09;
            hsv.z = max(hsv.z, minLightness);
            hsv.y = max(hsv.y, minSaturation);

            float color_effect = u_effects_color_fisheye_whirl_pixelate.x;
            hsv.x = mod(hsv.x + color_effect, 1.0);
            unmultiplied = hsv2rgb(hsv);
        }

        if ((u_effects_bitmask & EFFECT_BRIGHTNESS) != 0) {
            unmultiplied = clamp(unmultiplied + u_effects_mosaic_brightness_ghost.y, vec3(0.0), vec3(1.0));
        }

        color.rgb = unmultiplied * max(color.a, EPSILON);
    }

    if ((u_effects_bitmask & EFFECT_GHOST) != 0) {
        color *= u_effects_mosaic_brightness_ghost.z;
    }
    #endif

    fragColor = color;
}
`;
