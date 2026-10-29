// Icons.jsx = the small pictures that stand in for words on buttons.
//
// Use it like this:  <Icon name="trash" />
// Every icon is a line drawing that takes the colour of the text around it (currentColor), so it follows the theme
// and the text colour. A button with only an icon still needs a name for screen readers: give the BUTTON an
// aria-label (and a title, so a mouse shows the name when you point at it).

// A circle as a path: centre (x, y) and radius r.
const circle = (x, y, r) => `M${x - r} ${y}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0`;

const PATHS = {
  plus: 'M12 5v14M5 12h14',
  x: 'M6 6l12 12M18 6L6 18',
  trash: 'M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 002 2h6a2 2 0 002-2l1-12M9 7V4h6v3',
  pencil: 'M4 20h4L19 9l-4-4L4 16v4zM13.5 6.5l4 4',
  dots: `${circle(5, 12, 1.2)}${circle(12, 12, 1.2)}${circle(19, 12, 1.2)}`,
  sliders: `M4 7h9M17 7h3M4 17h3M11 17h9${circle(15, 7, 2)}${circle(9, 17, 2)}`,
  repeat: 'M17 2l4 4-4 4M3 11V9a3 3 0 013-3h15M7 22l-4-4 4-4M21 13v2a3 3 0 01-3 3H3',
  help: `${circle(12, 12, 9)}M9.5 9.2a2.6 2.6 0 015 .6c0 1.7-2.5 2-2.5 3.7M12 17h.01`,
  sun: `${circle(12, 12, 4)}M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6L7 7M17 17l1.4 1.4M5.6 18.4L7 17M17 7l1.4-1.4`,
  folder: 'M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V7z',
  task: `${circle(12, 12, 9)}M8 12.5l3 3 5-6`,
  eye: `M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z${circle(12, 12, 3)}`,
  eyeOff: 'M3 3l18 18M10.6 5.1A9.7 9.7 0 0112 5c6 0 10 7 10 7a17 17 0 01-3 3.7M6.6 6.6A17 17 0 002 12s4 7 10 7a9.6 9.6 0 004.2-1M9.9 9.9a3 3 0 004.2 4.2',
  calendar: 'M5 5h14a2 2 0 012 2v12a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2zM3 10h18M8 3v4M16 3v4',
  chevronDown: 'M6 9l6 6 6-6',
  chevronUp: 'M6 15l6-6 6 6',
  palette: `M12 3a9 9 0 100 18c1.2 0 2-.8 2-2 0-.7-.3-1.1-.6-1.5-.4-.5-.4-1.5 1-1.5H17a4 4 0 004-4c0-4.4-4-9-9-9z${circle(7.5, 11, 1)}${circle(10, 7, 1)}${circle(15, 7, 1)}`,
  image: `M5 4h14a2 2 0 012 2v12a2 2 0 01-2 2H5a2 2 0 01-2-2V6a2 2 0 012-2zM3 17l5-5 4 4 3-3 6 6${circle(8.5, 8.5, 1.3)}`,
  user: `${circle(12, 8, 4)}M4 21a8 8 0 0116 0`,
  undo: 'M9 14L4 9l5-5M4 9h10a6 6 0 010 12h-3',
  note: 'M6 3h9l4 4v14H6zM14 3v5h5M9 13h7M9 17h5',
  list: 'M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01',
  download: 'M12 4v11M7 11l5 5 5-5M5 20h14',
  upload: 'M12 16V5M7 9l5-5 5 5M5 20h14',
  infinity: 'M18.2 8.5c-2.6 0-4.4 3.5-6.2 3.5s-3.6-3.5-6.2-3.5a3.5 3.5 0 000 7c2.6 0 4.4-3.5 6.2-3.5s3.6 3.5 6.2 3.5a3.5 3.5 0 000-7z',
  search: `${circle(11, 11, 7)}M20 20l-4-4`,
  grip: `${circle(9, 6, 1)}${circle(15, 6, 1)}${circle(9, 12, 1)}${circle(15, 12, 1)}${circle(9, 18, 1)}${circle(15, 18, 1)}`,
};

export default function Icon({ name, size = 18, ...rest }) {
  return (
    <svg
      className="icon"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      <path d={PATHS[name]} />
    </svg>
  );
}
