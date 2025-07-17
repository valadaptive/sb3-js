export const spriteVertexShader = `
in vec2 a_position;
uniform vec2 u_stageSize;
uniform mat3 u_transform;
out vec2 v_texCoord;

void main() {
    gl_Position = vec4(u_transform * vec3((a_position), 1.0) / vec3(u_stageSize * 0.5, 1.0), 1.0);
    v_texCoord = vec2(a_position.x, 1.0 - a_position.y);
}
`;

export const spriteFragmentShader = `
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
            hsv.x = fract(hsv.x + color_effect);
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

export const penLineVertexShader = `
in vec2 a_position;

// The X and Y components of u_penPoints hold the first pen point. The Z and W components hold the difference between
// the second pen point and the first. This is done because calculating the difference in the shader leads to floating-
// point error when both points have large-ish coordinates.
uniform vec4 u_penPoints;
uniform vec2 u_penLayerSize;
uniform float u_penThickness;
uniform float u_lineLength;

out vec2 v_texCoord;
// Add this to divisors to prevent division by 0, which results in NaNs propagating through calculations.
// Smaller values can cause problems on some mobile devices.
const float epsilon = 1e-3;

void main() {
    // Calculate a rotated ("tight") bounding box around the two pen points.
    // Yes, we're doing this 6 times (once per vertex), but on actual GPU hardware,
    // it's still faster than doing it in JS combined with the cost of uniformMatrix.

    // Expand line bounds by sqrt(2) / 2 each side-- this ensures that all antialiased pixels
    // fall within the quad, even at a 45-degree diagonal
    vec2 position = a_position;
    float expandedRadius = (u_penThickness * 0.5) + 1.4142135623730951;

    // The X coordinate increases along the length of the line. It's 0 at the center of the origin point
    // and is in pixel-space (so at n pixels along the line, its value is n).
    v_texCoord.x = mix(0.0, u_lineLength + (expandedRadius * 2.0), a_position.x) - expandedRadius;
    // The Y coordinate is perpendicular to the line. It's also in pixel-space.
    v_texCoord.y = ((a_position.y - 0.5) * expandedRadius) + 0.5;

    position.x *= u_lineLength + (2.0 * expandedRadius);
    position.y *= 2.0 * expandedRadius;

    // 1. Center around first pen point
    position -= expandedRadius;

    // 2. Rotate quad to line angle
    vec2 pointDiff = u_penPoints.zw;
    // Ensure line has a nonzero length so it's rendered properly
    // As long as either component is nonzero, the line length will be nonzero
    // If the line is zero-length, give it a bit of horizontal length
    pointDiff.x = (abs(pointDiff.x) < epsilon && abs(pointDiff.y) < epsilon) ? epsilon : pointDiff.x;
    // The 'normalized' vector holds rotational values equivalent to sine/cosine
    // We're applying the standard rotation matrix formula to the position to rotate the quad to the line angle
    // pointDiff can hold large values so we must divide by u_lineLength instead of calling GLSL's normalize function:
    // https://asawicki.info/news_1596_watch_out_for_reduced_precision_normalizelength_in_opengl_es
    vec2 normalized = pointDiff / max(u_lineLength, epsilon);
    position = mat2(normalized.x, normalized.y, -normalized.y, normalized.x) * position;

    // 3. Translate quad
    position += u_penPoints.xy;

    // 4. Apply view transform
    position *= 2.0 / u_penLayerSize;
    gl_Position = vec4(position, 0, 1);
}
`;

export const penLineFragmentShader = `
uniform sampler2D u_texture;
uniform vec4 u_penPoints;
uniform vec4 u_penColor;
uniform float u_penThickness;
uniform float u_lineLength;
in vec2 v_texCoord;
out vec4 fragColor;

void main() {
    // Maaaaagic antialiased-line-with-round-caps shader.

    // "along-the-lineness". This increases parallel to the line.
    // It goes from negative before the start point, to 0.5 through the start to the end, then ramps up again
    // past the end point.
    float d = ((v_texCoord.x - clamp(v_texCoord.x, 0.0, u_lineLength)) * 0.5) + 0.5;

    // Distance from (0.5, 0.5) to (d, the perpendicular coordinate). When we're in the middle of the line,
    // d will be 0.5, so the distance will be 0 at points close to the line and will grow at points further from it.
    // For the "caps", d will ramp down/up, giving us rounding.
    // See https://www.youtube.com/watch?v=PMltMdi1Wzg for a rough outline of the technique used to round the lines.
    float line = distance(vec2(0.5), vec2(d, v_texCoord.y)) * 2.0;
    // Expand out the line by its thickness.
    line -= ((u_penThickness - 1.0) * 0.5);
    // Because "distance to the center of the line" decreases the closer we get to the line, but we want more opacity
    // the closer we are to the line, invert it.
    fragColor = u_penColor * clamp(1.0 - line, 0.0, 1.0);
}
`;
