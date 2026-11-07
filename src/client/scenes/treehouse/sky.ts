import * as THREE from "three";

// Woodland Commons' light, from one source (ADR 0016): a bright early-autumn
// afternoon. Seen from the default view (looking towards −z), the sun is
// high to the right and a little in front of the tree, so the cabins'
// fronts are lit and the trunk's shadow falls back and to the left, away
// from the open working area. No fog, no darkness and no colour grading:
// the sky is a plain gradient with a few small clouds.

export const SUN_DIR = new THREE.Vector3(0.62, 0.72, 0.3).normalize();
export const SUN_COLOUR = new THREE.Color("#fff0d8");
export const SKY = {
  zenith: new THREE.Color("#4d8fd8"),
  high: new THREE.Color("#8ab9e8"),
  horizon: new THREE.Color("#dcecf3"),
  sun: new THREE.Color("#fffaf0"),
};
/** The clear colour, and what the very far ground meets. */
export const HORIZON = new THREE.Color("#dcecf3");

const vertex = /* glsl */ `
  varying vec3 vDir;
  void main() {
    vDir = normalize(position);
    vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    gl_Position = p.xyww;
  }
`;

const fragment = /* glsl */ `
  uniform vec3 uSun, uZenith, uHigh, uHorizon, uSunColour;
  uniform float uDisc;
  varying vec3 vDir;

  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float noise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
  }

  void main() {
    vec3 d = normalize(vDir);
    float h = max(d.y, 0.0);
    vec3 col = mix(uHorizon, uHigh, smoothstep(0.0, 0.25, h));
    col = mix(col, uZenith, smoothstep(0.22, 0.9, h));
    float toSun = max(dot(d, uSun), 0.0);
    col += vec3(1.0, 0.95, 0.85) * pow(toSun, 20.0) * 0.3;
    vec2 q = d.xz / max(d.y, 0.08) * 1.2;
    float band = smoothstep(0.08, 0.18, h) * (1.0 - smoothstep(0.4, 0.65, h));
    float c = smoothstep(0.64, 0.88, noise(q * 1.2 + 3.0) * 0.65 + noise(q * 3.3) * 0.35) * band;
    col = mix(col, vec3(1.0), c * 0.7);
    col = mix(col, uSunColour * 1.4, smoothstep(uDisc - 0.0006, uDisc, toSun));
    col = mix(col, uHorizon, smoothstep(0.0, -0.05, d.y));
    gl_FragColor = vec4(col, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

export function skyMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    vertexShader: vertex,
    fragmentShader: fragment,
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      uSun: { value: SUN_DIR },
      uZenith: { value: SKY.zenith },
      uHigh: { value: SKY.high },
      uHorizon: { value: SKY.horizon },
      uSunColour: { value: SKY.sun },
      uDisc: { value: Math.cos(THREE.MathUtils.degToRad(1.2)) },
    },
  });
}
