import "./WishlistDestinationPicker.css";

/** Which wishlist an AI suggestion is added to; hidden when there is only one. */
export function WishlistDestinationPicker({ lists, value, onChange, locale, disabled = false }: {
  lists: Array<{ id: string; name: string }>;
  value: string;
  onChange: (listId: string) => void;
  locale: "it" | "en";
  disabled?: boolean;
}) {
  if (lists.length < 2) return null;
  return (
    <label className="wishlist-destination-picker">
      <span>{locale === "it" ? "Wishlist di destinazione" : "Destination wishlist"}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)} disabled={disabled}>
        {lists.map((list) => <option key={list.id} value={list.id}>{list.name}</option>)}
      </select>
    </label>
  );
}

export default WishlistDestinationPicker;
