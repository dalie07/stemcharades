import { useEffect, useState, type ComponentType } from "react";
import { Account } from "./screens/Account";
import { Cards } from "./screens/Cards";
import { Home } from "./screens/Home";
import { Online } from "./screens/Online";
import { Party } from "./screens/Party";
import { Room } from "./screens/Room";
import { Rules } from "./screens/Rules";

/** Hash routes: they need no server configuration and keep working offline. */
const ROUTES: Record<string, ComponentType> = {
  "#/party": Party,
  "#/online": Online,
  "#/room": Room,
  "#/rules": Rules,
  "#/cards": Cards,
  "#/me": Account,
};

export function App() {
  const [hash, setHash] = useState(location.hash);
  useEffect(() => {
    const onChange = () => setHash(location.hash);
    window.addEventListener("hashchange", onChange);
    return () => window.removeEventListener("hashchange", onChange);
  }, []);

  const Screen = ROUTES[hash.split("?")[0] ?? ""] ?? Home;
  return <Screen />;
}
