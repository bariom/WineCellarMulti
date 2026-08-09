import { createHelpArticles } from "./articleFactory";

const allRoles = ["owner", "admin", "member", "viewer"] as const;
const writeRoles = ["owner", "admin", "member"] as const;

export const helpArticles = createHelpArticles("en", [
  ["onboarding", "getting-started", ["home", "cellar", "settings"], allRoles, "Getting started", "Set up a cellar and add your first bottles.", "Create or select a cellar.|Add a wine and quantity.|Complete vintage, format and purchase price.", "Viewers can browse but cannot edit.", "dashboard|import-export"],
  ["dashboard", "getting-started", ["home"], allRoles, "Read the dashboard", "Use operational views for priorities, value, maturity and missing data.", "Choose a dashboard focus.|Open a priority position.|Complete suggested actions.", "Value estimates always need verification.", "wine-detail|value-window"],
  ["cellar-filters", "cellar", ["cellar"], allRoles, "Cellar and filters", "Search, filter and organize the active collection.", "Use search and quick filters.|Save structured wine data.|Open details to edit.", "Filters do not change data.", "wine-detail|import-export"],
  ["label-recognition", "cellar", ["cellar"], writeRoles, "Label recognition", "Use a label photo to propose wine data.", "Take or upload a clear photo.|Review the proposal.|Confirm or correct fields.", "Availability can depend on role and external services; always verify results.", "wine-detail|ai-pack"],
  ["wine-detail", "cellar", ["cellar", "history"], allRoles, "Wine details", "Review and update value, ownership, notes, grapes and scores.", "Open a wine.|Review available data.|Edit only with write permission.", "AI information is guidance, not certification.", "consumption|value-window"],
  ["consumption", "cellar", ["cellar", "history"], writeRoles, "Consumption, tastings and private sales", "Record a consumed bottle or one or more bottles sold from a private cellar.", "Open wine details.|Use Consume for a tasting or Sell bottles for a sale.|For a sale, enter quantity, date and unit price.", "Consumption and sales reduce stock; sold quantity cannot exceed available bottles.", "wine-detail|history"],
  ["restaurant-mode", "cellar", ["home", "cellar", "settings"], writeRoles, "Restaurant cellar", "Manage the wine list, stock, sales, revenue and gross margin.", "Select Restaurant under Settings > Structure.|Set purchase and sale prices on each wine.|Use Sell bottles and review leading bottles, wine types, regions, low stock and period results on the dashboard.", "Gross margin and potential value are operational information, not accounting or tax calculations. Different currencies are never added together.", "wine-detail|import-export"],
  ["value-window", "decisions", ["cellar", "home"], allRoles, "Value and drinking window", "Maintain value history and drinking maturity.", "Add or update value.|Read its history.|Generate a drinking window when available.", "AI estimates can have costs and require source verification.", "ai-pack|dashboard"],
  ["wishlist", "decisions", ["wishlist"], allRoles, "Wishlist", "Keep future purchases separate from bought positions.", "Create a list.|Set target price and priority.|Convert an item after buying.", "AI market output does not replace seller verification.", "buying-advice|ai-pack"],
  ["pairing", "decisions", ["pairing"], allRoles, "Food pairing", "Ask for pairings from your cellar or the market.", "Describe the dish.|Set budget or preferences.|Verify the result before serving.", "AI generation requires a key or AI Pack credit and may consume budget.", "ai-pack|wine-detail"],
  ["wine-pulse", "decisions", ["pulse"], allRoles, "Wine Pulse", "Browse an editorial selection of international wine news.", "Open Wine Pulse from the main menu.|Filter by language or topic.|Open the original source to read the full article.", "Titles and summaries are AI-assisted; rely on the original source for full details.", "dashboard|ai-pack"],
  ["buying-advice", "decisions", ["buying"], allRoles, "Buying advice", "Search offers and advice with a goal, budget and deadline.", "Choose goal and location.|Set budget and urgency.|Check sources, availability and price.", "AI sources can change: always verify price, stock and conditions.", "wishlist|ai-pack"],
  ["compare", "decisions", ["cellar"], allRoles, "Wine comparison", "Compare bottles by style, readiness and occasion.", "Select up to four wines.|Compare structured data.|Use AI comparison for two wines.", "AI comparison may consume credits and is decision support only.", "pairing|ai-pack"],
  ["roles-cellars", "sharing", ["settings"], allRoles, "Cellars and roles", "Manage cellars, members and permissions.", "Open Settings > Cellars.|Invite an existing user.|Assign an appropriate role.", "Owners and admins have broader permissions; viewers are read-only.", "sharing|coownership"],
  ["sharing", "sharing", ["cellar", "settings"], writeRoles, "Sharing", "Send and receive shared positions between cellars.", "Define ownership and visibility.|Send the proposal.|Follow its response in notifications.", "Sharing can expose position information to other users.", "coownership|roles-cellars"],
  ["coownership", "sharing", ["cellar", "settings"], writeRoles, "Co-ownership", "Create agreements, shares and payment records.", "Create an agreement from a position.|Verify shares and custody.|Wait for or record responses.", "A shared agreement is not legal or tax advice.", "sharing|roles-cellars"],
  ["notifications", "account", ["home", "settings"], allRoles, "Notifications", "Track invitations, deliveries, actions and system updates.", "Open the notification center.|Read action context.|Archive or act when needed.", "Notifications do not replace checking actual delivery status.", "roles-cellars|troubleshooting"],
  ["ai-pack", "account", ["settings", "pairing", "buying"], allRoles, "AI key and AI Pack", "Configure a personal key or use AI Pack credit.", "Open Settings > AI.|Choose a personal key or AI Pack.|Review model and budget.", "AI requests can cost money; never place secrets in article or text fields.", "billing|pairing"],
  ["billing", "account", ["settings"], allRoles, "Billing and access", "Review access, redeem codes and payments.", "Open Settings > Billing.|Check access validity.|Use the payment portal when available.", "Availability and amounts depend on plan and role.", "ai-pack|troubleshooting"],
  ["import-export", "troubleshooting", ["settings"], ["owner", "admin"], "Import, export and backup", "Export and restore cellar data deliberately.", "Export before major operations.|Inspect an import file.|Import only needed blocks.", "Importing members, invitations or ownership can change access and sharing.", "offline-pwa|roles-cellars"],
  ["offline-pwa", "troubleshooting", ["settings", "cellar"], allRoles, "Offline and PWA", "Install the PWA and view offline snapshots in read-only mode.", "Install from the browser.|Keep an offline copy current.|Reconnect to edit or sync.", "An offline snapshot may not contain the newest server changes.", "import-export|troubleshooting"],
  ["troubleshooting", "troubleshooting", ["settings", "cellar"], allRoles, "Troubleshooting", "Resolve access, synchronization and missing-data problems.", "Check connection and active account.|Reload the view.|Export data or contact support with context.", "Never share passwords, tokens, API keys or payment data with support.", "offline-pwa|billing"],
].map(([id, category, relatedViews, roles, title, summary, steps, warnings, relatedArticles]) => ({
  id: id as string,
  slug: id === "onboarding" ? "getting-started" : id as string,
  title: title as string,
  summary: summary as string,
  keywords: [id as string, title as string, category as string],
  category: category as "getting-started" | "cellar" | "decisions" | "sharing" | "account" | "troubleshooting",
  roles: roles as Array<"owner" | "admin" | "member" | "viewer">,
  relatedViews: relatedViews as Array<"home" | "cellar" | "history" | "wishlist" | "pairing" | "pulse" | "buying" | "settings">,
  steps: (steps as string).split("|"),
  warnings: (warnings as string).split("|"),
  relatedArticles: (relatedArticles as string).split("|"),
  updatedAt: "2026-07-16",
})));
