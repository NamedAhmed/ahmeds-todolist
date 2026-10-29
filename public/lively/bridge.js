// bridge.js = how the app talks to a wallpaper page.
//
// A wallpaper is someone else's web page, so it runs in a sandboxed <iframe> WITHOUT "allow-same-origin": it can't read
// the app's storage (where the sign-in lives) or reach into the app, and the app can't reach into it either.
// Instead the app sends messages, and this script (added to each wallpaper's page) acts on them:
//   { type: 'lively-property', id, name, value, suffix }  pass a setting to the page's livelyPropertyListener(name, value)
//                                                         (a picture arrives as a Blob and gets an address in here)
//   { type: 'lively-pointer', x, y }                      the mouse moved over the app: pass it on to the page
// Each setting is answered with { type: 'lively-property-ack', id, ok } so the app knows to try again later.
(function () {
  let pictureUrl = null; // the address of the last picture the app sent, freed when the next one comes

  window.addEventListener('message', function (event) {
    if (event.source !== window.parent) return;
    const data = event.data || {};

    if (data.type === 'lively-property') {
      let value = data.value;
      if (value instanceof Blob) {
        if (pictureUrl) URL.revokeObjectURL(pictureUrl);
        pictureUrl = URL.createObjectURL(value);
        value = pictureUrl + (data.suffix || '');
      }
      let ok = false;
      if (typeof window.livelyPropertyListener === 'function') {
        try {
          window.livelyPropertyListener(data.name, value);
          ok = true;
        } catch (error) {
          // the page has not finished starting: the app tries again shortly
        }
      }
      window.parent.postMessage({ type: 'lively-property-ack', id: data.id, ok: ok }, '*');
    } else if (data.type === 'lively-pointer') {
      const target = document.elementFromPoint(data.x, data.y) || document.body;
      if (target) target.dispatchEvent(new MouseEvent('mousemove', { clientX: data.x, clientY: data.y, bubbles: true }));
    }
  });
})();
