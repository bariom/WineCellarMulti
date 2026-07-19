import "./KeyPositionBottlePhoto.css";

export function KeyPositionBottlePhoto({ photoUrl }: { photoUrl: string }) {
  return (
    <span className="key-position-bottle-stage" aria-hidden="true">
      <img src={photoUrl} alt="" loading="lazy" />
    </span>
  );
}

export default KeyPositionBottlePhoto;
