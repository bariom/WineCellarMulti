import "./KeyPositionBottlePhoto.css";
import { useState } from "react";

export function KeyPositionBottlePhoto({ photoUrl }: { photoUrl: string }) {
  const [hasImageError, setHasImageError] = useState(false);
  const hasPhoto = Boolean(photoUrl) && !hasImageError;

  return (
    <span className={`key-position-bottle-stage${hasPhoto ? " has-photo" : ""}`} aria-hidden="true">
      <span className="key-position-bottle-placeholder"><i /><i /><i /></span>
      {hasPhoto ? <img src={photoUrl} alt="" loading="lazy" onError={() => setHasImageError(true)} /> : null}
    </span>
  );
}

export default KeyPositionBottlePhoto;
