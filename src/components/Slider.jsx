// Slider.jsx = a range slider that shows how far along it is. The browser's own slider can't
// colour the part before the knob, so the filled amount is passed to the CSS as --fill
// (see .slider in appearance.css).

export default function Slider({ min, max, step = 1, value, onChange, ...rest }) {
  const percent = max === min ? 0 : ((value - min) / (max - min)) * 100;

  return (
    <input
      type="range"
      className="slider"
      min={min}
      max={max}
      step={step}
      value={value}
      style={{ '--fill': percent + '%' }}
      onChange={onChange}
      {...rest}
    />
  );
}
