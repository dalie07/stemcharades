import { useEffect, useState } from "react";
import { Account } from "./screens/Account";
import { CardPreview } from "./CardPreview";
import { Home } from "./Home";
import { Room } from "./screens/Room";
import { Online } from "./screens/Online";
import { Party } from "./screens/Party";

export function App() {
  const [route, setRoute] = useState(location.hash);
  useEffect(() => {
    const onChange = () => setRoute(location.hash);
    window.addEventListener("hashchange", onChange);
    return () => window.removeEventListener("hashchange", onChange);
  }, []);

  if (route === "#/party") return <Party />;
  if (route === "#/me") return <Account />;
  if (route === "#/online") return <Online />;
  if (route === "#/room") return <Room />;
  if (route === "#/cards") return <CardPreview />;
  return <Home />;
}
