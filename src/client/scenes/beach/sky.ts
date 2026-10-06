import * as THREE from "three";

// The beach scene's light, from one source (ADR 0004). The sun's direction
// here is used by the visible sky dome, by the environment map rendered
// from that same dome, by the shadow-casting sun light and by the sea's
// glitter, so the sky shown and the light falling on the houses agree.
//
// Golden hour, shortly before sunset: the sun is low (about 19° up) over the
// sea, which lies towards +z, only slightly to the left as seen from the
// beach. Nearly straight out to sea, so the neighbours' shadows fall behind
// them, inland, and never across the plot.

export const SUN_DIR = new THREE.Vector3(-0.14, 0.33, 0.93).normalize();
/** Warm, but still light enough that the houses keep their own colours. */
export const SUN_COLOUR = new THREE.Color("#ffdcb2");
export const SKY = {
  zenith: new THREE.Color("#6d8fd9"),
  high: new THREE.Color("#b6b4ec"),
  horizon: new THREE.Color("#f7c2c6"),
  glow: new THREE.Color("#ffab7a"),
  sun: new THREE.Color("#fff1d6"),
};
/** The colour the distance fades to: the sky just above the horizon, away from the sun. */
export const HAZE = new THREE.Color("#efc9cf");

const vertex = /* glsl */ `
  varying vec3 vDir;
  void main() {
    vDir = normalize(position);
    vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    gl_Position = p.xyww; // always at the far plane
  }
`;

const fragment = /* glsl */ `
  uniform vec3 uSun, uZenith, uHigh, uHorizon, uGlow, uSunColour;
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
    // blue overhead, lavender higher up, pink at the horizon
    vec3 col = mix(uHorizon, uHigh, smoothstep(0.0, 0.28, h));
    col = mix(col, uZenith, smoothstep(0.25, 0.85, h));
    // the warm glow round the sun, strongest low down
    float toSun = max(dot(d, uSun), 0.0);
    col = mix(col, uGlow, pow(toSun, 6.0) * (1.0 - smoothstep(0.0, 0.5, h)) * 0.85);
    col += uGlow * pow(toSun, 40.0) * 0.5;
    // a few long low clouds, lit pink and gold from below
    vec2 q = d.xz / max(d.y, 0.06) * 0.9;
    float band = smoothstep(0.03, 0.09, h) * (1.0 - smoothstep(0.12, 0.3, h));
    float c = smoothstep(0.55, 0.85, noise(q * vec2(0.6, 2.4)) * 0.7 + noise(q * 2.3) * 0.3) * band;
    col = mix(col, mix(vec3(1.0, 0.8, 0.78), vec3(1.0, 0.86, 0.6), pow(toSun, 3.0)), c * 0.7);
    // the sun's disc, still above the horizon
    col = mix(col, uSunColour * 1.6, smoothstep(uDisc - 0.0006, uDisc, toSun));
    // below the horizon the sky is hidden by the sea and land; keep it hazy
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
      uGlow: { value: SKY.glow },
      uSunColour: { value: SKY.sun },
      uDisc: { value: Math.cos(THREE.MathUtils.degToRad(1.4)) },
    },
  });
}
