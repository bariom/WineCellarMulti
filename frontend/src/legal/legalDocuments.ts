export const LEGAL_DOCUMENT_VERSION = "2026-09-02";

export type LegalDocumentKind = "privacy" | "terms";

export type LegalConfig = {
  version: string;
  operator_name: string;
  operator_address: string;
  contact_email: string;
};
