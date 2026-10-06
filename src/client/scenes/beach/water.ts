import * as THREE from "three";
import { HAZE, SKY, SUN_COLOUR, SUN_DIR } from "./sky.ts";

// The sea: one large plane with a light shader, not a fluid simulation
// (ADR 0004). Small moving ripples tilt its normal, which drives the sky's
// reflection, the sun's glitter and a line of foam where it meets the sand.
// It's slightly see-through in the shallows, so the wet sand shows.

export const SEA_LEVEL = -1.5;
/** Where the sand dips under the water, along z. */
export const SHORE_Z = 58;

const vertex = /* glsl */ `
  varying vec3 vWorld;
  void main() {
    vec4 w = modelMatrix * vec4(position, 1.0);
    vWorld = w.xyz;
    gl_Position = projectionMatrix * viewMatrix * w;
  }
`;

const fragment = /* glsl */ `
  uniform float uTime, uShore;
  uniform vec3 uSun, uSunColour, uDeep, uShallow, uSky, uHaze;
  varying vec3 vWorld;

  vec2 ripple(vec2 p, float t) {
    vec2 g = vec2(0.0);
    g += vec2(cos(p.x * 0.31 + p.y * 0.12 + t * 0.9), sin(p.y * 0.27 - p.x * 0.08 + t * 0.7)) * 0.05;
    g += vec2(cos(p.x * 0.83 - p.y * 0.41 + t * 1.7), sin(p.y * 0.91 + p.x * 0.36 + t * 1.3)) * 0.025;
    g += vec2(cos(p.x * 2.1 + p.y * 1.3 + t * 2.6), sin(p.y * 1.9 - p.x * 1.1 + t * 2.2)) * 0.012;
    return g;
  }

  void main() {
    vec3 toCam = cameraPosition - vWorld;
    float dist = length(toCam.xz);
    vec3 V = normalize(toCam);
    // ripples fade out with distance, so far water is calm rather than noisy
    vec2 g = ripple(vWorld.xz, uTime) * (1.0 - smoothstep(60.0, 260.0, dist));
    vec3 N = normalize(vec3(-g.x, 1.0, -g.y));
    float fres = 0.04 + 0.96 * pow(1.0 - max(dot(N, V), 0.0), 5.0);
    float deep = smoothstep(uShore, uShore + 40.0, vWorld.z);
    vec3 col = mix(uShallow, uDeep, deep);
    col = mix(col, uSky, fres * 0.85);
    vec3 R = reflect(-V, N);
    float s = max(dot(R, uSun), 0.0);
    col += uSunColour * (pow(s, 300.0) * 3.0 + pow(s, 24.0) * 0.35);
    // foam where waves run up the sand
    float edge = vWorld.z - uShore;
    float wave = 0.5 + 0.5 * sin(edge * 2.6 - uTime * 1.4 + sin(vWorld.x * 0.15) * 1.8);
    float foam = (1.0 - smoothstep(0.0, 2.2, edge)) * smoothstep(-0.4, 0.2, edge) * (0.45 + 0.55 * wave);
    col = mix(col, vec3(1.0, 0.98, 0.95), clamp(foam, 0.0, 1.0) * 0.8);
    col = mix(col, uHaze, smoothstep(160.0, 700.0, dist));
    float alpha = mix(0.62, 1.0, smoothstep(uShore, uShore + 10.0, vWorld.z));
    gl_FragColor = vec4(col, max(alpha, foam));
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

export function seaMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    vertexShader: vertex,
    fragmentShader: fragment,
    transparent: true,
    uniforms: {
      uTime: { value: 0 },
      uShore: { value: SHORE_Z },
      uSun: { value: SUN_DIR },
      uSunColour: { value: SUN_COLOUR },
      uDeep: { value: new THREE.Color("#1f6f9a") },
      uShallow: { value: new THREE.Color("#3fc0bf") },
      uSky: { value: SKY.horizon.clone().lerp(SKY.high, 0.35) },
      uHaze: { value: HAZE },
    },
  });
}
