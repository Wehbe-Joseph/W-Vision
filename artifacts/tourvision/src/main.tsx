import { redirectToCanonicalHost } from "./lib/site-url";

// www and apex do not share localStorage — normalize before OAuth or callback.
redirectToCanonicalHost();

import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

createRoot(document.getElementById("root")!).render(<App />);
