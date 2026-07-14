
export function tokenFromUrl() {
  const params = new URLSearchParams(window.location.search);
  return params.get("invite") || params.get("token") || "";
}

export function stripeCheckoutResultFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const result = params.get("stripe_checkout");
  return result === "success" || result === "cancelled" ? result : "";
}

export function emailVerificationResultFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const result = params.get("email_verified");
  return result === "success" || result === "expired" || result === "invalid" ? result : "";
}

export function emailVerificationTokenFromUrl() {
  const params = new URLSearchParams(window.location.search);
  return params.get("email_verify_token") || "";
}

export function passwordResetTokenFromUrl() {
  const params = new URLSearchParams(window.location.search);
  return params.get("password_reset_token") || "";
}

export const STRIPE_CHECKOUT_PLAN_KEY = "vinaris_stripe_checkout_plan";

export const STRIPE_CHECKOUT_BALANCE_KEY = "vinaris_stripe_checkout_balance";

export function inviteLink(token: string) {
  const url = new URL(window.location.href);
  url.search = "";
  url.hash = "";
  url.searchParams.set("invite", token);
  return url.toString();
}
