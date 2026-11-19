import { lazy, Suspense, useEffect, useState, type ComponentType } from "react";
import { Screen } from "./components/ui";
import { Cards } from "./screens/Cards";
import { Home } from "./screens/Home";
import { Online } from "./screens/Online";
import { Party } from "./screens/Party";
import { Privacy } from "./screens/Privacy";
import { Room } from "./screens/Room";
import { Rules } from "./screens/Rules";

// Accounts are optional and used by few players, so their screen is downloaded only when opened.
const Account = lazy(() => import("./screens/Account").then((m) => ({ default: m.Account })));

/** Hash routes: they need no server configuration and keep working offline. */
const ROUTES: Record<string, ComponentType> = {
  "#/party": Party,
  "#/online": Online,
  "#/room": Room,
  "#/rules": Rules,
  "#/cards": Cards,
  "#/me": Account,
  "#/privacy": Privacy,
};

export function App() {
  const [hash, setHash] = useState(location.hash);
  useEffect(() => {
    const onChange = () => setHash(location.hash);
    window.addEventListener("hashchange", onChange);
    return () => window.removeEventListener("hashchange", onChange);
  }, []);

  const Route = ROUTES[hash.split("?")[0] ?? ""] ?? Home;
  return (
    <Suspense
      fallback={
        <Screen centered>
          <p role="status">Loading…</p>
        </Screen>
      }
    >
      <Route />
    </Suspense>
  );
}
