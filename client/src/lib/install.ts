import { create } from "zustand";

/** Chrome's install offer. Not in the standard DOM types, so described here. */
interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

interface InstallState {
  /** Set when the browser (Chrome, Edge, Samsung Internet on Android) has offered to install the app. */
  offer: InstallPromptEvent | null;
  installed: boolean;
}

export const useInstall = create<InstallState>(() => ({ offer: null, installed: false }));

/** Running as an installed app rather than in a browser tab. */
export const isStandalone = () =>
  typeof window !== "undefined" &&
  (window.matchMedia?.("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true);

/** iPhones and iPads: Safari has no install prompt, so players are shown how to add the app themselves. */
export const isIOS = () =>
  typeof navigator !== "undefined" &&
  (/iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1));

// The offer can arrive before any screen is shown, so it is caught as soon as this module loads.
if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault(); // show our own button instead of the browser's mini bar
    useInstall.setState({ offer: e as InstallPromptEvent });
  });
  window.addEventListener("appinstalled", () => useInstall.setState({ offer: null, installed: true }));
}

/** Show the browser's install dialog. True if the player accepted. */
export async function install(): Promise<boolean> {
  const { offer } = useInstall.getState();
  if (!offer) return false;
  await offer.prompt();
  const { outcome } = await offer.userChoice;
  useInstall.setState({ offer: null, installed: outcome === "accepted" });
  return outcome === "accepted";
}
