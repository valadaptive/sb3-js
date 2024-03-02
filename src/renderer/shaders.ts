export const vertexShader = `
in vec2 a_position;
uniform vec2 u_stageSize;
uniform mat3 u_transform;
out vec2 v_texCoord;

void main() {
    gl_Position = vec4(u_transform * vec3((a_position), 1.0) / vec3(u_stageSize * 0.5, 1.0), 1.0);
    //gl_Position = vec4((a_position * 2.0 - 1.0) / u_stageSize, 0.0, 1.0);
    v_texCoord = vec2(a_position.x, 1.0 - a_position.y);
}
`;

export const fragmentShader = `
in vec2 v_texCoord;
uniform sampler2D u_texture;
out vec4 fragColor;

void main() {
    //fragColor = vec4(v_texCoord, 0.0, 1.0);
    //fragColor = vec4(0.0, 0.0, 0.0, 1.0);
    fragColor = texture(u_texture, v_texCoord);
}
`;
