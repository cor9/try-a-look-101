"use client";

const CARDS = [
  { cap: "Girl Next Door", shirt: "#b6a3e0", bg: "#c9d8bf", rot: -8, x: 10, y: 30 },
  { cap: "Tough Kid", shirt: "#1d1d1d", bg: "#55585e", rot: 6, x: 190, y: 0 },
  { cap: "Comedic Best Friend", shirt: "#d23a3a", bg: "#a9c6e8", rot: -3, x: 120, y: 190 },
  { cap: "Dramatic Lead", shirt: "#6a1f2f", bg: "#4a5568", rot: 9, x: 290, y: 170 },
];

export function Welcome({ onStart }: { onStart: () => void }) {
  return (
    <section className="welcome">
      <div>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo.jpeg" alt="Try A Look" className="welcome-logo" />
        <h1>
          See the wardrobe <span>before</span> the shoot.
        </h1>
        <p className="welcome-lede">
          Upload your actor&apos;s photo, hang outfits on the rail — a henley, a cardigan, that denim jacket — and preview
          each headshot look built around the casting types you&apos;re going for.
        </p>
        <button className="btn btn-hot" onClick={onStart}>
          Start a headshot plan
        </button>
        <ol className="welcome-steps">
          <li>
            <span className="dot" style={{ background: "var(--blue)" }}>1</span> Add an actor photo and casting types
          </li>
          <li>
            <span className="dot" style={{ background: "var(--teal)" }}>2</span> Build a wardrobe from photos or descriptions
          </li>
          <li>
            <span className="dot" style={{ background: "var(--red)" }}>3</span> Layer outfits and preview them — then tweak in plain English
          </li>
          <li>
            <span className="dot" style={{ background: "var(--orange)" }}>4</span> Pick favorites and download a session plan + packing list
          </li>
        </ol>
        <p className="small muted" style={{ marginTop: 18 }}>
          Private by default: photos stay in your browser. Previews are AI simulations for planning, not real photos.
        </p>
      </div>
      <div className="welcome-art" aria-hidden>
        {CARDS.map((c) => (
          <div key={c.cap} className="polaroid" style={{ left: c.x, top: c.y, transform: `rotate(${c.rot}deg)` }}>
            <div className="ph" style={{ background: c.bg }}>
              <div className="shirt" style={{ background: c.shirt }} />
            </div>
            <div className="cap">{c.cap}</div>
          </div>
        ))}
      </div>
    </section>
  );
}
