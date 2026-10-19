import * as THREE from 'three';

// A small 3D workshop for choosing karts: turntable, spotlights, tyre stacks and tool walls.
export function createGarage() {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0d1418);
  scene.fog = new THREE.Fog(0x0d1418, 14, 34);
  const camera = new THREE.PerspectiveCamera(42, 1, .1, 80);
  const std = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: .7, ...o });

  // floor: dark epoxy with a painted grid
  const c = document.createElement('canvas'); c.width = c.height = 512; const g = c.getContext('2d');
  g.fillStyle = '#1b2328'; g.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 4000; i++) { g.fillStyle = `rgba(255,255,255,${Math.random() * .03})`; g.fillRect(Math.random() * 512, Math.random() * 512, 2, 2); }
  g.strokeStyle = 'rgba(255,200,80,.18)'; g.lineWidth = 3; for (let i = 0; i <= 512; i += 128) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i, 512); g.stroke(); g.beginPath(); g.moveTo(0, i); g.lineTo(512, i); g.stroke(); }
  const ft = new THREE.CanvasTexture(c); ft.wrapS = ft.wrapT = THREE.RepeatWrapping; ft.repeat.set(8, 8); ft.colorSpace = THREE.SRGBColorSpace;
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), new THREE.MeshStandardMaterial({ map: ft, roughness: .32, metalness: .2 }));
  floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; scene.add(floor);

  // walls with panels and a neon strip
  const wallMat = std(0x26323a, { roughness: .9 });
  const back = new THREE.Mesh(new THREE.BoxGeometry(30, 9, .4), wallMat); back.position.set(0, 4.5, -7); scene.add(back);
  for (const sx of [-1, 1]) { const side = new THREE.Mesh(new THREE.BoxGeometry(.4, 9, 20), wallMat); side.position.set(sx * 10, 4.5, 2); scene.add(side); }
  const neon = new THREE.Mesh(new THREE.BoxGeometry(18, .12, .12), new THREE.MeshBasicMaterial({ color: 0xff653d, toneMapped: false })); neon.position.set(0, 5.6, -6.75); scene.add(neon);
  const neon2 = neon.clone(); neon2.material = new THREE.MeshBasicMaterial({ color: 0x42c9cb, toneMapped: false }); neon2.position.y = 5.2; scene.add(neon2);
  // big sign
  const sc = document.createElement('canvas'); sc.width = 1024; sc.height = 200; const sg = sc.getContext('2d');
  sg.fillStyle = '#0c1216'; sg.fillRect(0, 0, 1024, 200); sg.fillStyle = '#ff653d'; sg.font = 'italic 900 110px Arial'; sg.textAlign = 'center'; sg.fillText('APEX GARAGE', 512, 140);
  const st = new THREE.CanvasTexture(sc); st.colorSpace = THREE.SRGBColorSpace;
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(7, 1.37), new THREE.MeshBasicMaterial({ map: st, toneMapped: false })); sign.position.set(0, 7, -6.78); scene.add(sign);
  // tool wall and tyre stacks
  const board = new THREE.Mesh(new THREE.BoxGeometry(5, 2.6, .1), std(0x3a4a52)); board.position.set(-5.5, 2.8, -6.75); scene.add(board);
  const tool = std(0xc9d0d3, { metalness: .8, roughness: .3 });
  for (let i = 0; i < 14; i++) { const t = new THREE.Mesh(new THREE.BoxGeometry(.08 + Math.random() * .1, .4 + Math.random() * .7, .05), tool); t.position.set(-7.5 + i * .3, 2.6 + Math.random() * .5, -6.65); t.rotation.z = (Math.random() - .5) * .3; scene.add(t); }
  const cab = new THREE.Mesh(new THREE.BoxGeometry(3, 1.6, 1.2), std(0xc8342c, { roughness: .4, metalness: .3 })); cab.position.set(-5.8, .8, -6); scene.add(cab);
  const tyre = new THREE.TorusGeometry(.55, .26, 10, 24), rubber = std(0x15171a, { roughness: .95 });
  for (const [x, z] of [[6, -5.5], [7.4, -4.8], [6.6, -3.2]]) for (let k = 0; k < 4; k++) { const t = new THREE.Mesh(tyre, rubber); t.rotation.x = Math.PI / 2; t.position.set(x, .26 + k * .5, z); t.castShadow = true; scene.add(t); }

  // turntable
  const table = new THREE.Group(); scene.add(table);
  const plate = new THREE.Mesh(new THREE.CylinderGeometry(2.6, 2.7, .18, 64), new THREE.MeshStandardMaterial({ color: 0x2c363c, roughness: .25, metalness: .7 }));
  plate.position.y = .09; plate.receiveShadow = true; table.add(plate);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(2.62, .04, 8, 96), new THREE.MeshBasicMaterial({ color: 0xff653d, toneMapped: false })); ring.rotation.x = Math.PI / 2; ring.position.y = .17; scene.add(ring);
  const holder = new THREE.Group(); holder.position.y = .18; table.add(holder);

  // lights
  scene.add(new THREE.HemisphereLight(0xcfe6ff, 0x20262a, 1.1));
  const key = new THREE.SpotLight(0xfff2e0, 260, 30, .55, .5, 1.6); key.position.set(4, 8, 5); key.target.position.set(0, .5, 0); key.castShadow = true; key.shadow.mapSize.set(1024, 1024); scene.add(key, key.target);
  const rim = new THREE.SpotLight(0x42c9cb, 120, 25, .6, .6, 1.6); rim.position.set(-5, 5, -4); rim.target.position.set(0, .5, 0); scene.add(rim, rim.target);
  const warm = new THREE.PointLight(0xff8a50, 30, 14, 1.8); warm.position.set(3, 2, -3); scene.add(warm);

  let car = null, spin = 0, drag = null, targetY = -.6;
  const look = new THREE.Vector3(0, .65, 0);
  return {
    scene, camera,
    setCar(model) {
      if (car) { holder.remove(car); car.traverse(o => { o.geometry?.dispose(); }); }
      car = model; car.scale.setScalar(2.4); car.position.set(0, 0, 0); car.traverse(o => { if (o.isMesh) o.castShadow = true; }); holder.add(car);
      spin = .35; // a little flourish when the kart changes
    },
    update(dt, t) {
      if (!drag) targetY += dt * (.32 + spin * 2.5);
      spin = Math.max(0, spin - dt * .7);
      holder.rotation.y += (targetY - holder.rotation.y) * Math.min(1, dt * 6);
      const w = innerWidth, h = innerHeight; camera.aspect = w / h;
      // keep the kart in the free half of the screen next to the info panel
      const shift = w > 900 ? -1.4 : 0;
      camera.position.set(5.2 + Math.sin(t * .2) * .2, 2.3, 6.2); camera.lookAt(look.set(shift, .75, 0));
      camera.updateProjectionMatrix();
      neon.material.color.setHSL(.04, 1, .55 + Math.sin(t * 3) * .05);
    },
    dragStart(x) { drag = { x, y: targetY }; },
    dragMove(x) { if (drag) targetY = drag.y + (x - drag.x) * .012; },
    dragEnd() { drag = null; },
  };
}
