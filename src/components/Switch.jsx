// Switch.jsx = an on/off switch. The real checkbox sits invisibly on top of it, so clicking and the keyboard work as usual.

export default function Switch({ checked, onChange }) {
  return (
    <span className="switch">
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      <i />
    </span>
  );
}
