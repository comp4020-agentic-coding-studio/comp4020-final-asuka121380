import * as THREE from "three";

// The castle scene's light, from one source (ADR 0015): a warm, clear
// afternoon. Seen from the default view (looking towards −z), the sun
// stands to the left and a little behind the castle, fairly high, so its
// light rakes across the front face (which stays lit, not in silhouette)
// and the towers' short shadows fall to the right and slightly forwards.
// No fog, no darkness and no colour grading: the sky is a plain gradient.

export const SUN_DIR = new THREE.Vector3(-0.78, 0.6, -0.12).normalize();
export const SUN_COLOUR = new THREE.Color("#fff1dc");
export const SKY = {
  zenith: new THREE.Color("#4f8fdc"),
  high: new THREE.Color("#86b6ea"),
  horizon: new THREE.Color("#d9ebf6"),
  sun: new THREE.Color("#fffaf0"),
};
/** What the very far ground fades towards; also the clear colour. */
export const HORIZON = new THREE.Color("#d9ebf6");

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
    vec3 col = mix(uHorizon, uHigh, smoothstep(0.0, 0.22, h));
    col = mix(col, uZenith, smoothstep(0.2, 0.9, h));
    float toSun = max(dot(d, uSun), 0.0);
    col += vec3(1.0, 0.96, 0.88) * pow(toSun, 24.0) * 0.35;
    // a few small fair-weather clouds, white, mid-sky
    vec2 q = d.xz / max(d.y, 0.08) * 1.1;
    float band = smoothstep(0.06, 0.16, h) * (1.0 - smoothstep(0.35, 0.6, h));
    float c = smoothstep(0.62, 0.86, noise(q * 1.3) * 0.65 + noise(q * 3.7) * 0.35) * band;
    col = mix(col, vec3(1.0), c * 0.75);
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
