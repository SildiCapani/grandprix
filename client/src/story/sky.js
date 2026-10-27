import * as THREE from 'three';

export function createIslandSky() {
  const sky = new THREE.Mesh(new THREE.SphereGeometry(2800, 32, 20), new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: {
      top: { value: new THREE.Color(0x4288d0) },
      horizon: { value: new THREE.Color(0xd8ebf5) },
      ground: { value: new THREE.Color(0x2a8ab0) },
      sunDir: { value: new THREE.Vector3(.5, .75, .35).normalize() },
      sunColor: { value: new THREE.Color(0xffe7bc) },
      time: { value: 0 },
    },
    vertexShader: `
      varying vec3 vDir;
      void main() {
        vDir = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.);
      }`,
    fragmentShader: `
      uniform vec3 top, horizon, ground, sunColor, sunDir;
      uniform float time;
      varying vec3 vDir;
      float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float noise(vec2 p) {
        vec2 i = floor(p), f = fract(p); f = f * f * (3. - 2. * f);
        return mix(mix(hash(i), hash(i + vec2(1., 0.)), f.x),
                   mix(hash(i + vec2(0., 1.)), hash(i + vec2(1., 1.)), f.x), f.y);
      }
      float cloudNoise(vec2 p) {
        float n = 0., a = .55;
        for (int i = 0; i < 5; i++) { n += noise(p) * a; p = p * 2.03 + 13.7; a *= .48; }
        return n;
      }
      void main() {
        vec3 d = normalize(vDir);
        float sun = max(dot(d, sunDir), 0.);
        vec3 color = d.y > 0. ? mix(horizon, top, pow(d.y, .48))
          : mix(horizon, ground, pow(min(1., -d.y * 3.), .5));
        color += sunColor * (pow(sun, 1400.) * 6. + pow(sun, 40.) * .24 + pow(sun, 6.) * .1);
        if (d.y > .025) {
          vec2 uv = d.xz / (d.y + .17) * 2.2 + vec2(time * .006, time * .002);
          float n = cloudNoise(uv);
          float clouds = smoothstep(.49, .68, n) * smoothstep(.025, .16, d.y);
          vec3 cloudColor = mix(vec3(.66, .75, .83), vec3(1., .97, .89), smoothstep(.49, .76, n));
          cloudColor += sunColor * pow(sun, 6.) * .14;
          color = mix(color, cloudColor, clouds * .9);
          float wisps = smoothstep(.62, .78, cloudNoise(uv * vec2(.4, 2.5) + 57.));
          color = mix(color, vec3(.91, .95, 1.), wisps * .15 * smoothstep(.1, .4, d.y));
        }
        gl_FragColor = vec4(color, 1.);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  }));
  sky.name = 'Inselhimmel'; sky.frustumCulled = false; sky.renderOrder = -10;
  return sky;
}
