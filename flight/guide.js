// Demo-page extra: a Guide button and a how-to panel, added only to the public
// demo copy of Archipelago Run. The submitted game files stay untouched.
(function () {
  var style = document.createElement('style');
  style.textContent = [
    '#guide-btn { position: fixed; top: 14px; right: 14px; z-index: 20;',
    '  font: 600 15px/1 system-ui, sans-serif; color: #0b1c26; background: #ffb43a;',
    '  border: 0; border-radius: 999px; padding: 10px 18px; cursor: pointer;',
    '  box-shadow: 0 2px 10px rgba(0,0,0,.45); }',
    '#guide-btn:hover { background: #ffc35c; }',
    '#guide-panel { position: fixed; inset: 0; z-index: 30; display: none;',
    '  background: rgba(4, 12, 18, .72); padding: 20px; overflow: auto; }',
    '#guide-panel.open { display: block; }',
    '#guide-card { max-width: 560px; margin: 4vh auto; background: #0e2432;',
    '  color: #e8f1f5; border: 1px solid #2b4a5c; border-radius: 14px;',
    '  padding: 22px 26px; font: 15px/1.55 system-ui, sans-serif; }',
    '#guide-card h2 { margin: 0 0 4px; font-size: 22px; color: #ffb43a; }',
    '#guide-card h3 { margin: 18px 0 6px; font-size: 16px; color: #ffb43a; }',
    '#guide-card p { margin: 6px 0; }',
    '#guide-card table { border-collapse: collapse; width: 100%; }',
    '#guide-card td { padding: 4px 8px 4px 0; vertical-align: top; }',
    '#guide-card td:first-child { white-space: nowrap; color: #ffd88a; font-weight: 600; }',
    '#guide-close { margin-top: 18px; font: 600 15px/1 system-ui, sans-serif;',
    '  color: #0b1c26; background: #ffb43a; border: 0; border-radius: 999px;',
    '  padding: 10px 18px; cursor: pointer; }'
  ].join('\n');
  document.head.appendChild(style);

  var btn = document.createElement('button');
  btn.id = 'guide-btn';
  btn.type = 'button';
  btn.textContent = 'Guide';

  var panel = document.createElement('div');
  panel.id = 'guide-panel';
  panel.innerHTML =
    '<div id="guide-card">' +
    '<h2>Archipelago Run — pilot guide</h2>' +
    '<p>Fly a Cessna 172 over an Indonesian archipelago. Take off, chase a ring ' +
    'course against the clock, or shoot a graded landing on runway 27.</p>' +
    '<h3>Controls</h3>' +
    '<table>' +
    '<tr><td>Mouse</td><td>Steer: move it to pitch and bank. Click = confirm.</td></tr>' +
    '<tr><td>↑ / ↓</td><td>Pitch down / up (arrows also step through menus)</td></tr>' +
    '<tr><td>← / → or A / D</td><td>Bank left / right</td></tr>' +
    '<tr><td>W or R / S</td><td>Throttle up / down</td></tr>' +
    '<tr><td>F</td><td>Flaps: cycle 0 / 10 / 20 / 30 degrees</td></tr>' +
    '<tr><td>C</td><td>Camera: cockpit view or chase view</td></tr>' +
    '<tr><td>Space / Enter</td><td>Confirm, start, continue</td></tr>' +
    '<tr><td>P</td><td>Pause</td></tr>' +
    '<tr><td>X</td><td>Wind gusts on / off</td></tr>' +
    '<tr><td>M</td><td>Sound on / off</td></tr>' +
    '<tr><td>Esc</td><td>Back to menu</td></tr>' +
    '</table>' +
    '<h3>Flying the 172</h3>' +
    '<p>Full throttle, ease the nose up at <b>55 knots</b>. She stalls at 53 clean ' +
    'and 48 with full flap, so keep speed in hand. For landing: flaps 30, fly the ' +
    'final at <b>60–65 knots</b>, and watch the PAPI lights beside the runway — ' +
    'two white, two red means you are on the glide path. Four red: too low. ' +
    'Four white: too high.</p>' +
    '<h3>Modes</h3>' +
    '<p><b>Ring courses</b> — 6, 8 or 10 rings against the clock.<br>' +
    '<b>Landing challenge</b> — land on runway 27, graded S to D, then refuel.<br>' +
    '<b>Free flight</b> — dawn, noon or dusk, fuel burns as you fly.</p>' +
    '<p>Best played with a keyboard. On a phone you can look around the title ' +
    'screen, but the plane needs keys to fly.</p>' +
    '<button id="guide-close" type="button">Close</button>' +
    '</div>';

  document.body.appendChild(btn);
  document.body.appendChild(panel);

  function setOpen(open) {
    panel.classList.toggle('open', open);
  }
  btn.addEventListener('click', function () { setOpen(true); });
  panel.addEventListener('click', function (event) {
    if (event.target === panel || event.target.id === 'guide-close') setOpen(false);
  });
  // While the guide is open, keep Space / Enter / Esc for the guide so the
  // game behind it does not react.
  window.addEventListener('keydown', function (event) {
    if (!panel.classList.contains('open')) return;
    if (event.code === 'Escape') { setOpen(false); event.stopPropagation(); }
    else if (event.code === 'Space' || event.code === 'Enter') {
      event.stopPropagation();
      event.preventDefault();
    }
  }, true);
})();
