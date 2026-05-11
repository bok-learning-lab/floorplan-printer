import Link from "next/link";

export const metadata = {
  title: "Footprint Studio · 50 Church St",
};

export default function Home() {
  return (
    <div className="studio choose-screen">
      <div className="choose-card">
        <div className="choose-brand">
          <div className="brand-line" />
          <div className="brand-row">
            <div className="brand">FOOTPRINT</div>
            <div className="brand-sub">STUDIO</div>
          </div>
          <div className="meta-row">
            <div>
              <span className="meta-label">project</span> <span className="meta-val">50 CHURCH ST · 3F</span>
            </div>
          </div>
        </div>

        <div className="choose-title">Pick a workspace</div>

        <div className="choose-options">
          <Link href="/digital" className="choose-option">
            <div className="choose-option-num">01</div>
            <div className="choose-option-head">Digital workspace</div>
            <div className="choose-option-body">
              Lay out objects on the screen at any scale. Drag, rotate, group, flip. Save and re-open.
            </div>
            <div className="choose-option-cta">open digital →</div>
          </Link>

          <Link href="/printed" className="choose-option">
            <div className="choose-option-num">02</div>
            <div className="choose-option-head">Print kit</div>
            <div className="choose-option-body">
              Print the floor plan and a cut-out shape pack — both at 1 inch = 1 foot — across multiple
              pages you tape together. Arrange the room physically.
            </div>
            <div className="choose-option-cta">open print kit →</div>
          </Link>
        </div>

        <div className="choose-foot">DRAWN BY · USER &nbsp;·&nbsp; AS-PLACED &nbsp;·&nbsp; NTS</div>
      </div>
    </div>
  );
}
