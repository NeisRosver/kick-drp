import "./App.css";
import { NavigationProvider, useNavigation } from "./context/navigationContext";
import { setKickPresence, setIdlePresence, clearPresence } from "./libs/discord";
import { useEffect } from "react"
import { getConfig } from "./libs/config";
import { Header } from "./components/header";
import { Footer } from "./components/footer";
import { Aside } from "./components/aside";
import HomePage from "./pages/home";
import SettingsPage from "./pages/settings";
import AboutPage from "./pages/about";

function Content() {
  const { page } = useNavigation();

    switch (page) {
    case "settings":
      return <SettingsPage />
    case "about":
      return <AboutPage />
    default:
      return <HomePage />
  }
}

function App() {
  useEffect(() => {
    // const blockInspect = (event: KeyboardEvent) => {
    //   const key = event.key.toLowerCase();

    //   if (event.key === "F12") {
    //     event.preventDefault();
    //     return;
    //   }

    //   if (event.ctrlKey && event.shiftKey && ["i", "j", "c"].includes(key)) {
    //     event.preventDefault();
    //     return;
    //   }

    //   if (event.ctrlKey && key === "u") {
    //     event.preventDefault();
    //     return;
    //   }
    // };

    // const blockContextMenu = (event: MouseEvent) => {
    //   event.preventDefault();
    // };

    // window.addEventListener("keydown", blockInspect);
    // window.addEventListener("contextmenu", blockContextMenu);

    // return () => {
    //   window.removeEventListener("keydown", blockInspect);
    //   window.removeEventListener("contextmenu", blockContextMenu);
    // };
  }, [])

  return (
    <NavigationProvider>
      <div className="flex flex-col min-h-screen">
      <Header />
      <div className="flex flex-1">
        <Aside />
        <Content />
      </div>
      {/* <Footer /> */}
      </div>

    </NavigationProvider>
  )
}

export default App;
