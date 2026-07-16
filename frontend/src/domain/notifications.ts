import type { Locale, UserNotification } from "../types";

type NotificationCopy = Pick<UserNotification, "title" | "message">;

function firstNumber(value: string): string | null {
  return value.match(/\d+/)?.[0] || null;
}

function notificationSubject(title: string, prefix: string): string {
  return title.startsWith(prefix) ? title.slice(prefix.length).trim() : "";
}

/**
 * Notifications are persisted so they remain available after a session ends.
 * Older records contain Italian prose; render their semantic kind in the active
 * interface language instead of exposing the language used when they were made.
 */
export function localizedNotification(notification: UserNotification, locale: Locale): NotificationCopy {
  if (locale === "it") return notification;

  const count = firstNumber(notification.message);

  switch (notification.kind) {
    case "smart_drink_now":
      return { title: "Cellar reminder", message: count ? `${count} wines are ready to drink in your cellar.` : "Some wines are ready to drink in your cellar." };
    case "smart_past_window":
      return { title: "Past peak window", message: count ? `${count} wines are past their ideal drinking window.` : "Some wines are past their ideal drinking window." };
    case "smart_future_deliveries":
      return { title: "Upcoming deliveries", message: count ? `${count} future deliveries are being tracked in your cellar.` : "Future deliveries are being tracked in your cellar." };
    case "smart_to_collect":
      return { title: "Bottles to collect", message: count ? `${count} wines are marked for collection.` : "Some wines are marked for collection." };
    case "smart_entitlement_expiring":
      return { title: "Access expiring", message: count ? `Your access expires in ${count} days.` : "Your access is about to expire." };
    case "trial_redeem_code":
      return { title: "Vinaris trial available", message: count ? `A ${count}-day trial code is available to start using Vinaris.` : "A trial code is available to start using Vinaris." };
    case "new_user_registration":
      return { title: "New user registration", message: "A new user has created an account and is ready for review." };
    case "ai_credits":
      return { title: "AI credit update", message: notification.message.match(/[\d.]+\s*USD/)?.[0] ? `Your AI credit balance was updated (${notification.message.match(/[\d.]+\s*USD/)?.[0]}).` : "Your AI credit balance was updated." };
    case "redeem_code":
      return { title: "New redeem code available", message: count ? `A ${count}-day redeem code has been generated.` : "A new redeem code has been generated." };
    case "subscription":
      return notification.title === "Abbonamento in disdetta"
        ? { title: "Subscription scheduled for cancellation", message: "Your subscription remains active until the end of the already paid period." }
        : { title: "Subscription ended", message: "Your Stripe subscription was cancelled. Redeemed codes remain valid until they expire." };
    case "payment_failed":
      return { title: "Payment failed", message: "Stripe could not collect the renewal payment. Check your payment method." };
    case "coownership_agreement": {
      const wine = notification.message.match(/accordo per\s+(.+?)\.$/i)?.[1];
      return { title: "Co-ownership agreement to review", message: wine ? `You have been invited to review the agreement for ${wine}.` : "You have been invited to review a co-ownership agreement." };
    }
    case "coownership_response": {
      const response = notification.message.match(/^(.+?) ha (accettato|rifiutato) l'accordo per (.+?)\. Stato: (.+?)\.$/i);
      if (response) {
        const decision = response[2] === "accettato" ? "accepted" : "declined";
        return { title: "Response to a co-ownership agreement", message: `${response[1]} ${decision} the agreement for ${response[3]}. Status: ${response[4]}.` };
      }
      return { title: "Response to a co-ownership agreement", message: "A participant responded to a co-ownership agreement." };
    }
    case "share_revocation": {
      const wine = notificationSubject(notification.title, "Rimozione richiesta:");
      return { title: wine ? `Removal requested: ${wine}` : "Removal requested", message: "A request to remove a shared position from your cellar requires your response." };
    }
    case "share_revocation_result": {
      const wine = notificationSubject(notification.title, "Revoca comproprietà:");
      return { title: wine ? `Co-ownership revocation: ${wine}` : "Co-ownership revocation", message: "The recipient responded to the shared-position removal request." };
    }
    default:
      return notification;
  }
}
