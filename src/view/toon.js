// "Toy render" materials for the heroes: a vertical colour gradient (lit top,
// deeper base) plus a fresnel rim glow, on top of glossy physical shading.
import * as THREE from 'three';

/**
 * @param {object} o
 * @param {string[]} o.stops   gradient colours bottom -> mid -> top (2 or 3)
 * @param {number[]} o.range   local-space y range the gradient spans [y0, y1]
 * @param {string}   o.rim     rim colour
 * @param {number}   o.rimStrength
 * @param {number}   o.rimPower
 * Other keys go to MeshPhysicalMaterial (roughness, clearcoat, sheen...).
 */
export function heroMaterial({ stops, range = [-1, 1], rim = '#ffffff', rimStrength = 0.4, rimPower = 2.4, ...phys }) {
  const m = new THREE.MeshPhysicalMaterial({ color: '#ffffff', ...phys });
  const c = stops.map((s) => new THREE.Color(s));
  const bottom = c[0];
  const mid = c.length > 2 ? c[1] : c[0].clone().lerp(c[c.length - 1], 0.5);
  const top = c[c.length - 1];
  const uniforms = {
    gBottom: { value: bottom },
    gMid: { value: mid },
    gTop: { value: top },
    gRange: { value: new THREE.Vector2(range[0], range[1]) },
    rimColor: { value: new THREE.Color(rim) },
    rimParams: { value: new THREE.Vector2(rimStrength, rimPower) },
  };
  m.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying float vHeroY;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvHeroY = position.y;');
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
varying float vHeroY;
uniform vec3 gBottom; uniform vec3 gMid; uniform vec3 gTop; uniform vec2 gRange;
uniform vec3 rimColor; uniform vec2 rimParams;`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
float hk = clamp((vHeroY - gRange.x) / (gRange.y - gRange.x), 0.0, 1.0);
vec3 hg = hk < 0.5 ? mix(gBottom, gMid, smoothstep(0.0, 0.5, hk)) : mix(gMid, gTop, smoothstep(0.5, 1.0, hk));
diffuseColor.rgb *= hg;`,
      )
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
float rimF = pow(1.0 - clamp(dot(normalize(normal), normalize(vViewPosition)), 0.0, 1.0), rimParams.y);
totalEmissiveRadiance += rimColor * rimF * rimParams.x;`,
      );
  };
  m.customProgramCacheKey = () => 'heroMaterial';
  return m;
}
