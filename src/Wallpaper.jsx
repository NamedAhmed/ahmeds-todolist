// Wallpaper.jsx = the background behind the whole app. It also applies the theme and font.
//
// It is a stack of layers behind everything (see .wallpaper in appearance.css):
//   1. your background picture (if you chose one), or a video you added
//   2. a film in the theme's colour over it, so text stays readable (Dim, set by Auto readability below)

import { useEffect, useRef } from 'react';
import {
  LIGHT_THEMES,
  LIGHT_THEME_MIN_GLASS,
  MAX_GLASS,
  NO_PICTURE,
  UNKNOWN_TONES,
  backingNeeded,
  colourOf,
  useAppearance,
  useApplyFont,
  useApplyGlass,
  useApplyTheme,
  useBackdropTones,
  useMediaUrl,
  usePictureId,
} from './appearance.js';

export default function Wallpaper() {
  const { theme, wallpaper, dim, glass, font, look } = useAppearance();
  const pictureId = usePictureId();
  const pictureUrl = useMediaUrl(pictureId);
  const videoUrl = useMediaUrl(wallpaper.startsWith('video:') ? wallpaper : NO_PICTURE);
  const frameBox = useRef(null);

  useApplyTheme(theme); // put the theme on the page (this component is always on screen)
  useApplyFont(theme, font);
  useApplyGlass(theme, look);

  const showsSomething = pictureUrl || videoUrl;

  // What is behind the text: the picture or video is measured. (Until it has been, or if it can't be, it is treated as
  // an unknown, bright one, so the text is readable meanwhile.)
  const measured = useBackdropTones(videoUrl ? null : pictureUrl, videoUrl);
  const tones = measured ?? UNKNOWN_TONES;
  const isLightTheme = LIGHT_THEMES.includes(theme);

  // Tell the page's CSS whether something is behind the columns, how strong the Dim film is, and how frosted to
  // make the columns (see ".wallpaper-dim" and "html[data-backdrop] .col" in appearance.css).
  useEffect(() => {
    const root = document.documentElement;
    root.toggleAttribute('data-backdrop', !!showsSomething);
    root.toggleAttribute('data-animated', !!videoUrl); // moving: the glass blur is capped (appearance.css)

    const canDim = theme !== 'liquid'; // the Liquid theme has no Dim film
    let dimNow = canDim ? dim : 0;
    let strength = glass;
    if (isLightTheme) strength = Math.max(strength, LIGHT_THEME_MIN_GLASS); // dark text needs a pale panel behind it

    // Auto readability: add just enough Glass (and then Dim) on top of the theme's own for the text to be clear.
    // The film and the panel stack up: together they cover 1 - (1 - dim) x (1 - glass) of the picture.
    // (Not on Liquid: its glass always looks the same, see LIQUID_GLASS in appearance.js.)
    if (showsSomething && canDim) {
      const needed = backingNeeded(tones, colourOf('var(--text)'), colourOf('var(--muted)'), colourOf('var(--bg)'));
      const glassNeeded = 1 - (1 - needed) / (1 - dimNow);
      strength = Math.max(strength, Math.min(MAX_GLASS, glassNeeded));
      dimNow = Math.max(dimNow, 1 - (1 - needed) / (1 - strength)); // the panel alone wasn't enough
    }

    frameBox.current.style.setProperty('--dim', dimNow);
    root.style.setProperty('--dim-soft', dimNow * 0.5); // the same Dim, at half strength, for selections, the add box and the daily circles
    root.style.setProperty('--glass', Math.ceil(strength * 100) + '%'); // rounded up, so Auto never falls just short
    root.style.setProperty('--glass-blur', Math.round(strength * 20) + 'px'); // more glass = a stronger blur too
  }, [showsSomething, videoUrl, glass, dim, tones, theme, isLightTheme]);

  return (
    <div className="wallpaper" aria-hidden="true" ref={frameBox}>
      {pictureUrl && <div className="wallpaper-image" style={{ backgroundImage: `url(${pictureUrl})` }} />}
      {videoUrl && <video className="wallpaper-video" src={videoUrl} autoPlay loop muted playsInline />}
      {showsSomething && <div className="wallpaper-dim" />}
    </div>
  );
}
