
export function base64UrlToBuffer(value: string) {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes.buffer;
}

export function bufferToBase64Url(value: ArrayBuffer) {
  const bytes = new Uint8Array(value);
  let binary = "";
  bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

export function prepareCreationOptions(options: PublicKeyCredentialCreationOptions) {
  return {
    ...options,
    challenge: base64UrlToBuffer(options.challenge as unknown as string),
    user: { ...options.user, id: base64UrlToBuffer(options.user.id as unknown as string) },
    excludeCredentials: options.excludeCredentials?.map((credential) => ({ ...credential, id: base64UrlToBuffer(credential.id as unknown as string) })),
  } as PublicKeyCredentialCreationOptions;
}

export function prepareRequestOptions(options: PublicKeyCredentialRequestOptions) {
  return {
    ...options,
    challenge: base64UrlToBuffer(options.challenge as unknown as string),
    allowCredentials: options.allowCredentials?.map((credential) => ({ ...credential, id: base64UrlToBuffer(credential.id as unknown as string) })),
  } as PublicKeyCredentialRequestOptions;
}

export function credentialToJson(credential: PublicKeyCredential) {
  const response = credential.response;
  const base = {
    id: credential.id,
    rawId: bufferToBase64Url(credential.rawId),
    type: credential.type,
    clientExtensionResults: credential.getClientExtensionResults(),
  };
  if (response instanceof AuthenticatorAttestationResponse) {
    const attestation = response as AuthenticatorAttestationResponse & { getTransports?: () => string[] };
    return {
      ...base,
      response: {
        clientDataJSON: bufferToBase64Url(response.clientDataJSON),
        attestationObject: bufferToBase64Url(response.attestationObject),
        transports: attestation.getTransports?.() || [],
      },
    };
  }
  const assertion = response as AuthenticatorAssertionResponse;
  return {
    ...base,
    response: {
      clientDataJSON: bufferToBase64Url(assertion.clientDataJSON),
      authenticatorData: bufferToBase64Url(assertion.authenticatorData),
      signature: bufferToBase64Url(assertion.signature),
      userHandle: assertion.userHandle ? bufferToBase64Url(assertion.userHandle) : null,
    },
  };
}
