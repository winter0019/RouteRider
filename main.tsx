import React from "react";
import ReactDOM from "react-dom/client";
import App from "../App";
import "../index.css"; // if you have this file; if not, remove this line

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
