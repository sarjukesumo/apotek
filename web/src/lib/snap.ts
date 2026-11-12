// Snap.js helper. Snap script loaded in index.html.
declare global {
  interface Window {
    snap?: {
      pay: (token: string, opts?: any) => void;
      embed?: (token: string, opts: { embedId: string } & any) => void;
    };
  }
}

export function snapPay(token: string, opts: any = {}): Promise<"success" | "pending" | "close" | "error"> {
  return new Promise((resolve) => {
    if (!window.snap) { resolve("error"); return; }
    window.snap.pay(token, {
      onSuccess: () => resolve("success"),
      onPending: () => resolve("pending"),
      onError:   () => resolve("error"),
      onClose:   () => resolve("close"),
      ...opts,
    });
  });
}
