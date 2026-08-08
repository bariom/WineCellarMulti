import { ArrowsDownUp } from "@phosphor-icons/react/dist/csr/ArrowsDownUp";
import { BellRinging } from "@phosphor-icons/react/dist/csr/BellRinging";
import { BeerBottle } from "@phosphor-icons/react/dist/csr/BeerBottle";
import { CalendarBlank } from "@phosphor-icons/react/dist/csr/CalendarBlank";
import { Camera } from "@phosphor-icons/react/dist/csr/Camera";
import { CardsThree } from "@phosphor-icons/react/dist/csr/CardsThree";
import { CaretLeft } from "@phosphor-icons/react/dist/csr/CaretLeft";
import { CaretRight } from "@phosphor-icons/react/dist/csr/CaretRight";
import { ChartDonut } from "@phosphor-icons/react/dist/csr/ChartDonut";
import { ChartLineUp } from "@phosphor-icons/react/dist/csr/ChartLineUp";
import { CheckCircle } from "@phosphor-icons/react/dist/csr/CheckCircle";
import { DownloadSimple } from "@phosphor-icons/react/dist/csr/DownloadSimple";
import { Funnel } from "@phosphor-icons/react/dist/csr/Funnel";
import { GearSix } from "@phosphor-icons/react/dist/csr/GearSix";
import { HeartStraight } from "@phosphor-icons/react/dist/csr/HeartStraight";
import { MagnifyingGlass } from "@phosphor-icons/react/dist/csr/MagnifyingGlass";
import { MapPin } from "@phosphor-icons/react/dist/csr/MapPin";
import { NewspaperClipping } from "@phosphor-icons/react/dist/csr/NewspaperClipping";
import { Martini } from "@phosphor-icons/react/dist/csr/Martini";
import { List } from "@phosphor-icons/react/dist/csr/List";
import { Package } from "@phosphor-icons/react/dist/csr/Package";
import { PencilSimple } from "@phosphor-icons/react/dist/csr/PencilSimple";
import { Scan } from "@phosphor-icons/react/dist/csr/Scan";
import { SignOut } from "@phosphor-icons/react/dist/csr/SignOut";
import { Smiley } from "@phosphor-icons/react/dist/csr/Smiley";
import { SmileySad } from "@phosphor-icons/react/dist/csr/SmileySad";
import { Sparkle } from "@phosphor-icons/react/dist/csr/Sparkle";
import { StarFour } from "@phosphor-icons/react/dist/csr/StarFour";
import { Trash } from "@phosphor-icons/react/dist/csr/Trash";
import { Truck } from "@phosphor-icons/react/dist/csr/Truck";
import { UploadSimple } from "@phosphor-icons/react/dist/csr/UploadSimple";
import { UsersThree } from "@phosphor-icons/react/dist/csr/UsersThree";
import { Warehouse } from "@phosphor-icons/react/dist/csr/Warehouse";
import { Wine } from "@phosphor-icons/react/dist/csr/Wine";
import { ComponentProps } from "react";

export type AppIconName =
  | "bottle" | "cellar" | "dashboard" | "dashboard-cards" | "wishlist" | "search" | "filter" | "sort"
  | "edit" | "delete" | "import" | "export" | "compare" | "camera" | "chevron-left" | "chevron-right"
  | "sentiment-positive" | "sentiment-negative" | "status-delivered" | "status-pickup" | "status-shipped" | "status-ordered"
  | "glass-sparkle" | "calendar" | "chart" | "star" | "users" | "settings" | "logout" | "bell" | "location" | "grapes" | "menu" | "newspaper";

type IconVariant = "action" | "navigation" | "feature" | "premium" | "ai" | "status";
type IconTone = "default" | "muted" | "accent" | "success" | "warning" | "danger" | "ai";
type AppIconProps = Omit<ComponentProps<typeof Wine>, "weight" | "size"> & {
  name: AppIconName;
  size?: number | string;
  variant?: IconVariant;
  tone?: IconTone;
  detailLevel?: "compact" | "standard" | "rich";
  background?: boolean;
  active?: boolean;
  decorative?: boolean;
};

const icons: Record<AppIconName, typeof Wine> = {
  bottle: BeerBottle, cellar: Warehouse, dashboard: ChartDonut, "dashboard-cards": CardsThree, wishlist: HeartStraight,
  search: MagnifyingGlass, filter: Funnel, sort: ArrowsDownUp, edit: PencilSimple, delete: Trash,
  import: DownloadSimple, export: UploadSimple, compare: ChartLineUp, camera: Camera,
  "chevron-left": CaretLeft, "chevron-right": CaretRight, "sentiment-positive": Smiley,
  "sentiment-negative": SmileySad, "status-delivered": CheckCircle, "status-pickup": Package,
  "status-shipped": Truck, "status-ordered": CalendarBlank, "glass-sparkle": Martini,
  calendar: CalendarBlank, chart: ChartLineUp, star: StarFour, users: UsersThree, settings: GearSix,
  logout: SignOut, bell: BellRinging, location: MapPin, grapes: Wine, menu: List, newspaper: NewspaperClipping,
};

/** Vinaris adapter over Phosphor: duotone section icons and precise operational controls. */
export function AppIcon({
  name, size = "1em", variant = "action", tone = "default", detailLevel = "standard",
  background = false, active = false, decorative = true, className = "", ...props
}: AppIconProps) {
  const Icon = icons[name];
  const weight = detailLevel === "compact" ? "regular" : variant === "action" || variant === "navigation" ? "bold" : "duotone";
  return (
    <span className={`app-icon app-icon--${variant} app-icon--${tone}${background ? " has-background" : ""}${active ? " is-active" : ""} ${className}`.trim()}>
      <Icon size={size} weight={weight} aria-hidden={decorative ? true : undefined} focusable="false" {...props} />
      {variant === "ai" || (variant === "premium" && detailLevel === "rich") ? <StarFour className="app-icon-spark" size="0.38em" weight="fill" aria-hidden="true" /> : null}
      {name === "glass-sparkle" ? <Sparkle className="app-icon-spark" size="0.38em" weight="fill" aria-hidden="true" /> : null}
      {name === "camera" && variant !== "action" ? <Scan className="app-icon-scan" size="0.64em" weight="bold" aria-hidden="true" /> : null}
    </span>
  );
}

export function FeatureIcon(props: AppIconProps) {
  return <AppIcon variant="feature" detailLevel="rich" background {...props} />;
}
