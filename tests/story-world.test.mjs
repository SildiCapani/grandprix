import test from 'node:test';
import assert from 'node:assert/strict';
import { footprintDistance, overlapsHeight } from '../client/src/story/collision.js';
import {canUseBoostPad} from '../client/src/story/drive.js';
test('long fence footprint crosses a road even when its centre is off the road',()=>{
  const c={x:0,z:12,hx:10,hz:.1,ang:Math.PI/2};
  assert.ok(footprintDistance(c,0,0)<3);
  assert.ok(footprintDistance({...c,ang:0},0,0)>11);
});
test('rotated rectangle follows the same convention as Three.js',()=>{
  const c={x:5,z:8,hx:4,hz:1,ang:Math.PI/2};
  assert.equal(footprintDistance(c,5,11.9),0);
  assert.ok(footprintDistance(c,7,8)>.9);
});
test('circle clearance uses the complete rock radius',()=>{
  assert.equal(footprintDistance({x:4,z:0,r:3},0,0),1);
});
test('kart clears a low obstacle when jumping above it',()=>{
  const c={minY:3,maxY:5};
  assert.equal(overlapsHeight({y:3},c),true);
  assert.equal(overlapsHeight({y:5.1},c),false);
  assert.equal(overlapsHeight({y:0},c),false);
  assert.equal(overlapsHeight({},c),true);
});
test('boost pads do not launch parked, reversing, airborne or spinning karts',()=>{
  const c={grounded:true,speed:0,spinT:0};
  assert.equal(canUseBoostPad(c),false);
  assert.equal(canUseBoostPad({...c,speed:10}),true);
  assert.equal(canUseBoostPad({...c,speed:-5}),false);
  assert.equal(canUseBoostPad({...c,speed:10,grounded:false}),false);
  assert.equal(canUseBoostPad({...c,speed:10,spinT:1}),false);
});
