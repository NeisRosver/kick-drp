import { createContext, useContext, useState } from "react";

export enum Page {
    HOME = "home",
    SETTINGS = "settings",
    ABOUT = "about"
}

interface NavigationContextType {
    page: Page;
    setPage: (page: Page) => void;
}

const NavigationContext = createContext<NavigationContextType | undefined>(undefined);

export function NavigationProvider({ children } : { children: React.ReactNode }) {
    const [page, setPage] = useState<Page>(Page.HOME);

    return (
        <NavigationContext.Provider value={{ page, setPage }}>
            {children}
        </NavigationContext.Provider>
    );
}

export function useNavigation() {
    const context = useContext(NavigationContext);

    if (!context) throw Error("useNavigation must be use inside NavigationProvider");

    return context;
}